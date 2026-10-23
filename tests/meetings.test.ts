import {it,expect} from 'vitest';
import {meetingRecurrenceLabel} from '../src/planner/meetings';
import {createScheduler} from '../src/planner/engine.js';
import {projectData} from './fixtures';

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
