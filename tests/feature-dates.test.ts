import {it,expect} from 'vitest';
import {fullWorkspace,projectData} from './fixtures';
import {shiftFeatureDates} from '../src/planner/feature-dates';
import {createScheduler} from '../src/planner/engine.js';
import {fromDay} from '../src/planner/dates.js';
import {calendarSpan} from '../src/planner/precision.js';

it('moves every child and its manual/completed dates while preserving half days, estimates, references and fixed targets',()=>{
 const data=fullWorkspace().projects[0].data;data.features[0].collapsed=true;data.features[0].manualEnd='2026-11-06';data.features[0].manualEndFraction=.5;
 data.tasks[0].manualEnd='2026-10-29';data.tasks[0].manualEndFraction=.5;
 Object.assign(data.tasks[1],{status:'done',start:'2026-10-20',completedDate:'2026-10-22'});
 data.features.push({...data.features[0],id:'other',manualEnd:undefined});data.tasks.push({...data.tasks[0],id:'outside',featureId:'other'});
 const original=structuredClone(data);
 expect(shiftFeatureDates(data,'f1',2)).toBe(true);
 expect(data.features[0]).toEqual({...original.features[0],start:'2026-10-28',manualEnd:'2026-11-08'});
 expect(data.tasks[0]).toEqual({...original.tasks[0],start:'2026-10-28',manualEnd:'2026-10-31'});
 expect(data.tasks[1]).toEqual({...original.tasks[1],start:'2026-10-22',completedDate:'2026-10-24'});
 expect(data.tasks[2]).toEqual({...original.tasks[2],start:'2026-10-28'});
 expect(data.features[1]).toEqual(original.features[1]);expect(data.tasks[3]).toEqual(original.tasks[3]);
 expect({...data,features:original.features,tasks:original.tasks}).toEqual(original);
});
it('rejects a group shift atomically if any child date crosses the supported bounds',()=>{
 const data=projectData();data.tasks[0].manualEnd='2200-12-31';let before=structuredClone(data);
 expect(shiftFeatureDates(data,'f1',1)).toBe(false);expect(data).toEqual(before);
 delete data.tasks[0].manualEnd;data.tasks[0].completedDate='2000-01-01';before=structuredClone(data);
 expect(shiftFeatureDates(data,'f1',-1)).toBe(false);expect(data).toEqual(before);
});
it('leaves missing epics, zero/fractional shifts and invalid dates unchanged',()=>{
 const data=projectData(),before=structuredClone(data);
 for(const [id,days]of [['missing',1],['f1',0],['f1',.5],['f1',NaN],['f1',Infinity]] as const){expect(shiftFeatureDates(data,id,days)).toBe(false);expect(data).toEqual(before);}
 data.tasks[0].start='2026-02-31';const invalid=structuredClone(data);expect(shiftFeatureDates(data,'f1',1)).toBe(false);expect(data).toEqual(invalid);
});
it('keeps automatic forecasts automatic and recalculates them for the new working calendar',()=>{
 const data=projectData();data.settings.autoShiftDependencies=false;
 const before=createScheduler(data).calculate().schedule.t1;expect(calendarSpan(before)).toBe(3);
 expect(shiftFeatureDates(data,'f1',4)).toBe(true);
 const after=createScheduler(data).calculate().schedule.t1;
 expect(data.tasks[0].start).toBe('2026-10-30');expect(fromDay(after.end!)).toBe('2026-11-03');expect(calendarSpan(after)).toBe(5);
 expect(data.tasks[0].effort).toBe(3);expect(data.tasks[0].manualEnd).toBeUndefined();expect(data.features[0].manualEnd).toBeUndefined();
});
