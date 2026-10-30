import { it, expect } from 'vitest';
import { projectData, fullWorkspace } from './fixtures';
import { createScheduler } from '../src/planner/engine.js';
import { taskTimeBreakdown, featureTimeBreakdown, capacityGradient, dependencyPath } from '../src/planner/timeline';
import { buildStoryWorkItems } from '../src/planner/stories';
import { workspaceSchema } from '../src/lib/schema';
import { fromDay } from '../src/planner/dates.js';

it('fills an epic with accounted-time proportions when its child work has gaps',()=>{
  const data=projectData();data.tasks[0].effort=1;data.tasks.push({...data.tasks[0],id:'later',start:'2026-10-30'});
  const engine=createScheduler(data),result=engine.calculate(),parent=result.featureInfo.f1;
  const b=featureTimeBreakdown(parent.start,parent.end!,data.tasks.map(t=>taskTimeBreakdown(t,result.schedule[t.id],data,engine)),parent.endFraction)!;
  const before=structuredClone(b),saved=structuredClone(data);
  expect(b.days).toBe(5);expect(b.totals.development).toBe(2);expect(b.required).toBe(2);
  expect(capacityGradient(b)).toBe('linear-gradient(90deg,#7c9fe5 0.00000% 100.00000%)');
  expect(b).toEqual(before);expect(data).toEqual(saved);
});
it('normalizes mixed colors across a longer manual window without inflating time totals',()=>{
  const data=projectData();Object.assign(data.tasks[0],{effort:.5,start:'2026-10-30',manualEnd:'2026-11-04'});
  data.meetings=[{id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:30,allTeam:true,attendees:[],enabled:true}];
  const engine=createScheduler(data),info=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],info,data,engine)!,before=structuredClone(b);
  expect(b.days).toBe(6);expect(b.totals).toMatchObject({development:.5,meetings:.5,weekends:2});expect(b.actualMeetingMinutes).toBe(120);
  expect(capacityGradient(b)).toBe('linear-gradient(90deg,#7c9fe5 0.00000% 16.66667%,#e3c584 16.66667% 33.33333%,#c7ced9 33.33333% 100.00000%)');
  expect(b).toEqual(before);expect(data.tasks[0]).toMatchObject({effort:.5,start:'2026-10-30',manualEnd:'2026-11-04'});
});
it('returns no mix for an epic window outside its children instead of a blank or invented development band',()=>{
  const data=projectData();data.features[0].manualEnd='2026-10-27';data.tasks[0].start='2026-11-02';
  const engine=createScheduler(data),result=engine.calculate(),parent=result.featureInfo.f1;
  const b=featureTimeBreakdown(parent.start,parent.end!,[taskTimeBreakdown(data.tasks[0],result.schedule.t1,data,engine)])!;
  expect(parent.windowConflict).toBe(true);expect(Object.values(b.totals).every(value=>value===0)).toBe(true);expect(capacityGradient(b)).toBe('none');expect(b.required).toBe(3);
});

it('explains six development days over eight calendar days regardless of retired allocations without inventing effort', () => {
  const data=projectData(); data.tasks[0].effort=6; data.people[0].capacity={feature:50,bugs:20,ongoing:20,ops:10};
  const engine=createScheduler(data),scheduled=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],scheduled,data,engine)!;
  expect(b.days).toBe(8); expect(b.totals).toEqual({development:6,meetings:0,weekends:2,holidays:0,timeoff:0,sick:0});
  expect(Object.values(b.totals).reduce((a,b)=>a+b,0)).toBeCloseTo(8);
  expect(capacityGradient(b)).toContain('#7c9fe5'); expect(capacityGradient(b)).toContain('#c7ced9');
  const gradient=capacityGradient(b),colors=gradient.match(/#[a-f0-9]{6}/g)!;
  expect(colors).toHaveLength(2);expect(new Set(colors).size).toBe(colors.length);
  expect(gradient).toContain('#7c9fe5 0.00000% 75.00000%');
  expect(gradient).toContain('#c7ced9 75.00000% 100.00000%');
});
it('accounts for rounded meetings and a half-day finish without an unused category', () => {
  const data=fullWorkspace().projects[0].data,engine=createScheduler(data),result=engine.calculate();
  const b=taskTimeBreakdown(data.tasks[0],result.schedule.t1,data,engine)!;
  expect(b.totals.meetings).toBeGreaterThan(0);expect(b.totals).not.toHaveProperty('available');
  expect(b.allocated).toBe(3);expect(Object.values(b.totals).reduce((a,b)=>a+b,0)).toBeCloseTo(b.days,5);
  expect(taskTimeBreakdown({...data.tasks[0],status:'done'}, {...result.schedule.t1,done:true},data,engine)).toBeNull();
});
it('keeps parallel parent capacity mixes distinct from summed person-day effort', () => {
  const data=projectData();data.tasks[0].effort=2;data.tasks.push({...data.tasks[0],id:'t2',assignee:'',effort:2});
  const engine=createScheduler(data),result=engine.calculate(),b=featureTimeBreakdown(result.featureInfo.f1.start,result.featureInfo.f1.end!,data.tasks.map(task=>taskTimeBreakdown(task,result.schedule[task.id],data,engine)))!;
  expect(b.days).toBe(2);expect(b.required).toBe(4);expect(b.totals.development).toBe(2);
});
it('separates recurring meetings, weekends, sick leave and days off over the entire bar',()=>{
  const data=projectData();data.tasks[0].effort=6;data.people[0].capacity={feature:10,bugs:90,ongoing:0,ops:0};
  data.meetings.push({id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:60,allTeam:true,attendees:[],enabled:true});
  data.leave.push({id:'sick',person:'u1',type:'sick',from:'2026-10-27',to:'2026-10-27',note:''},{id:'off',person:'u1',type:'vacation',from:'2026-10-30',to:'2026-11-01',note:''});
  const engine=createScheduler(data),info=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],info,data,engine)!;
  expect(fromDay(info.end!)).toBe('2026-11-05');expect(b.days).toBe(11);
  expect(b.totals).toEqual({development:6,meetings:1,weekends:2,holidays:0,timeoff:1,sick:1});
  expect(Object.values(b.totals).reduce((sum,n)=>sum+n,0)).toBe(11);
  expect(new Set(capacityGradient(b).match(/#[a-f0-9]{6}/g)).size).toBe(5);
  data.settings.observeHolidays=true;data.holidays.push({date:'2026-10-28',name:'Company holiday'});
  const changed=createScheduler(data);expect(taskTimeBreakdown(data.tasks[0],changed.calculate().schedule.t1,data,changed)!.totals.holidays).toBe(1);
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
