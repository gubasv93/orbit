import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { isConfigured, supabase } from '@/lib/supabase';
import { problem, sameOrigin } from '@/lib/http';

export async function POST(request: NextRequest) {
  if (!sameOrigin(request)) return problem('Request origin is not allowed.', 403);
  if (!isConfigured()) return problem('Authentication is not configured yet. Please contact the owner.', 503);
  if (process.env.SIGNUP_MODE !== 'public') return problem('Google sign-in is unavailable while registration is restricted. Please use email and password.', 403);

  try {
    const client = await supabase();
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const key = createHash('sha256').update(ip).digest('hex');
    const { data: allowed, error: rateError } = await client.rpc('orbit_auth_allow', { p_key: key, p_kind: 'login' });
    if (rateError) return problem('Authentication is temporarily unavailable. Please retry later.', 503);
    if (!allowed) return problem('Too many attempts. Please wait a minute and try again.', 429);

    // Check the provider before leaving Orbit, so incomplete setup never sends
    // a visitor to Supabase's raw provider-disabled error page.
    const settings = await fetch(`${process.env.SUPABASE_URL}/auth/v1/settings`, {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY! }, cache: 'no-store', signal: AbortSignal.timeout(10_000),
    });
    if (!settings.ok) return problem('Google sign-in is temporarily unavailable. Please try again.', settings.status === 429 ? 429 : 503);
    const configuration = await settings.json();
    if (!configuration.external?.google) return problem('Google sign-in is being set up. Please use email and password for now.', 503);

    const origin = new URL(process.env.APP_URL || request.nextUrl.origin).origin;
    // The server client saves the PKCE verifier in an HttpOnly cookie. Omit
    // skipBrowserRedirect: it also makes /authorize return JSON instead of a redirect.
    const { data, error } = await client.auth.signInWithOAuth({
      provider: 'google', options: { redirectTo: `${origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
    });
    if (error || !data.url) return problem('Unable to start Google sign-in. Please try again.', 503);
    return NextResponse.json({ url: data.url }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return problem('Google sign-in is temporarily unavailable. Please try again.', 503);
  }
}
