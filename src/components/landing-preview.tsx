'use client';
import { useRef, useState, type KeyboardEvent } from 'react';
const rows = [
  { name:'Account setup',meta:'3 stories · 6d est.',group:true,left:5,width:76,label:'Account setup',tone:'blue' },
  { name:'Secure sign-in',meta:'Backend · Sam',left:5,width:40,label:'Secure sign-in · Backend',tone:'blue' },
  { name:'Signup screens',meta:'Frontend · Mia',left:23,width:48,label:'Signup screens · Frontend',tone:'purple' },
  { name:'Quality checks',meta:'QA · Alex',left:68,width:24,label:'Quality checks · QA',tone:'mint' },
  { name:'Notification rules',meta:'2 stories · 4d est.',group:true,left:48,width:44,label:'Notification rules',tone:'purple' },
  { name:'Rule editor',meta:'Frontend · Mia',left:48,width:35,label:'Rule editor · Frontend',tone:'purple' },
];
export function LandingPreview() {
  const [view,setView]=useState<'roadmap'|'poker'>('roadmap');
  const roadmapTab=useRef<HTMLButtonElement>(null),pokerTab=useRef<HTMLButtonElement>(null);
  function changeTab(event:KeyboardEvent<HTMLButtonElement>) {
    if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;
    event.preventDefault();
    const next=event.key==='Home'?'roadmap':event.key==='End'?'poker':view==='roadmap'?'poker':'roadmap';
    setView(next);(next==='roadmap'?roadmapTab:pokerTab).current?.focus();
  }
  return <div className="product-demo" role="group" aria-label="Illustrative product preview">
    <div className="demo-window-top"><span className="demo-window-brand"><span aria-hidden="true">◎</span> orbit <i/> Product workspace</span><span className="demo-example-label">Illustrative preview</span></div>
    <div className="demo-workspace-head"><div><span className="demo-project-icon" aria-hidden="true"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="m5 16 5-5 4 3 5-7m-5 0h5v5"/></svg></span><strong>Product launch</strong><span className="demo-project-status">In the making</span></div><div className="demo-tabs" role="tablist" aria-label="Product preview"><button ref={roadmapTab} id="preview-roadmap-tab" type="button" role="tab" aria-selected={view==='roadmap'} aria-controls="preview-roadmap" tabIndex={view==='roadmap'?0:-1} onKeyDown={changeTab} onClick={()=>setView('roadmap')}>Roadmap</button><button ref={pokerTab} id="preview-poker-tab" type="button" role="tab" aria-selected={view==='poker'} aria-controls="preview-poker" tabIndex={view==='poker'?0:-1} onKeyDown={changeTab} onClick={()=>setView('poker')}>Planning Poker</button></div></div>
    <div id="preview-roadmap" role="tabpanel" aria-labelledby="preview-roadmap-tab" aria-label="Roadmap preview" hidden={view!=='roadmap'} tabIndex={0}>
      <div className="demo-roadmap-scroll"><div className="demo-roadmap"><div className="demo-grid-label">FEATURE / WORK ITEM</div><div className="demo-calendar">{['Week 1','Week 2','Week 3','Week 4','Week 5'].map(week=><span key={week}>{week}</span>)}</div>{rows.map(row=><div key={row.name} className={`demo-row${row.group?' is-group':''}`}><div className="demo-item-label"><span aria-hidden="true">{row.group?'⌄':'○'}</span><div><strong>{row.name}</strong><small>{row.meta}</small></div></div><div className="demo-track"><div className={`demo-task ${row.tone}${row.group?' is-epic':''}`} style={{left:row.left+'%',width:row.width+'%'}}><span className="demo-task-work"/><span className="demo-task-meetings"/><span className="demo-task-off"/><strong>{row.label}</strong></div></div></div>)}</div></div>
      <div className="demo-roadmap-foot"><div><span><i/>Estimate</span><span><i/>Meetings</span><span><i/>Days off</span></div><span>One story. The whole picture.</span></div>
    </div>
    <div id="preview-poker" role="tabpanel" aria-labelledby="preview-poker-tab" aria-label="Planning Poker preview" hidden={view!=='poker'} tabIndex={0}>
      <div className="demo-poker"><div className="demo-poker-story"><span className="demo-section-label">ON THE TABLE</span><h3>Build the rule editor</h3><p>Frontend <span>·</span> Mia <span>·</span> Current estimate: 2d</p></div><div className="demo-poker-table"><div className="demo-poker-center"><span className="demo-section-label">A SHARED UNDERSTANDING</span><strong>Different perspectives.<br/>One agreed estimate.</strong><span>Reveal the votes. Talk through the differences.</span></div><div className="demo-poker-players">{[{name:'Sam',vote:'3',initial:'S'},{name:'Mia',vote:'5',initial:'M'},{name:'Alex',vote:'5',initial:'A'},{name:'Jordan',vote:'3',initial:'J'}].map(player=><div key={player.name}><span className="demo-vote">{player.vote}</span><span className="demo-player-avatar">{player.initial}</span><strong>{player.name}</strong></div>)}</div></div><div className="demo-poker-foot"><span><i/>Everyone has a voice.</span><span>Agreed estimates can go straight to the roadmap.</span></div></div>
    </div>
  </div>;
}
