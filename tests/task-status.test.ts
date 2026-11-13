import {describe,it,expect,vi,afterEach} from 'vitest';
import {changeTaskStatus} from '../src/planner/task-status';
import {createScheduler} from '../src/planner/engine.js';
import {asDay} from '../src/planner/dates.js';
import {projectData} from './fixtures';

afterEach(()=>vi.useRealTimers());
describe('status changes preserve the existing task plan',()=>{
  it('records the forecast finish rather than the much later day that completion is clicked',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const data=projectData(),task=data.tasks[0],before=createScheduler(data).calculate().schedule[task.id];
    const original=structuredClone(task);changeTaskStatus(task,'done',before);
    expect(task).toMatchObject({status:'done',start:'2026-10-26',completedDate:'2026-10-28',manualEnd:'2026-10-28',manualEndFraction:1,effort:original.effort});
    expect(createScheduler(data).calculate().schedule[task.id]).toMatchObject({start:before.start,end:before.end,done:true});
    expect(task.remaining).toBe(original.remaining);
  });

  it('keeps planned and in-progress switches status-only without converting an automatic forecast',()=>{
    const data=projectData(),task=data.tasks[0],before=structuredClone(task),schedule=createScheduler(data).calculate().schedule[task.id];
    changeTaskStatus(task,'progress',schedule);expect(task).toEqual({...before,status:'progress'});
    changeTaskStatus(task,'planned',schedule);expect(task).toEqual(before);
    expect(createScheduler(data).calculate().schedule[task.id]).toEqual(schedule);
  });

  it('pins the visible start and half-day finish when paused, then resumes that window without changing effort',()=>{
    const data=projectData(),task=data.tasks[0];Object.assign(task,{start:'2026-10-24',effort:1.5,remaining:1.5});
    const before=createScheduler(data).calculate().schedule[task.id];expect(before).toMatchObject({start:asDay('2026-10-26'),end:asDay('2026-10-27'),endFraction:.5});
    changeTaskStatus(task,'hold',before);
    expect(task).toMatchObject({start:'2026-10-26',manualEnd:'2026-10-27',manualEndFraction:.5,effort:1.5,remaining:1.5,status:'hold'});
    const paused=createScheduler(data).calculate().schedule[task.id];expect(paused).toMatchObject({hold:true,start:before.start,end:before.end,endFraction:.5,alloc:{}});
    changeTaskStatus(task,'progress',paused);const after=createScheduler(data).calculate().schedule[task.id];
    expect(after).toMatchObject({start:before.start,end:before.end,endFraction:before.endFraction,manual:true,shortfall:0});
    expect(task.effort).toBe(1.5);expect(task.remaining).toBe(1.5);
  });

  it('preserves a completed half-day window when reopening without carrying a stale completion date',()=>{
    const data=projectData(),task=data.tasks[0];Object.assign(task,{effort:2.5,remaining:1.5});
    const before=createScheduler(data).calculate().schedule[task.id];changeTaskStatus(task,'done',before);
    expect(task).toMatchObject({completedDate:'2026-10-27',manualEnd:'2026-10-27',manualEndFraction:.5,effort:2.5,remaining:1.5});
    changeTaskStatus(task,'planned',{...before,done:true,alloc:{}});
    expect(task.completedDate).toBeUndefined();
    expect(createScheduler(data).calculate().schedule[task.id]).toMatchObject({start:before.start,end:before.end,endFraction:.5,shortfall:0});
    expect(task.effort).toBe(2.5);expect(task.remaining).toBe(1.5);
  });

  it('reopens old completed work using its recorded date and preserves manually chosen dates',()=>{
    const data=projectData(),task=data.tasks[0];Object.assign(task,{status:'done',completedDate:'2026-11-02',manualEnd:'2026-10-28',manualEndFraction:.5});
    changeTaskStatus(task,'progress');
    expect(task).toMatchObject({status:'progress',start:'2026-10-26',manualEnd:'2026-11-02',manualEndFraction:1,effort:3});
    expect(task.completedDate).toBeUndefined();
    const before=structuredClone(task);changeTaskStatus(task,'planned');expect(task).toEqual({...before,status:'planned'});
  });

  it('completes paused or unestimated work from known dates without inventing today or changing its estimate',()=>{
    const data=projectData(),paused=data.tasks[0];Object.assign(paused,{status:'hold',manualEnd:'2026-10-29',manualEndFraction:.5});
    changeTaskStatus(paused,'done',{start:asDay(paused.start),end:null,hold:true,blocked:false,alloc:{}});
    expect(paused).toMatchObject({completedDate:'2026-10-29',manualEnd:'2026-10-29',manualEndFraction:.5,effort:3});
    const unknown={...projectData().tasks[0],effort:0,start:'2026-10-27'};changeTaskStatus(unknown,'done',{start:asDay(unknown.start),end:null,blocked:true,needsEstimate:true,alloc:{}});
    expect(unknown).toMatchObject({completedDate:'2026-10-27',effort:0,status:'done'});expect(unknown.manualEnd).toBeUndefined();
  });

  it('keeps the half-day completed bar and automatic dependent start at their original boundaries',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const data=projectData(),task=data.tasks[0];task.effort=1.5;
    data.tasks.push({...task,id:'dependent',title:'Next step',effort:1,start:'2026-10-26',dependsOn:[task.id]});
    const before=createScheduler(data).calculate();changeTaskStatus(task,'done',before.schedule[task.id]);
    const after=createScheduler(data).calculate();
    expect(after.schedule[task.id]).toMatchObject({start:before.schedule[task.id].start,end:before.schedule[task.id].end,endFraction:.5,done:true});
    expect(after.schedule.dependent.start).toBe(before.schedule.dependent.start);
    expect(after.featureInfo.f1.end).toBe(before.featureInfo.f1.end);
    expect(task.effort).toBe(1.5);
  });

  it('keeps a paused bar window while releasing capacity and blocking genuine dependents',()=>{
    const data=projectData(),task=data.tasks[0];
    data.tasks.push({...task,id:'dependent',title:'Next step',effort:1,dependsOn:[task.id]});
    const before=createScheduler(data).calculate();changeTaskStatus(task,'hold',before.schedule[task.id]);
    const paused=createScheduler(data).calculate();
    expect(paused.schedule[task.id]).toMatchObject({start:before.schedule[task.id].start,end:before.schedule[task.id].end,hold:true,alloc:{}});
    expect(paused.schedule.dependent).toMatchObject({blocked:true,end:null,alloc:{}});expect(paused.working.size).toBe(0);
    changeTaskStatus(task,'progress',paused.schedule[task.id]);
    const resumed=createScheduler(data).calculate();
    expect(resumed.schedule[task.id]).toMatchObject({start:before.schedule[task.id].start,end:before.schedule[task.id].end});
    expect(resumed.schedule.dependent.start).toBe(before.schedule.dependent.start);
  });

  it('ignores invalid computed windows and leaves repeated status selections completely unchanged',()=>{
    const task=projectData().tasks[0],before=structuredClone(task);
    changeTaskStatus(task,'planned',{start:NaN,end:NaN,blocked:false,alloc:{}});expect(task).toEqual(before);
    changeTaskStatus(task,'done',{start:asDay('2026-10-27'),end:asDay('2026-10-26'),blocked:false,alloc:{}});
    expect(task).toEqual({...before,status:'done',completedDate:before.start});
  });
});
