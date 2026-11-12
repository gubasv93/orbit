import {describe,expect,it} from 'vitest';
import {projectData} from './fixtures';
import {projectDataSchema} from '../src/lib/schema';
import {applyCountryHolidays,clearCountryHolidays,holidayCalendarNeedsRefresh,removeHoliday,saveManualHoliday,type CountryHolidayImport} from '../src/planner/holidays';
import {createScheduler} from '../src/planner/engine.js';
import {fromDay} from '../src/planner/dates.js';
import {taskTimeBreakdown} from '../src/planner/timeline';
import {getItemDetails} from '../src/planner/item-details';

const calendar=(changed:Partial<CountryHolidayImport>={}):CountryHolidayImport=>({
  countryCode:'DE',countryName:'Germany',stateCode:null,stateName:null,regionCode:null,regionName:null,
  years:[2026,2027],holidays:[{date:'2026-10-27',name:'Public holiday'},{date:'2027-01-01',name:'New Year'}],providerVersion:'3.39.1',...changed,
});

describe('project-owned public holiday calendars',()=>{
  it('imports dates independently of manual entries, deduplicates same-day names and preserves all unrelated work',()=>{
    const original=projectData();original.holidays=[{date:'2026-10-27',name:'Company policy'},{date:'2026-11-02',name:'Company anniversary'}];
    const before=structuredClone(original),result=applyCountryHolidays(original,calendar({holidays:[
      {date:'2026-10-27',name:'Provider name'},
      {date:'2027-01-01',name:'New Year'},{date:'2027-01-01',name:'New Year'},{date:'2027-01-01',name:'Additional public holiday'},
    ]}),2026);
    expect(original).toEqual(before);
    expect(result.tasks).toBe(original.tasks);expect(result.leave).toBe(original.leave);expect(result.people).toBe(original.people);
    expect(result.holidays).toEqual([
      {date:'2026-10-27',name:'Company policy'},{date:'2026-11-02',name:'Company anniversary'},
      {date:'2027-01-01',name:'New Year · Additional public holiday',source:'country',countryCode:'DE'},
    ]);
    expect(result.settings.holidayCalendar).toMatchObject({countryCode:'DE',years:[2026,2027],excludedDates:[],updatedForYear:2026});
    expect(projectDataSchema.parse(result)).toEqual(result);
  });

  it('refreshes only requested years and preserves deletions and existing historical generated dates',()=>{
    let result=applyCountryHolidays(projectData(),calendar(),2026);
    result=removeHoliday(result,'2026-10-27');
    expect(result.settings.holidayCalendar?.excludedDates).toEqual(['2026-10-27']);
    result=applyCountryHolidays(result,calendar(),2026);
    expect(result.holidays.some(row=>row.date==='2026-10-27')).toBe(false);
    result=applyCountryHolidays(result,calendar({years:[2027,2028],holidays:[
      {date:'2027-03-29',name:'Easter Monday'},{date:'2028-04-17',name:'Easter Monday'},
    ]}),2027);
    expect(result.holidays.map(row=>row.date)).toEqual(['2027-03-29','2028-04-17']);
    expect(result.settings.holidayCalendar).toMatchObject({years:[2026,2027,2028],excludedDates:['2026-10-27'],updatedForYear:2027});
  });

  it('retains earlier imported years when adding the next rolling year',()=>{
    const initial=applyCountryHolidays(projectData(),calendar(),2026);
    const result=applyCountryHolidays(initial,calendar({years:[2027,2028],holidays:[{date:'2027-01-01',name:'New Year updated'},{date:'2028-01-01',name:'New Year'}]}),2027);
    expect(result.holidays.map(row=>row.date)).toEqual(['2026-10-27','2027-01-01','2028-01-01']);
    expect(result.holidays[1].name).toBe('New Year updated');
  });

  it('resets generated rows and exclusions when country, state or local region changes, keeping manual dates',()=>{
    let data=saveManualHoliday(projectData(),{date:'2026-11-02',name:'Company day'});
    data=removeHoliday(applyCountryHolidays(data,calendar(),2026),'2026-10-27');
    const switched=applyCountryHolidays(data,calendar({countryCode:'GB',countryName:'United Kingdom',stateCode:'ENG',stateName:'England',regionCode:'LND',regionName:'London'}),2026);
    expect(switched.settings.holidayCalendar).toMatchObject({countryCode:'GB',stateCode:'ENG',regionCode:'LND',excludedDates:[]});
    expect(switched.holidays.filter(row=>row.source==='country').every(row=>row.countryCode==='GB'&&row.stateCode==='ENG'&&row.regionCode==='LND')).toBe(true);
    expect(switched.holidays.some(row=>row.date==='2026-10-27')).toBe(true);
    expect(switched.holidays.find(row=>row.date==='2026-11-02')).toEqual({date:'2026-11-02',name:'Company day'});
    const otherState=applyCountryHolidays(switched,calendar({countryCode:'GB',stateCode:'SCT'}),2026);
    expect(otherState.settings.holidayCalendar?.regionCode).toBeUndefined();
    expect(otherState.holidays.filter(row=>row.source==='country').every(row=>row.stateCode==='SCT'&&!row.regionCode)).toBe(true);
  });

  it('turns manual overrides into independent dates and preserves their deletion on refresh',()=>{
    let data=applyCountryHolidays(projectData(),calendar(),2026);
    data=removeHoliday(data,'2026-10-27');
    data=saveManualHoliday(data,{date:'2026-10-27',name:'Our chosen holiday'});
    expect(data.settings.holidayCalendar?.excludedDates).toEqual([]);
    data=applyCountryHolidays(data,calendar(),2026);
    expect(data.holidays.find(row=>row.date==='2026-10-27')).toEqual({date:'2026-10-27',name:'Our chosen holiday'});
    data=removeHoliday(data,'2026-10-27');data=applyCountryHolidays(data,calendar(),2026);
    expect(data.holidays.some(row=>row.date==='2026-10-27')).toBe(false);
  });

  it('returns to manual-only mode without deleting company holidays or mutating the old project',()=>{
    const original=saveManualHoliday(applyCountryHolidays(projectData(),calendar(),2026),{date:'2026-11-02',name:'Company day'});
    const before=structuredClone(original),result=clearCountryHolidays(original);
    expect(result.holidays).toEqual([{date:'2026-11-02',name:'Company day'}]);
    expect(result.settings.holidayCalendar).toBeUndefined();expect(original).toEqual(before);
  });

  it('requests an automatic refresh once the planning year changes or the next year is missing',()=>{
    const data=applyCountryHolidays(projectData(),calendar(),2026);
    expect(holidayCalendarNeedsRefresh(projectData(),2026)).toBe(false);
    expect(holidayCalendarNeedsRefresh(data,2026)).toBe(false);
    expect(holidayCalendarNeedsRefresh(data,2027)).toBe(true);
    const updated=applyCountryHolidays(data,calendar({years:[2027,2028],holidays:[]}),2027);
    expect(holidayCalendarNeedsRefresh(updated,2027)).toBe(false);
    const missing=applyCountryHolidays(projectData(),calendar({years:[2026],holidays:[]}),2026);
    expect(holidayCalendarNeedsRefresh(missing,2026)).toBe(true);
    const last=applyCountryHolidays(projectData(),calendar({years:[2200],holidays:[{date:'2200-01-01',name:'New Year'}]}),2200);
    expect(holidayCalendarNeedsRefresh(last,2200)).toBe(false);
    expect(holidayCalendarNeedsRefresh(data,2201)).toBe(false);
  });

  it('rejects invalid metadata and oversized merges without partially changing the project',()=>{
    for(const response of [calendar({countryCode:'de'}),calendar({years:[2026,2026]}),calendar({years:[2025]}),calendar({regionCode:'X'}),calendar({holidays:[{date:'2026-02-30',name:'Invalid'}]})]){
      const data=projectData(),before=structuredClone(data);expect(()=>applyCountryHolidays(data,response,2026)).toThrow();expect(data).toEqual(before);
    }
    const data=projectData();data.holidays=Array.from({length:1000},(_,index)=>({date:new Date(Date.UTC(2000,0,1+index)).toISOString().slice(0,10),name:'Manual day'}));
    const before=structuredClone(data);expect(()=>applyCountryHolidays(data,calendar(),2026)).toThrow(/1,000/);expect(data).toEqual(before);
  });

  it('round-trips generated origin and exclusions while keeping legacy false flags readable',()=>{
    const data=removeHoliday(applyCountryHolidays(projectData(),calendar(),2026),'2026-10-27');data.settings.observeHolidays=false;
    expect(projectDataSchema.parse(JSON.parse(JSON.stringify(data)))).toEqual(data);
    const {observeHolidays:_legacy,...settings}=data.settings;
    expect(projectDataSchema.parse({...data,settings}).settings.observeHolidays).toBe(true);
    const invalid=structuredClone(data);invalid.holidays[0].countryCode=undefined;expect(projectDataSchema.safeParse(invalid).success).toBe(false);
  });

  it('treats every listed holiday as non-working in forecasts and breakdowns regardless of the retired flag',()=>{
    const data=projectData();data.settings.observeHolidays=false;data.holidays=[{date:'2026-10-27',name:'Company day off'}];
    const engine=createScheduler(data),computed=engine.calculate();
    expect(fromDay(computed.schedule.t1.end!)).toBe('2026-10-29');
    expect(taskTimeBreakdown(data.tasks[0],computed.schedule.t1,data,engine)?.totals.holidays).toBe(1);
    expect(getItemDetails(data,computed,'task','t1')?.timeAway.find(row=>row.kind==='holidays')?.days).toBe(1);
    expect(data.settings.observeHolidays).toBe(false);
  });
});
