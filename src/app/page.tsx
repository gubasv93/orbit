import Link from 'next/link';
import { Footer, PublicHeader } from '@/components/brand';
import { LandingPreview } from '@/components/landing-preview';
import './landing.css';

const challenges = [
  { number:'01', title:'An estimate isn’t a delivery date.', problem:'Six days of work rarely fit into six days on the calendar.', solution:'See estimates alongside meetings, weekends, holidays and absences — with a clear breakdown of where the time goes.' },
  { number:'02', title:'A story needs more than one role.', problem:'Backend, frontend and QA each have their own part to play.', solution:'Break a story into role-based work, assign each part, and give it an estimate. Keep the whole epic in view.' },
  { number:'03', title:'Plans change. Context gets lost.', problem:'A delayed task can affect work that depends on it.', solution:'Connect dependencies, spot overlapping assignments, and decide which dates move. Your plan stays in your hands.' },
];
const questions = [
  { question:'Can I use Orbit for free?', answer:'Yes. Orbit is currently a free public beta. Create an account and start planning without a credit card.' },
  { question:'Does an estimate include meetings and days off?', answer:'The estimate is the amount of work. The calendar forecast also accounts for recurring meetings, weekends, holidays and recorded absences. The timeline shows both so you can explain a delivery date.' },
  { question:'Will dependencies move my tasks automatically?', answer:'You choose. Place connected work yourself, or enable automatic dependency scheduling in General settings. Adding an arrow does not have to rearrange your plan.' },
  { question:'Do people need an account to join Planning Poker?', answer:'Guests can join a shared room with a display name, without creating an Orbit account. The facilitator manages the session and chooses which agreed estimates to publish to the roadmap.' },
  { question:'Is my workspace public?', answer:'Your workspace is private to your account. Sharing a Planning Poker room gives its participants access to that room and the story information needed for the session.' },
];
function Arrow() { return <svg aria-hidden="true" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>; }
function FeatureIcon({kind}:{kind:'time'|'poker'|'roles'|'control'}) {
  return <span className="landing-feature-icon" aria-hidden="true"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{kind==='time'?<><circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/></>:kind==='poker'?<><rect x="4" y="5" width="11" height="15" rx="2"/><path d="m10 5 1-2 9 3-3 12-2-.5M9.5 10v5m-2.5-2.5h5"/></>:kind==='roles'?<><rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><path d="M14 17h6m-3-3v6"/></>:<><path d="M5 7h14M5 17h14"/><circle cx="9" cy="7" r="2" fill="var(--ui-surface-soft)"/><circle cx="15" cy="17" r="2" fill="var(--ui-surface-soft)"/></>}</svg></span>;
}

