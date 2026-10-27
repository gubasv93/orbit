import { it, expect } from 'vitest';
import { buildStoryWorkItems, workstreamNames } from '../src/planner/stories';
import { featureEffort } from '../src/planner/features';
import { createScheduler } from '../src/planner/engine.js';
import { fromDay } from '../src/planner/dates.js';
import { projectData } from './fixtures';

function teamData() {
  const data = projectData(); data.tasks = [];
  for (const platform of ['Frontend', 'QA', 'DevOps']) {
    data.roles.push({ id: `r${platform}`, name: `${platform} specialist`, platform });
    data.people.push({ ...data.people[0], id: `u${platform}`, name: `${platform} teammate`, roleId: `r${platform}`, role: `${platform} specialist`, platform });
  }
  return data;
}
const draft = () => ({ title: 'Add a specific rule', start: '2026-11-02', teams: [
  { platform: 'Backend', assignee: 'u1', effort: 3 },
  { platform: 'Frontend', assignee: 'uFrontend', effort: 2 },
  { platform: 'QA', assignee: 'uQA', effort: 2 },
] });

it('creates three independent team work items with exact estimates and a seven-day effort total', () => {
  const data = teamData(), tasks = buildStoryWorkItems('f1', draft(), data);
  expect(tasks.map(task => [task.platform, task.assignee, task.effort])).toEqual([['Backend', 'u1', 3], ['Frontend', 'uFrontend', 2], ['QA', 'uQA', 2]]);
  expect(new Set(tasks.map(task => task.id)).size).toBe(3);
  expect(tasks.every(task => task.title === 'Add a specific rule' && task.featureId === 'f1' && task.start === '2026-11-02' && task.status === 'planned' && !task.dependsOn.length)).toBe(true);
  expect(featureEffort(data.features[0], tasks).total).toBe(7);
  expect(data.tasks).toEqual([]);
});

it('uses full work availability without serializing the teams, and allows later manual dependency ordering', () => {
  const data = teamData(); data.people[0].capacity = { feature: 50, bugs: 50, ongoing: 0, ops: 0 };
  data.tasks = buildStoryWorkItems('f1', draft(), data);
  let result = createScheduler(data).calculate();
  expect(data.tasks.map(task => fromDay(result.schedule[task.id].start!))).toEqual(['2026-11-02', '2026-11-02', '2026-11-02']);
  expect(fromDay(result.schedule[data.tasks[0].id].end!)).toBe('2026-11-04');
  expect(fromDay(result.schedule[data.tasks[1].id].end!)).toBe('2026-11-03');
  const order = data.tasks.map(task => task.id);
  data.tasks[1].dependsOn = [data.tasks[0].id]; data.tasks[2].dependsOn = [data.tasks[1].id];
  result = createScheduler(data).calculate();
  expect(result.schedule[data.tasks[1].id].start).toBeGreaterThan(result.schedule[data.tasks[0].id].end!);
  expect(result.schedule[data.tasks[2].id].start).toBeGreaterThan(result.schedule[data.tasks[1].id].end!);
  expect(data.tasks.map(task => task.id)).toEqual(order);
});

it('supports custom workstreams, unassigned work, fractional estimates, and explicit dependency chaining', () => {
  const data = teamData(), value = draft();
  value.teams = [{ platform: 'DevOps', assignee: '', effort: .25 }, { platform: 'QA', assignee: 'uQA', effort: 1.5 }];
  const tasks = buildStoryWorkItems('f1', { ...value, sequential: true }, data);
  expect(tasks[0]).toMatchObject({ platform: 'DevOps', assignee: '', effort: .25, dependsOn: [] });
  expect(tasks[1].dependsOn).toEqual([tasks[0].id]);
  data.roles.push({ ...data.roles[0], id: 'duplicate-platform' });
  expect(workstreamNames(data)).toEqual(['Backend', 'DevOps', 'Frontend', 'QA']);
});

it('rejects missing, zero, negative, non-finite, and excessive estimates instead of changing their values', () => {
  const data = teamData();
  for (const effort of [0, -.5, NaN, Infinity, 3651, undefined]) {
    const value = draft(); Object.assign(value.teams[0], { effort });
    expect(() => buildStoryWorkItems('f1', value, data)).toThrow();
  }
  expect(data.tasks).toEqual([]);
});

it('rejects invalid assignees, duplicate or unknown teams, empty stories, and dates outside the supported range', () => {
  const data = teamData(), wrong = draft(); wrong.teams[0].assignee = 'uFrontend';
  expect(() => buildStoryWorkItems('f1', wrong, data)).toThrow('matching team member');
  for (const changes of [
    { teams: [] }, { teams: [draft().teams[0], draft().teams[0]] },
    { teams: [{ platform: 'Unknown', assignee: '', effort: 2 }] },
    { title: '  ' }, { start: '1999-12-31' },
  ]) expect(() => buildStoryWorkItems('f1', { ...draft(), ...changes }, data)).toThrow();
});

it('refuses a batch above the project work-item limit without partially adding it', () => {
  const data = teamData(); data.tasks = Array.from({ length: 2998 }, (_, index) => ({ ...projectData().tasks[0], id: `t${index}` }));
  expect(() => buildStoryWorkItems('f1', draft(), data)).toThrow('3000 work items');
  expect(data.tasks).toHaveLength(2998);
});
