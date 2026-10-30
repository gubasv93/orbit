import Link from 'next/link';
import { Footer, PublicHeader } from '@/components/brand';
import '@/components/loading-state.css';

export const metadata = { title: 'Page not found — Orbit' };

export default function NotFound() {
  return <div className="entry-shell orbit-not-found-shell"><PublicHeader/><main className="orbit-not-found">
    <div className="orbit-not-found-copy">
      <span className="orbit-not-found-label"><span>404</span> A little outside the orbit</span>
      <h1>This page is off the roadmap.</h1>
      <p>The address may be incorrect, or the page may have moved. Let’s get you back to a place you know.</p>
      <div className="orbit-not-found-actions"><Link className="entry-button primary" href="/">Back to home <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></Link><Link className="entry-button" href="/app">Open roadmap</Link></div>
    </div>
    <div className="orbit-not-found-art" aria-hidden="true"><div className="orbit-not-found-orbit"/><div className="orbit-not-found-orbit"/><span className="orbit-not-found-number">404</span><i className="orbit-not-found-dot"/><i className="orbit-not-found-dot"/><span className="orbit-not-found-spark">✧</span></div>
  </main><Footer/></div>;
}
