'use client';

import {useId,useMemo,useState,type KeyboardEvent} from 'react';
import type {AnalyticsTrends} from '@/lib/application-analytics-trends';
import './application-manager-trends.css';

type Day=AnalyticsTrends['days'][number];
type MetricKey=Exclude<keyof Day,'date'>;
type Metric={key:MetricKey;label:string;description:string;unit?:'seconds'|'people';samples?:MetricKey;total?:boolean};
type ChartGroup={id:string;title:string;metrics:Metric[]};
const groups:ChartGroup[]=[
 {id:'accounts',title:'Accounts',metrics:[
  {key:'accountsCreated',label:'Registrations',description:'Recorded account creation dates within the available history.',total:true},
  {key:'accountsDeleted',label:'Account deletions',description:'Account deletions recorded on each day.',total:true},
 ]},
 {id:'projects',title:'Projects',metrics:[
  {key:'projectsCreated',label:'First observed projects',description:'Projects counted when first observed, including the existing baseline.',total:true},
  {key:'projectsDeleted',label:'Project deletions',description:'Project deletions recorded on each day.',total:true},
  {key:'projectAverageLifetimeSeconds',label:'Average deleted-project lifetime',description:'Daily average for projects deleted that day with an exact creation date.',unit:'seconds',samples:'projectLifetimeSamples'},
 ]},
 {id:'resources',title:'First observed resources',metrics:[
  {key:'featuresCreated',label:'Work items',description:'First observations, including the existing baseline; these are not historical inventory totals.',total:true},
  {key:'storiesCreated',label:'Sub-items',description:'Logical sub-items on first observation; adding another role does not create another sub-item.',total:true},
  {key:'workItemsCreated',label:'Role rows',description:'Individual role work rows on first observation.',total:true},
  {key:'peopleCreated',label:'Team members',description:'First observed project-owned team records. Copied teams count in each project.',total:true},
  {key:'rolesCreated',label:'Roles',description:'First observed project-owned roles.',total:true},
  {key:'platformsCreated',label:'Platforms',description:'First observed distinct normalized platform labels within this scope.',total:true},
  {key:'meetingsCreated',label:'Recurring meetings',description:'Recurring meeting records on first observation.',total:true},
  {key:'holidaysCreated',label:'Holidays',description:'Holiday records on first observation.',total:true},
  {key:'timeOffCreated',label:'Time off entries',description:'Time off records on first observation.',total:true},
  {key:'milestonesCreated',label:'Milestones',description:'Milestone records on first observation.',total:true},
 ]},
 {id:'poker',title:'Planning Poker',metrics:[
  {key:'pokerGamesCreated',label:'Rooms created',description:'Rooms grouped by their creation day. Voting rounds are not separate games.',total:true},
  {key:'pokerGamesPlayed',label:'Rooms played',description:'Played rooms grouped by room creation day.',total:true},
  {key:'pokerParticipantsAverage',label:'Average participants',description:'Daily room-creation cohorts; distinct joined seats include facilitators and spectators.',unit:'people',samples:'pokerGamesPlayed'},
  {key:'pokerParticipantsMedian',label:'Median participants',description:'Median joined seats per played room in each daily room-creation cohort.',unit:'people',samples:'pokerGamesPlayed'},
  {key:'pokerParticipantsMin',label:'Minimum participants',description:'Fewest joined seats in a played room within each daily room-creation cohort.',unit:'people',samples:'pokerGamesPlayed'},
  {key:'pokerParticipantsMax',label:'Maximum participants',description:'Most joined seats in a played room within each daily room-creation cohort.',unit:'people',samples:'pokerGamesPlayed'},
  {key:'pokerAverageDurationSeconds',label:'Average game duration',description:'Timed played rooms grouped by creation day. Closed intervals are excluded.',unit:'seconds',samples:'pokerDurationSamples'},
 ]},
 {id:'landing',title:'Landing page views',metrics:[
  {key:'landingPageviews',label:'Page views',description:'Aggregate document loads, including repeated visits. These are not unique visitors.',total:true},
 ]},
];
const formatNumber=(value:number,digits=1)=>new Intl.NumberFormat('en',{maximumFractionDigits:digits}).format(value);
const shortDate=(value:string)=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
const fullDate=(value:string)=>new Intl.DateTimeFormat('en',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'}).format(new Date(value+'T12:00:00Z'));
function formatDuration(value:number){
 if(value<60)return `${formatNumber(value)}s`;
 if(value<3600)return `${formatNumber(value/60)}m`;
 if(value<86400)return `${formatNumber(value/3600)}h`;
 return `${formatNumber(value/86400)}d`;
}
function formatValue(value:number|null,metric:Metric){return value===null?'Not available':metric.unit==='seconds'?formatDuration(value):formatNumber(value,metric.unit==='people'?2:0);}
function axis(maximum:number,metric:Metric){
 const divisor=metric.unit==='seconds'?(maximum>=86400?86400:maximum>=3600?3600:maximum>=60?60:1):1;
 const suffix=metric.unit==='seconds'?(divisor===86400?'d':divisor===3600?'h':divisor===60?'m':'s'):'';
 const upper=Math.max(maximum/divisor,1),raw=upper/4,power=10**Math.floor(Math.log10(raw));
 const step=Math.max(metric.unit?0:1,Math.ceil(raw/power)*power),top=Math.ceil(upper/step)*step;
 const ticks=Array.from({length:Math.round(top/step)+1},(_,index)=>Math.max(0,top-index*step));
 return {maximum:top*divisor,ticks:ticks.map(value=>({value:value*divisor,label:(value>=10000?new Intl.NumberFormat('en',{notation:'compact',maximumFractionDigits:1}).format(value):formatNumber(value,metric.unit?1:0))+suffix}))};
}
const xAt=(index:number,length:number)=>length===1?300:6+index/(length-1)*588;

function TrendChart({group,days}:{group:ChartGroup;days:Day[]}){
 const id=useId().replace(/:/g,''),[metricKey,setMetricKey]=useState<MetricKey>(group.metrics[0].key),[active,setActive]=useState<number|null>(null),[showTable,setShowTable]=useState(false);
 const metric=group.metrics.find(item=>item.key===metricKey)||group.metrics[0];
 const values=days.map(day=>day[metric.key] as number|null),known=values.flatMap((value,index)=>value===null?[]:[{value,index}]);
 const scale=axis(Math.max(0,...known.map(point=>point.value)),metric),allZero=known.length>0&&known.every(point=>point.value===0),last=known.at(-1);
 const sampled=metric.samples?days.some(day=>day[metric.samples!]!==null):false;
 const selected=active===null?null:Math.max(0,Math.min(days.length-1,active)),point=selected===null?null:days[selected];
 const segments=useMemo(()=>{
  const result:{index:number;value:number}[][]=[];let segment:{index:number;value:number}[]=[];
  days.forEach((day,index)=>{const value=day[metric.key] as number|null;if(value===null){if(segment.length)result.push(segment);segment=[];}else segment.push({index,value});});
  if(segment.length)result.push(segment);return result;
 },[days,metric.key]);
 const yAt=(value:number)=>142-value/scale.maximum*132;
 const total=known.reduce((sum,item)=>sum+item.value,0),summary=metric.total?(known.length?formatValue(total,metric):'—'):(last?formatValue(last.value,metric):'—');
 const onKeyDown=(event:KeyboardEvent<HTMLDivElement>)=>{
  if(event.key==='Escape'){setActive(null);return;}
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key)||!days.length)return;
  event.preventDefault();const from=active??last?.index??days.length-1;
  setActive(event.key==='Home'?0:event.key==='End'?days.length-1:Math.max(0,Math.min(days.length-1,from+(event.key==='ArrowRight'?1:-1))));
 };
 return <section className="am-trend-card" data-trend-card={group.id} data-trend-state={!known.length?'unavailable':allZero?'empty':'ready'} aria-labelledby={id+'-title'}>
  <header className="am-trend-card-head"><h3 id={id+'-title'}>{group.title}</h3><label className="am-sr-only" htmlFor={id+'-metric'}>{group.title} chart metric</label><select id={id+'-metric'} value={metric.key} onChange={event=>{setMetricKey(event.target.value as MetricKey);setActive(null);}}>{group.metrics.map(option=><option key={option.key} value={option.key}>{option.label}</option>)}</select></header>
  <div className="am-trend-summary"><strong>{summary}</strong><span>{metric.total?'Period total':last?`Latest daily value · ${shortDate(days[last.index].date)}`:'No daily samples'}</span></div>
  <p className="am-trend-description">{metric.description}</p>
  <div className="am-trend-chart">
   <div className="am-trend-y-axis" aria-hidden="true">{scale.ticks.map(tick=><span key={tick.value} style={{top:(yAt(tick.value)/152*100)+'%'}}>{tick.label}</span>)}</div>
   <div className="am-trend-plot" role="group" aria-label={group.title+' chart'} aria-describedby={id+'-instructions'} tabIndex={0}
    onFocus={()=>setActive(last?.index??days.length-1)} onBlur={()=>setActive(null)} onKeyDown={onKeyDown}
    onPointerMove={event=>{const rect=event.currentTarget.getBoundingClientRect(),fraction=((event.clientX-rect.left)/rect.width*600-6)/588;setActive(Math.max(0,Math.min(days.length-1,Math.round(fraction*(days.length-1)))));}}
    onPointerLeave={event=>{if(document.activeElement!==event.currentTarget)setActive(null);}}>
    <svg viewBox="0 0 600 152" preserveAspectRatio="none" aria-hidden="true">
     <defs><linearGradient id={id+'-fill'} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor="currentColor" stopOpacity=".16"/><stop offset="100%" stopColor="currentColor" stopOpacity=".01"/></linearGradient></defs>
     {scale.ticks.map(tick=><line key={tick.value} className="am-trend-gridline" x1="0" x2="600" y1={yAt(tick.value)} y2={yAt(tick.value)}/>)}
     {segments.map((segment,index)=>{const line=segment.map((item,i)=>(i?'L':'M')+xAt(item.index,days.length)+','+yAt(item.value)).join(' ');return <g key={index}><path d={line+` L${xAt(segment.at(-1)!.index,days.length)},142 L${xAt(segment[0].index,days.length)},142 Z`} fill={`url(#${id}-fill)`}/><path className="am-trend-line" d={line}/>{(days.length<=31||segment.length===1)&&segment.map(item=><circle className="am-trend-dot" key={item.index} cx={xAt(item.index,days.length)} cy={yAt(item.value)} r="2.5"/>)}</g>;})}
     {selected!==null&&<line className="am-trend-crosshair" x1={xAt(selected,days.length)} x2={xAt(selected,days.length)} y1="5" y2="147"/>}
     {selected!==null&&values[selected]!==null&&<circle className="am-trend-active-dot" cx={xAt(selected,days.length)} cy={yAt(values[selected]!)} r="4"/>}
    </svg>
    {!known.length&&<p className="am-trend-empty">{sampled?'No recorded samples in this period.':'No history available for this period.'}</p>}
    {allZero&&active===null&&<p className="am-trend-empty">{metric.total?'No activity recorded in this period.':'Daily values are zero in this period.'}</p>}
    {point&&<div className="am-trend-tooltip" role="status" aria-live="polite" data-trend-tooltip data-date={point.date}><time dateTime={point.date}>{fullDate(point.date)} · UTC</time><strong>{formatValue(point[metric.key] as number|null,metric)}</strong>{metric.samples&&<span>{point[metric.samples]===null?'Samples unavailable':formatNumber(point[metric.samples] as number,0)+' samples'}</span>}</div>}
   </div>
   <div className="am-trend-x-axis" aria-hidden="true">{[0,Math.floor((days.length-1)/2),days.length-1].filter((value,index,array)=>array.indexOf(value)===index).map(index=><span key={index}>{shortDate(days[index].date)}</span>)}</div>
  </div>
  <p className="am-sr-only" id={id+'-instructions'}>Use Left and Right arrow keys to explore daily values. Home selects the first day; End selects the latest day. Escape closes the details. Missing history is not zero.</p>
  <footer className="am-trend-card-foot"><span><i aria-hidden="true"/>{metric.label}</span><button type="button" onClick={()=>setShowTable(value=>!value)} aria-expanded={showTable} aria-controls={id+'-table'}>{showTable?'Hide':'Show'} {group.title} data table</button></footer>
  {showTable&&<div className="am-table-wrap am-trend-table-wrap" id={id+'-table'} tabIndex={0} role="region" aria-label={group.title+' data table'}><table className="am-table am-trend-table"><caption className="am-sr-only">{group.title} daily data</caption><thead><tr><th scope="col">Date (UTC)</th><th scope="col">{metric.label}</th>{metric.samples&&<th scope="col">Samples</th>}</tr></thead><tbody>{days.map(day=><tr key={day.date}><th scope="row"><time dateTime={day.date}>{fullDate(day.date)}</time></th><td>{formatValue(day[metric.key] as number|null,metric)}</td>{metric.samples&&<td>{day[metric.samples]===null?'Not available':formatNumber(day[metric.samples] as number,0)}</td>}</tr>)}</tbody></table></div>}
 </section>;
}

