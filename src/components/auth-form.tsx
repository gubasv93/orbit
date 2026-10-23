'use client';
import Link from 'next/link';
import { useState } from 'react';
import { emailSchema, signupSchema } from '@/lib/schema';
export function AuthForm({ mode, initialNotice }: { mode: 'login' | 'signup'; initialNotice?: string }) {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, setPending] = useState(false), [confirmation, setConfirmation] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = new FormData(event.currentTarget);
    const values = { email: String(form.get('email') || '').trim().toLowerCase(), password: String(form.get('password') || ''), confirm: String(form.get('confirm') || '') };
    const parsed = mode === 'signup' ? signupSchema.safeParse(values) : emailSchema.safeParse(values.email);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(i => [String(i.path[0] || 'email'), i.message]))); return;
    }
    setErrors({}); setPending(true);
    try {
      const response = await fetch(`/api/auth/${mode}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
      const result = await response.json();
      if (!response.ok) { setErrors({ form: result.error || 'Please try again.' }); return; }
      if (result.confirmationRequired) { setConfirmation(true); return; }
      window.location.assign('/app');
    } catch { setErrors({ form: 'Unable to connect. Check your connection and try again.' }); }
    finally { setPending(false); }
  }
  if (confirmation) return <div role="status"><h2>Check your email</h2><p className="auth-feedback">If registration is available for your address, you’ll receive a confirmation link. Open it in this browser, then log in. Email delivery depends on the project’s current sender configuration.</p><Link href="/login" className="entry-button">Go to log in</Link></div>;
  return <><h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2><p className="auth-description">{mode === 'signup' ? 'Your roadmap starts with an empty private workspace.' : 'Log in to continue planning your roadmap.'}</p>{initialNotice && <p className="auth-error" role="status">{initialNotice}</p>}<form className="auth-form" method="post" action={`/api/auth/${mode}`} onSubmit={submit}><noscript>Enable JavaScript to use Orbit.</noscript>
    {errors.form && <p role="alert" className="auth-error">{errors.form}</p>}
    <label htmlFor="email">Email address</label><input id="email" name="email" type="email" required maxLength={254} autoComplete="email" placeholder="you@company.com" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined}/>{errors.email && <p id="email-error" className="field-error" role="alert">{errors.email}</p>}
    <label htmlFor="password">Password</label><input id="password" name="password" type="password" required minLength={mode === 'signup' ? 8 : undefined} maxLength={72} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} aria-invalid={Boolean(errors.password)} aria-describedby={mode === 'signup' ? 'password-hint password-error' : undefined}/>
    {mode === 'signup' && <><p id="password-hint" className="auth-hint">At least 8 characters, including a letter and a number. Maximum 72 bytes; some characters use more than one byte.</p><p id="password-error" className="field-error" role={errors.password ? 'alert' : undefined}>{errors.password}</p><label htmlFor="confirm">Confirm password</label><input id="confirm" name="confirm" type="password" required maxLength={72} autoComplete="new-password" aria-invalid={Boolean(errors.confirm)} aria-describedby="confirm-error"/><p id="confirm-error" className="field-error" role={errors.confirm ? 'alert' : undefined}>{errors.confirm}</p></>}
    <button type="submit" disabled={pending} className="auth-submit">{pending ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}</button>
  </form><p className="auth-bottom">{mode === 'signup' ? 'Already have an account?' : 'New to Orbit?'} <Link className="auth-link" href={mode === 'signup' ? '/login' : '/signup'}>{mode === 'signup' ? 'Log in' : 'Sign up'}</Link></p></>;
}
