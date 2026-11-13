import type {ProjectData} from '../lib/schema';
import type {ScheduledTask} from './engine';
import {asDay,fromDay} from './dates.js';

type Task=ProjectData['tasks'][number];
type Status=Task['status'];
const firstDay=asDay('2000-01-01'),lastDay=asDay('2200-12-31');
function scheduledWindow(schedule:ScheduledTask|undefined){
  const start=schedule?.start,end=schedule?.end;
  if(start===null||start===undefined||end===null||end===undefined||!Number.isInteger(start)||!Number.isInteger(end)||start<firstDay||end>lastDay||end<start||end-start>=3650)return null;
  return {start:fromDay(start),end:fromDay(end),endFraction:schedule?.endFraction===.5?.5:1 as .5|1};
}
function storedWindow(task:Task){
  // A recorded completion is authoritative when reopening older completed work.
  const end=task.status==='done'?task.completedDate||task.manualEnd:task.manualEnd;
  if(!end||end<task.start)return null;
  return {start:task.start,end,endFraction:task.manualEnd===end?task.manualEndFraction??1:1 as .5|1};
}
function pinWindow(task:Task,window:NonNullable<ReturnType<typeof scheduledWindow>>){
  task.start=window.start;task.manualEnd=window.end;task.manualEndFraction=window.endFraction;
}

/** Status changes record the existing plan; they never use the date of the click. */
export function changeTaskStatus(task:Task,nextStatus:Status,schedule?:ScheduledTask):Task{
  if(task.status===nextStatus)return task;
  const previousStatus=task.status;
  // Completion and pause can hide a forecast. Keep its existing bounds so a
  // later reopen/resume restores that window, including a half-day finish.
  const preserveWindow=nextStatus==='done'||nextStatus==='hold'||previousStatus==='done';
  if(preserveWindow){
    const window=scheduledWindow(schedule)||storedWindow(task);
    if(window)pinWindow(task,window);
    if(nextStatus==='done')task.completedDate=window?.end||task.start;
  }
  if(nextStatus!=='done')delete task.completedDate;
  task.status=nextStatus;
  return task;
}
