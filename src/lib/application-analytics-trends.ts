import {z} from 'zod';

const count = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable();
const measure = z.number().nonnegative().nullable();
export const analyticsTrendDaySchema = z.object({
  date: z.iso.date(),
  accountsCreated: count, accountsDeleted: count,
  projectsCreated: count, projectsDeleted: count,
  featuresCreated: count, storiesCreated: count, workItemsCreated: count,
  peopleCreated: count, rolesCreated: count, platformsCreated: count,
  meetingsCreated: count, holidaysCreated: count, timeOffCreated: count, milestonesCreated: count,
  pokerGamesCreated: count, pokerGamesPlayed: count,
  pokerParticipantsMin: measure, pokerParticipantsMax: measure,
  pokerParticipantsMedian: measure, pokerParticipantsAverage: measure,
  pokerAverageDurationSeconds: measure, pokerDurationSamples: count,
  projectAverageLifetimeSeconds: measure, projectLifetimeSamples: count,
  landingPageviews: count,
});
export const analyticsTrendsSchema = z.object({
  userId: z.uuid().nullable(),
  generatedAt: z.iso.datetime({offset: true}),
  periodDays: z.union([z.literal(7), z.literal(30), z.literal(90), z.literal(365)]),
  timezone: z.literal('UTC'),
  startDate: z.iso.date(), endDate: z.iso.date(),
  historyStartedAt: z.iso.datetime({offset: true}),
  coverage: z.object({history:z.string(), resources:z.string(), poker:z.string(), landing:z.string()}),
  days: z.array(analyticsTrendDaySchema).min(7).max(365),
});
export type AnalyticsTrendDay = z.infer<typeof analyticsTrendDaySchema>;
export type AnalyticsTrends = z.infer<typeof analyticsTrendsSchema>;

/** Only allowlisted operational aggregates cross the administrator boundary. */
export function parseAnalyticsTrends(value:unknown, scope:{periodDays:number;userId:string|null}):AnalyticsTrends {
  const data=analyticsTrendsSchema.parse(value);
  const day=86400000,start=Date.parse(data.startDate+'T00:00:00Z');
  const invalid=()=>{throw new Error('Invalid analytics trends response.');};
  if(data.periodDays!==scope.periodDays||data.userId!==scope.userId||data.days.length!==data.periodDays||
    new Date(Date.parse(data.generatedAt)).toISOString().slice(0,10)!==data.endDate||
    new Date(start+(data.periodDays-1)*day).toISOString().slice(0,10)!==data.endDate)invalid();
  for(let index=0;index<data.days.length;index++){
    const row=data.days[index];
    if(row.date!==new Date(start+index*day).toISOString().slice(0,10))invalid();
    if(scope.userId!==null&&row.landingPageviews!==null)invalid();
    const stats=[row.pokerParticipantsMin,row.pokerParticipantsMax,row.pokerParticipantsMedian,row.pokerParticipantsAverage];
    if(stats.some(value=>value===null)&&stats.some(value=>value!==null))invalid();
    if(row.pokerParticipantsMin!==null&&row.pokerParticipantsMax!==null&&
      (row.pokerParticipantsMin>row.pokerParticipantsMax||stats.some(value=>value!==null&&(value<row.pokerParticipantsMin!||value>row.pokerParticipantsMax!))))invalid();
    if(row.pokerDurationSamples===0&&row.pokerAverageDurationSeconds!==null)invalid();
    if(row.projectLifetimeSamples===0&&row.projectAverageLifetimeSeconds!==null)invalid();
  }
  return data;
}
