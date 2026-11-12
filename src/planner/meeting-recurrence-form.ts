import './meeting-recurrence-form.css';

export type MeetingCustomRecurrence={
  frequency:'day'|'week'|'month'|'year';interval:number;weekdays?:number[];
  monthlyMode?:'day'|'weekday';monthlyOrdinal?:number;
  endType:'never'|'on'|'after';endDate?:string;count?:number;
};
type MeetingLike={recurrence?:string;customRecurrence?:MeetingCustomRecurrence;startDate?:string;endDate?:string;weekday?:number;interval?:number;nth?:number};
const weekdays=[[1,'Monday','Mo'],[2,'Tuesday','Tu'],[3,'Wednesday','We'],[4,'Thursday','Th'],[5,'Friday','Fr'],[6,'Saturday','Sa'],[0,'Sunday','Su']] as const;
const ordinals=[[-1,'Last'],[1,'1st'],[2,'2nd'],[3,'3rd'],[4,'4th'],[5,'5th']] as const;
const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const selected=(left:unknown,right:unknown)=>left===right?' selected':'';
function startParts(value:string){
  const date=new Date(value+'T12:00:00Z');
  return {weekday:Number.isFinite(date.getTime())?date.getUTCDay():1,ordinal:Number.isFinite(date.getTime())?Math.ceil(date.getUTCDate()/7):1,day:Number.isFinite(date.getTime())?date.getUTCDate():1};
}
const field=<T extends HTMLInputElement|HTMLSelectElement=HTMLInputElement>(form:HTMLFormElement,name:string)=>form.elements.namedItem(name) as T|null;

/** A legacy monthly weekday is independent of its lower-bound start date. */
export function legacyMonthlyCustomAnchor(startDate:string,weekday:number,ordinal:number):string|undefined{
  if(!validDate(startDate)||!Number.isInteger(weekday)||weekday<0||weekday>6||![-1,1,2,3,4,5].includes(ordinal))return undefined;
  const anchor=new Date(startDate+'T12:00:00Z'),startMonth=anchor.getUTCFullYear()*12+anchor.getUTCMonth(),lastMonth=2200*12+11;
  for(let monthIndex=startMonth;monthIndex<=lastMonth;monthIndex++){
    const year=Math.floor(monthIndex/12),month=monthIndex%12;
    const base=new Date(Date.UTC(year,ordinal===-1?month+1:month,ordinal===-1?0:1,12));
    const day=ordinal===-1?base.getUTCDate()-(base.getUTCDay()-weekday+7)%7:1+(weekday-base.getUTCDay()+7)%7+(ordinal-1)*7;
    const candidate=new Date(Date.UTC(year,month,day,12));
    if(candidate.getUTCMonth()!==month)continue;
    const date=candidate.toISOString().slice(0,10);
    if(date>=startDate)return date;
  }
}

