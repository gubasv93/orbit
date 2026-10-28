// Scheduling logic extracted from the supplied Orbit prototype. No UI or persistence dependencies.
import {DAY,asDay,fromDay,addDays,dow,today,monday} from './dates.js';
import {halfDay} from './precision.js';
export function createScheduler(data, {legacyAllocation=false}={}) {
const getPerson=id=>data.people.find(p=>p.id===id);
const getFeature=id=>data.features.find(f=>f.id===id);
const getTask=id=>data.tasks.find(t=>t.id===id);
function isHoliday(n){return data.settings.observeHolidays&&data.holidays.some(h=>asDay(h.date)===n)}
function nonwork(n,person){if(dow(n)===0||dow(n)===6||isHoliday(n))return true;return !!person&&data.leave.some(l=>l.person===person&&n>=asDay(l.from)&&n<=asDay(l.to))}
function nextWork(n,person){let j=0;while(nonwork(n,person)&&j++<550)n++;return n}
function capacityParts(pid,date){const p=getPerson(pid),base=p?.capacity||data.settings.defaultCapacity,iter=data.iterations.find(i=>asDay(i.start)<=asDay(date)&&asDay(i.end)>=asDay(date));return iter?.overrides?.[pid]||base}
// Estimates cover all work. Only meetings and non-working time reduce availability.
// Legacy allocation is used solely to preserve visible starts during migration.
const meetingDayCache=new Map();
function meetingOccurs(m,date){
 if(!m.enabled||!m.startDate||date<m.startDate||(m.endDate&&date>m.endDate))return false;
 const n=asDay(date),day=dow(n);
 if(m.recurrence==='workdays')return day>=1&&day<=5;
 if(m.recurrence==='monthly'){
  if(day!==Number(m.weekday))return false;
  const dayOfMonth=Number(date.slice(8)),ordinal=Math.ceil(dayOfMonth/7);
  if(Number(m.nth)===-1)return fromDay(n+7).slice(0,7)!==date.slice(0,7);
  return ordinal===Number(m.nth);
 }
 if(day!==Number(m.weekday))return false;
 const weeks=Math.floor((asDay(monday(date))-asDay(monday(m.startDate)))/7);
 return weeks>=0&&weeks%Math.max(1,Number(m.recurrence==='interval'?m.interval:1)||1)===0;
}
function meetingMinutes(pid,date){
 if(!pid)return 0;
 const key=pid+':'+date;
 if(meetingDayCache.has(key))return meetingDayCache.get(key);
 const intervals=[];
 for(const m of(data.meetings||[])){
  if(!m.allTeam&&!(m.attendees||[]).includes(pid))continue;
  if(!meetingOccurs(m,date))continue;
  const [hour,min]=String(m.startTime||'09:00').split(':').map(Number),start=hour*60+min;
  if(!Number.isFinite(start))continue;
  intervals.push([start,start+Math.max(0,Number(m.duration)||0)]);
 }
 intervals.sort((a,b)=>a[0]-b[0]);
 let total=0,earliest=null,latest=null;
 for(const [start,end] of intervals){
  if(earliest===null){earliest=start;latest=end}
  else if(start<=latest)latest=Math.max(latest,end);
  else{total+=latest-earliest;earliest=start;latest=end}
 }
 if(earliest!==null)total+=latest-earliest;
 const result=Math.min(Math.max(0,total),Math.max(1,Number(data.settings.workHours)||8)*60);
 meetingDayCache.set(key,result);return result;
}
function meetingHoursInIteration(pid,iteration){
 let minutes=0;
 for(let n=asDay(iteration.start);n<=asDay(iteration.end);n++){
  if(!nonwork(n,pid))minutes+=meetingMinutes(pid,fromDay(n));
 }
 return minutes/60;
}
function featureCapacity(pid,date){
 const hours=Math.max(1,Number(data.settings.workHours)||8);
 const timeAfterMeetings=Math.max(0,(hours*60-meetingMinutes(pid,date))/(hours*60));
 return legacyAllocation?timeAfterMeetings*Math.max(0,Number(capacityParts(pid,date).feature||0)/100):1-meetingDays(pid,date);
}
// Keep each meeting's exact duration. Half-day rounding belongs to the total
// displayed span, rather than charging half a day for every short daily event.
function meetingDays(pid,date){return Math.min(1,meetingMinutes(pid,date)/(Math.max(1,Number(data.settings.workHours)||8)*60));}
function dependencyReadyDay(task,end){
 let day=end+1,gap=Math.max(0,Math.min(365,Number(data.settings.dependencyGapDays)||0));
 if(data.settings.dependencyGapUnit==='working'){for(let i=0;i<gap;i++)day=nextWork(day,task.assignee)+1;}
 else day+=gap;
 return day;
}
function calculate(){meetingDayCache.clear();const schedule={},working=new Map(),errors=[];
 function calc(t,depth=0,seen=new Set()){
  if(schedule[t.id])return schedule[t.id];
  if(depth>100||seen.has(t.id)){let s={start:null,end:null,blocked:true,reason:'Circular dependency',alloc:{}};schedule[t.id]=s;errors.push(t.id);return s}
  seen=new Set(seen);seen.add(t.id);
  if(t.status==='hold'){return (schedule[t.id]={start:asDay(t.start),end:null,hold:true,blocked:false,alloc:{}})}
  let initial=asDay(t.start||getFeature(t.featureId)?.start||today());let depBlocked=false;
  let dependencyStart=null;
  for(const depId of(data.settings.autoShiftDependencies===true&&t.status!=='done'?t.dependsOn||[]:[])){
   const dep=getTask(depId);if(!dep)continue;
   const info=calc(dep,depth+1,seen);
   if(info.end===null||info.shortfall>0){depBlocked=true;continue}
   dependencyStart=Math.max(dependencyStart??-Infinity,dependencyReadyDay(t,info.end));
  }
  if(dependencyStart!==null)initial=data.settings.dependencyShiftPolicy==='follow'?dependencyStart:Math.max(initial,dependencyStart);
  if(depBlocked)return (schedule[t.id]={start:initial,end:null,blocked:true,reason:'Waiting for dependency',alloc:{}});
  const manual=t.manualEnd&&t.status!=='done';
  const windowEnd=manual?initial+asDay(t.manualEnd)-asDay(t.start):null;
  let current=manual?initial:nextWork(initial,t.assignee),first=current,last=current,allocation={};
  if(t.status==='done'){
   last=asDay(t.completedDate||t.start);first=asDay(t.start);if(last<first)first=last;
   return (schedule[t.id]={start:first,end:last,blocked:false,done:true,alloc:{}})
  }
  let remaining=Math.max(.1,Number(t.remaining??t.effort??1)),guard=0;if(!legacyAllocation)remaining=halfDay(remaining);
  while(remaining>0.0001&&guard++<(manual?3650:600)&&(!manual||current<=windowEnd)){
   if(!nonwork(current,t.assignee)){
    if(!manual&&Object.keys(allocation).length===0)first=current;
    const span=manual&&current===windowEnd?(t.manualEndFraction??1):1;
    let available=Math.max(0,span-(t.assignee?meetingDays(t.assignee,fromDay(current)):0));
    if(legacyAllocation&&t.assignee)available*=Math.max(0,Number(capacityParts(t.assignee,fromDay(current)).feature||0)/100);
    const used=Math.min(available,remaining);
    allocation[fromDay(current)]=used;remaining-=used;last=current;
   }
   if(remaining>0.0001)current++;
  }
  if(guard>=600&&!manual){errors.push(t.id);return schedule[t.id]={start:first,end:null,blocked:true,reason:'Could not schedule',alloc:{}}}
  for(let [date,effort] of Object.entries(allocation)){
   const k=`${t.assignee||'_'}:${date}`;working.set(k,(working.get(k)||0)+effort)
  }
  const endFraction=manual?(t.manualEndFraction??1):legacyAllocation?1:Math.min(1,Math.max(.5,halfDay((allocation[fromDay(last)]||0)+meetingDays(t.assignee,fromDay(last)))));
  return (schedule[t.id]={start:first,end:manual?windowEnd:last,endFraction,blocked:false,alloc:allocation,...(manual?{manual:true,shortfall:Math.max(0,Math.round(remaining*1000000)/1000000)}:{})});
 }
 data.tasks.forEach(t=>calc(t));
 const conflicts={};for(let t of data.tasks){let p=schedule[t.id],bad=[];for(let dt of Object.keys(p?.alloc||{})){let val=working.get(`${t.assignee||'_'}:${dt}`)||0;if(t.assignee&&val>featureCapacity(t.assignee,dt)+.001)bad.push(dt)}if(bad.length)conflicts[t.id]=bad}
 let featureInfo={};data.features.forEach(f=>{
   let arr=data.tasks.filter(t=>t.featureId===f.id);
   let entries=arr.map(t=>schedule[t.id]).filter(Boolean);
   let blocked=entries.some(s=>s.blocked||s.hold),starts=entries.map(s=>s.start).filter(x=>x!==null),ends=entries.map(s=>s.end).filter(x=>x!==null);
   let start=starts.length?Math.min(...starts):asDay(f.start),end=blocked?null:ends.length?Math.max(...ends):null;
   let allDone=arr.length>0&&arr.every(t=>t.status==='done');
   const manual=Boolean(f.manualEnd),displayStart=manual?asDay(f.start):start,displayEnd=manual?asDay(f.manualEnd):end;
   const windowConflict=manual&&entries.some(entry=>entry.start<displayStart||entry.end===null||entry.end+(entry.endFraction??1)>displayEnd+(f.manualEndFraction??1));
   const shortfall=entries.some(entry=>entry.shortfall>0);
   const endFraction=manual?(f.manualEndFraction??1):displayEnd===null?1:Math.max(...entries.filter(entry=>entry.end===displayEnd).map(entry=>entry.endFraction??1),.5);
   featureInfo[f.id]={start:displayStart,end:displayEnd,endFraction,blocked,allDone,atRisk:blocked||shortfall||windowConflict||(displayEnd!==null&&displayEnd>asDay(f.baseline)),delta:displayEnd!==null?displayEnd-asDay(f.baseline):null,...(manual?{manual:true,forecastStart:start,forecastEnd:end,windowConflict}: {})}
 });
 const dependencyConflicts={};
 if(data.settings.showDependencyWarnings!==false)for(const task of data.tasks){
  if(task.status==='done')continue;
  const target=schedule[task.id],issues=[];
  for(const id of task.dependsOn||[]){const source=schedule[id];if(source&&(source.end===null||source.shortfall>0||(target.start!==null&&target.start<dependencyReadyDay(task,source.end))))issues.push(id);}
  if(issues.length)dependencyConflicts[task.id]=issues;
 }
 return {schedule,conflicts,working,featureInfo,errors,dependencyConflicts};
}

return {calculate,isHoliday,nonwork,nextWork,capacityParts,meetingOccurs,meetingMinutes,meetingDays,meetingHoursInIteration,featureCapacity};
}