export function ApplicationManagerTrends({data,loading=false,error='',scope='global'}:{data:AnalyticsTrends|null;loading?:boolean;error?:string;scope?:'global'|'user'}){
 return <section className="am-trends" role="region" aria-label="Analytics trends" data-trends-scope={scope} aria-busy={loading}>
  <header className="am-trends-heading"><div><span className="am-eyebrow">DAILY ACTIVITY</span><h2>Trends over time</h2><p>{scope==='user'?'This account’s recorded activity':'Recorded activity across all accounts'}{data?` · ${data.periodDays} days`:''}</p></div>{data&&<span className="am-trends-range">{fullDate(data.startDate)} – {fullDate(data.endDate)}<small>UTC · today is partial</small></span>}</header>
  {loading?<div className="am-trends-message" role="status">Loading trends…</div>:error?<p className="am-alert am-error" role="alert">{error}</p>:data&&data.days.length?<><div className="am-trends-grid">{groups.filter(group=>scope==='global'||group.id!=='landing').map(group=><TrendChart key={group.id} group={group} days={data.days}/>)}</div><p className="am-trends-caption">Gaps mark unavailable history. Resource counts use first observation dates, including the existing baseline.</p><details className="am-trends-notes"><summary>About these charts</summary><p>{data.coverage.history}</p><p>{data.coverage.resources}</p><p>{data.coverage.poker}</p>{scope==='global'&&<p>{data.coverage.landing}</p>}<p>Daily values use UTC. Today is still in progress. Missing history appears as a gap, not as zero. Current inventory totals remain in their existing cards and tables.</p></details></>:<p className="am-trends-message">No trend history is available.</p>}
 </section>;
}