/** The controls remain mounted so changing a repeat unit does not discard a draft. */
export function customRecurrenceFields(meeting?:MeetingLike,startDate=meeting?.startDate||''):string{
  const custom=meeting?.customRecurrence,parts=startParts(startDate);
  const frequency=custom?.frequency||(meeting?.recurrence==='monthly'?'month':'week');
  const interval=custom?.interval||(meeting?.recurrence==='interval'?meeting.interval||1:1);
  const days=custom?.weekdays||(meeting?.recurrence==='workdays'||!meeting?[1,2,3,4,5]:[meeting.weekday??parts.weekday]);
  const monthlyMode=custom?.monthlyMode||(meeting?.recurrence==='monthly'?'weekday':'day');
  const ordinal=custom?.monthlyOrdinal??(meeting?.recurrence==='monthly'?meeting.nth:undefined)??parts.ordinal;
  const endType=custom?.endType||(meeting?.endDate?'on':'never');
  const active=meeting?.recurrence==='custom';
  return `<fieldset class="meeting-custom-recurrence" data-custom-recurrence data-custom-initialized="${active?'true':'false'}"${active?'':' hidden disabled'}>
    <legend>Custom recurrence</legend>
    <p class="meeting-custom-hint meeting-custom-conversion-note" data-custom-conversion-note hidden></p>
    <div class="meeting-custom-repeat-row"><div class="field"><label for="meetingCustomInterval">Repeat every</label><input id="meetingCustomInterval" name="customInterval" type="number" inputmode="numeric" min="1" max="99" step="1" required value="${escape(interval)}"></div><div class="field"><label for="meetingCustomFrequency">Repeat unit</label><select id="meetingCustomFrequency" name="customFrequency">${(['day','week','month','year'] as const).map(unit=>`<option value="${unit}"${selected(unit,frequency)}>${unit==='day'?'Days':unit==='week'?'Weeks':unit==='month'?'Months':'Years'}</option>`).join('')}</select></div></div>
    <fieldset class="meeting-custom-weekdays" data-custom-group="week"${frequency==='week'?'':' hidden disabled'}><legend>Repeat on</legend><div>${weekdays.map(([day,name,short])=>`<label class="meeting-custom-day"><input type="checkbox" name="customWeekday" value="${day}" aria-label="Repeat on ${name}"${days.includes(day)?' checked':''}><span aria-hidden="true">${short}</span></label>`).join('')}</div></fieldset>
    <div class="meeting-custom-month" data-custom-group="month"${frequency==='month'?'':' hidden'}><div class="field"><label for="meetingCustomMonthlyMode">Monthly pattern</label><select id="meetingCustomMonthlyMode" name="customMonthlyMode"><option value="day"${selected('day',monthlyMode)}>Day of month</option><option value="weekday"${selected('weekday',monthlyMode)}>Weekday of month</option></select></div><div class="field" data-custom-monthly-weekday${monthlyMode==='weekday'?'':' hidden'}><label for="meetingCustomMonthlyOrdinal">Weekday occurrence</label><select id="meetingCustomMonthlyOrdinal" name="customMonthlyOrdinal" data-derived-ordinal="${parts.ordinal}" data-explicit-ordinal="${custom?.monthlyOrdinal!==undefined?'true':'false'}">${ordinals.map(([value,label])=>`<option value="${value}"${selected(value,ordinal)}>${label}</option>`).join('')}</select></div><p class="meeting-custom-hint" data-custom-month-hint></p></div>
    <p class="meeting-custom-hint" data-custom-year-hint${frequency==='year'?'':' hidden'}>Uses the month and day in Active from. Dates that do not exist in a year are skipped.</p>
    <div class="meeting-custom-end-row"><div class="field"><label for="meetingCustomEndType">Ends</label><select id="meetingCustomEndType" name="customEndType"><option value="never"${selected('never',endType)}>Never</option><option value="on"${selected('on',endType)}>On date</option><option value="after"${selected('after',endType)}>After occurrences</option></select></div><div class="field" data-custom-end="on"${endType==='on'?'':' hidden'}><label for="meetingCustomEndDate">Repeat until</label><input id="meetingCustomEndDate" name="customEndDate" type="date" min="2000-01-01" max="2200-12-31" value="${escape(custom?.endDate||meeting?.endDate||startDate)}"></div><div class="field" data-custom-end="after"${endType==='after'?'':' hidden'}><label for="meetingCustomCount">Occurrences</label><input id="meetingCustomCount" name="customCount" type="number" inputmode="numeric" min="1" max="1000" step="1" value="${escape(custom?.count||10)}"></div></div>
    <p class="meeting-custom-hint">Occurrence limits follow the repeat pattern, including weekends and holidays. Forecasts reserve meeting time only on working days.</p>
  </fieldset>`;
}

