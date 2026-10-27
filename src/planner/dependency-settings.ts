import type {ProjectData} from '../lib/schema';
import type {Schedule} from './engine';
import {createScheduler} from './engine.js';
import {addDays,asDay,fromDay} from './dates.js';

// Turning automatic movement off must retain the positions the user sees,
// rather than reverting to each dependent's old earliest-start constraint.
export function pinDependentDates(data:ProjectData,schedule:Schedule){
  for(const task of data.tasks){
    const info=schedule.schedule[task.id];
    if(!task.dependsOn.length||['done','hold'].includes(task.status)||!info||info.blocked||info.start===null||info.end===null)continue;
    const start=fromDay(info.start),end=task.manualEnd?addDays(task.manualEnd,info.start-asDay(task.start)):undefined;
    if(start<'2000-01-01'||start>'2200-12-31'||(end&&end>'2200-12-31'))continue;
    task.start=start;if(end)task.manualEnd=end;
  }
}

export function initializeDependencySettings(data:ProjectData){
  if(data.settings.autoShiftDependencies!==undefined)return false;
  const legacy=createScheduler({...data,settings:{...data.settings,autoShiftDependencies:true,dependencyGapDays:0,dependencyGapUnit:'calendar',dependencyShiftPolicy:'push'}},{legacyAllocation:true}).calculate();
  pinDependentDates(data,legacy);
  data.settings.autoShiftDependencies=false;
  return true;
}
