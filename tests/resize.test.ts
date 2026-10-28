import {it,expect} from 'vitest';
import {resizeWindow} from '../src/planner/resize';
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
it('pins a half-day window without rewriting effort and warns when effort does not fit',()=>{
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
