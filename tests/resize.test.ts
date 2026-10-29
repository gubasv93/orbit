import {it,expect} from 'vitest';
import {resizeWindow,taskResizeEstimate,resizeTask,type ResizeDateWindow} from '../src/planner/resize';
import {asDay,fromDay} from '../src/planner/dates.js';
import {calendarSpan} from '../src/planner/precision.js';
import {createScheduler} from '../src/planner/engine.js';
import {workspaceSchema} from '../src/lib/schema';
import {fullWorkspace,projectData} from './fixtures';
const bounds={start:asDay('2026-10-26'),end:asDay('2026-10-27'),endFraction:1};

it('extends and shrinks the end in half-day slots without mutating the input',()=>{
 const original=structuredClone(bounds);
 expect(resizeWindow(bounds,'end',.5)).toEqual({start:'2026-10-26',manualEnd:'2026-10-28',manualEndFraction:.5});
 expect(resizeWindow(bounds,'end',-1.5)).toEqual({start:'2026-10-26',manualEnd:'2026-10-26',manualEndFraction:.5});
 expect(resizeWindow(bounds,'end',-100)).toEqual(resizeWindow(bounds,'end',-1.5));expect(bounds).toEqual(original);
});
it('moves the start by dates while keeping the end and at least half a day',()=>{
 expect(resizeWindow(bounds,'start',1)).toEqual({start:'2026-10-27',manualEnd:'2026-10-27',manualEndFraction:1});
 expect(resizeWindow({...bounds,endFraction:.5},'start',100)).toEqual({start:'2026-10-27',manualEnd:'2026-10-27',manualEndFraction:.5});
});
it('clamps to supported dates and the maximum window and rejects absent forecasts',()=>{
 expect(resizeWindow(bounds,'end',1e8)?.manualEnd).toBe('2036-10-22');
 expect(resizeWindow({start:asDay('2000-01-01'),end:asDay('2000-01-02')},'start',-999)?.start).toBe('2000-01-01');
 expect(resizeWindow({start:asDay('2200-12-30'),end:asDay('2200-12-31')},'end',999)?.manualEnd).toBe('2200-12-31');
 expect(resizeWindow({...bounds,end:null},'end',1)).toBeNull();expect(resizeWindow(bounds,'end',NaN)).toBeNull();
});
it('keeps geometry-only date pinning separate from estimate updates',()=>{
 const data=projectData(),original=structuredClone(data.tasks[0]);
 Object.assign(data.tasks[0],resizeWindow(bounds,'end',-.5));
 const info=createScheduler(data).calculate().schedule.t1;
 expect(calendarSpan(info)).toBe(1.5);expect(info.shortfall).toBe(1.5);expect(data.tasks[0].effort).toBe(original.effort);
 expect(fromDay(info.end!)).toBe('2026-10-27');expect(info.endFraction).toBe(.5);
});
it('persists half-day windows in backups and keeps epic resize independent of child dates',()=>{
 const w=fullWorkspace(),data=w.projects[0].data,children=structuredClone(data.tasks);
 Object.assign(data.features[0],resizeWindow(bounds,'end',-.5));
 const parsed=workspaceSchema.parse(w).projects[0].data;
 expect(parsed.features[0].manualEndFraction).toBe(.5);expect(parsed.tasks).toEqual(children);
 const info=createScheduler(parsed).calculate().featureInfo.f1;expect(info.windowConflict).toBe(true);expect(calendarSpan(info)).toBe(1.5);
 data.features[0].manualEndFraction=.25 as .5;expect(workspaceSchema.safeParse(w).success).toBe(false);
});

it('recalculates estimate from exact meeting unions, working dates, absences and the final half day',()=>{
 const data=projectData(),task=data.tasks[0];data.settings.observeHolidays=true;
 data.people[0].capacity={feature:10,bugs:30,ongoing:30,ops:30};data.iterations[0].overrides.u1={feature:20,bugs:20,ongoing:30,ops:30};
 const meeting={id:'daily',title:'Daily',recurrence:'workdays' as const,weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:60,allTeam:true,attendees:[],enabled:true};
 data.meetings=[meeting,{...meeting,id:'overlap',startTime:'09:30'}];
 data.holidays=[{date:'2026-10-28',name:'Holiday'}];
 data.leave=[{id:'dayoff',person:'u1',type:'dayoff',from:'2026-10-29',to:'2026-10-29',note:''},{id:'sick',person:'u1',type:'sick',from:'2026-10-30',to:'2026-10-30',note:''}];
 const window={start:'2026-10-26',manualEnd:'2026-11-03',manualEndFraction:.5 as const},before=structuredClone(data);
 expect(taskResizeEstimate(data,task,window)).toEqual({effort:2.5,remaining:2.5,completedDays:0,availableDays:2.75,meetingMinutes:360,calendarDays:8.5,roundingDays:.25});expect(data).toEqual(before);
 expect(resizeTask(data,task.id,window)).toBe(true);expect(task).toMatchObject({...window,effort:2.5,remaining:2.5});
 const info=createScheduler(data).calculate().schedule.t1;expect(info.shortfall).toBe(0);expect(calendarSpan(info)).toBe(8.5);expect(info.endFraction).toBe(.5);
});

