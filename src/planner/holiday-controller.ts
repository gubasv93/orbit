import type {ProjectData} from '../lib/schema';
import type {HolidaySettingsState} from './holiday-settings';
import {applyCountryHolidays,clearCountryHolidays,holidayCalendarNeedsRefresh,type CountryHolidayImport} from './holidays';

type CalendarResponse=CountryHolidayImport&{states:{code:string;name:string}[];regions:{code:string;name:string}[]};
type Options={
  getData:()=>ProjectData;getProjectId:()=>string|null;today:()=>string;isIdle:()=>boolean;
  commit:(data:ProjectData,message:string)=>void;render:()=>void;
};
const calendarKey=(calendar:ProjectData['settings']['holidayCalendar'])=>calendar?[calendar.countryCode,calendar.stateCode||'',calendar.regionCode||''].join(':'):'';
const emptyState=():HolidaySettingsState=>({countries:[],states:[],regions:[],countryCode:'',stateCode:'',regionCode:'',loading:false,saving:false,error:'',loaded:false});

/** Calendar refreshes run on opening a project, focus and the first active minute of a new year. */
export function createHolidayController(options:Options){
  let state=emptyState(),projectId:string|null=null,disposed=false,sequence=0;
  let request:AbortController|null=null,countriesRequest:AbortController|null=null;
  let countriesLoaded=false,previewKey='',retryAfter=0,countryError='';
  const year=()=>Number(options.today().slice(0,4));
  const emit=()=>{if(!disposed)options.render();};
  function reset(){
    sequence++;request?.abort();request=null;previewKey='';retryAfter=0;
    const countries=state.countries;state={...emptyState(),countries};projectId=options.getProjectId();
    const calendar=options.getData().settings.holidayCalendar;
    if(calendar)Object.assign(state,{countryCode:calendar.countryCode,stateCode:calendar.stateCode||'',regionCode:calendar.regionCode||''});
  }
  function syncProject(){if(projectId!==options.getProjectId())reset();}
  async function json(params:URLSearchParams,signal:AbortSignal){
    const response=await fetch('/api/holidays?'+params,{cache:'no-store',signal});
    const body=await response.json();
    if(!response.ok)throw new Error(body.error||'Unable to load the holiday calendar. Please try again.');
    return body;
  }
  const locationKey=()=>[state.countryCode,state.stateCode,state.regionCode,year()].join(':');
  function params(country=state.countryCode,stateCode=state.stateCode,regionCode=state.regionCode){
    const value=new URLSearchParams({country,year:String(year())});
    if(stateCode)value.set('state',stateCode);if(regionCode)value.set('region',regionCode);return value;
  }
  function calendarResponse(value:CalendarResponse,query:URLSearchParams){
    const requestedYear=Number(query.get('year')),years=requestedYear===2200?[2200]:[requestedYear,requestedYear+1];
    if(value.countryCode!==query.get('country')||(value.stateCode||'')!==(query.get('state')||'')||(value.regionCode||'')!==(query.get('region')||'')||JSON.stringify(value.years)!==JSON.stringify(years))throw new Error('The holiday calendar did not match the selected country and years. Please retry.');
    return value;
  }
  async function loadCountries(){
    if(countriesLoaded||countriesRequest||disposed)return;
    const controller=new AbortController();countriesRequest=controller;
    try{
      const value=await json(new URLSearchParams({action:'countries'}),controller.signal);
      if(disposed)return;
      if(!Array.isArray(value.countries))throw new Error('Holiday country choices are unavailable.');
      state.countries=value.countries;countriesLoaded=true;if(state.error===countryError)state.error='';countryError='';emit();
    }catch(error){if(!disposed&&!controller.signal.aborted){countryError=error instanceof Error?error.message:'Unable to load holiday countries.';state.error=countryError;emit();}}
    finally{if(countriesRequest===controller)countriesRequest=null;}
  }
  async function loadPreview(){
    syncProject();
    const key=locationKey();
    if(disposed||state.saving||state.loading||previewKey===key||!state.countryCode)return;
    const id=++sequence,target=projectId;request?.abort();const controller=new AbortController();request=controller;
    state.loading=true;state.error='';emit();
    try{
      const query=params(),value=calendarResponse(await json(query,controller.signal),query);
      if(disposed||id!==sequence||target!==options.getProjectId())return;
      state.states=value.states||[];state.regions=value.regions||[];state.loaded=true;previewKey=key;
    }catch(error){if(!disposed&&id===sequence&&!controller.signal.aborted){state.error=error instanceof Error?error.message:'Unable to load public holidays.';state.loaded=false;previewKey=key;}}
    finally{if(!disposed&&id===sequence){state.loading=false;request=null;emit();void refresh();}}
  }
  function select(field:string,value:string){
    syncProject();sequence++;request?.abort();request=null;state.loading=false;state.loaded=false;state.error='';previewKey='';
    if(field==='country'){state.countryCode=value;state.stateCode='';state.regionCode='';state.states=[];state.regions=[];}
    else if(field==='state'){state.stateCode=value;state.regionCode='';state.regions=[];}
    else if(field==='region')state.regionCode=value;
    if(!state.countryCode)state.loaded=true;
    emit();if(state.countryCode)void loadPreview();
  }
  async function waitForIdle(id:number,target:string|null,signal:AbortSignal){
    const valid=()=>!disposed&&!signal.aborted&&id===sequence&&target===options.getProjectId();
    while(!options.isIdle()){
      if(!valid())return false;
      await new Promise<void>(resolve=>{
        const done=()=>{clearTimeout(timer);signal.removeEventListener('abort',done);resolve();};
        const timer=setTimeout(done,75);signal.addEventListener('abort',done,{once:true});
      });
    }
    return valid();
  }
  async function apply(){
    syncProject();if(disposed||state.saving||state.loading)return;
    if(!state.countryCode){options.commit(clearCountryHolidays(options.getData()),'Manual holiday dates kept');return;}
    const country=state.countryCode,stateCode=state.stateCode,regionCode=state.regionCode,target=projectId,id=++sequence;
    request?.abort();const controller=new AbortController();request=controller;state.saving=true;state.error='';emit();
    try{
      const query=params(country,stateCode,regionCode),value=calendarResponse(await json(query,controller.signal),query);
      if(disposed||id!==sequence||target!==options.getProjectId())return;
      if(!await waitForIdle(id,target,controller.signal))return;
      const next=applyCountryHolidays(options.getData(),value,Number(query.get('year')));
      state.states=value.states||[];state.regions=value.regions||[];state.loaded=true;previewKey=locationKey();retryAfter=0;
      options.commit(next,'Public holidays added for '+value.years.join(' and '));
    }catch(error){if(!disposed&&id===sequence&&!controller.signal.aborted)state.error=error instanceof Error?error.message:'Unable to import public holidays. Saved dates were kept.';}
    finally{if(!disposed&&id===sequence){state.saving=false;request=null;emit();}}
  }
  async function refresh(force=false){
    syncProject();const calendar=options.getData().settings.holidayCalendar;
    if(disposed||!calendar||state.saving||state.loading||!options.isIdle()||!force&&(Date.now()<retryAfter||!holidayCalendarNeedsRefresh(options.getData(),year())))return;
    const target=projectId,key=calendarKey(calendar),id=++sequence,importYear=year();
    request?.abort();const controller=new AbortController();request=controller;state.saving=true;state.error='';emit();
    try{
      const query=params(calendar.countryCode,calendar.stateCode||'',calendar.regionCode||''),value=calendarResponse(await json(query,controller.signal),query);
      if(disposed||id!==sequence||target!==options.getProjectId()||key!==calendarKey(options.getData().settings.holidayCalendar)||!options.isIdle())return;
      if(key===[state.countryCode,state.stateCode,state.regionCode].join(':')){
        state.states=value.states||[];state.regions=value.regions||[];state.loaded=true;previewKey=locationKey();
      }
      options.commit(applyCountryHolidays(options.getData(),value,importYear),'Holiday calendar updated for '+importYear);retryAfter=0;
    }catch(error){if(!disposed&&id===sequence&&!controller.signal.aborted){retryAfter=Date.now()+60000;state.error=error instanceof Error?error.message:'Unable to refresh public holidays. Saved dates were kept.';}}
    finally{if(!disposed&&id===sequence){state.saving=false;request=null;emit();}}
  }
  function ensureOptions(){syncProject();void loadCountries();if(!state.countryCode)state.loaded=true;else void loadPreview();}
  const focus=()=>{if(document.visibilityState!=='hidden')void refresh();};
  const timer=setInterval(focus,60000);
  window.addEventListener('focus',focus);document.addEventListener('visibilitychange',focus);
  return {
    get state(){syncProject();return state;},ensureOptions,select,apply,refresh,reset,
    destroy(){disposed=true;sequence++;request?.abort();countriesRequest?.abort();clearInterval(timer);window.removeEventListener('focus',focus);document.removeEventListener('visibilitychange',focus);},
  };
}
