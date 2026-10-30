import type {Metadata} from 'next';
import Link from 'next/link';
import {Footer, PublicHeader} from '@/components/brand';
import {CookieSettingsButton} from '@/components/cookie-consent';

export const metadata: Metadata = {
  title: 'Cookies & browser storage — Orbit',
  description: 'How Orbit uses essential cookies and browser storage to support sign-in, Poker sessions, and your preferences.',
};

export default function CookiesPage() {
  return <div className="entry-shell"><PublicHeader/><main className="cookie-information">
    <span className="cookie-eyebrow">Only the essentials</span>
    <h1>Cookies &amp; browser storage</h1>
    <p className="cookie-information-intro">A few things your browser remembers so Orbit works as expected. We currently add no analytics or advertising cookies.</p>
    <section aria-labelledby="cookie-account-heading"><h2 id="cookie-account-heading">Keep your session yours</h2><p>Essential authentication cookies keep you signed in and support secure sign-in, including returning to Orbit after signing in with Google. They are managed as part of your account session. Logging out ends your signed-in session.</p></section>
    <section aria-labelledby="cookie-poker-heading"><h2 id="cookie-poker-heading">Find your seat at the Poker table</h2><p>When you join a Poker room as a guest, an essential room-specific cookie lets Orbit recognize your participant on later requests. It can last up to 30 days. Your live participation ends when your room tabs close or you leave after inactivity; keeping the cookie does not keep you in a room. Simply visiting the landing page does not create a Poker guest session.</p></section>
    <section aria-labelledby="cookie-preferences-heading"><h2 id="cookie-preferences-heading">Remember the choices you make</h2><h3>Your appearance</h3><p>When you explicitly choose a light or dark theme, Orbit remembers that choice in local browser storage. It stays on that browser until you change it or clear the storage.</p><h3>This notice</h3><p>We store an acknowledgment in local browser storage after you choose “Got it,” so the notice does not keep interrupting you. Clearing browser storage, using another browser, or a new version of the notice may show it again.</p></section>
    <section aria-labelledby="cookie-control-heading"><h2 id="cookie-control-heading">You stay in control</h2><p>There are no optional analytics or advertising cookies to enable or disable here. You can review the details through “Cookie settings” in the footer at any time. Your browser settings let you remove cookies and local storage; doing so may sign you out, remove a guest session, or reset your preferences. If you choose to sign in with Google, Google also handles data under its own <a href="https://policies.google.com/privacy" target="_blank" rel="noopener noreferrer">privacy policy</a>.</p></section>
    <div className="cookie-information-actions"><Link className="entry-button" href="/">Back to Orbit</Link><CookieSettingsButton/></div>
  </main><Footer/></div>;
}
