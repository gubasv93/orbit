import { it, expect } from 'vitest';
import { buildStoryWorkItems, workstreamNames, planStoryRoles, storyRoleIds, storyWorkItems } from '../src/planner/stories';
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
  value.teams = [{ platform: 'DevOps', assignee: '', effort: .5 }, { platform: 'QA', assignee: 'uQA', effort: 1.5 }];
  const tasks = buildStoryWorkItems('f1', { ...value, sequential: true }, data);
  expect(tasks[0]).toMatchObject({ platform: 'DevOps', assignee: '', effort: .5, dependsOn: [] });
  expect(tasks[1].dependsOn).toEqual([tasks[0].id]);
  data.roles.push({ ...data.roles[0], id: 'duplicate-platform' });
  expect(workstreamNames(data)).toEqual(['Backend', 'DevOps', 'Frontend', 'QA']);
});

it('rejects invalid fractional, negative, non-finite, and excessive estimates instead of changing their values', () => {
  const data = teamData();
  for (const effort of [.1, .25, .75, -.5, NaN, Infinity, 3651]) {
    const value = draft(); Object.assign(value.teams[0], { effort });
    expect(() => buildStoryWorkItems('f1', value, data)).toThrow();
  }
  expect(data.tasks).toEqual([]);
});

it('rejects invalid assignees, duplicate or unknown teams, empty stories, and dates outside the supported range', () => {
  const data = teamData(), wrong = draft(); wrong.teams[0].assignee = 'uFrontend';
  expect(() => buildStoryWorkItems('f1', wrong, data)).toThrow('matching team member');
  for (const changes of [
    { teams: [draft().teams[0], draft().teams[0]] },
    { teams: [{ platform: 'Unknown', assignee: '', effort: 2 }] },
    { title: '  ' }, { start: '1999-12-31' },
  ]) expect(() => buildStoryWorkItems('f1', { ...draft(), ...changes }, data)).toThrow();
});

it('refuses a batch above the project work-item limit without partially adding it', () => {
  const data = teamData(); data.tasks = Array.from({ length: 2998 }, (_, index) => ({ ...projectData().tasks[0], id: `t${index}` }));
  expect(() => buildStoryWorkItems('f1', draft(), data)).toThrow('3000 work items');
  expect(data.tasks).toHaveLength(2998);
});

it('captures a title-only story with no assignment or fabricated estimate, including an empty team',()=>{
 const data=teamData();data.people=[];data.roles=[];
 const [task]=buildStoryWorkItems('f1',{title:'  Explore a rule  ',start:'2026-11-02',teams:[]},data);
 expect(task).toMatchObject({title:'Explore a rule',platform:'',assignee:'',effort:0,dependsOn:[]});expect(task.roleId).toBeUndefined();expect(data.tasks).toEqual([]);
});
it('applies the work-item limit to a title-only story before adding it',()=>{
 const data=teamData();data.tasks=Array.from({length:3000},(_,i)=>({...projectData().tasks[0],id:'existing'+i}));
 expect(()=>buildStoryWorkItems('f1',{title:'Later',start:'2026-11-02',teams:[]},data)).toThrow('3000 work items');expect(data.tasks).toHaveLength(3000);
});

it('creates selected roles without assignments or invented estimates and keeps different same-name stories separate',()=>{
 const data=teamData(),value={title:'Rules',start:'2026-11-02',teams:[{roleId:'r1'},{roleId:'rQA',effort:1.5}]};
 const first=buildStoryWorkItems('f1',value,data),second=buildStoryWorkItems('f1',value,data);
 expect(first.map(t=>[t.roleId,t.platform,t.assignee,t.effort])).toEqual([['r1','Backend','',0],['rQA','QA','',1.5]]);
 expect(first[0].storyId).toBeTruthy();expect(first[1].storyId).toBe(first[0].storyId);expect(second[0].storyId).not.toBe(first[0].storyId);
 data.tasks=[...first,...second];expect(storyWorkItems(first[0],data)).toEqual(first);
 const result=createScheduler(data).calculate();expect(result.schedule[first[0].id]).toMatchObject({needsEstimate:true,alloc:{}});
});

