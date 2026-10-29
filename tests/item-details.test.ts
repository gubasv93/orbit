import { it, expect } from 'vitest';
import { projectData } from './fixtures';
import { createScheduler } from '../src/planner/engine.js';
import { getItemDetails } from '../src/planner/item-details';
import type { ProjectData } from '../src/lib/schema';
const details = (data: ProjectData, kind: 'task'|'feature' = 'task', id = 't1') => getItemDetails(data, createScheduler(data).calculate(), kind, id)!;
function daily(data: ProjectData, duration=30) {
  data.meetings.push({id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration,allTeam:true,attendees:[],enabled:true});
}
function manual(data: ProjectData, start: string, end: string, fraction: .5|1 = 1) {
  Object.assign(data.tasks[0],{start,manualEnd:end,manualEndFraction:fraction});
}

it('reports exact meeting minutes and half-day spans without per-day rounding or overlapping-event duplication',()=>{
  const data=projectData();daily(data,60);data.meetings.push({...data.meetings[0],id:'overlap',startTime:'09:30'});
  manual(data,'2026-10-26','2026-10-27',.5);
  const result=details(data);
  expect(result.calendarDays).toBe(1.5);expect(result.meetingMinutes).toBe(180);expect(result.meetingHours).toBe(3);
  expect(result.meetings.map(m=>({id:m.id,minutes:m.minutes,scheduled:m.scheduledMinutes,dates:m.dates.length}))).toEqual([
    {id:'daily',minutes:90,scheduled:120,dates:2},{id:'overlap',minutes:90,scheduled:120,dates:2},
  ]);
  expect(result.estimate).toBe(3);expect(result.estimateUnit).toBe('work days');expect(result.conflicts.some(c=>c.kind==='shortfall')).toBe(true);
});

it('separates weekends, enabled public holidays, vacation, days off and sick leave without double counting',()=>{
  const data=projectData();daily(data);data.settings.observeHolidays=true;
  manual(data,'2026-10-26','2026-11-06');
  data.holidays=[{date:'2026-10-27',name:'Holiday'},{date:'2026-10-31',name:'Weekend holiday'}];
  data.leave=[
    {id:'vac',person:'u1',type:'vacation',from:'2026-10-27',to:'2026-10-29',note:''},
    {id:'off',person:'u1',type:'dayoff',from:'2026-10-29',to:'2026-10-30',note:''},
    {id:'sick',person:'u1',type:'sick',from:'2026-10-30',to:'2026-11-02',note:''},
  ];
  const result=details(data),byKind=Object.fromEntries(result.timeAway.map(row=>[row.kind,row.days]));
  expect(byKind).toEqual({weekends:2,holidays:1,vacation:1,dayoff:1,sick:2});
  expect(result.meetingMinutes).toBe(150); // Five working dates remain after absences.
});

it('deduplicates a person’s meeting and leave time across parallel child work items and labels epic units',()=>{
  const data=projectData();daily(data);manual(data,'2026-10-26','2026-11-02');
  data.tasks.push({...data.tasks[0],id:'t2',title:'Review'});
  data.people.push({...data.people[0],id:'u2',name:'Riley Dev',firstName:'Riley'});
  data.tasks.push({...data.tasks[0],id:'t3',title:'Another teammate',assignee:'u2'});
  data.leave=[{id:'off',person:'u1',type:'dayoff',from:'2026-10-28',to:'2026-10-28',note:''}];
  const result=details(data,'feature','f1');
  expect(result.estimate).toBe(9);expect(result.estimateUnit).toBe('person-days');expect(result.calendarDays).toBe(8);
  expect(result.meetingMinutes).toBe(330);expect(result.meetingUnit).toBe('person-minutes');
  expect(result.meetings).toHaveLength(1);expect(result.meetings[0]).toMatchObject({minutes:330,attendeeOccurrences:11,attendeeIds:['u1','u2']});expect(result.meetings[0].dates).toHaveLength(6);
  expect(result.timeAway.find(row=>row.kind==='weekends')).toMatchObject({days:2,unit:'calendar days'});
  expect(result.timeAway.find(row=>row.kind==='dayoff')).toMatchObject({days:1,unit:'person-days'});
  expect(result.conflicts.filter(c=>c.kind==='capacity').map(c=>c.task.id).sort()).toEqual(['t1','t2']);
  expect(result.conflicts.filter(c=>c.kind==='capacity').every(c=>c.relatedTask===null)).toBe(true);
});

it('lists concrete overbooked tasks including work in another epic with dates and overload minutes',()=>{
  const data=projectData();daily(data,60);
  data.features.push({...data.features[0],id:'other',title:'Other epic'});
  data.tasks.push({...data.tasks[0],id:'other-task',featureId:'other',title:'Competing work'});
  const result=details(data),conflict=result.conflicts.find(c=>c.kind==='capacity')!;
  expect(conflict.task.title).toBe('API');expect(conflict.relatedTask).toMatchObject({id:'other-task',title:'Competing work',featureTitle:'Other epic',assigneeName:'Alex Dev'});
  expect(conflict.dates).toHaveLength(3);expect(conflict.dates[0]).toBe('2026-10-26');expect(conflict.overloadMinutes).toBe(1260);
});

