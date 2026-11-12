import {holidayCalendarSchema,holidaySchema,type ProjectData} from '../lib/schema';

export type CountryHolidayImport = {
  countryCode:string;countryName?:string|null;
  stateCode?:string|null;stateName?:string|null;
  regionCode?:string|null;regionName?:string|null;
  years:number[];holidays:{date:string;name:string}[];providerVersion?:string;
};
type Calendar = NonNullable<ProjectData['settings']['holidayCalendar']>;
const maximumHolidays=1000;
const identity=(calendar:Pick<Calendar,'countryCode'|'stateCode'|'regionCode'>)=>[calendar.countryCode,calendar.stateCode||'',calendar.regionCode||''].join(':');
const yearOf=(date:string)=>Number(date.slice(0,4));
const validYear=(year:number)=>Number.isInteger(year)&&year>=2000&&year<=2200;
const yearWindow=(year:number)=>year===2200?[2200]:[year,year+1];
function sortedHolidays(rows:ProjectData['holidays']){
  if(rows.length>maximumHolidays)throw new Error('The holiday calendar can contain at most 1,000 dates. Remove unused dates before adding more.');
  return rows.sort((a,b)=>a.date.localeCompare(b.date));
}
function optionalLocation(response:CountryHolidayImport){
  return {
    ...(response.countryName?{countryName:response.countryName}:{}),
    ...(response.stateCode?{stateCode:response.stateCode}:{}),
    ...(response.stateName?{stateName:response.stateName}:{}),
    ...(response.regionCode?{regionCode:response.regionCode}:{}),
    ...(response.regionName?{regionName:response.regionName}:{}),
    ...(response.providerVersion?{providerVersion:response.providerVersion}:{}),
  };
}

/** Reconcile only imported dates. A hand-written entry always wins its date. */
export function applyCountryHolidays(data:ProjectData,response:CountryHolidayImport,currentYear:number):ProjectData {
  const incoming=holidayCalendarSchema.parse({countryCode:response.countryCode,...optionalLocation(response),years:response.years,excludedDates:[],updatedForYear:currentYear});
  if(!Array.isArray(response.holidays)||response.holidays.length>3000)throw new Error('The holiday response contains too many dates.');
  const previous=data.settings.holidayCalendar,same=previous&&identity(previous)===identity(incoming);
  const excludedDates=same?[...previous.excludedDates]:[];
  const excluded=new Set(excludedDates),years=new Set(incoming.years);
  const rows=new Map<string,ProjectData['holidays'][number]>();
  for(const holiday of data.holidays){
    if(holiday.source!=='country'||same&&!years.has(yearOf(holiday.date)))rows.set(holiday.date,{...holiday});
  }
  const imported=new Map<string,string[]>();
  for(const entry of response.holidays){
    const holiday=holidaySchema.parse({date:entry.date,name:entry.name});
    if(!years.has(yearOf(holiday.date)))throw new Error('A holiday date falls outside the requested years.');
    if(excluded.has(holiday.date)||rows.has(holiday.date))continue;
    const names=imported.get(holiday.date)||[];
    if(!names.includes(holiday.name))names.push(holiday.name);
    imported.set(holiday.date,names);
  }
  for(const [date,names] of imported){
    rows.set(date,holidaySchema.parse({date,name:names.join(' · '),source:'country',countryCode:incoming.countryCode,
      ...(incoming.stateCode?{stateCode:incoming.stateCode}:{}),...(incoming.regionCode?{regionCode:incoming.regionCode}:{})}));
  }
  const calendar=holidayCalendarSchema.parse({...incoming,years:[...new Set([...(same?previous.years:[]),...incoming.years])].sort((a,b)=>a-b),excludedDates});
  return {...data,holidays:sortedHolidays([...rows.values()]),settings:{...data.settings,observeHolidays:true,holidayCalendar:calendar}};
}

/** Keep an explicit deletion through future refreshes of the same country. */
export function removeHoliday(data:ProjectData,date:string):ProjectData {
  const exists=data.holidays.some(holiday=>holiday.date===date);
  const calendar=data.settings.holidayCalendar;
  const updated=calendar&&exists?holidayCalendarSchema.parse({...calendar,excludedDates:[...new Set([...calendar.excludedDates,date])].sort()}):calendar;
  return {...data,holidays:data.holidays.filter(holiday=>holiday.date!==date),settings:{...data.settings,observeHolidays:true,...(updated?{holidayCalendar:updated}:{})}};
}

/** A manual date becomes independent of provider updates and country changes. */
export function saveManualHoliday(data:ProjectData,entry:{date:string;name:string}):ProjectData {
  const holiday=holidaySchema.parse({date:entry.date,name:entry.name}),calendar=data.settings.holidayCalendar;
  return {...data,holidays:sortedHolidays([...data.holidays.filter(row=>row.date!==holiday.date),holiday]),
    settings:{...data.settings,observeHolidays:true,...(calendar?{holidayCalendar:{...calendar,excludedDates:calendar.excludedDates.filter(date=>date!==holiday.date)}}:{})}};
}

/** Manual-only mode removes generated dates without touching hand-written ones. */
export function clearCountryHolidays(data:ProjectData):ProjectData {
  const {holidayCalendar:_calendar,...settings}=data.settings;
  return {...data,holidays:data.holidays.filter(holiday=>holiday.source!=='country'),settings:{...settings,observeHolidays:true}};
}

export function holidayCalendarNeedsRefresh(data:ProjectData,currentYear:number):boolean {
  const calendar=data.settings.holidayCalendar;
  return Boolean(calendar&&validYear(currentYear)&&(calendar.updatedForYear!==currentYear||yearWindow(currentYear).some(year=>!calendar.years.includes(year))));
}