it('retains completed effort as remaining capacity changes and does not alter related items',()=>{
 const data=projectData(),task=data.tasks[0];Object.assign(task,{effort:5,remaining:2,status:'progress'});
 data.tasks.push({...task,id:'sibling',effort:1,remaining:1,dependsOn:['t1']});const sibling=structuredClone(data.tasks[1]),feature=structuredClone(data.features[0]);
 const window={start:'2026-10-26',manualEnd:'2026-10-27',manualEndFraction:.5 as const};
 expect(taskResizeEstimate(data,task,window)).toMatchObject({effort:4.5,remaining:1.5,completedDays:3});expect(resizeTask(data,task.id,window)).toBe(true);
 expect(task.effort-task.remaining!).toBe(3);expect(task.status).toBe('progress');expect(task.dependsOn).toEqual([]);expect(data.tasks[1]).toEqual(sibling);expect(data.features[0]).toEqual(feature);
 expect(resizeTask(data,task.id,{...window,manualEnd:'2026-10-28'})).toBe(true);expect(task).toMatchObject({effort:5.5,remaining:2.5});expect(task.effort-task.remaining!).toBe(3);
});

it('recalculates a shifted start and excludes meetings and leave that do not apply to unassigned work',()=>{
 const data=projectData(),task=data.tasks[0];task.assignee='';
 data.meetings=[{id:'all',title:'All team',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:480,allTeam:true,attendees:[],enabled:true}];
 data.leave=[{id:'leave',person:'u1',type:'vacation',from:'2026-10-26',to:'2026-11-02',note:''}];
 const window=resizeWindow(bounds,'start',1)!;expect(resizeTask(data,task.id,window)).toBe(true);expect(task).toMatchObject({start:'2026-10-27',manualEnd:'2026-10-27',effort:1,remaining:1});
 const acrossWeekend={start:'2026-10-30',manualEnd:'2026-11-02',manualEndFraction:.5 as const};
 expect(taskResizeEstimate(data,task,acrossWeekend)).toMatchObject({effort:1.5,meetingMinutes:0,availableDays:1.5,calendarDays:3.5});
});

it('rejects windows without a half day of work and invalid date windows atomically',()=>{
 const data=projectData(),task=data.tasks[0];data.meetings=[{id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:30,allTeam:true,attendees:[],enabled:true}];
 const base={start:'2026-10-26',manualEnd:'2026-10-26',manualEndFraction:1 as const},before=structuredClone(data);
 const windows=[null,undefined,{...base,manualEndFraction:.5},{...base,start:'2026-10-31',manualEnd:'2026-11-01'},{...base,start:'1999-12-31'},{...base,start:'2026-02-30'},{...base,manualEnd:'2026-10-25'},{...base,manualEnd:'2037-01-01'},{...base,manualEndFraction:.25}] as (ResizeDateWindow|null|undefined)[];
 for(const window of windows){expect(resizeTask(data,task.id,window)).toBe(false);expect(data).toEqual(before);}
 expect(resizeTask(data,'missing',base)).toBe(false);expect(data).toEqual(before);
});

it('protects non-resizable statuses, unestimated work, legacy completion fractions and estimate limits',()=>{
 const base=projectData(),window={start:'2026-10-26',manualEnd:'2026-10-26',manualEndFraction:1 as const};
 for(const values of [{status:'done'},{status:'hold'},{effort:0},{effort:3,remaining:2.7},{effort:3650,remaining:0},{assignee:'missing'}]){
  const data=structuredClone(base);Object.assign(data.tasks[0],values);const before=structuredClone(data);
  expect(resizeTask(data,'t1',window)).toBe(false);expect(data).toEqual(before);
 }
});

it('keeps other assignments as conflicts instead of reducing the resized estimate',()=>{
 const data=projectData(),task=data.tasks[0];data.tasks.push({...task,id:'other'});
 const window={start:'2026-10-26',manualEnd:'2026-10-27',manualEndFraction:1 as const};
 expect(resizeTask(data,'t1',window)).toBe(true);expect(task).toMatchObject({effort:2,remaining:2});
 expect(createScheduler(data).calculate().conflicts.t1).toEqual(['2026-10-26','2026-10-27']);
 const workspace=fullWorkspace();workspace.projects[0].data=data;expect(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).projects[0].data.tasks[0]).toEqual(task);
});
