import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { createScheduler } from '../src/planner/engine.js';
import { asDay, fromDay } from '../src/planner/dates.js';
import { projectData } from './fixtures';

describe('preserved scheduling behavior', () => {
  it('preserves prototype work-item allocations and forecasts for epics with no paused or blocked work', () => {
    const html = readFileSync(new URL('../docs/reference/orbit_roadmap_prototype.html', import.meta.url), 'utf8');
    const source = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const dates = source.slice(source.indexOf('const asDay='), source.indexOf('const clamp='));
    const seed = source.slice(source.indexOf('function seed()'), source.indexOf('// Existing single-project'));
    const logic = source.slice(source.indexOf('function isHoliday('), source.indexOf('const weekDayLabels=')) + source.slice(source.indexOf('function calcSchedule()'), source.indexOf('let computed=calcSchedule();'));
    const baseline = runInNewContext(`const DAY=86400000;${dates}${seed}let data=seed();data.meetings=[];data.settings.defaultCapacity={feature:100,bugs:0,ongoing:0,ops:0};data.people.forEach(p=>p.capacity={...data.settings.defaultCapacity});data.iterations.forEach(i=>i.overrides={});const getPerson=id=>data.people.find(p=>p.id===id),getFeature=id=>data.features.find(f=>f.id===id),getTask=id=>data.tasks.find(t=>t.id===id);${logic}JSON.stringify({data,result:calcSchedule()},(key,value)=>value instanceof Map?[...value]:value);`, {}, { timeout: 3000 });
    const { data, result } = JSON.parse(baseline);
    data.settings.autoShiftDependencies=true;
    const {dependencyConflicts: _warnings,...calculated}=createScheduler(data).calculate();
    const actual = JSON.parse(JSON.stringify(calculated, (_key, value) => _key==='endFraction'?undefined:value instanceof Map ? [...value] : value));
    const {featureInfo:actualFeatures,...actualWork}=actual,{featureInfo:prototypeFeatures,...prototypeWork}=result;
    expect(actualWork).toEqual(prototypeWork);
    for(const [id,info] of Object.entries(prototypeFeatures) as [string,{blocked:boolean}][])if(!info.blocked)expect(actualFeatures[id]).toMatchObject(info);
  });
  it('distinguishes work effort from calendar duration and skips weekends', () => {
    const data = projectData(); data.tasks[0].effort = 6;
    expect(fromDay(createScheduler(data).calculate().schedule.t1.end!)).toBe('2026-11-02');
  });
  it('deducts overlapping meeting minutes once, before allocation', () => {
    const data = projectData(); data.people[0].capacity = { feature: 50, bugs: 20, ongoing: 20, ops: 10 };
    const meeting = { id: 'm1', title: 'Sync', recurrence: 'workdays' as const, weekday: 1, interval: 1, nth: 1, startDate: '2026-10-26', endDate: '', startTime: '09:00', duration: 60, allTeam: true, attendees: [], enabled: true };
    data.meetings = [meeting, { ...meeting, id: 'm2', startTime: '09:30' }];
    const engine = createScheduler(data);
    expect(engine.meetingMinutes('u1', '2026-10-26')).toBe(90);
    expect(engine.featureCapacity('u1', '2026-10-26')).toBe(0.8125);
  });
  it('supports biweekly and nth/last weekday monthly recurrences', () => {
    const engine = createScheduler(projectData());
    const base = { enabled: true, startDate: '2026-10-26', weekday: 1, interval: 2, nth: 1, endDate: '' };
    expect(engine.meetingOccurs({ ...base, recurrence: 'interval' }, '2026-11-02')).toBe(false);
    expect(engine.meetingOccurs({ ...base, recurrence: 'interval' }, '2026-11-09')).toBe(true);
    expect(engine.meetingOccurs({ ...base, weekday: 4, nth: 3, recurrence: 'monthly' }, '2026-11-19')).toBe(true);
    expect(engine.meetingOccurs({ ...base, nth: -1, recurrence: 'monthly' }, '2026-11-30')).toBe(true);
  });
  it('extends forecasts for leave and respects the holiday switch', () => {
    const data = projectData(); data.leave = [{ id: 'l1', person: 'u1', type: 'sick', from: '2026-10-27', to: '2026-10-28', note: '' }];
    expect(fromDay(createScheduler(data).calculate().schedule.t1.end!)).toBe('2026-10-30');
    data.leave = []; data.holidays = [{ date: '2026-10-27', name: 'Optional holiday' }];
    expect(fromDay(createScheduler(data).calculate().schedule.t1.end!)).toBe('2026-10-28');
    data.settings.observeHolidays = true;
    expect(fromDay(createScheduler(data).calculate().schedule.t1.end!)).toBe('2026-10-29');
  });
  it('blocks dependents indefinitely on hold and releases future capacity', () => {
    const data = projectData(); data.tasks[0].status = 'hold'; data.tasks.push({ ...data.tasks[0], id: 't2', status: 'planned', dependsOn: ['t1'] });
    const result = createScheduler(data).calculate();
    expect(result.schedule.t1.end).toBeNull(); expect(result.schedule.t2.blocked).toBe(true);
    expect(result.schedule.t2.end).toBeNull(); expect(result.working.size).toBe(0);
    data.tasks[0].status = 'progress';
    expect(createScheduler(data).calculate().schedule.t2.start).toBe(asDay('2026-10-29'));
  });
  it('flags overbooking without changing priorities or task order', () => {
    const data = projectData(); data.tasks.push({ ...data.tasks[0], id: 't2' });
    const result = createScheduler(data).calculate();
    expect(result.schedule.t1.start).toBe(result.schedule.t2.start);
    expect(result.conflicts.t1).toHaveLength(3); expect(data.tasks.map(t => t.id)).toEqual(['t1','t2']);
  });
  it('derives parent forecasts from child tasks and ignores retired percentage overrides', () => {
    const data = projectData(); data.iterations[0].overrides.u1 = { feature: 50, bugs: 20, ongoing: 20, ops: 10 };
    const result = createScheduler(data).calculate();
    expect(result.featureInfo.f1.end).toBe(result.schedule.t1.end);
    expect(fromDay(result.featureInfo.f1.end!)).toBe('2026-10-28');
  });
});

