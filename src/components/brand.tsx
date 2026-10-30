import Link from 'next/link';
import { ThemeToggle } from './appearance';
import { CookieSettingsButton } from './cookie-consent';
import { FeedbackLink } from './feedback-link';
import './brand.css';
export function Brand() {
  return <Link href="/" className="entry-logo" aria-label="Orbit home"><span className="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg></span>orbit</Link>;
}
export function PublicHeader({ auth = false, landing = false }: { auth?: boolean; landing?: boolean }) {
  return <header className={`entry-top${landing ? ' landing-top' : ''}`}><Brand/>{landing && <nav className="landing-links" aria-label="Explore Orbit"><a href="#why-orbit">Why Orbit</a><Link href="/how-it-works">How it works</Link><a href="#faq">FAQ</a></nav>}<nav className="entry-nav" aria-label="Main navigation">{auth ? <Link className="entry-button" href="/">Back to website</Link> : <><Link className="entry-button" href="/login">Log in</Link><Link className="entry-button primary" href="/signup">Get started</Link></>}<ThemeToggle/></nav></header>;
}
export function Footer() { return <footer className="entry-footer"><span>Orbit · A little more clarity.</span><div className="public-footer-links"><FeedbackLink/><Link href="/cookies">Cookies & storage</Link><CookieSettingsButton/></div></footer>; }
