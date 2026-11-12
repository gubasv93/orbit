import {describe,expect,it} from 'vitest';
import {projectDataSchema,type ProjectData} from '../src/lib/schema';
import {meetingOccursOnDate,upcomingMeetingDates} from '../src/planner/meeting-recurrence.js';
import {createScheduler} from '../src/planner/engine.js';
import {projectData} from './fixtures';

type Custom=NonNullable<ProjectData['meetings'][number]['customRecurrence']>;
function meeting(customRecurrence:Custom,patch:Partial<ProjectData['meetings'][number]>={}):ProjectData['meetings'][number]{
  return {id:'recurrence',title:'Custom meeting',recurrence:'custom',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'14:00',duration:60,allTeam:true,attendees:[],enabled:true,customRecurrence,...patch};
}
const occurs=(value:ReturnType<typeof meeting>,date:string)=>meetingOccursOnDate(value,date);

describe('custom meeting recurrence dates',()=>{
  it('repeats every N calendar days and counts weekend occurrences before capacity filtering',()=>{
    const value=meeting({frequency:'day',interval:3,endType:'after',count:3});
    for(const date of ['2026-10-26','2026-10-29','2026-11-01'])expect(occurs(value,date)).toBe(true);
    for(const date of ['2026-10-25','2026-10-27','2026-11-04'])expect(occurs(value,date)).toBe(false);
  });
  it('supports several weekdays and ends after the actual number of selected dates',()=>{
    const value=meeting({frequency:'week',interval:1,weekdays:[4,2],endType:'after',count:3});
    for(const date of ['2026-10-27','2026-10-29','2026-11-03'])expect(occurs(value,date)).toBe(true);
    for(const date of ['2026-10-26','2026-10-30','2026-11-05'])expect(occurs(value,date)).toBe(false);
  });
  it('anchors fortnightly multi-weekday repeats to Monday weeks and handles a partial first week',()=>{
    const value=meeting({frequency:'week',interval:2,weekdays:[1,5],endType:'after',count:3},{startDate:'2026-10-28'});
    for(const date of ['2026-10-30','2026-11-09','2026-11-13'])expect(occurs(value,date)).toBe(true);
    for(const date of ['2026-10-26','2026-11-02','2026-11-06','2026-11-23'])expect(occurs(value,date)).toBe(false);
  });
  it('uses inclusive custom end dates and ignores stale inactive ending fields',()=>{
    const until=meeting({frequency:'day',interval:1,endType:'on',endDate:'2026-10-29'});
    expect(occurs(until,'2026-10-29')).toBe(true);expect(occurs(until,'2026-10-30')).toBe(false);
    const never=meeting({frequency:'day',interval:1,endType:'never',endDate:'2026-10-27',count:1},{endDate:'2026-10-26'});
    expect(occurs(never,'2026-11-01')).toBe(true);
  });
  it('skips missing month dates rather than moving a January 31 meeting to February',()=>{
    const value=meeting({frequency:'month',interval:1,monthlyMode:'day',endType:'after',count:3},{startDate:'2026-01-31'});
    for(const date of ['2026-01-31','2026-03-31','2026-05-31'])expect(occurs(value,date)).toBe(true);
    for(const date of ['2026-02-28','2026-03-03','2026-04-30','2026-07-31'])expect(occurs(value,date)).toBe(false);
  });
  it('supports monthly day intervals independent of weekly legacy interval fields',()=>{
    const value=meeting({frequency:'month',interval:2,monthlyMode:'day',endType:'never'},{startDate:'2026-01-12'});
    expect(occurs(value,'2026-03-12')).toBe(true);expect(occurs(value,'2026-02-12')).toBe(false);
  });
  it('derives a monthly weekday ordinal from its start date',()=>{
    const value=meeting({frequency:'month',interval:1,monthlyMode:'weekday',endType:'never'},{startDate:'2026-10-13'});
    for(const date of ['2026-10-13','2026-11-10','2026-12-08'])expect(occurs(value,date)).toBe(true);
    expect(occurs(value,'2026-11-17')).toBe(false);
  });
  it('supports the last weekday and excludes candidates earlier than the start date from its count',()=>{
    const last=meeting({frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:-1,endType:'after',count:2},{startDate:'2026-10-13'});
    expect(occurs(last,'2026-10-27')).toBe(true);expect(occurs(last,'2026-11-24')).toBe(true);expect(occurs(last,'2026-12-29')).toBe(false);
    const second=meeting({frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:2,endType:'after',count:2},{startDate:'2026-10-20'});
    expect(occurs(second,'2026-10-13')).toBe(false);expect(occurs(second,'2026-11-10')).toBe(true);expect(occurs(second,'2026-12-08')).toBe(true);expect(occurs(second,'2027-01-12')).toBe(false);
  });
  it('skips months without a fifth weekday without consuming an occurrence',()=>{
    const value=meeting({frequency:'month',interval:1,monthlyMode:'weekday',endType:'after',count:2},{startDate:'2026-01-31'});
    expect(occurs(value,'2026-01-31')).toBe(true);expect(occurs(value,'2026-05-30')).toBe(true);expect(occurs(value,'2026-02-28')).toBe(false);expect(occurs(value,'2026-08-29')).toBe(false);
  });
  it('repeats leap-day yearly meetings only on a real February 29',()=>{
    const value=meeting({frequency:'year',interval:1,endType:'after',count:2},{startDate:'2024-02-29'});
    expect(occurs(value,'2024-02-29')).toBe(true);expect(occurs(value,'2028-02-29')).toBe(true);
    for(const date of ['2025-02-28','2025-03-01','2032-02-29'])expect(occurs(value,date)).toBe(false);
    const century=meeting({frequency:'year',interval:1,endType:'after',count:2},{startDate:'2096-02-29'});
    expect(occurs(century,'2100-03-01')).toBe(false);expect(occurs(century,'2104-02-29')).toBe(true);
  });
  it('supports every N years and does not treat other months as the anniversary',()=>{
    const value=meeting({frequency:'year',interval:2,endType:'never'},{startDate:'2026-11-12'});
    expect(occurs(value,'2028-11-12')).toBe(true);expect(occurs(value,'2027-11-12')).toBe(false);expect(occurs(value,'2028-10-12')).toBe(false);
  });
  it('returns false for disabled, incomplete or invalid date drafts',()=>{
    const value=meeting({frequency:'day',interval:1,endType:'never'});
    expect(occurs({...value,enabled:false},'2026-10-26')).toBe(false);
    expect(occurs({...value,customRecurrence:undefined},'2026-10-26')).toBe(false);
    for(const date of ['','not-a-date','2026-02-31','2201-01-01'])expect(occurs(value,date)).toBe(false);
  });
});

