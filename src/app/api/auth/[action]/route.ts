import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { emailSchema, signupSchema, loginPasswordSchema } from '@/lib/schema';
import { isConfigured, supabase } from '@/lib/supabase';
import { limitedJson, problem, sameOrigin } from '@/lib/http';

export async function POST(request: NextRequest, context: { params: Promise<{ action: string }> }) {
  if (!sameOrigin(request)) return problem('Request origin is not allowed.', 403);
  const { action } = await context.params;
  if (!['login', 'signup', 'logout'].includes(action)) return problem('Not found.', 404);
  if (!isConfigured()) return problem('Authentication is not configured yet. Please contact the owner.', 503);
  const client = await supabase();
  if (action === 'logout') {
    const { error } = await client.auth.signOut();
    return error ? problem('Log out failed. Please retry.', 503) : NextResponse.json({ ok: true });
  }
  let input: unknown;
  try { input = await limitedJson(request, 4096); } catch { return problem('Invalid request.'); }
  const schema = action === 'signup' ? signupSchema : z.object({ email: emailSchema, password: loginPasswordSchema });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return problem(parsed.error.issues[0]?.message || 'Check the form fields.');
  const { email, password } = parsed.data;
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const key = createHash('sha256').update(ip).digest('hex');
  const { data: allowed, error: rateError } = await client.rpc('orbit_auth_allow', { p_key: key, p_kind: action });
  if (rateError) return problem('Authentication is temporarily unavailable. Please retry later.', 503);
  if (!allowed) return problem('Too many attempts. Please wait a minute and try again.', 429);
  if (action === 'signup') {
    const allowedEmails = (process.env.SIGNUP_ALLOWED_EMAILS || '').split(',').map(e => e.trim().toLowerCase()).filter(Boolean);
    if (process.env.SIGNUP_MODE !== 'public' && !allowedEmails.includes(email)) {
      return problem('Registration is currently limited to approved emails. Please contact the owner.', 403);
    }
    const origin = process.env.APP_URL || request.nextUrl.origin;
    const { data, error } = await client.auth.signUp({ email, password, options: { emailRedirectTo: `${origin}/auth/callback` } });
    if (error) {
      console.warn('auth_signup_failed', { code: error.code || 'provider_error' });
      return problem(error.status === 429 ? 'Too many attempts. Please try later.' : 'Unable to create an account. Check your details or try logging in.', error.status === 429 ? 429 : 400);
    }
    return NextResponse.json({ ok: true, confirmationRequired: !data.session });
  }
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) {
    console.warn('auth_login_failed', { code: error.code || 'provider_error' });
    return problem(error.status === 429 ? 'Too many attempts. Please try later.' : 'Email or password is incorrect, or your email has not been confirmed.', error.status === 429 ? 429 : 401);
  }
  return NextResponse.json({ ok: true });
}