it('shows dependency conflicts when map warnings are hidden and explains unestimated or paused predecessors',()=>{
  const data=projectData();data.settings.autoShiftDependencies=false;data.settings.showDependencyWarnings=false;
  data.tasks.push({...data.tasks[0],id:'t2',title:'Dependent',dependsOn:['t1'],assignee:''});
  expect(details(data,'task','t2').conflicts.find(c=>c.kind==='dependency')?.relatedTask?.title).toBe('API');
  data.tasks[0].effort=0;
  expect(details(data,'task','t2').conflicts.find(c=>c.kind==='dependency')?.message).toContain('needs an estimate');
  data.tasks[0].status='hold';
  expect(details(data,'task','t2').conflicts.find(c=>c.kind==='dependency')?.message).toContain('paused');
});

it('keeps manual targets explicit, clips epic time accounting to that window and identifies outside child items',()=>{
  const data=projectData();daily(data);manual(data,'2026-10-26','2026-10-30');
  data.features[0].manualEnd='2026-10-27';
  const result=details(data,'feature','f1');
  expect(result.dateMode).toBe('manual');expect(result.calendarDays).toBe(2);expect(result.meetingMinutes).toBe(60);expect(result.forecastComplete).toBe(false);
  expect(result.meetings[0]).toMatchObject({minutes:60,dates:['2026-10-26','2026-10-27']});
  expect(result.conflicts.find(c=>c.kind==='window')).toMatchObject({task:{id:'t1'},dates:['2026-10-30']});
  data.tasks[0].status='done';data.tasks[0].completedDate='2026-10-30';
  expect(details(data,'feature','f1').conflicts.some(c=>c.kind==='window')).toBe(true);
});

it('keeps a manual estimate authoritative while explaining pending work without inventing time',()=>{
  const data=projectData();data.tasks[0].effort=0;data.tasks[0].assignee='';data.tasks[0].platform='';
  let result=details(data,'feature','f1');
  expect(result.estimate).toBeNull();expect(result.calendarDays).toBeNull();expect(result.meetingMinutes).toBeNull();expect(result.forecastComplete).toBe(false);expect(result.issues[0].kind).toBe('unestimated');
  data.features[0].effortOverride=12.5;data.features[0].manualEnd='2026-10-30';
  result=details(data,'feature','f1');expect(result.estimate).toBe(12.5);expect(result.estimateManual).toBe(true);expect(result.knownEstimate).toBe(0);expect(result.unestimatedCount).toBe(1);expect(result.calendarDays).toBe(5);expect(result.meetingMinutes).toBeNull();
});

it('does not invent past recurring meetings for completed items or their completed epic',()=>{
  const data=projectData();daily(data);data.tasks[0].status='done';data.tasks[0].completedDate='2026-11-02';
  for(const result of [details(data),details(data,'feature','f1')]){
    expect(result.state).toBe('completed');expect(result.dateMode).toBe('recorded');expect(result.calendarDays).toBe(8);expect(result.meetingMinutes).toBeNull();expect(result.timeAway.find(row=>row.kind==='weekends')?.days).toBe(2);expect(result.timeAway.find(row=>row.kind==='vacation')?.days).toBeNull();expect(result.notes.some(note=>note.includes('not tracked'))).toBe(true);
    expect(result.meetings).toEqual([]);
  }
});

it('handles half-day absences, empty epics, unknown items and leaves the supplied schedule and data unchanged',()=>{
  const data=projectData();manual(data,'2026-10-26','2026-10-26',.5);data.leave=[{id:'sick',person:'u1',type:'sick',from:'2026-10-26',to:'2026-10-26',note:''}];
  const computed=createScheduler(data).calculate(),beforeData=structuredClone(data),beforeSchedule=structuredClone(computed);
  expect(getItemDetails(data,computed,'task','t1')?.timeAway.find(row=>row.kind==='sick')?.days).toBe(.5);
  expect(data).toEqual(beforeData);expect(computed).toEqual(beforeSchedule);expect(getItemDetails(data,computed,'task','missing')).toBeNull();
  data.tasks=[];const empty=details(data,'feature','f1');expect(empty.state).toBe('empty');expect(empty.estimate).toBe(0);expect(empty.calendarDays).toBeNull();expect(empty.meetingMinutes).toBeNull();
});