describe('upcoming meeting dates',()=>{
  it('returns inclusive upcoming daily dates and respects end/count limits before the requested range',()=>{
    const value=meeting({frequency:'day',interval:3,endType:'after',count:4});
    expect(upcomingMeetingDates(value,'2026-10-29')).toEqual(['2026-10-29','2026-11-01','2026-11-04']);
    expect(upcomingMeetingDates(value,'2026-11-02')).toEqual(['2026-11-04']);
    expect(upcomingMeetingDates(value,'2026-11-05')).toEqual([]);
    expect(upcomingMeetingDates(meeting({frequency:'day',interval:1,endType:'on',endDate:'2026-10-28'}),'2026-10-28')).toEqual(['2026-10-28']);
  });
  it('starts from the anchor when the requested range is earlier and handles a partial first fortnight',()=>{
    const value=meeting({frequency:'week',interval:2,weekdays:[1,5],endType:'after',count:4},{startDate:'2026-10-28'});
    expect(upcomingMeetingDates(value,'2026-10-01')).toEqual(['2026-10-30','2026-11-09','2026-11-13']);
    expect(upcomingMeetingDates(value,'2026-11-14')).toEqual(['2026-11-23']);
    expect(upcomingMeetingDates(value,'2026-11-24')).toEqual([]);
    const nextWeek=meeting({frequency:'week',interval:2,weekdays:[1,2],endType:'after',count:2},{startDate:'2026-11-01'});
    expect(upcomingMeetingDates(nextWeek,'2026-10-01')).toEqual(['2026-11-09','2026-11-10']);
  });
  it('skips missing month days and supports derived or last weekday recurrence',()=>{
    const endOfMonth=meeting({frequency:'month',interval:1,endType:'after',count:4},{startDate:'2026-01-31'});
    expect(upcomingMeetingDates(endOfMonth,'2026-02-01')).toEqual(['2026-03-31','2026-05-31','2026-07-31']);
    expect(upcomingMeetingDates(endOfMonth,'2026-08-01')).toEqual([]);
    expect(upcomingMeetingDates(meeting({frequency:'month',interval:1,monthlyMode:'weekday',endType:'never'},{startDate:'2026-10-13'}),'2026-10-14')).toEqual(['2026-11-10','2026-12-08','2027-01-12']);
    expect(upcomingMeetingDates(meeting({frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:-1,endType:'on',endDate:'2026-11-30'}),'2026-10-26')).toEqual(['2026-10-26','2026-11-30']);
  });
  it('skips non-leap years and jumps directly across sparse yearly intervals',()=>{
    const leapDay=meeting({frequency:'year',interval:1,endType:'after',count:3},{startDate:'2096-02-29'});
    expect(upcomingMeetingDates(leapDay,'2097-01-01')).toEqual(['2104-02-29','2108-02-29']);
    const sparse=meeting({frequency:'year',interval:99,endType:'never'},{startDate:'2000-01-15'});
    expect(upcomingMeetingDates(sparse,'2000-01-15')).toEqual(['2000-01-15','2099-01-15','2198-01-15']);
    expect(upcomingMeetingDates(sparse,'2000-01-16')).toEqual(['2099-01-15','2198-01-15']);
  });
  it('supports legacy workday, weekly interval and monthly rules with inclusive ends',()=>{
    const legacy={...meeting({frequency:'day',interval:1,endType:'never'}),customRecurrence:undefined};
    expect(upcomingMeetingDates({...legacy,recurrence:'workdays'},'2026-10-30')).toEqual(['2026-10-30','2026-11-02','2026-11-03']);
    expect(upcomingMeetingDates({...legacy,recurrence:'interval',interval:2,weekday:5,startDate:'2026-10-28'},'2026-10-01')).toEqual(['2026-10-30','2026-11-13','2026-11-27']);
    expect(upcomingMeetingDates({...legacy,recurrence:'monthly',nth:-1,weekday:2,endDate:'2026-11-24'},'2026-10-28')).toEqual(['2026-11-24']);
  });
  it('bounds results to valid dates, enabled rules and the requested limit',()=>{
    const value=meeting({frequency:'day',interval:1,endType:'never'});
    expect(upcomingMeetingDates(value,'2200-12-30')).toEqual(['2200-12-30','2200-12-31']);
    expect(upcomingMeetingDates(value,'2026-10-26',1)).toEqual(['2026-10-26']);
    expect(upcomingMeetingDates(value,'2026-10-26',0)).toEqual([]);
    expect(upcomingMeetingDates(value,'not-a-date')).toEqual([]);
    expect(upcomingMeetingDates({...value,enabled:false},'2026-10-26')).toEqual([]);
    expect(upcomingMeetingDates({...value,customRecurrence:undefined},'2026-10-26')).toEqual([]);
  });
});

