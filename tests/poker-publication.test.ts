import { describe, expect, it } from 'vitest';
import { planPokerPublication, pokerPublicationSchema } from '../src/lib/poker-publication';
import { fullWorkspace } from './fixtures';
import { workspaceSchema } from '../src/lib/schema';
const operationId='11111111-1111-4111-8111-111111111111',projectId='project-shared-id';
function draft(extra:Record<string,unknown>={}){return {operationId,revision:1,kind:'story',featureId:'f1',title:'Add a specific rule',teams:[{roleId:'r1',assignee:'u1',effort:3}],...extra};}
function grouped(){const workspace=fullWorkspace(),data=workspace.projects[0].data;data.tasks=data.tasks.filter(task=>task.id!=='t2');Object.assign(data.tasks[0],{roleId:'r1',storyId:'existing-story',title:'Original story',effort:2,manualEnd:'2026-11-12',manualEndFraction:.5,dependsOn:['t3']});Object.assign(data.tasks[1],{roleId:'rfront',storyId:'existing-story',title:'Original story',effort:1});return workspace;}

describe('Planning Poker publication into ordinary Orbit work items',()=>{
 it('creates a real epic and three independently assigned role items atomically without modifying the input',()=>{
  const source=fullWorkspace();const data=source.projects[0].data;data.roles.push({id:'qa',name:'QA Engineer',platform:'QA'});const before=structuredClone(source);
  const plan=planPokerPublication(source,projectId,draft({featureId:undefined,newEpic:{title:'Disable Rules'},description:'Add a rule by ID',teams:[{roleId:'r1',assignee:'u1',effort:3},{roleId:'rfront',assignee:'',effort:2},{roleId:'qa',effort:1}]}),'2026-10-29');
  expect(source).toEqual(before);expect(plan.workspace.projects[0].data.features).toHaveLength(2);const tasks=plan.workspace.projects[0].data.tasks.slice(-3);expect(tasks.map(t=>t.effort)).toEqual([3,2,1]);expect(tasks.map(t=>t.platform)).toEqual(['Backend','Frontend','QA']);expect(tasks.map(t=>t.assignee)).toEqual(['u1','','']);expect(new Set(tasks.map(t=>t.storyId)).size).toBe(1);expect(tasks.every(t=>t.featureId===plan.result.featureId&&t.description==='Add a rule by ID'&&t.start==='2026-10-29'&&t.dependsOn.length===0)).toBe(true);expect(workspaceSchema.safeParse(plan.workspace).success).toBe(true);
 });
 it('creates a name-only unestimated story and does not translate a poker card into working days',()=>{
  const source=fullWorkspace(),plan=planPokerPublication(source,projectId,draft({teams:[],acceptedVote:'8',roundId:operationId}));const item=plan.workspace.projects[0].data.tasks.at(-1)!;expect(item).toMatchObject({effort:0,assignee:'',platform:'',status:'planned',title:'Add a specific rule'});expect(plan.result.acceptedVote).toBe('8');expect(item.effort).not.toBe(8);
 });
 it('creates only explicitly requested sequential dependencies and distinguishes roles on the same platform',()=>{
  const source=fullWorkspace();source.projects[0].data.roles.push({id:'be-review',name:'Backend Reviewer',platform:'Backend'});
  const plan=planPokerPublication(source,projectId,draft({sequential:true,teams:[{roleId:'r1',effort:.5},{roleId:'be-review',effort:1.5}]}));const [first,second]=plan.workspace.projects[0].data.tasks.slice(-2);expect(first.roleId).toBe('r1');expect(second.roleId).toBe('be-review');expect(second.dependsOn).toEqual([first.id]);
 });
 it('updates the same existing role item IDs, keeping manual dates, dependency links, status and unrelated projects',()=>{
  const source=grouped();source.projects.push({...structuredClone(source.projects[0]),id:'other-project'});const before=structuredClone(source);
  const plan=planPokerPublication(source,projectId,draft({taskId:'t1',title:'Renamed story',teams:[{roleId:'r1',effort:3},{roleId:'rfront',effort:1.5}]}));const data=plan.workspace.projects[0].data;
  expect(data.tasks.map(t=>t.id)).toEqual(['t1','t3']);expect(data.tasks[0]).toEqual({...before.projects[0].data.tasks[0],title:'Renamed story',effort:3});expect(data.tasks[1]).toEqual({...before.projects[0].data.tasks[1],title:'Renamed story',effort:1.5});expect(plan.workspace.projects[1]).toEqual(before.projects[1]);expect(plan.result.taskIds).toEqual(['t1','t3']);expect(source).toEqual(before);
 });
 it('preserves individually named role items during re-estimation unless the story name is explicitly changed',()=>{
  const source=grouped();source.projects[0].data.tasks[1].title='Custom QA acceptance title';const plan=planPokerPublication(source,projectId,draft({taskId:'t1',title:'Original story',teams:[{roleId:'r1',effort:3}]}));expect(plan.workspace.projects[0].data.tasks.map(t=>t.title)).toEqual(['Original story','Custom QA acceptance title']);
  const renamed=planPokerPublication(source,projectId,draft({taskId:'t1',title:'Renamed story',teams:[]}));expect(renamed.workspace.projects[0].data.tasks.map(t=>t.title)).toEqual(['Renamed story','Renamed story']);
 });
 it('retains omitted existing roles instead of silently deleting their work',()=>{
  const source=grouped(),plan=planPokerPublication(source,projectId,draft({taskId:'t1',title:'Original story',teams:[{roleId:'r1',effort:3}]}));expect(plan.workspace.projects[0].data.tasks[1]).toEqual(source.projects[0].data.tasks[1]);expect(plan.result.taskIds).toEqual(['t1','t3']);
 });
 it('adds only a missing role and reuses the zero-effort placeholder identity',()=>{
  const source=fullWorkspace(),data=source.projects[0].data;Object.assign(data.tasks[0],{platform:'',assignee:'',effort:0,remaining:0,manualEnd:'2026-11-12'});
  const plan=planPokerPublication(source,projectId,draft({taskId:'t1',sequential:true,teams:[{roleId:'r1',effort:3},{roleId:'rfront',effort:2}]}));const tasks=plan.workspace.projects[0].data.tasks;expect(tasks).toHaveLength(data.tasks.length+1);const first=tasks.find(t=>t.id==='t1')!;expect(first).toMatchObject({id:'t1',roleId:'r1',effort:3,remaining:3,manualEnd:'2026-11-12',start:data.tasks[0].start});expect(tasks.find(t=>plan.result.taskIds.includes(t.id)&&t.id!=='t1')?.dependsOn).toEqual(['t1']);
 });
 it('does not group equal titles across unrelated legacy work or existing story batches',()=>{
  const source=fullWorkspace();source.projects[0].data.tasks[1].title=source.projects[0].data.tasks[0].title;
  const before=structuredClone(source.projects[0].data.tasks[1]);const plan=planPokerPublication(source,projectId,draft({taskId:'t1'}));expect(plan.workspace.projects[0].data.tasks[1]).toEqual(before);expect(plan.result.taskIds).toEqual(['t1']);expect(plan.workspace.projects[0].data.tasks[0].storyId).toBeUndefined();
 });
 it('requires explicit confirmation for active work, preserves completed effort and never overwrites completed estimates',()=>{
  const source=grouped(),task=source.projects[0].data.tasks[0];Object.assign(task,{status:'progress',effort:5,remaining:2});
  expect(()=>planPokerPublication(source,projectId,draft({taskId:'t1',title:'Original story',teams:[{roleId:'r1',effort:6}]}))).toThrow('Confirm changes');const plan=planPokerPublication(source,projectId,draft({taskId:'t1',title:'Original story',confirmProgress:true,teams:[{roleId:'r1',effort:6}]}));expect(plan.workspace.projects[0].data.tasks[0]).toMatchObject({effort:6,remaining:3,status:'progress'});
  expect(()=>planPokerPublication(source,projectId,draft({taskId:'t1',confirmProgress:true,teams:[{roleId:'r1',effort:2}]}))).toThrow('already completed');task.status='done';task.completedDate='2026-11-02';expect(()=>planPokerPublication(source,projectId,draft({taskId:'t1',confirmProgress:true,teams:[{roleId:'r1',effort:6}]}))).toThrow('Completed work estimates');
 });
 it('preserves historical fine-grained estimates if unchanged but requires half-day steps for new values',()=>{
  const source=grouped();source.projects[0].data.tasks[0].effort=.25;expect(planPokerPublication(source,projectId,draft({taskId:'t1',title:'Original story',teams:[{roleId:'r1',effort:.25}]})).workspace.projects[0].data.tasks[0].effort).toBe(.25);
  expect(()=>planPokerPublication(source,projectId,draft({taskId:'t1',teams:[{roleId:'r1',effort:.75}]}))).toThrow('0.5-day');expect(()=>planPokerPublication(source,projectId,draft({teams:[{roleId:'r1',effort:.25}]}))).toThrow();
 });
 it('rejects bad roles, assignments, absent stories and cross-epic edits before any source mutation',()=>{
  const source=grouped(),before=structuredClone(source);
  expect(()=>planPokerPublication(source,projectId,draft({teams:[{roleId:'unknown',effort:1}]}))).toThrow('role');expect(()=>planPokerPublication(source,projectId,draft({teams:[{roleId:'rfront',assignee:'u1',effort:1}]}))).toThrow('matching assignee');expect(()=>planPokerPublication(source,projectId,draft({taskId:'missing'}))).toThrow('no longer available');expect(()=>planPokerPublication(source,projectId,draft({taskId:'t1',featureId:'other-epic'}))).toThrow('another epic');expect(source).toEqual(before);expect(pokerPublicationSchema.safeParse(draft({teams:[{roleId:'r1'},{roleId:'r1'}]})).success).toBe(false);
 });
});