export default function Home() {
  return <div className="entry-shell landing-shell">
    <PublicHeader landing/>
    <main id="main-content" className="landing-main">
      <section className="landing-hero" aria-labelledby="hero-title">
        <span className="landing-eyebrow"><span/> A little less guesswork. A lot more clarity.</span>
        <h1 id="hero-title">Roadmaps that<br/><em>adapt to reality.</em></h1>
        <p className="landing-lead">Great plans make room for real life. Bring your features, people and estimates together — and see what delivery actually looks like.</p>
        <div className="landing-actions"><Link className="entry-button primary" href="/signup">Start planning <Arrow/></Link><a className="landing-secondary" href="#product-preview">Explore the product <span aria-hidden="true">↓</span></a></div>
        <p className="landing-assurance">Free public beta <span>·</span> No credit card <span>·</span> Your own workspace</p>
        <div id="product-preview" className="landing-product"><LandingPreview/></div>
        <div className="landing-product-caption"><span>From “how much work?” to “when can we deliver?”</span><span>Roadmaps + Planning Poker, in one place.</span></div>
      </section>
      <section id="why-orbit" className="landing-section" aria-labelledby="challenge-title">
        <div className="landing-section-heading"><span className="landing-kicker">BUILT AROUND YOUR REAL WEEK</span><h2 id="challenge-title">The plan is clear.<br/><span>Until the week happens.</span></h2><p>Orbit makes the things between the work visible, so the roadmap is easier to trust — and easier to explain.</p></div>
        <div className="landing-challenges">{challenges.map(item=><article className="landing-challenge" key={item.number}><span className="challenge-number">{item.number}</span><h3>{item.title}</h3><p>{item.problem}</p><div className="challenge-solution"><span aria-hidden="true"><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 4v8a4 4 0 0 0 4 4h9m-5-5 5 5-5 5"/></svg></span><p>{item.solution}</p></div></article>)}</div>
      </section>
      <section className="landing-section landing-features" aria-labelledby="features-title">
        <div className="landing-section-heading"><span className="landing-kicker">A CONNECTED WAY TO PLAN</span><h2 id="features-title">The details matter.<br/><span>Keep the bigger picture.</span></h2></div>
        <div className="landing-bento">
          <article className="landing-feature feature-time">
            <div className="feature-copy"><FeatureIcon kind="time"/><h3>See where the days go.</h3><p>An estimate tells you the effort. Orbit shows the calendar time, with meetings and days off visible on the same bar.</p></div>
            <div className="time-illustration" aria-label="Illustrative example: 6 days of estimated work, 1 day of meetings and 2 days off span 9 calendar days"><div className="time-illustration-label"><span>Launch a new feature</span><strong>6d est. <span>/</span> 9d calendar</strong></div><div className="time-illustration-bar"><span/><span/><span/></div><div className="time-illustration-legend"><span><i/>Estimate <b>6d</b></span><span><i/>Meetings <b>1d</b></span><span><i/>Days off <b>2d</b></span></div></div>
            <p className="feature-footnote">A clear breakdown. A more realistic conversation.</p>
          </article>
          <article className="landing-feature feature-poker">
            <div className="feature-copy"><FeatureIcon kind="poker"/><h3>Find the estimate together.</h3><p>Bring everyone into a Planning Poker room. Vote, reveal, agree — then publish the estimate back to your roadmap.</p></div>
            <div className="poker-illustration" aria-label="Illustrative Planning Poker vote cards: 3, 5, and 5">{[{vote:3,name:'Sam'},{vote:5,name:'Mia'},{vote:5,name:'Alex'}].map((player,i)=><div key={player.name}><span className={i===1?'is-highlighted':''}>{player.vote}</span><small>{player.name}</small></div>)}</div>
            <Link className="landing-text-link" href="/app">Plan your next session <Arrow/></Link>
          </article>
          <article className="landing-feature feature-roles">
            <div className="feature-copy"><FeatureIcon kind="roles"/><h3>One story. Every role.</h3><p>Keep each discipline’s owner and estimate clear. Start with a name, add roles now, and fill in the details when you’re ready.</p></div>
            <div className="roles-illustration" aria-label="Illustrative estimates by role">{[{role:'Backend',person:'Sam',estimate:'3d',initial:'S'},{role:'Frontend',person:'Mia',estimate:'2d',initial:'M'},{role:'QA',person:'Alex',estimate:'0.5d',initial:'A'}].map(role=><div key={role.role}><span className="role-dot"/><strong>{role.role}</strong><span className="role-person"><i>{role.initial}</i>{role.person}</span><span className="role-estimate">{role.estimate}</span></div>)}</div>
          </article>
          <article className="landing-feature feature-control">
            <div className="feature-copy"><FeatureIcon kind="control"/><h3>You decide what moves.</h3><p>Draw dependencies, drag work into place, or resize a bar to update its estimate. Choose when connected tasks should move automatically.</p></div>
            <div className="dependency-illustration" aria-label="Illustration of a dependency from API work to interface work"><div><span className="dependency-dot"/>API work <small>Backend</small></div><svg aria-hidden="true" viewBox="0 0 260 54" fill="none"><path d="M57 0v21a7 7 0 0 0 7 7h125a7 7 0 0 1 7 7v16" stroke="currentColor" strokeWidth="1.5"/><path d="m191 45 5 6 5-6" stroke="currentColor" strokeWidth="1.5"/></svg><div><span className="dependency-dot"/>Interface work <small>Frontend</small></div><span className="landing-dependency-mode">Manual placement? Automatic scheduling? Your call.</span></div>
          </article>
        </div>
      </section>
      <section id="how-it-works" className="landing-section landing-workflow" aria-labelledby="workflow-title">
        <div className="landing-section-heading"><span className="landing-kicker">FROM A BLANK PAGE TO A CLEAR PLAN</span><h2 id="workflow-title">Start simple.<br/><span>Make it your own.</span></h2></div>
        <ol className="landing-steps"><li><span>01</span><h3>Set the scene.</h3><p>Create a project, add your people and roles, and set up the meetings that shape your week.</p></li><li><span>02</span><h3>Break down the work.</h3><p>Add epics and stories. Estimate by role yourself, or invite the team into Planning Poker.</p></li><li><span>03</span><h3>Give it a place in time.</h3><p>Arrange the roadmap, connect dependencies, and review the forecast as your plans change.</p></li></ol>
      </section>
      <section id="faq" className="landing-section landing-faq" aria-labelledby="faq-title"><div className="landing-section-heading"><span className="landing-kicker">A FEW THINGS YOU MIGHT WONDER</span><h2 id="faq-title">Glad you asked.</h2><p>The essentials before you get started.</p></div><div className="landing-questions">{questions.map(item=><details key={item.question}><summary>{item.question}<span aria-hidden="true">+</span></summary><p>{item.answer}</p></details>)}</div></section>
      <section className="landing-final" aria-labelledby="final-title"><span className="landing-final-orbit" aria-hidden="true"><i/><i/><i/></span><span className="landing-kicker">LESS GUESSWORK, STARTING TODAY</span><h2 id="final-title">Make room for<br/>a more realistic plan.</h2><p>Your next project deserves a little more clarity.</p><Link className="entry-button primary" href="/signup">Create your workspace <Arrow/></Link><small>Free during public beta. No credit card needed.</small></section>
    </main><Footer/>
  </div>;
}
