import {it,expect} from 'vitest';
import {projectData,fullWorkspace} from './fixtures';
import {createScheduler} from '../src/planner/engine.js';
import {initializeDependencySettings,pinDependentDates} from '../src/planner/dependency-settings';
import {fromDay} from '../src/planner/dates.js';
import {workspaceSchema} from '../src/lib/schema';
function linked(){const data=projectData();data.tasks.push({...data.tasks[0],id:'t2',effort:1,dependsOn:['t1']});return data;}

it('defaults to visual links and never moves or blocks a dependent bar when auto-shift is off',()=>{
 const data=linked();delete data.settings.autoShiftDependencies;
 const before=createScheduler(data).calculate();expect(fromDay(before.schedule.t2.start!)).toBe('2026-10-26');
 expect(before.dependencyConflicts.t2).toEqual(['t1']);data.tasks[0].status='hold';
 const paused=createScheduler(data).calculate();expect(paused.schedule.t2.blocked).toBe(false);expect(paused.schedule.t2.end).not.toBeNull();
 data.settings.showDependencyWarnings=false;expect(createScheduler(data).calculate().dependencyConflicts).toEqual({});
});
it('supports calendar and working-day gaps using the dependent working calendar',()=>{
 const data=linked();data.tasks[0].effort=5;data.settings.dependencyGapDays=1;
 expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-11-02');
 data.settings.dependencyGapUnit='working';expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-11-03');
 data.leave.push({id:'leave',person:'u1',type:'vacation',from:'2026-11-02',to:'2026-11-02',note:''});
 expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-11-04');
});
it('lets push mode retain a later chosen start and follow mode move it earlier or later',()=>{
 const data=linked();data.tasks[1].start='2026-11-16';
 expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-11-16');
 data.settings.dependencyShiftPolicy='follow';expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-10-29');
 data.tasks[0].effort=10;expect(fromDay(createScheduler(data).calculate().schedule.t2.start!)).toBe('2026-11-09');
});
it('pins visible automatic dates when disabling movement, including manual window length',()=>{
 const data=linked();data.tasks[1].manualEnd='2026-10-27';const before=createScheduler(data).calculate();
 pinDependentDates(data,before);data.settings.autoShiftDependencies=false;
 const after=createScheduler(data).calculate();expect(after.schedule.t2).toEqual(before.schedule.t2);
 expect(data.tasks[1].start).toBe('2026-10-29');expect(data.tasks[1].manualEnd).toBe('2026-10-30');
 expect(data.tasks[1].effort).toBe(1);expect(data.tasks[1].dependsOn).toEqual(['t1']);
});
it('migrates legacy projects to manual placement once while retaining their displayed positions',()=>{
 const data=linked(),before=createScheduler(data).calculate();delete data.settings.autoShiftDependencies;
 expect(initializeDependencySettings(data)).toBe(true);expect(data.settings.autoShiftDependencies).toBe(false);
 expect(createScheduler(data).calculate().schedule).toEqual(before.schedule);
 const migrated=structuredClone(data);expect(initializeDependencySettings(data)).toBe(false);expect(data).toEqual(migrated);
 data.tasks[1].status='done';data.tasks[1].completedDate='2026-10-27';data.tasks[0].status='hold';data.settings.autoShiftDependencies=true;
 expect(createScheduler(data).calculate().schedule.t2.done).toBe(true);
});
it('validates project-specific options and round-trips choices without imposing defaults on old backups',()=>{
 const w=fullWorkspace(),settings=w.projects[0].data.settings;
 settings.autoShiftDependencies=false;settings.dependencyGapDays=2;settings.dependencyGapUnit='working';settings.dependencyShiftPolicy='follow';settings.showDependencyWarnings=false;
 expect(workspaceSchema.parse(JSON.parse(JSON.stringify(w)))).toEqual(w);
 for(const gap of [-1,.5,366,Infinity]){settings.dependencyGapDays=gap;expect(workspaceSchema.safeParse(w).success).toBe(false);}
 const old=fullWorkspace();delete old.projects[0].data.settings.autoShiftDependencies;expect(workspaceSchema.parse(old).projects[0].data.settings.autoShiftDependencies).toBeUndefined();
});
it('preserves old dependent starts while retiring percentage allocations from new forecasts',()=>{
 const data=linked();delete data.settings.autoShiftDependencies;data.tasks[0].effort=6;data.people[0].capacity={feature:50,bugs:20,ongoing:20,ops:10};
 initializeDependencySettings(data);const schedule=createScheduler(data).calculate().schedule;
 expect(fromDay(schedule.t1.end!)).toBe('2026-11-02');expect(data.tasks[1].start).toBe('2026-11-11');
 expect(fromDay(schedule.t2.start!)).toBe('2026-11-11');expect(data.settings.autoShiftDependencies).toBe(false);
});
