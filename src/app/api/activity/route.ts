import {createHash, randomBytes} from 'node:crypto';
import {NextRequest, NextResponse} from 'next/server';
import {z} from 'zod';
import {adminClient} from '@/lib/application-admin-server';
import {limitedJson, sameOrigin} from '@/lib/http';
import {supabase} from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const consentCookie = 'orbit_analytics_consent';
const visitorCookie = 'orbit_analytics_visitor';
const consentVersion = 'v1';
const cookieOptions = () => ({httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict' as const, path: '/', maxAge: 365 * 86400});
const inputSchema = z.discriminatedUnion('action', [
  z.object({action: z.literal('consent'), enabled: z.boolean()}).strict(),
  z.object({action: z.literal('event'), surface: z.enum(['landing', 'planner']), sessionId: z.uuid(), sequence: z.number().int().min(0).max(1_000_000_000), seconds: z.number().int().min(0).max(60), end: z.boolean().default(false)}).strict(),
]);
const reply = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const failure = (status: number) => reply({error: status === 429 ? 'Please try again later.' : status === 403 ? 'Usage analytics is not enabled.' : status === 401 ? 'Please log in.' : status === 400 ? 'Invalid activity request.' : 'Usage analytics is unavailable.'}, status);

/** Optional first-party usage measurements never accept a client-supplied account ID. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return failure(403);
  let value: unknown;
  try { value = await limitedJson(request, 2048); } catch { return failure(400); }
  const parsed = inputSchema.safeParse(value);
  if (!parsed.success) return failure(400);
  const input = parsed.data;
  if (input.action === 'event' && request.headers.get('referer')) {
    try {
      const referrer = new URL(request.headers.get('referer')!);
      if (referrer.origin !== request.headers.get('origin') || referrer.pathname !== (input.surface === 'landing' ? '/' : '/app')) return failure(400);
    } catch { return failure(400); }
  }
  // Revocation must remain available even if analytics storage is unavailable.
  if (input.action === 'consent' && !input.enabled) {
    const response = reply({ok: true, enabled: false});
    response.cookies.set(consentCookie, '', {...cookieOptions(), maxAge: 0});
    response.cookies.set(visitorCookie, '', {...cookieOptions(), maxAge: 0});
    return response;
  }
  if (input.action === 'event' && (request.cookies.get(consentCookie)?.value !== consentVersion || !/^[a-f0-9]{64}$/.test(request.cookies.get(visitorCookie)?.value || ''))) return failure(403);
  try {
    const client = adminClient();
    // Only a short-lived hash is persisted by the rate limiter. No IP address,
    // user agent, URL, referrer or browser fingerprint enters activity storage.
    const address = (request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local').slice(0, 200);
    const key = createHash('sha256').update('orbit-activity:' + address).digest('hex');
    const allowance = await client.rpc('orbit_application_activity_allow', {p_key: key});
    if (allowance.error) return failure(503);
    if (!allowance.data) return failure(429);
    if (input.action === 'consent') {
      const response = reply({ok: true, enabled: true});
      const previous = request.cookies.get(visitorCookie)?.value;
      response.cookies.set(consentCookie, consentVersion, cookieOptions());
      response.cookies.set(visitorCookie, previous && /^[a-f0-9]{64}$/.test(previous) ? previous : randomBytes(32).toString('hex'), cookieOptions());
      return response;
    }
    let userId: string | null = null;
    if (input.surface === 'planner') {
      const auth = await supabase();
      const {data: {user}, error} = await auth.auth.getUser();
      if (error || !user) return failure(401);
      userId = user.id;
    }
    const visitor = input.surface === 'landing' ? createHash('sha256').update(request.cookies.get(visitorCookie)!.value).digest('hex') : null;
    const result = await client.rpc('orbit_application_activity', {
      p_session: input.sessionId, p_surface: input.surface, p_user: userId, p_visitor: visitor,
      p_seconds: input.seconds, p_end: input.end, p_sequence: input.sequence,
    });
    return result.error ? failure(503) : reply({ok: true});
  } catch { return failure(503); }
}
