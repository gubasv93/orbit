// Date-only recurrence rules shared by forecasts, meeting previews and details.
// End-after counts recurrence dates before weekends, holidays or absences filter capacity.
import {DAY,asDay,fromDay,dow,monday} from './dates.js';

const prefixCache=new Map();
const maxPrefixes=256;
function validDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2200-12-31')return false;
 const day=asDay(value);return Number.isFinite(day)&&fromDay(day)===value;
}
const mondayOffset=day=>(day+6)%7;
function ordinalDate(year,month,weekday,ordinal){
 if(ordinal===-1){const end=Date.UTC(year,month+1,0)/DAY;return end-((dow(end)-weekday+7)%7);}
 const first=Date.UTC(year,month,1)/DAY,candidate=first+(weekday-dow(first)+7)%7+(ordinal-1)*7;
 return new Date(candidate*DAY).getUTCMonth()===month?candidate:null;
}
function monthCandidate(start,cycle,rule){
 const anchor=new Date(start*DAY),monthIndex=anchor.getUTCFullYear()*12+anchor.getUTCMonth()+cycle*rule.interval;
 const year=Math.floor(monthIndex/12),month=monthIndex%12;
 if(rule.monthlyMode==='weekday')return ordinalDate(year,month,anchor.getUTCDay(),rule.monthlyOrdinal??Math.ceil(anchor.getUTCDate()/7));
 const candidate=Date.UTC(year,month,anchor.getUTCDate())/DAY;
 return new Date(candidate*DAY).getUTCMonth()===month?candidate:null;
}
function yearCandidate(start,cycle,rule){
 const anchor=new Date(start*DAY),year=anchor.getUTCFullYear()+cycle*rule.interval;
 const candidate=Date.UTC(year,anchor.getUTCMonth(),anchor.getUTCDate())/DAY,date=new Date(candidate*DAY);
 return date.getUTCMonth()===anchor.getUTCMonth()&&date.getUTCDate()===anchor.getUTCDate()?candidate:null;
}
function prefixCount(start,cycle,rule){
 const key=[start,rule.frequency,rule.interval,rule.monthlyMode||'day',rule.monthlyOrdinal||''].join(':');
 let counts=prefixCache.get(key);
 if(!counts){counts=[];prefixCache.set(key,counts);if(prefixCache.size>maxPrefixes)prefixCache.delete(prefixCache.keys().next().value);}
 for(let index=counts.length;index<=cycle;index++){
  const candidate=rule.frequency==='month'?monthCandidate(start,index,rule):yearCandidate(start,index,rule);
  counts.push((counts[index-1]||0)+(candidate!==null&&candidate>=start?1:0));
 }
 return counts[cycle];
}
function customOccurrenceIndex(meeting,date,day,start){
 const rule=meeting.customRecurrence;
 if(!rule||!['day','week','month','year'].includes(rule.frequency)||!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>99)return 0;
 if(rule.frequency==='day'){
  const difference=day-start;return difference%rule.interval===0?difference/rule.interval+1:0;
 }
 if(rule.frequency==='week'){
  if(!Array.isArray(rule.weekdays))return 0;
  const selected=[...new Set(rule.weekdays||[])].filter(value=>Number.isInteger(value)&&value>=0&&value<=6).map(mondayOffset).sort((a,b)=>a-b);
  const offset=mondayOffset(dow(day)),startOffset=mondayOffset(dow(start));
  if(!selected.length||!selected.includes(offset))return 0;
  const weeks=Math.floor((asDay(monday(date))-asDay(monday(meeting.startDate)))/7);
  if(weeks<0||weeks%rule.interval!==0)return 0;
  return weeks/rule.interval*selected.length+selected.filter(value=>value<=offset).length-selected.filter(value=>value<startOffset).length;
 }
 const first=new Date(start*DAY),target=new Date(day*DAY);
 const difference=rule.frequency==='month'?(target.getUTCFullYear()-first.getUTCFullYear())*12+target.getUTCMonth()-first.getUTCMonth():target.getUTCFullYear()-first.getUTCFullYear();
 if(difference<0||difference%rule.interval!==0)return 0;
 const cycle=difference/rule.interval,candidate=rule.frequency==='month'?monthCandidate(start,cycle,rule):yearCandidate(start,cycle,rule);
 if(candidate!==day)return 0;
 return rule.endType==='after'?prefixCount(start,cycle,rule):1;
}

export function meetingOccursOnDate(meeting,date){
 if(!meeting?.enabled||!validDate(meeting.startDate)||!validDate(date)||date<meeting.startDate)return false;
 const day=asDay(date),start=asDay(meeting.startDate),weekday=dow(day);
 if(meeting.recurrence==='custom'){
  const rule=meeting.customRecurrence;
  if(!rule||!['never','on','after'].includes(rule.endType))return false;
  if(rule.endType==='on'&&(!validDate(rule.endDate)||date>rule.endDate))return false;
  if(rule.endType==='after'&&(!Number.isInteger(rule.count)||rule.count<1||rule.count>1000))return false;
  const index=customOccurrenceIndex(meeting,date,day,start);
  return index>0&&(rule.endType!=='after'||index<=rule.count);
 }
 if(meeting.endDate&&date>meeting.endDate)return false;
 if(meeting.recurrence==='workdays')return weekday>=1&&weekday<=5;
 if(meeting.recurrence==='monthly'){
  if(weekday!==Number(meeting.weekday))return false;
  return Number(meeting.nth)===-1?fromDay(day+7).slice(0,7)!==date.slice(0,7):Math.ceil(Number(date.slice(8))/7)===Number(meeting.nth);
 }
 if(!['weekly','interval'].includes(meeting.recurrence)||weekday!==Number(meeting.weekday))return false;
 const weeks=Math.floor((asDay(monday(date))-asDay(monday(meeting.startDate)))/7);
 return weeks>=0&&weeks%Math.max(1,Number(meeting.recurrence==='interval'?meeting.interval:1)||1)===0;
}