export function syncMeetingCustomRecurrence(form:HTMLFormElement):void{
  const container=form.querySelector<HTMLFieldSetElement>('[data-custom-recurrence]');if(!container)return;
  const mode=field<HTMLSelectElement>(form,'recurrence')?.value||'workdays',active=mode==='custom';
  const frequency=field<HTMLSelectElement>(form,'customFrequency')!,interval=field(form,'customInterval')!,monthlyMode=field<HTMLSelectElement>(form,'customMonthlyMode')!,ordinal=field<HTMLSelectElement>(form,'customMonthlyOrdinal')!;
  if(active&&container.dataset.customInitialized!=='true'){
    const previous=container.dataset.previousRecurrence||'workdays';
    if(previous==='monthly'){
      frequency.value='month';interval.value='1';monthlyMode.value='weekday';ordinal.value=field<HTMLSelectElement>(form,'nth')?.value||'1';ordinal.dataset.explicitOrdinal='true';
      const start=field(form,'startDate')!,original=start.value,weekday=Number(field<HTMLSelectElement>(form,'weekday')?.value??1);
      const converted=legacyMonthlyCustomAnchor(original,weekday,Number(ordinal.value));
      if(converted&&converted!==original){
        start.value=converted;container.dataset.customConversionFrom=original;container.dataset.customConversionAnchor=converted;
        const occurrence=ordinals.find(([value])=>value===Number(ordinal.value))?.[1].toLowerCase()||'1st',name=weekdays.find(([day])=>day===weekday)?.[1]||'Monday';
        container.dataset.customConversionPattern=`${occurrence} ${name}`;
      }else if(!converted)container.dataset.customConversionBlockedAnchor=original;
    }
    else if(previous==='daily'){frequency.value='day';interval.value='1';}
    else{
      frequency.value='week';interval.value=previous==='weekly'||previous==='interval'?field(form,'interval')?.value||'1':'1';
      const selectedDay=Number(field<HTMLSelectElement>(form,'weekday')?.value??1);
      form.querySelectorAll<HTMLInputElement>('[name="customWeekday"]').forEach(input=>input.checked=previous==='workdays'?Number(input.value)>=1&&Number(input.value)<=5:Number(input.value)===selectedDay);
    }
    const legacyEnd=field(form,'endDate')?.value;
    if(legacyEnd){field<HTMLSelectElement>(form,'customEndType')!.value='on';field(form,'customEndDate')!.value=legacyEnd;}
    container.dataset.customInitialized='true';
  }
  container.dataset.previousRecurrence=mode;container.hidden=!active;container.disabled=!active;
  container.querySelectorAll<HTMLElement>('[data-custom-group]').forEach(group=>{
    const visible=active&&group.dataset.customGroup===frequency.value;group.hidden=!visible;
    if(group instanceof HTMLFieldSetElement)group.disabled=!visible;
    group.querySelectorAll<HTMLInputElement|HTMLSelectElement>('input,select').forEach(input=>input.disabled=!visible);
  });
  const monthWeek=container.querySelector<HTMLElement>('[data-custom-monthly-weekday]')!;
  const showOrdinal=active&&frequency.value==='month'&&monthlyMode.value==='weekday';monthWeek.hidden=!showOrdinal;ordinal.disabled=!showOrdinal;
  const anchor=field(form,'startDate')?.value||'',parts=startParts(anchor);
  if(container.dataset.customConversionBlockedAnchor!==anchor)delete container.dataset.customConversionBlockedAnchor;
  const conversionNote=container.querySelector<HTMLElement>('[data-custom-conversion-note]')!;
  const conversionBlocked=container.dataset.customConversionBlockedAnchor===anchor;
  const anchorMoved=container.dataset.customConversionAnchor===anchor;
  conversionNote.hidden=!active||frequency.value!=='month'||monthlyMode.value!=='weekday'||(!conversionBlocked&&!anchorMoved);
  conversionNote.textContent=conversionBlocked?'The next monthly occurrence is beyond 2200. Choose an earlier Active from date or another repeat pattern.':anchorMoved?`Active from moved from ${container.dataset.customConversionFrom} to ${anchor} to keep the ${container.dataset.customConversionPattern} pattern.`:'';
  if(document.activeElement===ordinal||ordinal.value!==ordinal.dataset.derivedOrdinal)ordinal.dataset.explicitOrdinal='true';
  if(ordinal.dataset.explicitOrdinal!=='true')ordinal.value=String(parts.ordinal);
  ordinal.dataset.derivedOrdinal=String(parts.ordinal);
  const weekdayName=weekdays.find(([day])=>day===parts.weekday)?.[1]||'Monday';
  container.querySelector<HTMLElement>('[data-custom-month-hint]')!.textContent=monthlyMode.value==='weekday'?`Uses ${weekdayName} from Active from. Select Last for the final ${weekdayName} in each month.`:`Uses day ${parts.day} from Active from. Months without that date are skipped.`;
  container.querySelector<HTMLElement>('[data-custom-year-hint]')!.hidden=!active||frequency.value!=='year';
  const ends=field<HTMLSelectElement>(form,'customEndType')!.value;
  container.querySelectorAll<HTMLElement>('[data-custom-end]').forEach(group=>{
    const visible=active&&group.dataset.customEnd===ends;group.hidden=!visible;
    group.querySelectorAll<HTMLInputElement>('input').forEach(input=>{input.disabled=!visible;input.required=visible;});
  });
  const until=field(form,'customEndDate')!;until.min=anchor||'2000-01-01';
}

