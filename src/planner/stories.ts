import { z } from 'zod';
import type { ProjectData } from '../lib/schema';

type TeamData = Pick<ProjectData, 'roles' | 'tasks' | 'people'>;
export function workstreamNames(data: Pick<TeamData, 'roles' | 'tasks'>, extra = '') {
  return [...new Set([
    ...(data.roles.length ? [] : ['Backend', 'Frontend', 'QA']),
    ...data.roles.map(role => role.platform), ...data.tasks.map(task => task.platform), ...(extra ? [extra] : []),
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

const draftSchema = z.object({
  title: z.string().trim().min(1, 'Enter a user story name').max(200),
  start: z.iso.date().refine(value => value >= '2000-01-01' && value <= '2200-12-31', 'Choose a date between 2000 and 2200'),
  teams: z.array(z.object({
    platform: z.string().trim().min(1).max(200).optional(), roleId: z.string().optional(), assignee: z.string().default(''),
    effort: z.union([z.literal(0),z.number().min(0.5, 'Estimates must be at least 0.5 work days').max(3650, 'Estimates cannot exceed 3650 work days').multipleOf(.5, 'Use 0.5-day steps')]).default(0),
  })).max(1000),
  sequential: z.boolean().default(false),
});

// A story fans out to ordinary platform work items in the existing epic model.
// Build and validate the entire batch before the caller mutates the workspace.
export function buildStoryWorkItems(featureId: string, draft: unknown, data: TeamData, storyId = `s${crypto.randomUUID()}`): ProjectData['tasks'] {
  const parsed = draftSchema.parse(draft), platforms = new Set(workstreamNames(data));
  if (new Set(parsed.teams.map(team => team.roleId || team.platform)).size !== parsed.teams.length) throw new Error('Select each role only once');
  if (data.tasks.length + Math.max(1, parsed.teams.length) > 3000) throw new Error('A project can contain at most 3000 work items');
  if (!parsed.teams.length) return [{ id: `t${crypto.randomUUID()}`, featureId, storyId, title: parsed.title,
    platform: '', assignee: '', effort: 0, start: parsed.start, status: 'planned', dependsOn: [] }];
  for (const team of parsed.teams) {
    const role = team.roleId ? data.roles.find(role => role.id === team.roleId) : undefined;
    if (team.roleId && !role) throw new Error('Choose a role from this project');
    const platform = role?.platform || team.platform;
    if (!platform || !platforms.has(platform) || (role && team.platform && role.platform !== team.platform)) throw new Error('Choose a role from this project');
    if (team.assignee && !data.people.some(person => person.id === team.assignee && person.platform === platform && (!role || person.roleId === role.id))) {
      throw new Error(`${role?.name || platform}: choose a matching team member or leave it unassigned`);
    }
  }
  const tasks: ProjectData['tasks'] = [];
  for (const team of parsed.teams) {
    const role = data.roles.find(role => role.id === team.roleId);
    tasks.push({ id: `t${crypto.randomUUID()}`, featureId, storyId, title: parsed.title, platform: role?.platform || team.platform!, ...(role ? { roleId: role.id } : {}),
      assignee: team.assignee, effort: team.effort, start: parsed.start, status: 'planned',
      dependsOn: parsed.sequential && tasks.length ? [tasks[tasks.length - 1].id] : [] });
  }
  return tasks;
}

export function storyWorkItems(task: ProjectData['tasks'][number], data: TeamData) {
  return task.storyId ? data.tasks.filter(t => t.featureId === task.featureId && t.storyId === task.storyId) : [task];
}
export function storyRoleIds(task: ProjectData['tasks'][number], data: TeamData) {
  return new Set(storyWorkItems(task,data).flatMap(t => {
    const role = t.roleId || data.people.find(p => p.id === t.assignee)?.roleId;
    if (role) return [role];
    const matches = data.roles.filter(r => r.platform === t.platform);
    return matches.length === 1 ? [matches[0].id] : [];
  }));
}

/** Validate the entire addition before changing the source or its siblings. */
export function planStoryRoles(taskId: string, draft: unknown, data: TeamData) {
  const source = data.tasks.find(t => t.id === taskId);if (!source) throw new Error('Choose an existing story');
  const parsed = draftSchema.parse(draft), roles = storyRoleIds(source,data);
  if (!parsed.teams.length) throw new Error('Choose at least one new role');
  if (parsed.teams.some(t => !t.roleId || roles.has(t.roleId))) throw new Error('Choose roles that have not been added to this story');
  const reuse = source.effort === 0 && !source.roleId && !source.platform && !source.assignee && source.status === 'planned';
  if (reuse && source.manualEnd && (parsed.start > source.manualEnd || Date.parse(source.manualEnd)-Date.parse(parsed.start)>=3650*86400000)) throw new Error('Keep the existing manual date window valid when adding roles');
  const storyId = source.storyId || `s${crypto.randomUUID()}`;
  const built = buildStoryWorkItems(source.featureId,{...parsed,title:source.title},reuse?{...data,tasks:data.tasks.filter(t=>t.id!==source.id)}:data,storyId);
  let updatedSource = {...source,storyId}, items = built;
  if (reuse) {
    updatedSource = {...source,...built[0],id:source.id,storyId,dependsOn:source.dependsOn};delete updatedSource.remaining;
    items = built.slice(1).map(t=>({...t,dependsOn:t.dependsOn.map(id=>id===built[0].id?source.id:id)}));
  } else if (parsed.sequential) built[0].dependsOn = [source.id];
  return {updatedSource,items};
}
