import {describe,expect,it} from 'vitest';
import {meetingRecurrenceLabel} from '../src/planner/meetings';
import type {ProjectData} from '../src/lib/schema';

type Rule=NonNullable<ProjectData['meetings'][number]['customRecurrence']>;
const label=(rule:Rule,startDate='2026-11-12')=>meetingRecurrenceLabel({recurrence:'custom',weekday:4,interval:1,nth:2,startDate,customRecurrence:rule});

describe('custom meeting recurrence labels',()=>{
  it('describes daily intervals and their occurrence limits',()=>{
    expect(label({frequency:'day',interval:1,endType:'never'})).toBe('Every day');
    expect(label({frequency:'day',interval:3,endType:'after',count:1})).toBe('Every 3 days · after 1 occurrence');
    expect(label({frequency:'day',interval:2,endType:'after',count:10})).toBe('Every 2 days · after 10 occurrences');
  });
  it('lists weekly weekdays once in Monday-first order and includes the end date',()=>{
    expect(label({frequency:'week',interval:2,weekdays:[4,2],endType:'on',endDate:'2026-12-31'})).toBe('Every 2 weeks on Tuesday and Thursday · until 2026-12-31');
    expect(label({frequency:'week',interval:1,weekdays:[0,1,5,1],endType:'never'})).toBe('Every week on Monday, Friday and Sunday');
  });
  it('distinguishes the monthly calendar date, fourth weekday and final weekday',()=>{
    expect(label({frequency:'month',interval:2,monthlyMode:'day',endType:'never'},'2026-01-31')).toBe('Every 2 months on day 31');
    expect(label({frequency:'month',interval:1,monthlyMode:'weekday',endType:'never'},'2026-01-23')).toBe('Every month on the 4th Friday');
    expect(label({frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:-1,endType:'never'},'2026-01-23')).toBe('Every month on the last Friday');
  });
  it('labels yearly leap-day recurrence from its date-only anchor',()=>{
    expect(label({frequency:'year',interval:1,endType:'never'},'2028-02-29')).toBe('Every year on February 29');
    expect(label({frequency:'year',interval:2,endType:'never'},'2026-12-31')).toBe('Every 2 years on December 31');
  });
  it('keeps an incomplete custom preview readable',()=>{
    expect(meetingRecurrenceLabel({recurrence:'custom',weekday:1,interval:1,nth:1})).toBe('Custom recurrence');
    expect(label({frequency:'week',interval:1,weekdays:[],endType:'never'})).toBe('Custom recurrence');
  });
});
