import type { Metadata } from 'next';
import Link from 'next/link';
import { Footer, PublicHeader } from '@/components/brand';
import './guide.css';

export const metadata: Metadata = {
  title: 'How Orbit works — A quick guide',
  description: 'Read the roadmap, understand its colors and warnings, move work, select multiple items, and estimate together in Planning Poker.',
};

const sections = [
  ['timeline-colors', 'Timeline colors'], ['warnings', 'Warnings & markers'],
  ['move-resize', 'Move & resize'], ['selection', 'Select & filter'],
  ['dependencies', 'Dependencies'], ['planning-poker', 'Planning Poker'],
] as const;
const colors = [
  { name: 'Estimate', color: '#7c9fe5', description: 'Time allocated to the work itself.' },
  { name: 'Recurring meetings', color: '#e3c584', description: 'Meeting time reserved for the assignee.' },
  { name: 'Weekends', color: '#c7ced9', description: 'Weekend dates inside the calendar span.' },
  { name: 'Public holidays', color: '#86c4ac', description: 'Holidays enabled in your working calendar.' },
  { name: 'Days off', color: '#b6a0dc', description: 'Vacation and personal leave for the assignee.' },
  { name: 'Sick leave', color: '#dfa6a5', description: 'Recorded sick days for the assignee.' },
];

function SectionHeading({number, title, description}: {number: string; title: string; description?: string}) {
  return <header className="orbit-guide-section-heading"><span>{number}</span><div><h2>{title}</h2>{description && <p>{description}</p>}</div></header>;
}

