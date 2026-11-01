import Link from 'next/link';
import type {ReactNode} from 'react';
import {Footer, PublicHeader} from './brand';
import './legal-document.css';

type LegalSection = {id: string; title: string; children: ReactNode};
type Summary = {title: string; text: string};

export function LegalDocument({title, version, intro, summaries, sections}: {title: string; version: string; intro: string; summaries: Summary[]; sections: LegalSection[]}) {
  const updated = new Intl.DateTimeFormat('en', {dateStyle: 'long', timeZone: 'UTC'}).format(new Date(version + 'T00:00:00Z'));
  return <div className="entry-shell legal-shell"><PublicHeader/>
    <main className="legal-main">
      <header className="legal-intro"><span className="legal-eyebrow">ORBIT · POLICIES &amp; TERMS</span><h1>{title}</h1><p>{intro}</p><span className="legal-version">Version {version} · Updated <time dateTime={version}>{updated}</time></span></header>
      <section className="legal-summary" aria-label={`${title} at a glance`}>{summaries.map(summary => <article key={summary.title}><h2>{summary.title}</h2><p>{summary.text}</p></article>)}</section>
      <div className="legal-layout"><nav className="legal-contents" aria-label={`${title} sections`}><span>ON THIS PAGE</span>{sections.map(section => <a key={section.id} href={'#' + section.id}>{section.title}</a>)}</nav><div className="legal-sections">{sections.map(section => <section id={section.id} key={section.id}><h2>{section.title}</h2>{section.children}</section>)}</div></div>
      <aside className="legal-contact"><div><h2>Have a question?</h2><p>Contact the Orbit operator at <a href="mailto:gubasv93@gmail.com">gubasv93@gmail.com</a>.</p></div><Link className="entry-button" href="/">Back to Orbit</Link></aside>
    </main><Footer/>
  </div>;
}
