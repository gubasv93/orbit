import Link from 'next/link';
export function Brand() {
  return <Link href="/" className="entry-logo" aria-label="Orbit home"><span className="brand-mark"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/></svg></span>orbit</Link>;
}
export function PublicHeader({ auth = false }: { auth?: boolean }) {
  return <header className="entry-top"><Brand/><nav className="entry-nav" aria-label="Main navigation">{auth ? <Link className="entry-button" href="/">Back to website</Link> : <><Link className="entry-button" href="/login">Log in</Link><Link className="entry-button primary" href="/signup">Get started</Link></>}</nav></header>;
}
export function Footer() { return <footer className="entry-footer"><span>Orbit · Product roadmap planning</span><span>One roadmap. Real capacity.</span></footer>; }
