import { z } from 'zod';
import { workspaceSchema, type Workspace, type ProjectData } from './schema';
import { buildStoryWorkItems, storyWorkItems } from '../planner/stories';

const identifier = z.string().regex(/^[A-Za-z0-9_-]{1,100}$/);
const title = z.string().trim().min(1, 'Enter a name').max(200);
const effort = z.number().min(0).max(3650);
export const pokerPublicationSchema = z.object({
  operationId: z.uuid(), revision: z.number().int().min(0), kind: z.enum(['epic','story']),
  featureId: identifier.optional(), newEpic: z.object({title}).optional(), taskId: identifier.optional(),
  title, description: z.string().max(10000).optional(),
  teams: z.array(z.object({roleId: identifier, assignee: identifier.or(z.literal('')).optional(), effort: effort.optional()})).max(1000).default([]),
  sequential: z.boolean().default(false), acceptedVote: z.string().trim().max(32).optional(),
  roundId: z.uuid().optional(), confirmProgress: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if (new Set(value.teams.map(team => team.roleId)).size !== value.teams.length) ctx.addIssue({code:'custom',message:'Select each role only once'});
  if (value.kind==='story' && !value.featureId && !value.newEpic && !value.taskId) ctx.addIssue({code:'custom',message:'Choose an epic or create one for this story'});
  if (value.newEpic && (value.featureId || value.taskId)) ctx.addIssue({code:'custom',message:'Choose an existing epic or a new one'});
});
export type PokerPublicationInput = z.input<typeof pokerPublicationSchema>;
export type PokerPublicationResult = {projectId:string;featureId:string;taskIds:string[];storyId?:string;acceptedVote?:string;roundId?:string};
type Task = ProjectData['tasks'][number];
export class PokerPublicationError extends Error {
  constructor(message:string, public code='invalid_publication', public status=400) { super(message); }
}
function inferredRole(task:Task,data:ProjectData) {
  if(task.roleId)return task.roleId;
  const person=data.people.find(p=>p.id===task.assignee);if(person?.platform===task.platform)return person.roleId;
  const roles=data.roles.filter(role=>role.platform===task.platform);return roles.length===1?roles[0].id:undefined;
}
function assertProgressChange(before:Task,after:Task,confirmed:boolean) {
  if(before.status==='done' && after.effort!==before.effort)throw new PokerPublicationError('Completed work estimates cannot be changed. Add a new work item for additional work.');
  if(['progress','done'].includes(before.status) && JSON.stringify(before)!==JSON.stringify(after) && !confirmed)
    throw new PokerPublicationError('Confirm changes to in-progress or completed work.','confirmation_required',409);
}
function setEstimate(task:Task,value:number) {
  if(value===task.effort)return;
  if(task.status==='done')throw new PokerPublicationError('Completed work estimates cannot be changed. Add a new work item for additional work.');
  if(!Number.isInteger(value*2))throw new PokerPublicationError('Use 0.5-day estimates.');
  const completed=Math.max(0,task.effort-(task.remaining??task.effort));
  if(value<completed)throw new PokerPublicationError('The estimate cannot be less than already completed effort.');
  if(task.remaining!==undefined)task.remaining=value-completed;
  task.effort=value;
}
/** Pure publication plan. A separate SQL transaction checks the revision and persists this validated snapshot once. */
export function planPokerPublication(source:Workspace,projectId:string,raw:unknown,date=new Date().toISOString().slice(0,10)) {
  const input=pokerPublicationSchema.parse(raw),workspace=structuredClone(source);
  const project=workspace.projects.find(p=>p.id===projectId);if(!project)throw new PokerPublicationError('This project is no longer available.','project_not_found',404);
  const data=project.data;
  let feature=input.featureId?data.features.find(f=>f.id===input.featureId):undefined;
  const selected=input.taskId?data.tasks.find(t=>t.id===input.taskId):undefined;
  if(input.taskId&&!selected)throw new PokerPublicationError('This story is no longer available.','story_not_found',404);
  if(selected){if(input.featureId&&input.featureId!==selected.featureId)throw new PokerPublicationError('The story belongs to another epic.');feature=data.features.find(f=>f.id===selected.featureId);}
  if(input.kind==='epic'||input.newEpic){
    if(data.features.length>=1000)throw new PokerPublicationError('A project can contain at most 1000 epics.');
    feature={id:`f${crypto.randomUUID()}`,title:input.kind==='epic'?input.title:input.newEpic!.title,description:input.kind==='epic'?input.description||'':'',start:date,baseline:date,collapsed:false,color:'#8c7ae6'};
    data.features.push(feature);
  }
  if(!feature)throw new PokerPublicationError('Choose an epic from this project.');
  const result:PokerPublicationResult={projectId,featureId:feature.id,taskIds:[],...(input.acceptedVote!==undefined?{acceptedVote:input.acceptedVote}:{}),...(input.roundId?{roundId:input.roundId}:{})};
  if(input.kind==='epic')return {workspace:workspaceSchema.parse(workspace),result,storyKey:'free'};
  const existing=selected?storyWorkItems(selected,data):[];
  const storyId=selected?.storyId||`s${crypto.randomUUID()}`;
  const oldTasks=new Map(existing.map(t=>[t.id,structuredClone(t)]));
  const reusable=existing.length===1&&selected?.status==='planned'&&!selected.platform&&!selected.roleId&&!selected.assignee&&selected.effort===0?selected:undefined;
  const missing:typeof input.teams=[];
  for(const team of input.teams){
    const role=data.roles.find(role=>role.id===team.roleId);if(!role)throw new PokerPublicationError('Choose a role from this project.');
    if(team.assignee && !data.people.some(person=>person.id===team.assignee&&person.roleId===role.id&&person.platform===role.platform))throw new PokerPublicationError(`${role.name}: choose a matching assignee or Unassigned.`);
    const matches=existing.filter(t=>inferredRole(t,data)===role.id);
    if(matches.length>1)throw new PokerPublicationError(`${role.name} has several work items in this story. Edit those items individually in the roadmap.`);
    const task=matches[0];
    if(!task){missing.push(team);continue;}
    // Only explicitly submitted assignment/estimate fields are changed. Dates, status, dependency and history stay intact.
    if(team.assignee!==undefined)task.assignee=team.assignee;
    if(team.effort!==undefined)setEstimate(task,team.effort);
  }
  const rename=input.title!==selected?.title;
  for(const task of existing){if(rename)task.title=input.title;if(input.description!==undefined)task.description=input.description;}
  let additions:Task[]=[];
  if(missing.length||!existing.length){
    const built=buildStoryWorkItems(feature.id,{title:input.title,start:selected?.start||feature.start,teams:missing.map(team=>({...team,assignee:team.assignee||'',effort:team.effort??0})),sequential:input.sequential},reusable?{...data,tasks:data.tasks.filter(t=>t.id!==reusable.id)}:data,storyId);
    if(input.description!==undefined)for(const task of built)task.description=input.description;
    if(reusable&&missing.length){
      const first=built[0];reusable.roleId=first.roleId;reusable.platform=first.platform;reusable.assignee=first.assignee;setEstimate(reusable,first.effort);
      additions=built.slice(1).map(task=>({...task,dependsOn:task.dependsOn.map(id=>id===first.id?reusable.id:id)}));
    }else additions=built;
    if(input.sequential&&existing.length&&!reusable&&additions.length)additions[0].dependsOn=[existing.at(-1)!.id];
  }
  // Give a legacy singleton a group only when new roles join it; never infer a group from titles.
  const grouped=!!selected?.storyId||!selected||additions.length>0||!!reusable&&missing.length>0;
  if(grouped)for(const task of existing)task.storyId=storyId;
  for(const task of existing)assertProgressChange(oldTasks.get(task.id)!,task,input.confirmProgress);
  if(additions.length){const after=existing.length?Math.max(...existing.map(t=>data.tasks.findIndex(item=>item.id===t.id)))+1:data.tasks.length;data.tasks.splice(after,0,...additions);}
  feature.collapsed=false;
  result.taskIds=[...existing,...additions].map(t=>t.id);if(grouped)result.storyId=storyId;
  return {workspace:workspaceSchema.parse(workspace),result,storyKey:input.taskId||result.taskIds[0]};
}
