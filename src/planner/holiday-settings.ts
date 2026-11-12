import type {ProjectData} from '../lib/schema';
import './holiday-settings.css';

export type HolidayCalendarOption = {code:string;name:string;available?:boolean;reason?:string};
export type HolidaySettingsState = {
  countries:HolidayCalendarOption[];
  states:HolidayCalendarOption[];
  regions:HolidayCalendarOption[];
  countryCode:string;
  stateCode:string;
  regionCode:string;
  loading:boolean;
  saving:boolean;
  error:string;
  loaded:boolean;
};
type CalendarSummary = {
  countryCode:string;countryName?:string;stateCode?:string;stateName?:string;
  regionCode?:string;regionName?:string;years:number[];excludedDates?:string[];
};
type HolidayRow = ProjectData['holidays'][number]&{source?:'country';countryCode?:string};

const escape=(value:unknown)=>String(value??'').replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]!));
const attribute=(condition:boolean,name:string)=>condition?' '+name:'';
const removeIcon='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2M5 6l1 15h12l1-15M10 11v6m4-6v6"/></svg>';
const addIcon='<span aria-hidden="true">+</span>';
function dateLabel(value:string){
  const parsed=new Date(value+'T12:00:00Z');
  return Number.isFinite(parsed.getTime())?new Intl.DateTimeFormat('en-GB',{day:'numeric',month:'short',timeZone:'UTC'}).format(parsed):value;
}
function optionList(options:HolidayCalendarOption[],selected:string){
  return options.map(option=>`<option value="${escape(option.code)}"${attribute(option.code===selected,'selected')}${attribute(option.available===false,'disabled')}${option.reason?` title="${escape(option.reason)}"`:''}>${escape(option.name)}${option.available===false?' — automatic calendar unavailable':''}</option>`).join('');
}
function scopeField(id:string,label:string,field:string,options:HolidayCalendarOption[],selected:string,placeholder:string,disabled:boolean){
  return `<div class="field holiday-calendar-field"><label for="${id}">${label}</label><select id="${id}" aria-label="${label}" data-holiday-field="${field}"${attribute(disabled,'disabled')}><option value="">${placeholder}</option>${optionList(options,selected)}</select></div>`;
}

