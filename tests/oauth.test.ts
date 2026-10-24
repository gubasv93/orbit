import { createHash } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../src/app/api/auth/google/route';
import { GET } from '../src/app/auth/callback/route';

const cookies = vi.hoisted(() => ({
  values: new Map<string, string>(),
  writes: [] as { name: string; value: string; options: Record<string, unknown> }[],
}));
vi.mock('next/headers', () => ({ cookies: async () => ({
  getAll: () => [...cookies.values].map(([name, value]) => ({ name, value })),
  set: (name: string, value: string, options: Record<string, unknown>) => {
    cookies.writes.push({ name, value, options });
    if (options.maxAge === 0) cookies.values.delete(name); else cookies.values.set(name, value);
  },
}) }));

const app = 'https://orbit.example', backend = 'https://supabase.example';
let googleEnabled: boolean, allowed: boolean, challenge: string, exchanged: boolean;
const request = (origin = app) => new NextRequest(`${app}/api/auth/google?next=https://attacker.example`, { method: 'POST', headers: { Origin: origin } });
const callback = (query: string) => GET(new NextRequest(`${app}/auth/callback?${query}`));

beforeEach(() => {
  cookies.values.clear(); cookies.writes.length = 0;
  googleEnabled = true; allowed = true; challenge = ''; exchanged = false;
  vi.stubEnv('SUPABASE_URL', backend); vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test-publishable-key');
  vi.stubEnv('APP_URL', app); vi.stubEnv('SIGNUP_MODE', 'public'); vi.stubEnv('NODE_ENV', 'production');
  // Real @supabase/ssr client and real PKCE storage/exchange; only the remote
  // provider's HTTP boundary and Next.js request cookie jar are substituted.
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : String(input));
    if (url.origin !== backend) throw new Error('Unexpected destination');
    if (url.pathname === '/rest/v1/rpc/orbit_auth_allow') return Response.json(allowed);
    if (url.pathname === '/auth/v1/settings') return Response.json({ external: { google: googleEnabled } });
    if (url.pathname === '/auth/v1/token' && url.searchParams.get('grant_type') === 'pkce') {
      const body = JSON.parse(String(init?.body));
      const digest = createHash('sha256').update(body.code_verifier || '').digest('base64url');
      if (exchanged || body.auth_code !== 'one-use-code' || !challenge || digest !== challenge) {
        return Response.json({ code: 400, error_code: 'bad_code_verifier', msg: 'Invalid exchange' }, { status: 400 });
      }
      exchanged = true;
      const payload = Buffer.from(JSON.stringify({ sub: '11111111-1111-4111-8111-111111111111', exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
      return Response.json({ access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.signature`, refresh_token: 'test-refresh-token', token_type: 'bearer', expires_in: 3600,
        user: { id: '11111111-1111-4111-8111-111111111111', email: 'person@example.com', aud: 'authenticated', role: 'authenticated', app_metadata: { provider: 'google' }, user_metadata: {}, created_at: '2026-10-24T00:00:00Z' } });
    }
    throw new Error('Unexpected provider request');
  }));
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function start() {
  const response = await POST(request()); expect(response.status).toBe(200);
  const url = new URL((await response.json()).url); challenge = url.searchParams.get('code_challenge') || '';
  return { response, url };
}

it('starts Google PKCE with an HttpOnly verifier, a fixed callback, and an account chooser', async () => {
  const { response, url } = await start();
  expect(url.origin + url.pathname).toBe(`${backend}/auth/v1/authorize`);
  expect(url.searchParams.get('provider')).toBe('google');
  expect(url.searchParams.get('redirect_to')).toBe(`${app}/auth/callback`);
  expect(url.searchParams.get('prompt')).toBe('select_account');
  expect(url.searchParams.get('code_challenge_method')).toBe('s256');
  expect(challenge.length).toBeGreaterThanOrEqual(43);
  expect(url.searchParams.has('skip_http_redirect')).toBe(false);
  expect(url.searchParams.has('code_verifier')).toBe(false);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(cookies.writes.length).toBeGreaterThan(0);
  for (const cookie of cookies.writes) expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax', path: '/' });
});

it('exchanges a matching proof key for a server session and redirects only to the private app', async () => {
  await start();
  const response = await callback('code=one-use-code&next=https://attacker.example');
  expect(exchanged).toBe(true); expect(response.headers.get('location')).toBe(`${app}/app`);
  expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(response.headers.get('referrer-policy')).toBe('no-referrer');
  expect([...cookies.values.keys()].some(name => name.endsWith('-auth-token'))).toBe(true);
  for (const cookie of cookies.writes) expect(cookie.options).toMatchObject({ httpOnly: true, secure: true, sameSite: 'lax' });
});

it('rejects a callback in a different browser without its verifier cookie', async () => {
  await start(); cookies.values.clear();
  const response = await callback('code=one-use-code');
  expect(exchanged).toBe(false); expect(response.headers.get('location')).toBe(`${app}/login?auth=failed`);
});

it('rejects a changed verifier instead of establishing a session', async () => {
  await start(); challenge = 'different-challenge';
  const response = await callback('code=one-use-code');
  expect(exchanged).toBe(false); expect(response.headers.get('location')).toBe(`${app}/login?auth=failed`);
  expect([...cookies.values.keys()].some(name => name.endsWith('-auth-token'))).toBe(false);
});

it('does not accept a replayed authorization code', async () => {
  await start(); await callback('code=one-use-code');
  const response = await callback('code=one-use-code');
  expect(response.headers.get('location')).toBe(`${app}/login?auth=failed`);
});

it.each(['access_denied', 'server_error'])('handles provider error %s without reflecting untrusted descriptions or redirects', async error => {
  const response = await callback(`error=${error}&error_description=untrusted-secret&next=https://attacker.example`);
  expect(response.headers.get('location')).toBe(`${app}/login?oauth=${error === 'access_denied' ? 'cancelled' : 'failed'}`);
  expect(fetch).not.toHaveBeenCalled();
});

it('rejects cross-origin attempts before creating cookies or contacting Supabase', async () => {
  expect((await POST(request('https://attacker.example'))).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled(); expect(cookies.writes).toEqual([]);
});

it('fails closed when auth or public registration is unavailable', async () => {
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', ''); expect((await POST(request())).status).toBe(503);
  vi.stubEnv('SUPABASE_PUBLISHABLE_KEY', 'test'); vi.stubEnv('SIGNUP_MODE', 'restricted'); expect((await POST(request())).status).toBe(403);
  expect(fetch).not.toHaveBeenCalled();
});

it('keeps visitors on Orbit with a useful message when Google is not configured', async () => {
  googleEnabled = false; const response = await POST(request());
  expect(response.status).toBe(503); expect((await response.json()).error).toContain('Please use email and password');
  expect(cookies.writes).toEqual([]);
});

it('shares the login rate limit and does not start a flow after the limit', async () => {
  allowed = false; const response = await POST(request());
  expect(response.status).toBe(429); expect(cookies.writes).toEqual([]);
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('returns usable error responses during provider outages', async () => {
  await start();
  // A real error response reaches the code exchange with a stored verifier.
  vi.mocked(fetch).mockImplementation(async () => Response.json({ code: 503, error_code: 'unexpected_failure', msg: 'Provider unavailable' }, { status: 503 }));
  expect((await callback('code=one-use-code')).headers.get('location')).toBe(`${app}/login?auth=failed`);
  vi.mocked(fetch).mockRejectedValue(new Error('Provider offline'));
  expect((await POST(request())).status).toBe(503);
});
