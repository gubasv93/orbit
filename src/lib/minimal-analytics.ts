import {z} from 'zod';

const pageviewsSchema = z.object({
  pageviews: z.number().int().nonnegative(),
  days: z.number().int().min(1).max(365),
  startedAt: z.iso.datetime({offset: true}),
});
type RecordValue = Record<string, unknown>;
function object(value: unknown): RecordValue {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid analytics response.');
  return value as RecordValue;
}

/** Retired engagement measurements never leave the server, even with old RPC data. */
export function minimalAnalytics(snapshot: unknown, pageviews: unknown) {
  const source = object(snapshot);
  if (!Array.isArray(source.users)) throw new Error('Invalid analytics users.');
  const {landing: _landing, landingPageviews: _oldPageviews, ...analytics} = source;
  const {planner: _plannerTotal, ...totals} = object(source.totals);
  const {engagement: _coverage, ...coverage} = object(source.coverage);
  const users = source.users.map(user => {
    const {planner: _planner, ...details} = object(user);
    return details;
  });
  return {...analytics, totals, coverage, users, landingPageviews: pageviewsSchema.parse(pageviews)};
}
