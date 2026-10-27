import { it, expect } from 'vitest';
import { projectData, fullWorkspace } from './fixtures';
import { createScheduler } from '../src/planner/engine.js';
import { taskTimeBreakdown, featureTimeBreakdown, capacityGradient, dependencyPath } from '../src/planner/timeline';
import { buildStoryWorkItems } from '../src/planner/stories';
import { workspaceSchema } from '../src/lib/schema';
import { fromDay } from '../src/planner/dates.js';

it('explains six development days over sixteen calendar days without inventing effort', () => {
  const data=projectData(); data.tasks[0].effort=6; data.people[0].capacity={feature:50,bugs:20,ongoing:20,ops:10};
  const engine=createScheduler(data),scheduled=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],scheduled,data,engine)!;
  expect(b.days).toBe(16); expect(b.totals).toEqual({development:6,bugs:2.4,ongoing:2.4,ops:1.2,meetings:0,nonwork:4,available:0});
  expect(Object.values(b.totals).reduce((a,b)=>a+b,0)).toBeCloseTo(16);
  expect(capacityGradient(b)).toContain('#7870db'); expect(capacityGradient(b)).toContain('#e9a367');
  const gradient=capacityGradient(b),colors=gradient.match(/#[a-f0-9]{6}/g)!;
  expect(colors).toHaveLength(5);expect(new Set(colors).size).toBe(colors.length);
  expect(gradient).toContain('#7870db 0.00000% 37.50000%');
  expect(gradient).toContain('#cbd2de 75.00000% 100.00000%');
});
it('accounts for meetings, overrides, leave, and unused final-day availability once', () => {
  const data=fullWorkspace().projects[0].data,engine=createScheduler(data),result=engine.calculate();
  const b=taskTimeBreakdown(data.tasks[0],result.schedule.t1,data,engine)!;
  expect(b.totals.meetings).toBeGreaterThan(0);expect(b.totals.available).toBeGreaterThan(0);
  expect(b.allocated).toBe(3);expect(Object.values(b.totals).reduce((a,b)=>a+b,0)).toBeCloseTo(b.days,5);
  expect(taskTimeBreakdown({...data.tasks[0],status:'done'}, {...result.schedule.t1,done:true},data,engine)).toBeNull();
});
it('keeps parallel parent capacity mixes distinct from summed person-day effort', () => {
  const data=projectData();data.tasks[0].effort=2;data.tasks.push({...data.tasks[0],id:'t2',assignee:'',effort:2});
  const engine=createScheduler(data),result=engine.calculate(),b=featureTimeBreakdown(result.featureInfo.f1.start,result.featureInfo.f1.end!,data.tasks.map(task=>taskTimeBreakdown(task,result.schedule[task.id],data,engine)))!;
  expect(b.days).toBe(2);expect(b.required).toBe(4);expect(b.totals.development).toBe(2);
});
it('preserves manual date windows and estimates while reporting capacity shortfall', () => {
  const data=projectData();data.tasks[0].effort=6;data.tasks[0].manualEnd='2026-10-28';
  const engine=createScheduler(data),result=engine.calculate(),info=result.schedule.t1;
  expect(fromDay(info.start!)).toBe('2026-10-26');expect(fromDay(info.end!)).toBe('2026-10-28');expect(info.shortfall).toBe(3);
  expect(data.tasks[0].effort).toBe(6);expect(result.featureInfo.f1.atRisk).toBe(true);
  expect(taskTimeBreakdown(data.tasks[0],info,data,engine)!.missing).toBe(3);
  data.tasks.push({...data.tasks[0],id:'dependent',manualEnd:undefined,effort:1,dependsOn:['t1']});
  expect(createScheduler(data).calculate().schedule.dependent.blocked).toBe(true);
});
it('moves a dependent manual window together and derives automatic parents from its displayed bars', () => {
  const data=projectData();data.tasks.push({...data.tasks[0],id:'t2',start:'2026-10-26',manualEnd:'2026-10-27',effort:1,dependsOn:['t1']});
  const result=createScheduler(data).calculate();expect(fromDay(result.schedule.t2.start!)).toBe('2026-10-29');
  expect(fromDay(result.schedule.t2.end!)).toBe('2026-10-30');expect(result.featureInfo.f1.end).toBe(result.schedule.t2.end);
});
it('supports an explicit epic window without changing child effort or child forecasts', () => {
  const data=projectData(),original=createScheduler(data).calculate();data.features[0].manualEnd='2026-10-27';
  const result=createScheduler(data).calculate();expect(result.schedule).toEqual(original.schedule);
  expect(fromDay(result.featureInfo.f1.end!)).toBe('2026-10-27');expect(result.featureInfo.f1.windowConflict).toBe(true);
  delete data.features[0].manualEnd;expect(createScheduler(data).calculate()).toEqual(original);
});
it('creates two roles on the same platform with strictly role-matched assignees', () => {
  const data=projectData();data.roles.push({id:'r2',name:'Backend Reviewer',platform:'Backend'});
  data.people.push({...data.people[0],id:'u2',roleId:'r2',role:'Backend Reviewer'});
  const draft={title:'Review rules',start:'2026-10-26',teams:[{roleId:'r1',assignee:'u1',effort:2},{roleId:'r2',assignee:'u2',effort:1}]};
  const tasks=buildStoryWorkItems('f1',draft,data);expect(tasks.map(t=>t.roleId)).toEqual(['r1','r2']);expect(tasks.map(t=>t.platform)).toEqual(['Backend','Backend']);
  draft.teams[0].assignee='u2';expect(()=>buildStoryWorkItems('f1',draft,data)).toThrow('matching team member');
});
it('roundtrips date/role metadata in backups and rejects invalid windows and role assignments', () => {
  const w=fullWorkspace(),data=w.projects[0].data;data.tasks[0].roleId='r1';data.tasks[0].manualEnd='2026-11-02';data.features[0].manualEnd='2026-11-30';
  expect(workspaceSchema.parse(JSON.parse(JSON.stringify(w)))).toEqual(w);
  data.tasks[0].manualEnd='2026-10-01';expect(workspaceSchema.safeParse(w).success).toBe(false);
  data.tasks[0].manualEnd='2026-11-02';data.tasks[0].roleId='rfront';expect(workspaceSchema.safeParse(w).success).toBe(false);
  expect(dependencyPath({x:100,y:50},{x:50,y:100})).toMatch(/^M 100 50 C/);
});
