import {describe,expect,it} from 'vitest';
import {parseAnalyticsTrends} from '../src/lib/application-analytics-trends';
import {trendsFixture} from './analytics-trends-fixture';

describe('administrator operational trends boundary',()=>{
  it('preserves unknown days, observed zeros and missing duration samples as different states',()=>{
    const fixture=trendsFixture(30),result=parseAnalyticsTrends(fixture,{periodDays:30,userId:null});
    expect(result.days[0].accountsCreated).toBeNull();
    expect(result.days.at(-1)).toMatchObject({accountsCreated:0,pokerAverageDurationSeconds:null,pokerDurationSamples:0,landingPageviews:0});
    expect(result.days).toHaveLength(30);
  });
  it('strips unrequested fields instead of forwarding raw provider records or retired tracking',()=>{
    const fixture={...trendsFixture(7),sessions:[{visitor:'private'}],days:trendsFixture(7).days.map(row=>({...row,plannerActiveSeconds:777,email:'private@example.com'}))};
    const result=parseAnalyticsTrends(fixture,{periodDays:7,userId:null});
    expect(JSON.stringify(result)).not.toMatch(/private|plannerActiveSeconds|sessions/);
  });
  it('rejects a wrong account scope or global landing counts in a selected-user series',()=>{
    const userId='11111111-1111-4111-8111-111111111111';
    expect(()=>parseAnalyticsTrends(trendsFixture(7),{periodDays:7,userId})).toThrow();
    const fixture=trendsFixture(7,userId);fixture.days[0].landingPageviews=0;
    expect(()=>parseAnalyticsTrends(fixture,{periodDays:7,userId})).toThrow();
  });
  it('rejects sparse, duplicate, future or mismatched reporting windows',()=>{
    for(const mutate of [
      (value:ReturnType<typeof trendsFixture>)=>value.days.pop(),
      (value:ReturnType<typeof trendsFixture>)=>value.days[1].date=value.days[0].date,
      (value:ReturnType<typeof trendsFixture>)=>value.endDate='2026-11-12',
      (value:ReturnType<typeof trendsFixture>)=>value.startDate='2026-11-01',
    ]){const fixture=trendsFixture(7);mutate(fixture);expect(()=>parseAnalyticsTrends(fixture,{periodDays:7,userId:null})).toThrow();}
    expect(()=>parseAnalyticsTrends(trendsFixture(7),{periodDays:30,userId:null})).toThrow();
  });
  it('rejects negative counts and impossible participant or duration summaries',()=>{
    for(const patch of [
      {accountsCreated:-1},
      {pokerParticipantsMin:2,pokerParticipantsMax:4,pokerParticipantsMedian:3,pokerParticipantsAverage:5},
      {pokerParticipantsMin:2,pokerParticipantsMax:null},
      {pokerAverageDurationSeconds:60,pokerDurationSamples:0},
      {projectAverageLifetimeSeconds:3600,projectLifetimeSamples:0},
    ]){const fixture=trendsFixture(7);Object.assign(fixture.days[0],patch);expect(()=>parseAnalyticsTrends(fixture,{periodDays:7,userId:null})).toThrow();}
  });
});