describe('recurrence capacity and persistence',()=>{
  it('deducts overlapping custom and legacy meetings once on their actual weekdays',()=>{
    const data=projectData();data.meetings=[meeting({frequency:'week',interval:1,weekdays:[2,4],endType:'never'}),
      {...meeting({frequency:'day',interval:1,endType:'never'}),id:'legacy',recurrence:'weekly',customRecurrence:undefined,weekday:2,startTime:'14:30'}];
    const engine=createScheduler(data);
    expect(engine.meetingMinutes('u1','2026-10-27')).toBe(90);expect(engine.meetingMinutes('u1','2026-10-29')).toBe(60);expect(engine.meetingMinutes('u1','2026-10-28')).toBe(0);
  });
  it('consumes count-limited occurrences on holidays and weekends without moving them into later working days',()=>{
    const data=projectData();data.meetings=[meeting({frequency:'day',interval:1,endType:'after',count:2},{startDate:'2026-10-24'})];
    expect(createScheduler(data).meetingHoursInIteration('u1',{...data.iterations[0],start:'2026-10-24',end:'2026-10-28'})).toBe(0);
    data.meetings=[meeting({frequency:'day',interval:1,endType:'after',count:2})];data.holidays=[{date:'2026-10-26',name:'Company holiday'}];
    expect(createScheduler(data).meetingHoursInIteration('u1',{...data.iterations[0],start:'2026-10-26',end:'2026-10-28'})).toBe(1);
  });
  it('persists valid custom rules and preset identities without rewriting existing rules',()=>{
    const data=projectData();data.meetings=[{...meeting({frequency:'week',interval:2,weekdays:[2,4],endType:'after',count:6}),presetKey:'scrum-refinement'}];
    expect(projectDataSchema.parse(data).meetings).toEqual(data.meetings);
    const legacy={...data.meetings[0],recurrence:'weekly' as const};delete legacy.customRecurrence;delete legacy.presetKey;data.meetings=[legacy];
    expect(projectDataSchema.parse(data).meetings).toEqual([legacy]);
  });
  it('rejects missing weekdays, duplicate days, impossible endings and out-of-bounds intervals',()=>{
    const invalid:unknown[]=[
      {frequency:'week',interval:1,endType:'never'},
      {frequency:'week',interval:1,weekdays:[2,2],endType:'never'},
      {frequency:'week',interval:1,weekdays:[],endType:'never'},
      {frequency:'day',interval:0,endType:'never'},
      {frequency:'day',interval:100,endType:'never'},
      {frequency:'day',interval:1,endType:'on'},
      {frequency:'day',interval:1,endType:'on',endDate:'2026-10-25'},
      {frequency:'day',interval:1,endType:'after'},
      {frequency:'day',interval:1,endType:'after',count:0},
      {frequency:'day',interval:1,endType:'after',count:1001},
    ];
    for(const rule of invalid){const data=projectData();data.meetings=[meeting(rule as Custom)];expect(projectDataSchema.safeParse(data).success).toBe(false);}
    const data=projectData();data.meetings=[{...meeting({frequency:'day',interval:1,endType:'never'}),customRecurrence:undefined}];expect(projectDataSchema.safeParse(data).success).toBe(false);
  });
});