export default function HowItWorks() {
  return <div className="entry-shell orbit-guide-shell"><PublicHeader auth/>
    <main className="orbit-guide-main">
      <header className="orbit-guide-intro"><span className="orbit-guide-eyebrow">THE QUICK GUIDE</span><h1>How Orbit works</h1><p>The shortcuts, colors and small details that make your next plan easier to read.</p><Link className="entry-button primary" href="/app">Open your roadmap <span aria-hidden="true">→</span></Link></header>
      <div className="orbit-guide-layout">
        <nav className="orbit-guide-contents" aria-label="On this page"><span>JUMP TO</span>{sections.map(([id, label]) => <a key={id} href={`#${id}`}>{label}</a>)}</nav>
        <div className="orbit-guide-content">
          <section id="timeline-colors" className="orbit-guide-section">
            <SectionHeading number="01" title="The bar is a calendar window." description="Estimate is the work. Calendar duration is how long that work spans on the roadmap."/>
            <div className="orbit-guide-card">
              <div className="orbit-guide-example" role="img" aria-label="Illustration: six days of work, one day of meetings and two days off span nine calendar days"><div><strong>Launch a feature</strong><span>6d est. <i>/</i> 9d calendar</span></div><div className="orbit-guide-example-bar"><span/><span/><span/></div><div className="orbit-guide-example-labels"><span>6d work</span><span>1d meetings</span><span>2d off</span></div></div>
              <p className="orbit-guide-note"><strong>Read the colors across the whole bar.</strong> They show the total mix of accounted time, not which activity happens on each individual date.</p>
              <dl className="orbit-guide-legend">{colors.map(item => <div key={item.name}><dt><i aria-hidden="true" style={{background:item.color}}/>{item.name}</dt><dd>{item.description}</dd></div>)}</dl>
            </div>
            <div className="orbit-guide-tips"><p><strong>Hover for the breakdown.</strong> See the estimate, calendar dates, exact meeting minutes, days away and conflicting tasks. Click the item to open its full details.</p><p><strong>Epic totals can run in parallel.</strong> An epic adds up work across people. Its calendar span runs from the first start to the last finish, so parallel tasks can finish sooner than that summed effort.</p><p><strong>Browse the calendar.</strong> Scroll horizontally into the past or future. <b>Today</b> brings you back to the current date; <b>View</b> changes the time scale.</p></div>
          </section>

          <section id="warnings" className="orbit-guide-section">
            <SectionHeading number="02" title="Know what needs attention." description="A highlight points to something to review. Open the item for the reason and affected work."/>
            <div className="orbit-guide-signals">
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-conflict" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="m12 3 10 18H2L12 3Z"/><path d="M12 9v5m0 3h.01"/></svg></span><div><h3>Warning triangle</h3><p>The same assignee has overlapping work. Details list the conflicting tasks and dates.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-shortfall" aria-hidden="true"/><div><h3>Dashed red outline</h3><p>The selected date window does not fit the estimated work. Review the dates, estimate or availability.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-paused" aria-hidden="true">Ⅱ</span><div><h3>Pause badge on an epic</h3><p>Some child work is paused. Other tasks keep going; pausing one task does not pause the whole epic.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-arrow" aria-hidden="true"><svg viewBox="0 0 50 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 6h21v12h21" strokeDasharray="4 3"/><path d="m40 13 5 5-5 5"/></svg></span><div><h3>Amber dashed dependency</h3><p>Connected dates conflict with the dependency order. Manual scheduling keeps your chosen dates.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-selected" aria-hidden="true"/><div><h3>Highlighted row and outline</h3><p>The item is selected. A selected epic includes its children, even when they are collapsed or filtered out.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-calendar" aria-hidden="true"/><div><h3>Calendar shading</h3><p>Marks weekends, holidays or recorded time off. Hover a public holiday date to see its name.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-today" aria-hidden="true"><i/></span><div><h3>Today line</h3><p>The vertical blue line marks the current date. Use Today to bring it back into view.</p></div></article>
              <article className="orbit-guide-signal"><span className="orbit-guide-signal-sample orbit-guide-milestone" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M5 21V4m0 0c5-4 9 4 14 0v10c-5 4-9-4-14 0"/></svg></span><div><h3>Milestone flag</h3><p>A target date. Its risk highlight means linked work is forecast to finish after that target.</p></div></article>
            </div>
            <p className="orbit-guide-inline-tip"><strong>Needs estimate / Blocked / Paused:</strong> these labels explain why an item has no complete forecast. You can add roles and people before entering an estimate.</p>
          </section>

          <section id="move-resize" className="orbit-guide-section">
            <SectionHeading number="03" title="Move the plan, not a spreadsheet."/>
            <div className="orbit-guide-action-grid">
              <article className="orbit-guide-card"><span className="orbit-guide-action-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12h18M8 7l-5 5 5 5m8-10 5 5-5 5"/></svg></span><h3>Drag a bar to move it</h3><p>A task moves to a new start date. Moving an epic shifts its child tasks with it.</p></article>
              <article className="orbit-guide-card"><span className="orbit-guide-action-symbol orbit-guide-resize-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 12h18M8 7l-5 5 5 5m8-10 5 5-5 5"/></svg></span><h3>Drag an edge to resize</h3><p>Resizing a sub-item recalculates its estimate from the working time inside those dates, accounting for meetings and days off.</p></article>
              <article className="orbit-guide-card"><span className="orbit-guide-action-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="currentColor">{[6,12,18].flatMap(y => [9,15].map(x => <circle key={`${x}-${y}`} cx={x} cy={y} r="1.4"/>))}</svg></span><h3>Drag the row grip</h3><p>Change the order of rows or move a work item under a different epic. Drag the grip in the list, rather than the timeline bar.</p></article>
              <article className="orbit-guide-card"><span className="orbit-guide-action-symbol" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="4" y="5" width="16" height="15" rx="2"/><path d="M8 3v4m8-4v4M4 10h16m-12 4h3m3 0h2m-8 3h3"/></svg></span><h3>Edit dates in the details</h3><p>Set start and end dates directly. Editing these dates keeps the estimate; resizing the bar recalculates it.</p></article>
            </div>
            <p className="orbit-guide-inline-tip"><strong>Smallest planning step: 0.5 day.</strong> Meetings keep their exact minutes; the item’s combined meeting reservation is rounded once for the timeline. Press <kbd>Esc</kbd> to cancel a drag.</p>
          </section>

          <section id="selection" className="orbit-guide-section">
            <SectionHeading number="04" title="Find the work. Select what you need."/>
            <div className="orbit-guide-selection-card orbit-guide-card"><div className="orbit-guide-shortcut"><span><kbd>⌘ Command</kbd><small>Mac</small></span><i>or</i><span><kbd>Ctrl</kbd><small>Windows / Linux</small></span><b>+</b><span><kbd>Click</kbd><small>A row or bar</small></span></div><h3>Select several items at once</h3><ul><li>Hold the key and click each item. Click a selected item again to remove it from the selection.</li><li>Use <strong>Delete selected</strong> to review exactly what will be removed before confirming.</li><li>Selecting an epic includes all its child items. Check the deletion review, including work hidden by filters.</li><li>Use <strong>Clear</strong> or <kbd>Esc</kbd> to clear the selection.</li></ul></div>
            <div className="orbit-guide-card orbit-guide-filter-card"><div><h3>Combine people, roles and platforms</h3><p>Each filter accepts multiple values. Values in one filter are alternatives; different filters work together to narrow the roadmap.</p></div><div className="orbit-guide-filter-example" aria-label="Example: filter work for Mia or Sam, with the Frontend role"><span>Mia <b>or</b> Sam</span><i>+</i><span>Frontend role</span></div><p className="orbit-guide-note">Use <strong>Clear filters</strong> to restore the full view. Filtering does not change or delete your work.</p></div>
          </section>

          <section id="dependencies" className="orbit-guide-section">
            <SectionHeading number="05" title="Connect work. Choose what moves."/>
            <ol className="orbit-guide-steps"><li><span>1</span><div><h3>Connect the work</h3><p>Drag from a dependency handle to the work that follows it. The arrow records the relationship.</p></div></li><li><span>2</span><div><h3>Keep control of the dates</h3><p>With auto-shift off, adding a dependency preserves your dates. A warning shows when their order conflicts.</p></div></li><li><span>3</span><div><h3>Turn on automatic movement if you want it</h3><p>Enable auto-shift in <strong>General settings</strong>. Advanced options let you choose the gap and how connected dates follow changes.</p></div></li></ol>
            <div className="orbit-guide-tips"><p><strong>Change the labels, not the plan.</strong> General settings also lets you choose which information appears on bars and switch between light and dark themes.</p><p><strong>Keep availability up to date.</strong> Recurring meetings, holidays and recorded absences shape the calendar forecast. The item details show which meetings consume time.</p></div>
          </section>

          <section id="planning-poker" className="orbit-guide-section">
            <SectionHeading number="06" title="Estimate together. Publish on purpose." description="Start a room from your project, then share its link with the team. Guests can join without an Orbit account."/>
            <div className="orbit-guide-poker-flow"><article><span>01</span><h3>Vote privately</h3><p>Pick a story and a card. Votes stay hidden until the reveal.</p></article><article><span>02</span><h3>Reveal and discuss</h3><p>The facilitator reveals the cards, or uses auto-reveal when the room is configured for it.</p></article><article><span>03</span><h3>Agree and publish</h3><p>The facilitator confirms which estimates to send to the roadmap. Voting alone does not rewrite the plan.</p></article></div>
            <div className="orbit-guide-tips"><p><strong>Your name follows your account.</strong> Registered users use their profile name in Poker. Open <Link href="/profile">Profile</Link> to update your name or password.</p><p><strong>Rooms are for the current session.</strong> Closing the room tab leaves the session. After 15 minutes without activity, you leave automatically. A short reconnect window lets you reload without ending the room; when nobody remains, it closes.</p></div>
          </section>
          <aside className="orbit-guide-saving orbit-guide-card"><h2>Your changes save automatically.</h2><p>If saving fails, keep this tab open and use <strong>Retry</strong>. A conflict means another tab or device saved newer changes; export your unsaved work before reloading.</p></aside>
          <div className="orbit-guide-finish"><div><h2>Ready to put it into practice?</h2><p>Your next plan is a few small steps away.</p></div><Link className="entry-button primary" href="/app">Open your roadmap <span aria-hidden="true">→</span></Link></div>
        </div>
      </div>
    </main><Footer/>
  </div>;
}
