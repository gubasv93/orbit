// Server routes only: the holiday rules and country data must not enter client bundles.
import Holidays, {type HolidaysTypes} from 'date-holidays';

export const holidayProviderVersion='3.39.1';
export const holidayCalendarAttribution={
  name:'date-holidays',url:'https://github.com/commenthol/date-holidays',
  license:'ISC / CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/',
};
type Place={code:string;name:string};
type Country=Place&{available:boolean;reason?:string};
export type PublicHolidayCalendar={
  countryCode:string;countryName:string;stateCode:string|null;stateName:string|null;
  regionCode:string|null;regionName:string|null;years:number[];holidays:{date:string;name:string}[];
  states:Place[];regions:Place[];provider:'date-holidays';providerVersion:string;updatedAt:string;
  attribution:typeof holidayCalendarAttribution;
};
export class HolidayCalendarError extends Error {
  constructor(message:string,public status=400){super(message);}
}
const unavailableCalendars:Record<string,string>={
  // This source currently cannot provide a reliable non-working calendar here.
  // Keep the country visible, but never silently import known inaccurate dates.
  UA:'Automatic calendar data is unavailable for this country. Add company holidays manually.',
};
const catalogue=new Holidays();
const countryNames=catalogue.getCountries('en');
const places=(items:Record<string,string>|undefined):Place[]=>Object.entries(items||{}).map(([code,name])=>({code,name})).sort((a,b)=>a.name.localeCompare(b.name,'en'));
const countries:Country[]=places(countryNames).map(place=>({...place,available:!unavailableCalendars[place.code],...(unavailableCalendars[place.code]?{reason:unavailableCalendars[place.code]}:{})}));
const cache=new Map<string,Omit<PublicHolidayCalendar,'updatedAt'>>();
const DAY=86400000;

export function publicHolidayCountries(){return {countries:countries.map(country=>({...country})),attribution:{...holidayCalendarAttribution}};}

function code(value:string|undefined,label:string){
  if(value===undefined||value==='')return undefined;
  if(!/^[a-zA-Z0-9-]{1,16}$/.test(value))throw new HolidayCalendarError('Choose a valid '+label+'.');
  return value;
}
/** Date-only planning uses the nominal local date, never an ISO-converted UTC day. */
function holidayDates(holiday:HolidaysTypes.Holiday,years:number[]):string[]{
  if(holiday.type!=='public')return [];
  const note=String((holiday as HolidaysTypes.Holiday&{note?:unknown}).note||'');
  if(/only for|for all persons belonging|for muslim|women|youth|children|military personnel|^orthodox$/i.test(note))return [];
  const first=holiday.date.slice(0,10),duration=holiday.end.getTime()-holiday.start.getTime();
  // Calendars run in UTC solely to avoid DST changing a full day's duration.
  // Half-days and partial-day closures do not become whole non-working days.
  if(!/^\d{4}-\d{2}-\d{2}$/.test(first)||!Number.isFinite(duration)||duration<DAY)return [];
  const length=Math.floor(duration/DAY);
  if(length>40)throw new Error('Holiday duration exceeds the supported calendar range.');
  const start=Date.parse(first+'T00:00:00Z');
  return Array.from({length},(_,index)=>new Date(start+index*DAY).toISOString().slice(0,10))
    .filter(date=>years.includes(Number(date.slice(0,4))));
}

export function publicHolidayCalendar(input:{country:string;year:number;state?:string;region?:string}):PublicHolidayCalendar {
  const country=input.country;
  if(!/^[A-Z]{2}$/.test(country)||!Object.hasOwn(countryNames,country))throw new HolidayCalendarError('Choose a supported country.');
  if(unavailableCalendars[country])throw new HolidayCalendarError(unavailableCalendars[country],422);
  if(!Number.isInteger(input.year)||input.year<2000||input.year>2200)throw new HolidayCalendarError('Choose a calendar year between 2000 and 2200.');
  const state=code(input.state,'state or province'),region=code(input.region,'region');
  const states=places(catalogue.getStates(country,'en'));
  if(state&&!states.some(place=>place.code===state))throw new HolidayCalendarError('Choose a supported state or province.');
  if(region&&!state)throw new HolidayCalendarError('Choose a state or province before a region.');
  const regions=state?places(catalogue.getRegions(country,state,'en')):[];
  if(region&&!regions.some(place=>place.code===region))throw new HolidayCalendarError('Choose a supported region.');
  const years=input.year<2200?[input.year,input.year+1]:[2200];
  const key=[country,state||'',region||'',input.year].join('|');
  let result=cache.get(key);
  if(!result){
    const provider=new Holidays({country,...(state?{state}:{}),...(region?{region}:{})},{languages:['en'],types:['public'],timezone:'Etc/UTC'});
    const byDate=new Map<string,Set<string>>();
    for(const year of years)for(const holiday of provider.getHolidays(year))for(const date of holidayDates(holiday,years)){
      const name=holiday.name.trim().slice(0,200);
      if(!name)continue;
      if(!byDate.has(date))byDate.set(date,new Set());
      byDate.get(date)!.add(name);
    }
    const holidays=[...byDate].sort(([a],[b])=>a.localeCompare(b)).map(([date,names])=>({date,name:[...names].join(' · ').slice(0,200)}));
    if(holidays.length>732)throw new Error('Holiday calendar exceeds the supported date range.');
    result={countryCode:country,countryName:countryNames[country],stateCode:state||null,stateName:states.find(place=>place.code===state)?.name||null,
      regionCode:region||null,regionName:regions.find(place=>place.code===region)?.name||null,years,holidays,states,regions,
      provider:'date-holidays',providerVersion:holidayProviderVersion,attribution:{...holidayCalendarAttribution}};
    if(cache.size>=128)cache.delete(cache.keys().next().value!);
    cache.set(key,result);
  }
  return {...structuredClone(result),updatedAt:new Date().toISOString()};
}