it('keeps epic conflicts linear and names each internal or external competing task once',()=>{
  const data=projectData(),base={...data.tasks[0],effort:.5};
  data.tasks=Array.from({length:1000},(_,i)=>({...base,id:'task'+i,title:'Work '+i}));
  data.features.push({...data.features[0],id:'external',title:'External epic'});
  data.tasks.push({...base,id:'external1',featureId:'external',title:'Other work 1'},{...base,id:'external2',featureId:'external',title:'Other work 2'});
  const computed=createScheduler(data).calculate(),epic=getItemDetails(data,computed,'feature','f1')!,rows=epic.conflicts.filter(c=>c.kind==='capacity');
  expect(rows).toHaveLength(1002);expect(new Set(rows.map(c=>c.task.id)).size).toBe(1002);expect(rows.every(c=>c.relatedTask===null)).toBe(true);expect(rows.find(c=>c.task.id==='external1')?.task.featureTitle).toBe('External epic');
  const item=getItemDetails(data,computed,'task','task0')!,otherRows=item.conflicts.filter(c=>c.kind==='capacity');expect(otherRows).toHaveLength(1001);expect(new Set(otherRows.map(c=>c.relatedTask!.id)).size).toBe(1001);expect(otherRows.every(c=>c.task.id==='task0')).toBe(true);
});

it('flags an unknown-finish child whose earliest start already misses the feature target',()=>{
  for(const status of ['planned','hold'] as const){
    const data=projectData();data.features[0].manualEnd='2026-10-28';Object.assign(data.tasks[0],{start:'2026-11-03',status,effort:status==='planned'?0:3});
    const result=details(data,'feature','f1'),window=result.conflicts.find(c=>c.kind==='window');
    expect(window).toMatchObject({task:{id:'t1'},dates:['2026-11-03']});expect(result.forecastComplete).toBe(false);
  }
});

it('explains completed and remaining work when estimate exceeds the current remaining-work window',()=>{
  const data=projectData();Object.assign(data.tasks[0],{status:'progress',effort:4.5,remaining:1.5});manual(data,'2026-10-26','2026-10-27',.5);
  const result=details(data);expect(result.estimate).toBe(4.5);expect(result.calendarDays).toBe(1.5);expect(result.notes).toContain('Estimate includes 3 work days already completed; 1.5 work days remain.');
});

it('keeps paused tasks unreliable even when they retain a manual target window',()=>{
  const data=projectData();manual(data,'2026-10-26','2026-10-30');data.tasks[0].status='hold';
  const result=details(data);expect(result.state).toBe('paused');expect(result.dateMode).toBe('manual');expect(result.calendarDays).toBe(5);expect(result.forecastComplete).toBe(false);expect(result.meetingMinutes).toBeNull();
});

it('lists only meetings attended within working dates using each recurrence and excludes leave, holidays and inactive events',()=>{
  const data=projectData();daily(data);manual(data,'2026-10-26','2026-11-06');data.settings.observeHolidays=true;
  const base=data.meetings[0];data.meetings.push(
    {...base,id:'planning',title:'Planning',recurrence:'weekly',weekday:4,startTime:'10:00',duration:60},
    {...base,id:'demo',title:'Demo',recurrence:'interval',weekday:5,interval:2,startDate:'2026-10-30',startTime:'14:00',duration:60},
    {...base,id:'monthly',title:'Monthly',recurrence:'monthly',weekday:5,nth:1,startTime:'11:00',duration:45},
    {...base,id:'paused',enabled:false},{...base,id:'others',allTeam:false,attendees:[]},
    {...base,id:'expired',endDate:'2026-10-25'},{...base,id:'future',startDate:'2026-11-09'},
  );
  data.holidays=[{date:'2026-10-28',name:'Holiday'}];data.leave=[{id:'off',person:'u1',type:'dayoff',from:'2026-11-02',to:'2026-11-02',note:''}];
  const before=structuredClone(data),result=details(data);
  expect(result.meetings.map(m=>({id:m.id,minutes:m.minutes,count:m.dates.length}))).toEqual([
    {id:'daily',minutes:240,count:8},{id:'planning',minutes:120,count:2},{id:'demo',minutes:60,count:1},{id:'monthly',minutes:45,count:1},
  ]);
  expect(result.meetingMinutes).toBe(465);expect(result.meetings.reduce((sum,m)=>sum+m.minutes,0)).toBe(result.meetingMinutes);expect(data).toEqual(before);
});

it('shares identical overlapping meetings and caps each attendee to a half-day window without losing list entries',()=>{
  const data=projectData();daily(data,480);data.meetings.push({...data.meetings[0],id:'same-time',title:'Another meeting'});manual(data,'2026-10-26','2026-10-26',.5);
  const result=details(data);expect(result.meetingMinutes).toBe(240);
  expect(result.meetings.map(m=>({minutes:m.minutes,scheduled:m.scheduledMinutes,attendees:m.attendeeOccurrences}))).toEqual([
    {minutes:120,scheduled:480,attendees:1},{minutes:120,scheduled:480,attendees:1},
  ]);
  data.tasks[0].assignee='';expect(details(data).meetings).toEqual([]);
});
