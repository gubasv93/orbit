import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {createHolidayController} from '../src/planner/holiday-controller';
import {applyCountryHolidays,saveManualHoliday} from '../src/planner/holidays';
import {projectData} from './fixtures';

const response=(country='DE',year=2027)=>({countryCode:country,countryName:country,stateCode:null,regionCode:null,
  years:[year,year+1],states:[],regions:[],holidays:[{date:year+'-01-01',name:'New Year'},{date:(year+1)+'-01-01',name:'New Year'}]});
const controllers:ReturnType<typeof createHolidayController>[]=[];
function deferred(){let resolve!:(value:Response)=>void;const promise=new Promise<Response>(done=>resolve=done);return {promise,resolve:(data:unknown)=>resolve(new Response(JSON.stringify(data),{status:200}))};}
function harness(){
  let data=applyCountryHolidays(projectData(),response('DE',2026),2026),id='first',idle=true;
  const commit=vi.fn((next:typeof data)=>{data=next;});
  const controller=createHolidayController({getData:()=>data,getProjectId:()=>id,today:()=>new Date().toISOString().slice(0,10),isIdle:()=>idle,commit,render:vi.fn()});
  controllers.push(controller);
  return {controller,commit,get data(){return data;},set data(value){data=value;},set projectId(value:string){id=value;},set idle(value:boolean){idle=value;}};
}
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date('2027-01-01T00:01:00Z'));
  vi.stubGlobal('window',new EventTarget());vi.stubGlobal('document',Object.assign(new EventTarget(),{visibilityState:'visible'}));
});
afterEach(()=>{for(const controller of controllers.splice(0))controller.destroy();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});

describe('annual holiday refresh and concurrent planner edits',()=>{
  it('merges an annual response into the latest data rather than losing edits made while loading',async()=>{
    const pending=deferred();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));const h=harness();
    const refresh=h.controller.refresh();
    h.data=saveManualHoliday(h.data,{date:'2027-07-12',name:'Added while calendar was loading'});
    pending.resolve(response());await refresh;
    expect(h.data.holidays).toContainEqual({date:'2027-07-12',name:'Added while calendar was loading'});
    expect(h.data.settings.holidayCalendar).toMatchObject({updatedForYear:2027,years:[2026,2027,2028]});
    expect(h.commit).toHaveBeenCalledTimes(1);
  });
  it('discards an old project response even if the transport completes after cancellation',async()=>{
    const pending=deferred();vi.stubGlobal('fetch',vi.fn(()=>pending.promise));const h=harness();
    const refresh=h.controller.refresh();h.projectId='second';h.data=applyCountryHolidays(projectData(),response('GB',2027),2027);
    expect(h.controller.state.countryCode).toBe('GB');pending.resolve(response());await refresh;
    expect(h.commit).not.toHaveBeenCalled();expect(h.data.settings.holidayCalendar?.countryCode).toBe('GB');
  });
  it('keeps the saved calendar and exposes an error when a response belongs to another country',async()=>{
    vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify(response('GB')),{status:200})));const h=harness();
    const original=structuredClone(h.data);await h.controller.refresh();
    expect(h.data).toEqual(original);expect(h.commit).not.toHaveBeenCalled();expect(h.controller.state.error).toContain('did not match');
  });
  it('defers automatic changes while an editor is open, including an editor opened during the request',async()=>{
    const pending=deferred(),fetch=vi.fn(()=>pending.promise);vi.stubGlobal('fetch',fetch);const h=harness();
    h.idle=false;await h.controller.refresh();expect(fetch).not.toHaveBeenCalled();
    h.idle=true;const refresh=h.controller.refresh();h.idle=false;pending.resolve(response());await refresh;
    expect(h.commit).not.toHaveBeenCalled();expect(h.data.settings.holidayCalendar?.updatedForYear).toBe(2026);
  });
});
