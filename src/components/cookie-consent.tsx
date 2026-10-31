'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import {analyticsEnabled, analyticsPreferenceEvent, analyticsPreferenceKey, rememberAnalyticsPreference} from './activity-analytics';
import './cookie-consent.css';

// Existing essential-only acknowledgments never opt a visitor into analytics.
const noticeKey = 'orbit-cookie-notice';
const noticeVersion = 'essential-v1';
const settingsEvent = 'orbit:cookie-settings';

export function CookieSettingsButton({className = ''}: {className?: string}) {
  return <button type="button" className={`cookie-settings-trigger ${className}`} onClick={() => window.dispatchEvent(new Event(settingsEvent))}>Cookie settings</button>;
}

export function CookieConsent() {
  const [ready, setReady] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [analytics, setAnalytics] = useState(false), [draftAnalytics, setDraftAnalytics] = useState(false);
  const [savingChoice, setSavingChoice] = useState(false), [choiceError, setChoiceError] = useState('');
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { setAcknowledged(localStorage.getItem(noticeKey) === noticeVersion); } catch { /* Dismissing still works for this page when storage is unavailable. */ }
    const initialAnalytics = analyticsEnabled();setAnalytics(initialAnalytics);setDraftAnalytics(initialAnalytics);
    setReady(true);
    const open = () => {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDraftAnalytics(analyticsEnabled());setChoiceError('');setDetailsOpen(true);
    };
    const sync = (event: StorageEvent) => {
      if (event.key === noticeKey) setAcknowledged(event.newValue === noticeVersion);
      else if (event.key === null) setAcknowledged(false);
      if (event.key === analyticsPreferenceKey || event.key === null) {const enabled=event.newValue === 'accepted-v1';setAnalytics(enabled);setDraftAnalytics(enabled);}
    };
    const preference = (event: Event) => {const enabled=(event as CustomEvent<unknown>).detail === true;setAnalytics(enabled);setDraftAnalytics(enabled);};
    window.addEventListener(analyticsPreferenceEvent, preference);
    window.addEventListener(settingsEvent, open);
    window.addEventListener('storage', sync);
    // The planner also uses native document shortcuts. Stop keys at the
    // dialog itself, before those listeners can act on the page underneath.
    const element = dialog.current;
    const containKeys = (event: KeyboardEvent) => event.stopPropagation();
    element?.addEventListener('keydown', containKeys);
    return () => {
      window.removeEventListener(analyticsPreferenceEvent, preference);
      window.removeEventListener(settingsEvent, open);
      window.removeEventListener('storage', sync);
      element?.removeEventListener('keydown', containKeys);
    };
  }, []);

  useEffect(() => {
    if (!dialog.current) return;
    if (detailsOpen && !dialog.current.open) dialog.current.showModal();
    else if (!detailsOpen && dialog.current.open) dialog.current.close();
  }, [detailsOpen]);

  async function acknowledge(enabled = false) {
    if (savingChoice) return;
    setChoiceError('');
    const previouslyEnabled = analyticsEnabled();
    // Revocation takes effect locally before the cleanup request can run.
    if (!enabled) rememberAnalyticsPreference(false);
    setSavingChoice(true);
    try {
      if (enabled || previouslyEnabled) {
        const response = await fetch('/api/activity', {method: 'POST', headers: {'Content-Type': 'application/json'}, credentials: 'same-origin', signal: AbortSignal.timeout(5000), body: JSON.stringify({action: 'consent', enabled})});
        if (!response.ok && enabled) throw new Error('Optional analytics could not be enabled. You can keep using Orbit with essentials only.');
      }
      rememberAnalyticsPreference(enabled);setAnalytics(enabled);setDraftAnalytics(enabled);
      try { localStorage.setItem(noticeKey, noticeVersion); } catch { /* The current page still honors this choice. */ }
      setAcknowledged(true);setDetailsOpen(false);
    } catch {
      if (enabled) setChoiceError('Optional analytics could not be enabled. You can keep using Orbit with essentials only.');
      else {setAcknowledged(true);setDetailsOpen(false);}
    } finally { setSavingChoice(false); }
  }

  function openDetails() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDraftAnalytics(analyticsEnabled());setChoiceError('');setDetailsOpen(true);
  }

  return <>
    {ready && !acknowledged && <section className="cookie-banner" role="region" aria-label="Cookies and browser storage">
      <div className="cookie-banner-heading"><span className="cookie-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20.4 13.7a8.6 8.6 0 1 1-10-10.1 4.5 4.5 0 0 0 5.2 5.2 4.5 4.5 0 0 0 4.8 4.9Z"/><path d="M8 10h.01M8 16h.01M14 15h.01" strokeWidth="3" strokeLinecap="round"/></svg></span><h2>Just the essentials.</h2></div>
      <p>Essential cookies keep you signed in and remember your Poker session. Optional first-party analytics stays off unless you enable it. No advertising cookies.</p>
      <div className="cookie-banner-actions"><button type="button" className="cookie-button cookie-primary" disabled={savingChoice} onClick={() => void acknowledge(false)}>Got it</button><button type="button" className="cookie-button cookie-secondary" disabled={savingChoice} onClick={() => void acknowledge(true)}>Enable analytics</button><button type="button" className="cookie-button cookie-secondary" onClick={openDetails}>Cookie details</button></div><small className="cookie-choice-hint">“Got it” keeps optional analytics off.</small>{choiceError && <p role="alert" className="cookie-choice-error">{choiceError}</p>}
    </section>}
    <dialog ref={dialog} className="cookie-dialog" aria-labelledby="cookie-dialog-title" aria-describedby="cookie-dialog-description" onCancel={event => { event.preventDefault(); setDetailsOpen(false); }} onClose={() => { setDetailsOpen(false); previousFocus.current?.isConnected && previousFocus.current.focus(); }}>
      <div className="cookie-dialog-heading"><span className="cookie-eyebrow">Your browser, your data</span><button type="button" className="cookie-close" aria-label="Close cookie details" onClick={() => setDetailsOpen(false)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <h2 id="cookie-dialog-title">Cookies, kept simple</h2>
      <p id="cookie-dialog-description">Essential storage supports the features you use. You can also choose optional, first-party usage analytics. There are no advertising cookies.</p>
      <div className="cookie-purpose"><div><h3>Essential cookies</h3><span className="cookie-essential">Always active</span></div><p>Keep your account signed in, support secure sign-in, and identify your guest session when you join a Poker room.</p></div>
      <div className="cookie-purpose"><div><h3>Browser preferences</h3><span className="cookie-essential">Saved on your device</span></div><p>Remember a theme you explicitly choose and that you have seen this cookie notice. These preferences are not used for tracking.</p></div>
      <div className="cookie-purpose"><div><h3>Optional usage analytics</h3><span className="cookie-essential">{analytics ? 'Enabled' : 'Off by default'}</span></div><p>Help us understand visits and active time on the landing page and planner. A random browser identifier counts returning visitors. Planner activity is linked to your signed-in account. We do not record page content, passwords, mouse paths or browser fingerprints, and we do not share this data with advertising providers.</p><label className="cookie-analytics-choice"><input type="checkbox" checked={draftAnalytics} disabled={savingChoice} onChange={event => setDraftAnalytics(event.target.checked)}/><span>Allow usage analytics<small>You can turn this off here at any time.</small></span></label>{choiceError && <p role="alert" className="cookie-choice-error">{choiceError}</p>}</div>
      <p className="cookie-dialog-note">You can clear cookies and browser storage in your browser settings. This may sign you out or reset your preferences.</p>
      <div className="cookie-dialog-actions"><Link className="cookie-detail-link" href="/cookies" onClick={() => setDetailsOpen(false)}>Read the cookie details <span aria-hidden="true">↗</span></Link><button type="button" className="cookie-button cookie-primary" disabled={savingChoice} onClick={() => void acknowledge(draftAnalytics)}>{savingChoice ? 'Saving…' : 'Got it'}</button></div>
    </dialog>
  </>;
}
