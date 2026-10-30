'use client';

import Link from 'next/link';
import {useEffect, useRef, useState} from 'react';
import './cookie-consent.css';

// This records a notice acknowledgment, not consent to optional tracking.
// Orbit currently has no analytics or advertising cookies to opt into.
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
  const dialog = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    try { setAcknowledged(localStorage.getItem(noticeKey) === noticeVersion); } catch { /* Dismissing still works for this page when storage is unavailable. */ }
    setReady(true);
    const open = () => {
      previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setDetailsOpen(true);
    };
    const sync = (event: StorageEvent) => {
      if (event.key === noticeKey) setAcknowledged(event.newValue === noticeVersion);
      else if (event.key === null) setAcknowledged(false);
    };
    window.addEventListener(settingsEvent, open);
    window.addEventListener('storage', sync);
    // The planner also uses native document shortcuts. Stop keys at the
    // dialog itself, before those listeners can act on the page underneath.
    const element = dialog.current;
    const containKeys = (event: KeyboardEvent) => event.stopPropagation();
    element?.addEventListener('keydown', containKeys);
    return () => {
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

  function acknowledge() {
    try { localStorage.setItem(noticeKey, noticeVersion); } catch { /* Keep the current page usable without persistent browser storage. */ }
    setAcknowledged(true);
    setDetailsOpen(false);
  }

  function openDetails() {
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setDetailsOpen(true);
  }

  return <>
    {ready && !acknowledged && <section className="cookie-banner" role="region" aria-label="Cookies and browser storage">
      <div className="cookie-banner-heading"><span className="cookie-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M20.4 13.7a8.6 8.6 0 1 1-10-10.1 4.5 4.5 0 0 0 5.2 5.2 4.5 4.5 0 0 0 4.8 4.9Z"/><path d="M8 10h.01M8 16h.01M14 15h.01" strokeWidth="3" strokeLinecap="round"/></svg></span><h2>Just the essentials.</h2></div>
      <p>Orbit uses essential cookies to keep you signed in and remember your Poker session. No analytics or advertising cookies.</p>
      <div className="cookie-banner-actions"><button type="button" className="cookie-button cookie-primary" onClick={acknowledge}>Got it</button><button type="button" className="cookie-button cookie-secondary" onClick={openDetails}>Cookie details</button></div>
    </section>}
    <dialog ref={dialog} className="cookie-dialog" aria-labelledby="cookie-dialog-title" aria-describedby="cookie-dialog-description" onCancel={event => { event.preventDefault(); setDetailsOpen(false); }} onClose={() => { setDetailsOpen(false); previousFocus.current?.isConnected && previousFocus.current.focus(); }}>
      <div className="cookie-dialog-heading"><span className="cookie-eyebrow">Your browser, your data</span><button type="button" className="cookie-close" aria-label="Close cookie details" onClick={() => setDetailsOpen(false)}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="m6 6 12 12M18 6 6 18"/></svg></button></div>
      <h2 id="cookie-dialog-title">Cookies, kept simple</h2>
      <p id="cookie-dialog-description">Only storage that supports the features you use. Orbit currently adds no analytics or advertising cookies.</p>
      <div className="cookie-purpose"><div><h3>Essential cookies</h3><span className="cookie-essential">Always active</span></div><p>Keep your account signed in, support secure sign-in, and identify your guest session when you join a Poker room.</p></div>
      <div className="cookie-purpose"><div><h3>Browser preferences</h3><span className="cookie-essential">Saved on your device</span></div><p>Remember a theme you explicitly choose and that you have seen this cookie notice. These preferences are not used for tracking.</p></div>
      <p className="cookie-dialog-note">You can clear cookies and browser storage in your browser settings. This may sign you out or reset your preferences.</p>
      <div className="cookie-dialog-actions"><Link className="cookie-detail-link" href="/cookies" onClick={() => setDetailsOpen(false)}>Read the cookie details <span aria-hidden="true">↗</span></Link><button type="button" className="cookie-button cookie-primary" onClick={acknowledge}>Got it</button></div>
    </dialog>
  </>;
}
