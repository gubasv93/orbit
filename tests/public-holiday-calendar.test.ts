import {describe,expect,it} from 'vitest';
import {publicHolidayCalendar,publicHolidayCountries} from '../src/lib/public-holiday-calendar';

describe('country public holiday calendar',()=>{
  it('provides country choices without silently enabling an unreliable calendar',()=>{
    const data=publicHolidayCountries();
    expect(data.countries.length).toBeGreaterThan(100);
    expect(data.countries.find(country=>country.code==='DE')).toMatchObject({name:'Germany',available:true});
    expect(data.countries.find(country=>country.code==='UA')).toMatchObject({available:false});
    expect(data.attribution.license).toContain('CC BY-SA');
    expect(()=>publicHolidayCalendar({country:'UA',year:2026})).toThrow('unavailable');
  });
  it('calculates moving Easter dates separately for each year',()=>{
    const calendar=publicHolidayCalendar({country:'DE',year:2026});
    expect(calendar.years).toEqual([2026,2027]);
    expect(calendar.holidays).toEqual(expect.arrayContaining([
      {date:'2026-04-03',name:'Good Friday'},{date:'2026-04-06',name:'Easter Monday'},
      {date:'2027-03-26',name:'Good Friday'},{date:'2027-03-29',name:'Easter Monday'},
    ]));
    expect(calendar.holidays.some(day=>day.name==='Christmas Eve'||day.name==='Easter Sunday')).toBe(false);
  });
  it('includes substitute days and preserves nominal dates rather than shifting with timezone offsets',()=>{
    const calendar=publicHolidayCalendar({country:'GB',year:2027});
    expect(calendar.holidays).toEqual(expect.arrayContaining([
      {date:'2027-12-27',name:'Christmas Day (substitute day)'},
      {date:'2027-12-28',name:'Boxing Day (substitute day)'},
    ]));
    expect(publicHolidayCalendar({country:'JP',year:2027}).holidays).toContainEqual({date:'2027-01-01',name:'New Year’s Day'});
  });
  it('uses nationwide rules unless a supported subdivision is selected',()=>{
    const national=publicHolidayCalendar({country:'DE',year:2026}),bavaria=publicHolidayCalendar({country:'DE',state:'BY',year:2026});
    expect(national.states).toContainEqual({code:'BY',name:'Bayern'});
    expect(national.holidays.some(day=>day.date==='2026-01-06')).toBe(false);
    expect(bavaria.holidays.some(day=>day.date==='2026-01-06')).toBe(true);
    expect(national.stateCode).toBeNull();expect(bavaria.stateCode).toBe('BY');
  });
  it('excludes partial-day or restricted-group entries and expands multi-day closures',()=>{
    const china=publicHolidayCalendar({country:'CN',year:2027});
    expect(china.holidays.some(day=>['International Women’s Day','Youth Day','Children’s Day','Army Day'].includes(day.name))).toBe(false);
    const emirates=publicHolidayCalendar({country:'AE',year:2027});
    for(const date of ['2027-03-09','2027-03-10','2027-03-11'])expect(emirates.holidays).toContainEqual({date,name:'End of Ramadan (Eid al-Fitr)'});
    expect(new Set(emirates.holidays.map(day=>day.date)).size).toBe(emirates.holidays.length);
  });
  it('bounds input and calendar caching without returning shared mutable arrays',()=>{
    for(const input of [{country:'XX',year:2026},{country:'de',year:2026},{country:'DE',year:1999},{country:'DE',year:2201},{country:'DE',year:2026.5},{country:'DE',year:2026,state:'not-a-state'},{country:'DE',year:2026,region:'A'}])expect(()=>publicHolidayCalendar(input)).toThrow();
    const calendar=publicHolidayCalendar({country:'DE',year:2026});calendar.holidays[0].name='Changed';calendar.states.length=0;
    const next=publicHolidayCalendar({country:'DE',year:2026});expect(next.holidays[0].name).not.toBe('Changed');expect(next.states.length).toBeGreaterThan(0);
    expect(publicHolidayCalendar({country:'DE',year:2200}).years).toEqual([2200]);
  });
});
