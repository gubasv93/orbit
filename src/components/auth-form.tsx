'use client';
import Link from 'next/link';
import { useState } from 'react';
import { emailSchema, signupSchema } from '@/lib/schema';
export function AuthForm({ mode, initialNotice }: { mode: 'login' | 'signup'; initialNotice?: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<'email' | 'google' | null>(null), [confirmation, setConfirmation] = useState(false);
  async function continueWithGoogle() {
    if (pending) return;
    setErrors({}); setPending('google');
    try {
      const response = await fetch('/api/auth/google', { method: 'POST' });
      const result = await response.json();
      if (!response.ok || !result.url) { setErrors({ form: result.error || 'Unable to start Google sign-in. Please try again.' }); setPending(null); return; }
      window.location.assign(result.url);
    } catch { setErrors({ form: 'Unable to connect. Check your connection and try again.' }); setPending(null); }
  }
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const values = { email: String(form.get('email') || '').trim().toLowerCase(), password: String(form.get('password') || ''), confirm: String(form.get('confirm') || '') };
    const parsed = mode === 'signup' ? signupSchema.safeParse(values) : emailSchema.safeParse(values.email);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0] || 'email'), i.message]))); return;
    }
    setErrors({}); setPending('email');
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) { setErrors({ form: result.error || 'Please try again.' }); return; }
      if (result.confirmationRequired) { setConfirmation(true); return; }
      window.location.assign('/app');
    } catch { setErrors({ form: 'Unable to connect. Check your connection and try again.' }); }
    finally { setPending(null); }
  }
  if (confirmation) return <div role="status"><h2>Check your email</h2><p className="auth-feedback">If registration is available for your address, you’ll receive a confirmation link. Open it in this browser, then log in.</p><Link href="/login" className="entry-button">Go to log in</Link></div>;
  return <><h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p className="auth-description">{mode === 'signup' ? 'Your roadmap starts with an empty private workspace.' : 'Log in to continue planning your roadmap.'}</p>{initialNotice && <p className="auth-error" role="status">{initialNotice}</p>}
    {errors.form && <p role="alert" className="auth-error">{errors.form}</p>}
    <button type="button" className="auth-google" disabled={Boolean(pending)} onClick={continueWithGoogle}>
      <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.39-.18-2.05H12v3.88h5.38a4.6 4.6 0 0 1-2 3.02v2.51h3.23c1.89-1.74 2.99-4.3 2.99-7.36Z"/><path fill="#34A853" d="M12 22c2.7 0 4.96-.9 6.61-2.41l-3.23-2.51c-.9.6-2.04.97-3.38.97-2.6 0-4.81-1.76-5.6-4.13H3.06v2.59A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.4 13.92A6 6 0 0 1 6.09 12c0-.67.11-1.32.31-1.92V7.49H3.06A10 10 0 0 0 2 12c0 1.61.39 3.14 1.06 4.51l3.34-2.59Z"/><path fill="#EA4335" d="M12 5.95c1.47 0 2.78.51 3.82 1.51l2.86-2.86A9.6 9.6 0 0 0 12 2a10 10 0 0 0-8.94 5.49l3.34 2.59C7.19 7.71 9.4 5.95 12 5.95Z"/></svg>
      {pending === 'google' ? 'Connecting to Google…' : 'Continue with Google'}
    </button><div className="auth-divider"><span>or continue with email</span></div>
    <form className="auth-form" method="post" action={`/api/auth/${mode}`} onSubmit={submit}><noscript>Enable JavaScript to use Orbit.</noscript>
    <label htmlFor="email">Email address</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}/>{errors.email && <p id="email-error" className="field-error" role="alert">{errors.email}</p>}
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={mode === 'signup' ? 8 : undefined} maxLength={72} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-invalid={Boolean(errors.password)} aria-describedby={mode === 'signup' ? 'password-hint password-error' : undefined}/>
    {mode === 'signup' && <><p id="password-hint" className="auth-hint">At least 8 characters, including a letter and a number. Maximum 72 bytes; some characters use more than one byte.</p><p id="password-error" className="field-error" role={errors.password ? 'alert' : undefined}>{errors.password}</p><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required maxLength={72} autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} aria-describedby="confirm-error"/><p id="confirm-error" className="field-error" role={errors.confirm ? 'alert' : undefined}>{errors.confirm}</p></>}
    <button type="submit" disabled={Boolean(pending)} className="auth-submit">{pending === 'email' ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
  </form><p className="auth-bottom">{mode === 'signup' ? 'Already have an account?' : 'New to Orbit?'} <Link className="auth-link" href={mode === 'signup' ? '/login' : '/signup'}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Link></p></>;
}
