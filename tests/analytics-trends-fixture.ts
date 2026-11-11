import type {AnalyticsTrends,AnalyticsTrendDay} from '../src/lib/application-analytics-trends';

export function trendsFixture(periodDays:7|30|90|365=30,userId:string|null=null):AnalyticsTrends {
  const end=Date.parse('2026-11-11T00:00:00Z'),day=86400000;
  return {
    userId,generatedAt:'2026-11-11T12:00:00Z',periodDays,timezone:'UTC',
    startDate:new Date(end-(periodDays-1)*day).toISOString().slice(0,10),endDate:'2026-11-11',
    historyStartedAt:'2026-10-31T00:00:00Z',
    coverage:{history:'History before tracking is unavailable.',resources:'First observed records; baseline is included.',poker:'Room creation-day cohorts; played rooms only.',landing:'Aggregate views only; never attributed to a user.'},
    days:Array.from({length:periodDays},(_,index)=>{
      const date=new Date(end-(periodDays-1-index)*day).toISOString().slice(0,10);
      const zero=date<'2026-10-31'?null:0;
      const row:AnalyticsTrendDay={date,
        accountsCreated:zero,accountsDeleted:zero,projectsCreated:zero,projectsDeleted:zero,
        featuresCreated:zero,storiesCreated:zero,workItemsCreated:zero,peopleCreated:zero,rolesCreated:zero,platformsCreated:zero,
        meetingsCreated:zero,holidaysCreated:zero,timeOffCreated:zero,milestonesCreated:zero,
        pokerGamesCreated:zero,pokerGamesPlayed:zero,pokerParticipantsMin:null,pokerParticipantsMax:null,pokerParticipantsMedian:null,pokerParticipantsAverage:null,
        pokerAverageDurationSeconds:null,pokerDurationSamples:zero,projectAverageLifetimeSeconds:null,projectLifetimeSamples:zero,
        landingPageviews:userId||date<'2026-11-01'?null:0};
      return row;
    }),
  };
}