it('adds roles to the selected story atomically, rejects existing roles, and leaves its original work unchanged',()=>{
 const data=teamData();data.tasks=buildStoryWorkItems('f1',{...draft(),teams:[{roleId:'r1',assignee:'u1',effort:3}]},data);
 const original=structuredClone(data),source=data.tasks[0],addition=planStoryRoles(source.id,{title:source.title,start:source.start,teams:[{roleId:'rFrontend'},{roleId:'rQA',effort:2}]},data);
 expect(data).toEqual(original);expect(addition.updatedSource).toEqual(source);expect(addition.items.map(t=>[t.roleId,t.effort,t.assignee,t.storyId])).toEqual([['rFrontend',0,'',source.storyId],['rQA',2,'',source.storyId]]);
 data.tasks.push(...addition.items);expect([...storyRoleIds(source,data)]).toEqual(['r1','rFrontend','rQA']);
 const before=structuredClone(data);for(const teams of [[],[{roleId:'rQA'}],[{roleId:'rOps'}],[{roleId:'rFrontend',assignee:'u1'}]])expect(()=>planStoryRoles(source.id,{title:source.title,start:source.start,teams},data)).toThrow();expect(data).toEqual(before);
});

it('extends legacy role work without merging same-name legacy tasks and supports an explicit dependency chain',()=>{
 const data=teamData(),source={...projectData().tasks[0],roleId:'r1'};data.tasks=[source,{...source,id:'unrelated'}];
 const addition=planStoryRoles(source.id,{title:source.title,start:source.start,teams:[{roleId:'rFrontend'},{roleId:'rQA'}],sequential:true},data);
 expect(addition.updatedSource.storyId).toBeTruthy();expect(addition.items.every(t=>t.storyId===addition.updatedSource.storyId)).toBe(true);
 expect(addition.items.map(t=>t.dependsOn)).toEqual([[source.id],[addition.items[0].id]]);expect(data.tasks[1].storyId).toBeUndefined();
});

it('reuses a name-only placeholder for its first role and remaps explicit chains without leaving an empty extra task',()=>{
 const data=teamData();data.tasks=buildStoryWorkItems('f1',{title:'New story',start:'2026-11-02',teams:[]},data);const source=data.tasks[0];
 const addition=planStoryRoles(source.id,{title:source.title,start:source.start,teams:[{roleId:'r1',effort:.5},{roleId:'rQA'}],sequential:true},data);
 expect(addition.updatedSource).toMatchObject({id:source.id,roleId:'r1',platform:'Backend',effort:.5,assignee:'',dependsOn:[]});
 expect(addition.items).toHaveLength(1);expect(addition.items[0]).toMatchObject({roleId:'rQA',effort:0,dependsOn:[source.id],storyId:source.storyId});
 const before=structuredClone(data);data.tasks[0].manualEnd='2026-11-03';expect(()=>planStoryRoles(source.id,{title:source.title,start:'2026-11-04',teams:[{roleId:'r1'}]},data)).toThrow('manual date');expect(data.tasks[0]).toEqual({...before.tasks[0],manualEnd:'2026-11-03'});
});

it('counts placeholder reuse correctly at the project limit and rejects oversized role additions before mutation',()=>{
 const data=teamData();data.tasks=Array.from({length:2999},(_,i)=>({...projectData().tasks[0],id:'existing'+i}));
 const placeholder={...projectData().tasks[0],id:'placeholder',effort:0,platform:'',assignee:''};data.tasks.push(placeholder);
 expect(planStoryRoles(placeholder.id,{title:'Roles',start:placeholder.start,teams:[{roleId:'rQA'}]},data).items).toEqual([]);
 const before=structuredClone(data);expect(()=>planStoryRoles(placeholder.id,{title:'Roles',start:placeholder.start,teams:[{roleId:'rQA'},{roleId:'r1'}]},data)).toThrow('3000 work items');expect(data).toEqual(before);
});
