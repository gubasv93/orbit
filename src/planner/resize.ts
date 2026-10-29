import {asDay,fromDay} from './dates.js';
import {createScheduler} from './engine.js';
import type {ProjectData} from '../lib/schema';

type Bounds={start:number|null;end:number|null;endFraction?:number};
export type ResizeEdge='start'|'end';
// Starts remain calendar dates. End handles use half-day planning slots.
// Geometry is shared by epic and work-item handles. Epic resizing keeps child
// dates/estimates unchanged; work-item commits use resizeTask below.
export function resizeWindow(bounds:Bounds,edge:ResizeEdge,deltaDays:number){
 if(bounds.start===null||bounds.end===null||!Number.isFinite(deltaDays))return null;
 const first=asDay('2000-01-01'),last=asDay('2200-12-31');
 let start=bounds.start,finish=bounds.end+(bounds.endFraction??1);
 if(!Number.isFinite(start)||!Number.isFinite(finish)||finish<=start)return null;
 if(edge==='start')start=Math.max(first,Math.ceil(finish-3650),Math.min(Math.floor(finish-.5),start+Math.round(deltaDays)));
 else finish=Math.max(start+.5,Math.min(last+1,start+3650,finish+Math.round(deltaDays*2)/2));
 const end=Math.ceil(finish)-1;
 return {start:fromDay(start),manualEnd:fromDay(end),manualEndFraction:finish-end as .5|1};
}

export type ResizeDateWindow=NonNullable<ReturnType<typeof resizeWindow>>;
type Task=ProjectData['tasks'][number];
type Calendar=Pick<ReturnType<typeof createScheduler>,'nonwork'|'meetingMinutes'>;
const rounded=(value:number)=>Math.round(value*1_000_000)/1_000_000;

// A manually sized work-item window represents remaining work. Count the
// assignee's exact meeting minutes on working dates, then snap down once across
// the complete window so the resulting estimate fits within the selected dates.
// Other assignments remain conflict warnings rather than silently changing scope.
export function taskResizeEstimate(data:ProjectData,task:Task,window:ResizeDateWindow|null|undefined,calendar:Calendar=createScheduler(data)){
 if(!window||['done','hold'].includes(task.status)||!Number.isFinite(task.effort)||task.effort<=0||task.effort>3650)return null;
 const validDate=(value:string)=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2200-12-31'&&fromDay(asDay(value))===value;
 if(!validDate(window.start)||!validDate(window.manualEnd)||![.5,1].includes(window.manualEndFraction))return null;
 const start=asDay(window.start),end=asDay(window.manualEnd),calendarDays=end-start+window.manualEndFraction;
 if(calendarDays<.5||calendarDays>3650)return null;
 const hours=data.settings.workHours,previousRemaining=task.remaining??task.effort;
 if(!Number.isFinite(hours)||hours<1||hours>24||!Number.isFinite(previousRemaining)||previousRemaining<0||previousRemaining>3650)return null;
 if(task.assignee&&!data.people.some(person=>person.id===task.assignee))return null;
 let available=0,meetingMinutes=0;
 for(let day=start;day<=end;day++){
  if(calendar.nonwork(day,task.assignee))continue;
  const span=day===end?window.manualEndFraction:1;
  const minutes=task.assignee?Math.min(span*hours*60,calendar.meetingMinutes(task.assignee,fromDay(day))):0;
  meetingMinutes+=minutes;available+=Math.max(0,span-minutes/(hours*60));
 }
 const remaining=Math.floor((available+1e-9)*2)/2,completedDays=rounded(Math.max(0,task.effort-previousRemaining)),effort=rounded(completedDays+remaining);
 // Incompatible legacy fractions cannot retain completed work while also
 // producing valid half-day totals. Reject rather than rewrite their history.
 if(remaining<.5||effort>3650||!Number.isInteger(effort*2))return null;
 return {effort,remaining,completedDays,availableDays:rounded(available),meetingMinutes:rounded(meetingMinutes),calendarDays,roundingDays:rounded(Math.max(0,available-remaining))};
}

// Validate the whole patch first. Rejected gestures must not partially move an
// item, change its estimate, or alter dependency/ownership/completion metadata.
export function resizeTask(data:ProjectData,taskId:string,window:ResizeDateWindow|null|undefined,calendar?:Calendar):boolean{
 const task=data.tasks.find(item=>item.id===taskId);if(!task||!window)return false;
 const calculation=taskResizeEstimate(data,task,window,calendar);if(!calculation)return false;
 Object.assign(task,{start:window.start,manualEnd:window.manualEnd,manualEndFraction:window.manualEndFraction,effort:calculation.effort,remaining:calculation.remaining});return true;
}