it('leaves unestimated items unscheduled and the parent forecast incomplete without allocating fake effort',()=>{
 const data=projectData();Object.assign(data.tasks[0],{effort:0,platform:'',assignee:''});
 const result=createScheduler(data).calculate();expect(result.schedule.t1).toMatchObject({needsEstimate:true,end:null,alloc:{}});expect(result.working.size).toBe(0);expect(result.featureInfo.f1).toMatchObject({needsEstimate:true,blocked:true,end:null});expect(result.errors).toEqual([]);
 data.features[0].manualEnd='2026-11-01';expect(createScheduler(data).calculate().featureInfo.f1).toMatchObject({needsEstimate:true,manual:true,windowConflict:true});
});

it('keeps scheduled epic work visible when a sibling is paused without unblocking its genuine dependents',()=>{
 const data=projectData();data.tasks.push({...data.tasks[0],id:'paused',status:'hold',start:'2026-10-01'},{...data.tasks[0],id:'dependent',dependsOn:['paused']});
 const result=createScheduler(data).calculate();expect(result.schedule.dependent).toMatchObject({blocked:true,end:null});expect(result.schedule.paused).toMatchObject({hold:true,end:null,alloc:{}});
 expect(result.featureInfo.f1).toMatchObject({start:result.schedule.t1.start,end:result.schedule.t1.end,pausedCount:1,activeCount:1,allPaused:false,forecastIncomplete:true});
 expect(result.working.get('u1:2026-10-26')).toBe(1);expect(data.tasks[0].status).toBe('planned');
 data.tasks[1].status='progress';const resumed=createScheduler(data).calculate();expect(resumed.featureInfo.f1.pausedCount).toBe(0);expect(resumed.schedule.dependent.blocked).toBe(false);
});

it('distinguishes all-paused epics, preserves manual targets and shows only known work when estimates are missing',()=>{
 const data=projectData();data.tasks[0].status='hold';let result=createScheduler(data).calculate();expect(result.featureInfo.f1).toMatchObject({end:null,allPaused:true,activeCount:0,pausedCount:1});
 data.features[0].manualEnd='2026-11-05';result=createScheduler(data).calculate();expect(result.featureInfo.f1.end).toBe(asDay('2026-11-05'));
 delete data.features[0].manualEnd;data.tasks[0].status='planned';data.tasks.push({...data.tasks[0],id:'unknown',effort:0});result=createScheduler(data).calculate();expect(result.featureInfo.f1).toMatchObject({end:result.schedule.t1.end,needsEstimate:true,forecastIncomplete:true,activeCount:1,allPaused:false});
});
it('blocks automatic dependents until the missing estimate is supplied and preserves completed history',()=>{
 const data=projectData();data.tasks[0].effort=0;data.tasks.push({...data.tasks[0],id:'later',effort:1,dependsOn:['t1']});
 let result=createScheduler(data).calculate();expect(result.schedule.later).toMatchObject({blocked:true,end:null,alloc:{}});
 data.tasks[0].effort=.5;result=createScheduler(data).calculate();expect(result.schedule.t1.endFraction).toBe(.5);expect(result.schedule.later.start).toBeGreaterThan(result.schedule.t1.end!);
 data.tasks[0].effort=0;data.tasks[0].status='done';data.tasks[0].completedDate=data.tasks[0].start;
 result=createScheduler(data).calculate();expect(result.schedule.t1.done).toBe(true);expect(result.schedule.t1.needsEstimate).toBeUndefined();
});