/** Availability markup only; calendar selection and persistence belong to the planner. */
export function renderHolidaySettings(data:ProjectData,state:HolidaySettingsState):string {
  const calendar=(data.settings as ProjectData['settings']&{holidayCalendar?:CalendarSummary}).holidayCalendar;
  const holidays=[...data.holidays] as HolidayRow[];
  holidays.sort((a,b)=>a.date.localeCompare(b.date)||a.name.localeCompare(b.name));
  const busy=state.loading||state.saving;
  const chosen=state.countries.find(country=>country.code===state.countryCode);
  const unavailable=chosen?.available===false;
  const applyDisabled=busy||unavailable||Boolean(state.countryCode&&!state.loaded);
  const countries=[...state.countries];
  if(state.countryCode&&!countries.some(country=>country.code===state.countryCode))countries.push({code:state.countryCode,name:calendar?.countryName||state.countryCode});
  const countryField=scopeField('holidayCountry','Holiday country','country',countries,state.countryCode,'Manual holidays only',state.saving);
  const states=state.states.length?scopeField('holidayState','State / region','state',state.states,state.stateCode,'National holidays only',state.saving):'';
  const regions=state.regions.length?scopeField('holidayRegion','Local region','region',state.regions,state.regionCode,'All selected state / region',state.saving):'';
  const calendarName=calendar?[calendar.countryName||state.countries.find(country=>country.code===calendar.countryCode)?.name||calendar.countryCode,calendar.stateName||calendar.stateCode,calendar.regionName||calendar.regionCode].filter(Boolean).join(' · '):'';
  const years=calendar?[...calendar.years].sort((a,b)=>a-b):[];
  let previousYear='';
  const rows=holidays.map(holiday=>{
    const year=holiday.date.slice(0,4),heading=year!==previousYear?`<div class="holiday-year-heading" role="heading" aria-level="4">${escape(year)}</div>`:'';
    previousYear=year;
    const imported=holiday.source==='country';
    return `${heading}<div class="holiday-date-row" data-holiday-date="${escape(holiday.date)}"><time class="holiday-date" datetime="${escape(holiday.date)}">${escape(dateLabel(holiday.date))}</time><div class="holiday-date-detail"><strong>${escape(holiday.name)}</strong><span class="holiday-source-label${imported?' is-imported':''}">${imported?'Public holiday':'Manual date'}</span></div><button type="button" class="icon-action holiday-delete" data-action="delete-holiday" data-id="${escape(holiday.date)}" aria-label="${escape('Remove holiday '+holiday.name)}" title="${escape('Remove holiday '+holiday.name)}"${attribute(state.saving,'disabled')}>${removeIcon}</button></div>`;
  }).join('');

  return `<section class="card panel-body holiday-settings" aria-labelledby="holiday-settings-title" aria-busy="${busy}">
    <div class="holiday-settings-heading"><h2 class="panel-title" id="holiday-settings-title">Workweek &amp; holidays</h2><p class="holiday-workweek">Monday–Friday <span aria-hidden="true">·</span> ${escape(data.settings.workHours)} hours/day</p></div>
    <p class="panel-sub holiday-settings-description">Choose the calendar your team follows. Holiday dates are excluded from forecasts and highlighted on your roadmap.</p>
    <div class="holiday-calendar-fields">${countryField}${states}${regions}</div>
    ${state.loading?'<p class="holiday-calendar-status" role="status">Loading holiday calendars…</p>':!state.countries.length&&!state.error?'<p class="holiday-calendar-status" role="status">Loading country choices…</p>':''}
    ${state.saving?'<p class="holiday-calendar-status" role="status">Updating holiday dates…</p>':''}
    ${state.error?`<p class="holiday-calendar-error" role="alert">${escape(state.error)}</p>`:''}
    ${unavailable&&chosen.reason?`<p class="holiday-calendar-help">${escape(chosen.reason)}</p>`:''}
    <div class="holiday-calendar-actions"><button type="button" class="btn sm primary" data-action="apply-holiday-calendar"${attribute(applyDisabled,'disabled')}>Apply holiday calendar</button>${calendar?`<button type="button" class="btn sm" data-action="refresh-holiday-calendar"${attribute(busy,'disabled')}>Refresh public holidays</button>`:''}</div>
    <p class="holiday-calendar-help">Adds the current and next year. Updates for each new year when you open the planner. Review imported dates against your team’s policy.</p>
    ${calendar?`<div class="holiday-calendar-summary"><strong>${escape(calendarName)}</strong><span>Saved years: ${years.map(year=>escape(year)).join(', ')||'—'}</span>${calendar.excludedDates?.length?`<small>${calendar.excludedDates.length} removed ${calendar.excludedDates.length===1?'date stays':'dates stay'} excluded from automatic updates.</small>`:''}</div>`:''}
    <div class="holiday-dates-heading"><h3>Holiday dates <span class="soft-tag">${holidays.length}</span></h3><button type="button" class="btn sm" data-action="open-holiday">${addIcon} Add holiday</button></div>
    ${holidays.length?`<div class="holiday-dates-list" role="region" aria-label="Holiday dates" tabindex="0">${rows}</div>`:'<div class="holiday-dates-empty">No holiday dates yet. Choose a country to import public holidays, or add your company’s days off.</div>'}
    <p class="holiday-data-attribution">Holiday data: <a href="https://github.com/commenthol/date-holidays" target="_blank" rel="noopener noreferrer">date-holidays</a> · <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. Library: <a href="https://github.com/commenthol/date-holidays/blob/master/LICENSE" target="_blank" rel="noopener noreferrer">ISC</a>.</p>
  </section>`;
}
