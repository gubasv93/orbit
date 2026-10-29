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
    platform: z.string().trim().min(1).max(200).optional(), roleId: z.string().optional(), assignee: z.string(),
    effort: z.number().min(0.5, 'Estimates must be at least 0.5 work days').max(3650, 'Estimates cannot exceed 3650 work days').multipleOf(.5, 'Use 0.5-day steps'),
  })).max(1000),
  sequential: z.boolean().default(false),
});

// A story fans out to ordinary platform work items in the existing epic model.
// Build and validate the entire batch before the caller mutates the workspace.
export function buildStoryWorkItems(featureId: string, draft: unknown, data: TeamData): ProjectData['tasks'] {
  const parsed = draftSchema.parse(draft), platforms = new Set(workstreamNames(data));
  if (new Set(parsed.teams.map(team => team.roleId || team.platform)).size !== parsed.teams.length) throw new Error('Select each role only once');
  if (data.tasks.length + Math.max(1, parsed.teams.length) > 3000) throw new Error('A project can contain at most 3000 work items');
  if (!parsed.teams.length) return [{ id: `t${crypto.randomUUID()}`, featureId, title: parsed.title,
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
    tasks.push({ id: `t${crypto.randomUUID()}`, featureId, title: parsed.title, platform: role?.platform || team.platform!, ...(role ? { roleId: role.id } : {}),
      assignee: team.assignee, effort: team.effort, start: parsed.start, status: 'planned',
      dependsOn: parsed.sequential && tasks.length ? [tasks[tasks.length - 1].id] : [] });
  }
  return tasks;
}
