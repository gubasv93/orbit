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
    platform: z.string().trim().min(1).max(200), assignee: z.string(),
    effort: z.number().min(0.1, 'Estimates must be at least 0.1 work days').max(3650, 'Estimates cannot exceed 3650 work days'),
  })).min(1, 'Select at least one team').max(1000),
  sequential: z.boolean().default(false),
});

// A story fans out to ordinary platform work items in the existing epic model.
// Build and validate the entire batch before the caller mutates the workspace.
export function buildStoryWorkItems(featureId: string, draft: unknown, data: TeamData): ProjectData['tasks'] {
  const parsed = draftSchema.parse(draft), platforms = new Set(workstreamNames(data));
  if (new Set(parsed.teams.map(team => team.platform)).size !== parsed.teams.length) throw new Error('Select each team only once');
  if (data.tasks.length + parsed.teams.length > 3000) throw new Error('A project can contain at most 3000 work items');
  for (const team of parsed.teams) {
    if (!platforms.has(team.platform)) throw new Error('Choose a team from this project');
    if (team.assignee && !data.people.some(person => person.id === team.assignee && person.platform === team.platform)) {
      throw new Error(`${team.platform}: choose a matching team member or leave it unassigned`);
    }
  }
  const tasks: ProjectData['tasks'] = [];
  for (const team of parsed.teams) {
    tasks.push({ id: `t${crypto.randomUUID()}`, featureId, title: parsed.title, platform: team.platform,
      assignee: team.assignee, effort: team.effort, start: parsed.start, status: 'planned',
      dependsOn: parsed.sequential && tasks.length ? [tasks[tasks.length - 1].id] : [] });
  }
  return tasks;
}
