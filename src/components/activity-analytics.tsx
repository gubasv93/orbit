'use client';

import {useEffect, useState} from 'react';
import {usePathname} from 'next/navigation';

export const analyticsPreferenceKey = 'orbit-analytics-preference';
export const analyticsPreferenceEvent = 'orbit:analytics-preference';
const acceptedPreference = 'accepted-v1';
let currentPreference: boolean | undefined;

export function analyticsEnabled() {
  if (currentPreference !== undefined) return currentPreference;
  try { return localStorage.getItem(analyticsPreferenceKey) === acceptedPreference; } catch { return false; }
}

/** The default remains off, including for visitors who acknowledged an older notice. */
export function rememberAnalyticsPreference(enabled: boolean) {
  currentPreference = enabled;
  try { localStorage.setItem(analyticsPreferenceKey, enabled ? acceptedPreference : 'declined-v1'); } catch { /* The current page still honors the choice. */ }
  window.dispatchEvent(new CustomEvent(analyticsPreferenceEvent, {detail: enabled}));
}

type Surface = 'landing' | 'planner';
type ActivityEvent = {action: 'event'; surface: Surface; sessionId: string; sequence: number; seconds: number; end: boolean};

/** Active time is visible, focused time within a minute of the latest interaction. */
export function measuredActiveMilliseconds(elapsed: number, visible: boolean, focused: boolean, sinceInteraction: number) {
  return visible && focused && sinceInteraction >= 0 && sinceInteraction <= 60_000 ? Math.max(0, Math.min(1500, elapsed)) : 0;
}

export function ActivityAnalytics() {
  const pathname = usePathname();
  const [enabled, setEnabled] = useState(false);
  const [restored, setRestored] = useState(0);
  const [generation, setGeneration] = useState(0);
  useEffect(() => {
    setEnabled(analyticsEnabled());
    const choice = (event: Event) => { currentPreference = (event as CustomEvent<unknown>).detail === true; setEnabled(currentPreference); };
    const storage = (event: StorageEvent) => {
      if (event.key !== analyticsPreferenceKey && event.key !== null) return;
      currentPreference = event.newValue === acceptedPreference; setEnabled(currentPreference);
    };
    const restore = (event: PageTransitionEvent) => { if (event.persisted) setRestored(value => value + 1); };
    window.addEventListener(analyticsPreferenceEvent, choice);
    window.addEventListener('storage', storage);
    window.addEventListener('pageshow', restore);
    return () => { window.removeEventListener(analyticsPreferenceEvent, choice); window.removeEventListener('storage', storage); window.removeEventListener('pageshow', restore); };
  }, []);

  useEffect(() => {
    const surface: Surface | null = pathname === '/' ? 'landing' : pathname === '/app' ? 'planner' : null;
    if (!enabled || !surface) return;
    const sessionId = crypto.randomUUID(), startedDay = new Date().toISOString().slice(0, 10);
    let sequence = 0, lastSample = performance.now(), lastInteraction = Date.now(), lastEngaged = Date.now(), accumulated = 0, ended = false, sending = false, restartRequested = false;
    let retry: ActivityEvent | null = null;
    const engaged = () => document.visibilityState === 'visible' && document.hasFocus() && Date.now() - lastInteraction >= 0 && Date.now() - lastInteraction <= 60_000;
    const sample = () => {
      if (ended || restartRequested) return;
      const now = performance.now(), wallTime = Date.now();
      if (engaged() && (wallTime - lastEngaged >= 30 * 60_000 || new Date(wallTime).toISOString().slice(0, 10) !== startedDay)) {
        restartRequested = true;setGeneration(value => value + 1);lastSample = now;return;
      }
      const measured = measuredActiveMilliseconds(now - lastSample, document.visibilityState === 'visible', document.hasFocus(), wallTime - lastInteraction);
      accumulated += measured;if (measured > 0) lastEngaged = wallTime;
      lastSample = now;
    };
    const take = (end: boolean): ActivityEvent => {
      const seconds = Math.min(60, Math.floor(accumulated / 1000)); accumulated -= seconds * 1000;
      return {action: 'event', surface, sessionId, sequence: sequence++, seconds, end};
    };
    const send = async (flush = false) => {
      if (ended || sending || !analyticsEnabled() || !flush && !engaged()) return;
      sample();if (restartRequested || flush && accumulated < 1000 && !retry) return;
      // Once a visit exists, only measured active seconds advance its last seen
      // time. Background/idle tabs never keep sessions alive with zeroes.
      if (!retry && sequence > 0 && accumulated < 1000) return;
      sending = true;
      const event = retry || take(false); retry = event;
      try {
        const response = await fetch('/api/activity', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(event), credentials: 'same-origin'});
        if (response.ok) retry = null;
      } catch { /* Optional measurements never interrupt planning or navigation. */ }
      finally { sending = false; }
    };
    const finish = () => {
      if (ended) return;sample();ended = true;
      if (!analyticsEnabled() || sequence === 0) return;
      // A distinct final sequence retires the session. An in-flight older event
      // may be omitted on navigation; it can never add time after this event.
      const event = take(true), body = JSON.stringify(event);
      try { if (navigator.sendBeacon('/api/activity', new Blob([body], {type: 'application/json'}))) return; } catch { /* Use keepalive below. */ }
      void fetch('/api/activity', {method: 'POST', headers: {'Content-Type': 'application/json'}, body, credentials: 'same-origin', keepalive: true}).catch(() => {});
    };
    const interaction = (event: Event) => { if (event.isTrusted) {const wasIdle=!engaged();sample();lastInteraction = Date.now();if(wasIdle||sequence===0)void send();} };
    const visibility = () => {
      sample();
      if (document.visibilityState === 'hidden') void send(true);
      else if (document.hasFocus()) {lastInteraction = Date.now();void send();}
    };
    const focus = () => {sample();lastInteraction = Date.now();void send();};
    const blur = () => {sample();void send(true);};
    const interactionEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'];
    interactionEvents.forEach(name => window.addEventListener(name, interaction, {passive: true, capture: true}));
    document.addEventListener('visibilitychange', visibility);window.addEventListener('focus', focus);window.addEventListener('blur', blur);
    window.addEventListener('pagehide', finish);
    let previouslyEngaged=engaged();
    const tick=()=>{sample();const active=engaged();if(!active&&previouslyEngaged)void send(true);previouslyEngaged=active;};
    const sampleTimer = setInterval(tick, 1000), heartbeatTimer = setInterval(() => void send(), 15_000);
    void send();
    return () => {
      finish(); clearInterval(sampleTimer); clearInterval(heartbeatTimer);
      interactionEvents.forEach(name => window.removeEventListener(name, interaction, true));
      document.removeEventListener('visibilitychange', visibility);window.removeEventListener('focus', focus);window.removeEventListener('blur', blur); window.removeEventListener('pagehide', finish);
    };
  }, [enabled, pathname, restored, generation]);
  return null;
}
