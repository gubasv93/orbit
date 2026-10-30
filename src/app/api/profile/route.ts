import { createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { limitedJson, sameOrigin } from '@/lib/http';
import { accountProfile, profilePasswordMode, recentGoogleAuthentication } from '@/lib/profile';
import { firstNameSchema, lastNameSchema, passwordSchema, loginPasswordSchema } from '@/lib/schema';
import { isConfigured, supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
const nameChange = z.object({action: z.literal('name'), firstName: firstNameSchema, lastName: lastNameSchema}).strict();
const passwordChange = z.object({action: z.literal('password'), currentPassword: loginPasswordSchema.optional(), password: passwordSchema, confirm: z.string()}).strict()
  .refine(value => value.password === value.confirm, {message: 'Passwords do not match', path: ['confirm']});
const respond = (value: unknown, status = 200) => NextResponse.json(value, {status, headers: {'Cache-Control': 'private, no-store'}});
const failure = (message: string, status = 400) => respond({error: message}, status);

async function session() {
  if (!isConfigured()) return null;
  const client = await supabase();
  const {data: {user}, error} = await client.auth.getUser();
  return error || !user ? null : {client, user};
}
async function passwordCapabilities(auth: NonNullable<Awaited<ReturnType<typeof session>>>) {
  const mode = profilePasswordMode(auth.user);
  if (mode !== 'google-reauth') return {mode, recentGoogle: false};
  const {data, error} = await auth.client.auth.getClaims();
  return {mode, recentGoogle: !error && data?.claims.sub === auth.user.id && recentGoogleAuthentication(data.claims)};
}

export async function GET() {
  try {
    const auth = await session();
    if (!auth) return failure('Please log in.', 401);
    return respond({profile: accountProfile(auth.user), password: await passwordCapabilities(auth)});
  } catch { return failure('Unable to load your profile. Please retry.', 503); }
}

export async function PATCH(request: NextRequest) {
  if (!sameOrigin(request)) return failure('Request origin is not allowed.', 403);
  let input: unknown;
  try { input = await limitedJson(request, 4096); } catch { return failure('Invalid profile request.'); }
  const parsed = z.union([nameChange, passwordChange]).safeParse(input);
  if (!parsed.success) return failure(parsed.error.issues[0]?.message || 'Check the form fields.');
  try {
    const auth = await session();
    if (!auth) return failure('Please log in.', 401);
    const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
    const key = createHash('sha256').update(`profile:${auth.user.id}:${ip}`).digest('hex');
    const {data: allowed, error: limitError} = await auth.client.rpc('orbit_auth_allow', {p_key: key, p_kind: 'login'});
    if (limitError) return failure('Profile updates are temporarily unavailable. Please retry.', 503);
    if (!allowed) return failure('Too many attempts. Please wait a minute and try again.', 429);

    if (parsed.data.action === 'name') {
      const {firstName, lastName} = parsed.data;
      const {data, error} = await auth.client.auth.updateUser({data: {first_name: firstName, last_name: lastName, full_name: `${firstName} ${lastName}`}});
      if (error || !data.user) return failure('Unable to update your name. Please retry.', error?.status === 429 ? 429 : 503);
      return respond({ok: true, profile: accountProfile(data.user)});
    }

    const {currentPassword, password} = parsed.data;
    if (currentPassword) {
      if (!auth.user.email) return failure('This account has no email/password sign-in.', 400);
      // Verify in isolation. A failed attempt must not replace the browser session.
      const verifier = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
        auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false},
      });
      const checked = await verifier.auth.signInWithPassword({email: auth.user.email, password: currentPassword});
      if (checked.error || !checked.data.session || checked.data.user?.id !== auth.user.id) return failure('Current password is incorrect.', checked.error?.status === 429 ? 429 : 400);
      // A verified fresh session also supports Supabase's secure-password-change
      // option without an email nonce. Tokens only become HttpOnly session cookies.
      const adopted = await auth.client.auth.setSession({access_token: checked.data.session.access_token, refresh_token: checked.data.session.refresh_token});
      if (adopted.error || adopted.data.user?.id !== auth.user.id) return failure('Unable to verify your current sign-in. Please log in again.', 401);
    } else {
      const capabilities = await passwordCapabilities(auth);
      if (capabilities.mode !== 'google-reauth') return failure('Enter your current password.');
      if (!capabilities.recentGoogle) return failure('Sign in with Google again, then reopen Profile to set a password.', 403);
    }

    const {error} = await auth.client.auth.updateUser({password});
    if (error) {
      if (error.code === 'same_password') return failure('Choose a password different from your current password.');
      if (error.code === 'weak_password') return failure('Choose a stronger password with at least 8 characters, a letter and a number.');
      if (error.code === 'reauthentication_needed') return failure('Please log in again before changing your password.', 403);
      return failure('Unable to update your password. Please retry.', error.status === 429 ? 429 : 503);
    }
    return respond({ok: true});
  } catch { return failure('Profile updates are temporarily unavailable. Please retry.', 503); }
}