// Yield recurrence candidates by period so sparse rules do not scan every day.
function* upcomingCandidates(meeting,from,start,last){
 const custom=meeting.recurrence==='custom',rule=meeting.customRecurrence;
 if(custom&&rule.frequency==='day'){
  for(let candidate=start+Math.ceil((from-start)/rule.interval)*rule.interval;candidate<=last;candidate+=rule.interval)yield candidate;
  return;
 }
 if((custom&&rule.frequency==='week')||(!custom&&['weekly','interval'].includes(meeting.recurrence))){
  const interval=custom?rule.interval:Math.max(1,Number(meeting.recurrence==='interval'?meeting.interval:1)||1);
  const days=custom?rule.weekdays:[Number(meeting.weekday)];
  if(!Number.isInteger(interval)||!Array.isArray(days))return;
  const offsets=[...new Set(days)].filter(value=>Number.isInteger(value)&&value>=0&&value<=6).map(mondayOffset).sort((a,b)=>a-b);
  if(!offsets.length)return;
  const anchor=asDay(monday(meeting.startDate)),cycle=Math.max(0,Math.ceil(Math.floor((from-anchor)/7)/interval));
  for(let week=anchor+cycle*interval*7;week<=last;week+=interval*7){
   for(const offset of offsets){const candidate=week+offset;if(candidate>=from&&candidate<=last)yield candidate;}
  }
  return;
 }
 if((custom&&rule.frequency==='month')||(!custom&&meeting.recurrence==='monthly')){
  const anchor=new Date(start*DAY),target=new Date(from*DAY),end=new Date(last*DAY);
  const firstMonth=anchor.getUTCFullYear()*12+anchor.getUTCMonth(),targetMonth=target.getUTCFullYear()*12+target.getUTCMonth(),lastMonth=end.getUTCFullYear()*12+end.getUTCMonth();
  const interval=custom?rule.interval:1;
  if(!custom&&(!Number.isInteger(Number(meeting.weekday))||Number(meeting.weekday)<0||Number(meeting.weekday)>6||![1,2,3,4,5,-1].includes(Number(meeting.nth))))return;
  for(let cycle=Math.max(0,Math.ceil((targetMonth-firstMonth)/interval));firstMonth+cycle*interval<=lastMonth;cycle++){
   const month=firstMonth+cycle*interval;
   const candidate=custom?monthCandidate(start,cycle,rule):ordinalDate(Math.floor(month/12),month%12,Number(meeting.weekday),Number(meeting.nth));
   if(candidate!==null&&candidate>=from&&candidate<=last)yield candidate;
  }
  return;
 }
 if(custom&&rule.frequency==='year'){
  const firstYear=new Date(start*DAY).getUTCFullYear(),targetYear=new Date(from*DAY).getUTCFullYear(),lastYear=new Date(last*DAY).getUTCFullYear();
  for(let cycle=Math.max(0,Math.ceil((targetYear-firstYear)/rule.interval));firstYear+cycle*rule.interval<=lastYear;cycle++){
   const candidate=yearCandidate(start,cycle,rule);if(candidate!==null&&candidate>=from&&candidate<=last)yield candidate;
  }
  return;
 }
 if(!custom&&meeting.recurrence==='workdays'){
  for(let candidate=from;candidate<=last;candidate++){const weekday=dow(candidate);if(weekday>=1&&weekday<=5)yield candidate;}
 }
}

/** Occurrences on or after fromDate; dates are bounded to the saved-project range. */
export function upcomingMeetingDates(meeting,fromDate,limit=3){
 if(!meeting?.enabled||!validDate(meeting.startDate)||!validDate(fromDate)||!Number.isFinite(limit)||limit<1)return [];
 const target=Math.min(1000,Math.floor(limit)),start=asDay(meeting.startDate),from=Math.max(start,asDay(fromDate));
 let last=asDay('2200-12-31');
 if(meeting.recurrence==='custom'){
  const rule=meeting.customRecurrence;
  if(!rule||!['day','week','month','year'].includes(rule.frequency)||!Number.isInteger(rule.interval)||rule.interval<1||rule.interval>99||!['never','on','after'].includes(rule.endType))return [];
  if(rule.endType==='after'&&(!Number.isInteger(rule.count)||rule.count<1||rule.count>1000))return [];
  if(rule.endType==='on'){if(!validDate(rule.endDate))return [];last=Math.min(last,asDay(rule.endDate));}
 }else if(meeting.endDate){if(!validDate(meeting.endDate))return [];last=Math.min(last,asDay(meeting.endDate));}
 if(from>last)return [];
 const dates=[];
 for(const candidate of upcomingCandidates(meeting,from,start,last)){
  const date=fromDay(candidate);
  // Every yielded date matches the period rule, so a rejected custom date has
  // reached its occurrence limit or represents an incomplete draft.
  if(!meetingOccursOnDate(meeting,date)){if(meeting.recurrence==='custom')break;continue;}
  dates.push(date);if(dates.length>=target)break;
 }
 return dates;
}
