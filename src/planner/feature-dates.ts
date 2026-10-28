import type {ProjectData} from '../lib/schema';
import {asDay,fromDay} from './dates.js';

// Translate the entire epic atomically, including children hidden by filters or
// collapse. Baselines and milestones remain fixed targets. Other attributes,
// including half-day ends and dependency preferences, are preserved.
export function shiftFeatureDates(data:ProjectData,featureId:string,days:number):boolean{
 const feature=data.features.find(item=>item.id===featureId);
 if(!feature||!Number.isSafeInteger(days)||days===0)return false;
 const first=asDay('2000-01-01'),last=asDay('2200-12-31');
 const changes:{item:Record<string,unknown>;patch:Record<string,string>}[]=[];
 const targets:[Record<string,unknown>,string[]][]=[
  [feature,['start','manualEnd']],
  ...data.tasks.filter(task=>task.featureId===featureId).map(task=>[task,['start','manualEnd','completedDate']] as [Record<string,unknown>,string[]]),
 ];
 for(const [item,fields]of targets){
  const patch:Record<string,string>={};
  for(const key of fields){
   const value=item[key];if(value===undefined)continue;
   if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
   const day=asDay(value),next=day+days;
   if(!Number.isFinite(day)||fromDay(day)!==value||next<first||next>last)return false;
   patch[key]=fromDay(next);
  }
  changes.push({item,patch});
 }
 for(const {item,patch}of changes)Object.assign(item,patch);
 return true;
}
