'use client';

import Link from 'next/link';
import {useEffect, useState, type FormEvent} from 'react';
import {Brand, Footer} from './brand';
import type {AccountProfile} from '@/lib/profile';
import {firstNameSchema, lastNameSchema, passwordSchema} from '@/lib/schema';
import './profile.css';

type PasswordMode = 'current-password' | 'google-reauth';
export function ProfilePage({initialProfile, passwordMode}: {initialProfile: AccountProfile; passwordMode: PasswordMode}) {
  const [profile, setProfile] = useState(initialProfile);
  const [firstName, setFirstName] = useState(initialProfile.firstName), [lastName, setLastName] = useState(initialProfile.lastName);
  const [mode, setMode] = useState(passwordMode), [recentGoogle, setRecentGoogle] = useState(false);
  const [pending, setPending] = useState<'name' | 'password' | 'google' | null>(null);
  const [nameError, setNameError] = useState(''), [passwordError, setPasswordError] = useState('');
  const [nameSaved, setNameSaved] = useState(false), [passwordSaved, setPasswordSaved] = useState(false);
  useEffect(() => {
    if (passwordMode !== 'google-reauth') return;
    const abort = new AbortController();
    fetch('/api/profile', {cache: 'no-store', signal: abort.signal}).then(async response => {
      if (!response.ok) return;
      const value = await response.json();
      if (value.password?.mode === 'google-reauth') setRecentGoogle(value.password.recentGoogle === true);
    }).catch(() => { /* The server rechecks authentication before every change. */ });
    return () => abort.abort();
  }, [passwordMode]);

  async function patch(input: Record<string, unknown>) {
    const response = await fetch('/api/profile', {method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(input)});
    const value = await response.json();
    if (!response.ok) throw new Error(value.error || 'Unable to save your changes. Please retry.');
    return value;
  }
  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setNameError(''); setNameSaved(false);
    const first = firstNameSchema.safeParse(firstName), last = lastNameSchema.safeParse(lastName);
    if (!first.success || !last.success) { setNameError(!first.success ? first.error.issues[0].message : !last.success ? last.error.issues[0].message : 'Check your name.'); return; }
    setPending('name');
    try {
      const result = await patch({action: 'name', firstName: first.data, lastName: last.data});
      setProfile(result.profile); setFirstName(result.profile.firstName); setLastName(result.profile.lastName); setNameSaved(true);
    } catch (error) { setNameError(error instanceof Error ? error.message : 'Unable to save your name. Please retry.'); }
    finally { setPending(null); }
  }
  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget, data = new FormData(form);
    setPasswordError(''); setPasswordSaved(false);
    const password = String(data.get('password') || ''), confirm = String(data.get('confirm') || '');
    const valid = passwordSchema.safeParse(password);
    if (!valid.success) { setPasswordError(valid.error.issues[0].message); return; }
    if (password !== confirm) { setPasswordError('Passwords do not match'); return; }
    setPending('password');
    try {
      await patch({action: 'password', ...(mode === 'current-password' ? {currentPassword: String(data.get('currentPassword') || '')} : {}), password, confirm});
      form.reset(); setPasswordSaved(true); setMode('current-password');
    } catch (error) { setPasswordError(error instanceof Error ? error.message : 'Unable to change your password. Please retry.'); }
    finally { setPending(null); }
  }
  async function verifyGoogle() {
    if (pending) return;
    setPasswordError(''); setPending('google');
    try {
      const response = await fetch('/api/auth/google', {method: 'POST'}), value = await response.json();
      if (!response.ok || !value.url) throw new Error(value.error || 'Unable to start Google sign-in.');
      window.location.assign(value.url);
    } catch (error) { setPasswordError(error instanceof Error ? error.message : 'Unable to connect. Please retry.'); setPending(null); }
  }
  const initials = [profile.firstName, profile.lastName].filter(Boolean).map(name => Array.from(name)[0]).join('').toUpperCase() || Array.from(profile.displayName)[0]?.toUpperCase() || 'O';

  return <div className="entry-shell profile-shell">
    <header className="entry-top profile-top"><Brand/><Link className="entry-button" href="/app">Back to roadmap</Link></header>
    <main className="profile-main">
      <div className="profile-heading"><span className="profile-avatar" aria-hidden="true">{initials}</span><div><span className="profile-eyebrow">YOUR ACCOUNT</span><h1>Profile</h1><p>Your name appears in Planning Poker.</p></div></div>
      <section className="profile-card" aria-labelledby="profile-details-title"><div className="profile-section-heading"><h2 id="profile-details-title">Personal details</h2><p>Keep the name your team sees up to date.</p></div>
        <form className="profile-form" onSubmit={saveName}>
          <div className="profile-name-fields"><div className="profile-field"><label htmlFor="profile-first-name">First name</label><input id="profile-first-name" name="firstName" autoComplete="given-name" required maxLength={100} value={firstName} onChange={event => {setFirstName(event.target.value);setNameSaved(false);}}/></div><div className="profile-field"><label htmlFor="profile-last-name">Last name</label><input id="profile-last-name" name="lastName" autoComplete="family-name" required maxLength={100} value={lastName} onChange={event => {setLastName(event.target.value);setNameSaved(false);}}/></div></div>
          <div className="profile-field"><label htmlFor="profile-email">Email address</label><input id="profile-email" type="email" value={profile.email} readOnly autoComplete="email"/><p className="profile-hint">Your sign-in email.</p></div>
          {nameError && <p className="profile-error" role="alert">{nameError}</p>}{nameSaved && <p className="profile-success" role="status">Name updated.</p>}
          <div className="profile-actions"><button type="submit" className="profile-submit" disabled={Boolean(pending)}>{pending === 'name' ? 'Saving…' : 'Save name'}</button></div>
        </form>
      </section>
      <section className="profile-card" aria-labelledby="profile-password-title"><div className="profile-section-heading"><h2 id="profile-password-title">{mode === 'current-password' ? 'Change password' : 'Set a password'}</h2><p>{mode === 'current-password' ? 'Verify your current password before choosing a new one.' : 'Add email/password sign-in to your Google account.'}</p></div>
        {mode === 'google-reauth' && !recentGoogle && <div className="profile-google-notice"><p>Verify with Google again, then reopen Profile to set a password.</p><button type="button" className="entry-button" disabled={Boolean(pending)} onClick={() => void verifyGoogle()}>{pending === 'google' ? 'Connecting…' : 'Verify with Google'}</button></div>}
        <form className="profile-form" onSubmit={changePassword}>
          {mode === 'current-password' && <div className="profile-field"><label htmlFor="profile-current-password">Current password</label><input id="profile-current-password" name="currentPassword" type="password" autoComplete="current-password" required maxLength={72}/></div>}
          <div className="profile-field"><label htmlFor="profile-new-password">New password</label><input id="profile-new-password" name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} aria-describedby="profile-password-hint"/><p id="profile-password-hint" className="profile-hint">At least 8 characters, including a letter and a number. Maximum 72 bytes.</p></div>
          <div className="profile-field"><label htmlFor="profile-confirm-password">Confirm new password</label><input id="profile-confirm-password" name="confirm" type="password" autoComplete="new-password" required maxLength={72}/></div>
          {passwordError && <p className="profile-error" role="alert">{passwordError}</p>}{passwordSaved && <p className="profile-success" role="status">Password updated.</p>}
          <div className="profile-actions"><button type="submit" className="profile-submit" disabled={Boolean(pending) || mode === 'google-reauth' && !recentGoogle}>{pending === 'password' ? 'Updating…' : mode === 'current-password' ? 'Change password' : 'Set password'}</button></div>
        </form>
      </section>
    </main><Footer/>
  </div>;
}
