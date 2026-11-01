import type {SupabaseClient} from '@supabase/supabase-js';
import {NextResponse} from 'next/server';
import {z} from 'zod';
import {PRIVACY_VERSION, TERMS_VERSION} from './legal';

type LegalClient = Pick<SupabaseClient, 'rpc'>;
const statusSchema = z.object({
  required: z.boolean(),
  termsVersion: z.literal(TERMS_VERSION),
  privacyVersion: z.literal(PRIVACY_VERSION),
  acceptedAt: z.iso.datetime({offset: true}).nullable(),
}).refine(status => !status.required || status.acceptedAt === null);
export type LegalStatus = z.infer<typeof statusSchema>;

function checkedStatus(data: unknown, error: unknown): LegalStatus {
  const checked = statusSchema.safeParse(data);
  if (error || !checked.success) throw new Error('Legal acceptance is temporarily unavailable.');
  return checked.data;
}

export async function getLegalStatus(client: LegalClient): Promise<LegalStatus> {
  const {data, error} = await client.rpc('orbit_legal_status');
  return checkedStatus(data, error);
}

export async function acceptCurrentLegal(client: LegalClient): Promise<LegalStatus> {
  const {data, error} = await client.rpc('orbit_accept_legal', {
    p_terms_version: TERMS_VERSION,
    p_privacy_version: PRIVACY_VERSION,
  });
  const status = checkedStatus(data, error);
  if (status.required || !status.acceptedAt) throw new Error('Legal acceptance could not be recorded.');
  return status;
}

/** Call only after authenticating the account. The database binds the record to auth.uid(). */
export async function legalApiGate(client: LegalClient): Promise<NextResponse | null> {
  try {
    if (!(await getLegalStatus(client)).required) return null;
    return NextResponse.json({error: 'Please review the Terms of Use and Privacy Policy before continuing.', code: 'legal_acceptance_required', redirectTo: '/accept-terms'}, {status: 403, headers: {'Cache-Control': 'private, no-store'}});
  } catch {
    return NextResponse.json({error: 'Unable to check the current service terms. Please retry.'}, {status: 503, headers: {'Cache-Control': 'private, no-store'}});
  }
}
