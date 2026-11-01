'use client';

import {useState, type FormEvent} from 'react';
import {currentLegalAcceptance} from '@/lib/legal';
import {LegalAgreement} from './legal-agreement';

export function LegalAcceptanceForm({email, initialError = ''}: {email: string; initialError?: string}) {
  const [accepted, setAccepted] = useState(false), [pending, setPending] = useState(false), [error, setError] = useState(initialError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || !accepted) return;
    setPending(true);setError('');
    try {
      const response = await fetch('/api/legal', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(currentLegalAcceptance)});
      const result = await response.json();
      if (response.status === 401) {window.location.assign('/login');return;}
      if (!response.ok) throw new Error(result.error || 'Unable to record your agreement. Please retry.');
      window.location.assign('/app');
    } catch (caught) {setError(caught instanceof Error ? caught.message : 'Unable to record your agreement. Please retry.');}
    finally {setPending(false);}
  }
  return <section className="auth-card"><h1>Before you start planning</h1><p>Review the terms for your Orbit account.</p><p className="legal-acceptance-email">Signed in as <strong>{email}</strong></p><form onSubmit={submit}>
    <LegalAgreement checked={accepted} onChange={event => setAccepted(event.target.checked)} disabled={pending}/>
    {error && <p role="alert" className="auth-error">{error}</p>}
    <button className="auth-submit" type="submit" disabled={pending}>{pending ? 'Please wait…' : 'Accept and continue'}</button>
  </form></section>;
}
