import type {Metadata} from 'next';
import Link from 'next/link';
import {Footer, PublicHeader} from '@/components/brand';
import {CookieSettingsButton} from '@/components/cookie-consent';

export const metadata: Metadata = {
  title: 'Cookies & browser storage — Orbit',
  description: 'How Orbit uses essential cookies, browser preferences, and optional first-party usage analytics.',
};

export default function CookiesPage() {
  return <div className="entry-shell"><PublicHeader/><main className="cookie-information">
    <span className="cookie-eyebrow">Your storage choices</span>
    <h1>Cookies &amp; browser storage</h1>
    <p className="cookie-information-intro">Essential storage makes Orbit work. Optional usage analytics is off until you choose to enable it. We do not use advertising cookies.</p>
    <section aria-labelledby="cookie-account-heading"><h2 id="cookie-account-heading">Keep your session yours</h2><p>Essential authentication cookies keep you signed in and support secure sign-in, including returning to Orbit after signing in with Google. They are managed as part of your account session. Logging out ends your signed-in session.</p></section>
    <section aria-labelledby="cookie-poker-heading"><h2 id="cookie-poker-heading">Find your seat at the Poker table</h2><p>When you join a Poker room as a guest, an essential room-specific cookie lets Orbit recognize your participant on later requests. It can last up to 30 days. Your live participation ends when your room tabs close or you leave after inactivity; keeping the cookie does not keep you in a room. Simply visiting the landing page does not create a Poker guest session.</p></section>
    <section aria-labelledby="cookie-preferences-heading"><h2 id="cookie-preferences-heading">Remember the choices you make</h2><h3>Your appearance</h3><p>When you explicitly choose a light or dark theme, Orbit remembers that choice in local browser storage. It stays on that browser until you change it or clear the storage.</p><h3>This notice</h3><p>We store an acknowledgment in local browser storage after you choose “Got it,” so the notice does not keep interrupting you. Clearing browser storage, using another browser, or a new version of the notice may show it again.</p></section>
    <section aria-labelledby="cookie-analytics-heading"><h2 id="cookie-analytics-heading">Optional usage analytics</h2><p>If you enable usage analytics, Orbit sets first-party, HttpOnly cookies recording your choice and a random browser identifier, lasting up to one year. We store a hash of that identifier, visits, and active seconds on the landing page. In the signed-in planner, usage sessions are linked to your account so we can understand engagement and return visits. Active time means the page is visible, focused and recently used; background tabs and prolonged inactivity are excluded.</p><h3>What we leave out</h3><p>These measurements do not contain the text of your plans, passwords, mouse paths, browser fingerprints or full page URLs. No advertising provider receives this data. Analytics can undercount people who decline, block requests or clear storage; one browser is not necessarily one person. Operational records such as accounts, projects and Poker games are counted independently to manage the service.</p></section><section aria-labelledby="cookie-control-heading"><h2 id="cookie-control-heading">You stay in control</h2><p>Use “Cookie settings” in the footer to enable or disable optional analytics at any time. “Got it” on the initial notice keeps analytics off. Turning analytics off stops new measurements immediately in this browser and removes the analytics cookies; it does not delete existing aggregate or account activity records. Your browser settings let you remove cookies and local storage; doing so may sign you out, remove a guest session, or reset your preferences. If you choose to sign in with Google, Google also handles data under its own <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</p></section>
    <div className="cookie-information-actions"><Link className="entry-button" href="/">Back to Orbit</Link><CookieSettingsButton/></div>
  </main><Footer/></div>;
}
