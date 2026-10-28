import {it,expect} from 'vitest';
import {meetingRecurrenceLabel} from '../src/planner/meetings';
import {createScheduler} from '../src/planner/engine.js';
import {projectData} from './fixtures';
import {taskTimeBreakdown} from '../src/planner/timeline';
import {calendarSpan} from '../src/planner/precision.js';
import {fromDay} from '../src/planner/dates.js';

it('schedules six development days with daily, weekly and fortnightly meetings without six phantom meeting days',()=>{
 const data=projectData();data.tasks[0].effort=6;
 const base={enabled:true,endDate:'',allTeam:true,attendees:[],weekday:1,interval:1,nth:1,startDate:'2026-10-26'};
 data.meetings=[{...base,id:'daily',title:'Daily',recurrence:'workdays',startTime:'09:00',duration:30},
  {...base,id:'planning',title:'Planning',recurrence:'weekly',startTime:'10:00',duration:60},
  {...base,id:'demo',title:'Demo',recurrence:'interval',weekday:5,interval:2,startDate:'2026-10-30',startTime:'14:00',duration:60}];
 const original=structuredClone(data.meetings),engine=createScheduler(data),info=engine.calculate().schedule.t1;
 expect(fromDay(info.end!)).toBe('2026-11-03');expect(calendarSpan(info)).toBe(9);
 const breakdown=taskTimeBreakdown(data.tasks[0],info,data,engine)!;
 expect(breakdown.actualMeetingMinutes).toBe(390);expect(breakdown.totals).toMatchObject({development:6,meetings:1,weekends:2});
 expect(engine.meetingHoursInIteration('u1',data.iterations[0])).toBe(8);
 expect(data.meetings).toEqual(original);
});
it('refreshes exact meeting time after edits and excludes paused events, non-attendees and leave',()=>{
 const data=projectData();data.tasks[0].effort=1;data.meetings=[{id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:30,allTeam:false,attendees:['u1'],enabled:true}];
 const engine=createScheduler(data);let info=engine.calculate().schedule.t1;
 expect(engine.meetingMinutes('u1','2026-10-26')).toBe(30);expect(engine.meetingMinutes('u2','2026-10-26')).toBe(0);
 expect(taskTimeBreakdown(data.tasks[0],info,data,engine)!.totals.meetings).toBe(.5);
 data.meetings[0].enabled=false;info=engine.calculate().schedule.t1;expect(calendarSpan(info)).toBe(1);expect(engine.meetingMinutes('u1','2026-10-26')).toBe(0);
 data.meetings[0].enabled=true;data.leave=[{id:'off',person:'u1',type:'vacation',from:'2026-10-26',to:'2026-10-26',note:''}];
 info=engine.calculate().schedule.t1;expect(fromDay(info.start!)).toBe('2026-10-27');expect(taskTimeBreakdown(data.tasks[0],info,data,engine)!.actualMeetingMinutes).toBe(60);
});

it('distinguishes every Thursday from every other Thursday and the second monthly Thursday',()=>{
  const base={enabled:true,startDate:'2026-10-29',endDate:'',weekday:4,interval:2,nth:2};
  const engine=createScheduler(projectData());
  const weekly={...base,recurrence:'weekly' as const};
  expect(meetingRecurrenceLabel(weekly)).toBe('Every Thursday');
  for(const date of ['2026-10-29','2026-11-05','2026-11-12','2026-11-19'])expect(engine.meetingOccurs(weekly,date)).toBe(true);
  const fortnightly={...base,recurrence:'interval' as const};
  expect(meetingRecurrenceLabel(fortnightly)).toBe('Every 2 weeks on Thursday');
  expect(engine.meetingOccurs(fortnightly,'2026-11-05')).toBe(false);
  expect(engine.meetingOccurs(fortnightly,'2026-11-12')).toBe(true);
  expect(meetingRecurrenceLabel({...fortnightly,interval:1})).toBe('Every Thursday');
  expect(engine.meetingOccurs({...fortnightly,interval:1},'2026-11-05')).toBe(true);
  const monthly={...base,recurrence:'monthly' as const};
  expect(meetingRecurrenceLabel(monthly)).toBe('2nd Thursday of each month');
  expect(engine.meetingOccurs(monthly,'2026-11-12')).toBe(true);
  expect(engine.meetingOccurs(monthly,'2026-11-19')).toBe(false);
});
it('labels Sunday correctly and reserves weekly capacity only for selected attendees',()=>{
  expect(meetingRecurrenceLabel({recurrence:'weekly',weekday:0,interval:1,nth:1})).toBe('Every Sunday');
  const data=projectData();data.people.push({...data.people[0],id:'u2',name:'Casey Dev'});
  data.meetings=[{id:'m1',title:'Planning',recurrence:'weekly',weekday:4,interval:1,nth:1,startDate:'2026-10-29',endDate:'',startTime:'09:00',duration:60,allTeam:false,attendees:['u1'],enabled:true}];
  const engine=createScheduler(data);
  expect(engine.meetingMinutes('u1','2026-11-05')).toBe(60);
  expect(engine.meetingMinutes('u1','2026-11-06')).toBe(0);
  expect(engine.meetingMinutes('u2','2026-11-05')).toBe(0);
});
