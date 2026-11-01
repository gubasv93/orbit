import {NextRequest, NextResponse} from 'next/server';
import {limitedJson, sameOrigin} from '@/lib/http';

export const dynamic = 'force-dynamic';

function retiredResponse(value: unknown, status = 200) {
  const response = NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
  // Stale tabs can still send old events. Remove both cookies without storing
  // an event, consulting an account, or requiring an available analytics backend.
  for (const name of ['orbit_analytics_consent', 'orbit_analytics_visitor']) {
    response.cookies.set(name, '', {httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'strict', path: '/', maxAge: 0});
  }
  return response;
}

/** Compatibility endpoint only: optional usage tracking has been retired. */
export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return NextResponse.json({error: 'Request origin is not allowed.'}, {status: 403, headers: {'Cache-Control': 'private, no-store'}});
  let input: unknown;
  try { input = await limitedJson(request, 2048); }
  catch { return retiredResponse({error: 'Invalid activity request.'}, 400); }
  if (!input || typeof input !== 'object' || Array.isArray(input)) return retiredResponse({error: 'Invalid activity request.'}, 400);
  const action = 'action' in input ? input.action : undefined;
  const enabled = 'enabled' in input ? input.enabled : undefined;
  if (action === 'consent' && enabled === false) return retiredResponse({ok: true, enabled: false});
  if (action === 'event' || action === 'consent' && enabled === true) return retiredResponse({error: 'Optional usage analytics has been retired.', enabled: false}, 410);
  return retiredResponse({error: 'Invalid activity request.'}, 400);
}