function validDate(value:string){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'2000-01-01'||value>'2200-12-31')return false;
  const date=new Date(value+'T00:00:00Z');
  return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function readMeetingCustomRecurrence(form:HTMLFormElement):MeetingCustomRecurrence{
  const mode=field<HTMLSelectElement>(form,'recurrence')?.value;
  if(mode==='daily')return {frequency:'day',interval:1,endType:'never'};
  if(mode!=='custom')throw new Error('Choose Custom recurrence to edit this repeat pattern.');
  const frequency=field<HTMLSelectElement>(form,'customFrequency')?.value;
  if(!['day','week','month','year'].includes(frequency||''))throw new Error('Choose a valid repeat unit.');
  const interval=Number(field(form,'customInterval')?.value);
  if(!Number.isInteger(interval)||interval<1||interval>99)throw new Error('Repeat every must be a whole number from 1 to 99.');
  const result:MeetingCustomRecurrence={frequency:frequency as MeetingCustomRecurrence['frequency'],interval,endType:'never'};
  if(frequency==='week'){
    const days=[...form.querySelectorAll<HTMLInputElement>('[name="customWeekday"]:checked')].map(input=>Number(input.value));
    if(!days.length||days.some(day=>!Number.isInteger(day)||day<0||day>6)||new Set(days).size!==days.length)throw new Error('Choose at least one day of the week.');
    result.weekdays=days.sort((a,b)=>(a+6)%7-(b+6)%7);
  }
  if(frequency==='month'){
    const pattern=field<HTMLSelectElement>(form,'customMonthlyMode')?.value;
    if(pattern!=='day'&&pattern!=='weekday')throw new Error('Choose a monthly repeat pattern.');
    result.monthlyMode=pattern;
    if(pattern==='weekday'){
      if(form.querySelector<HTMLElement>('[data-custom-recurrence]')?.dataset.customConversionBlockedAnchor===field(form,'startDate')?.value)throw new Error('The next monthly occurrence is beyond 2200. Choose an earlier Active from date or another repeat pattern.');
      const ordinal=Number(field<HTMLSelectElement>(form,'customMonthlyOrdinal')?.value);
      if(![-1,1,2,3,4,5].includes(ordinal))throw new Error('Choose a valid weekday occurrence.');
      result.monthlyOrdinal=ordinal;
    }
  }
  const ending=field<HTMLSelectElement>(form,'customEndType')?.value;
  if(!['never','on','after'].includes(ending||''))throw new Error('Choose when the recurrence ends.');
  result.endType=ending as MeetingCustomRecurrence['endType'];
  if(ending==='on'){
    const date=field(form,'customEndDate')?.value||'',anchor=field(form,'startDate')?.value||'';
    if(!validDate(date)||!validDate(anchor)||date<anchor)throw new Error('Choose an end date on or after Active from.');
    result.endDate=date;
  }else if(ending==='after'){
    const count=Number(field(form,'customCount')?.value);
    if(!Number.isInteger(count)||count<1||count>1000)throw new Error('Occurrences must be a whole number from 1 to 1,000.');
    result.count=count;
  }
  return result;
}
