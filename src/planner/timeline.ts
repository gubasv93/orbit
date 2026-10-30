import type { ProjectData } from '../lib/schema';
import type { ScheduledTask } from './engine';
import type { createScheduler } from './engine';
import { fromDay, asDay, dow } from './dates.js';
import {halfDay} from './precision.js';

export const timeCategories = [
  ['development', 'Development', '#7f8fa9'], ['meetings', 'Recurring meetings', '#b8a581'],
  ['weekends', 'Weekends', '#aeb5bf'], ['holidays', 'Public holidays', '#7e9d91'],
  ['timeoff', 'Days off', '#9c97b4'], ['sick', 'Sick leave', '#b58e93'],
] as const;
type Category = typeof timeCategories[number][0];
type Parts = Record<Category, number>;
type Engine = ReturnType<typeof createScheduler>;
const empty = (): Parts => Object.fromEntries(timeCategories.map(([key]) => [key, 0])) as Parts;
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;
export function taskTimeBreakdown(task: ProjectData['tasks'][number], scheduled: ScheduledTask, data: ProjectData, engine: Engine) {
  if (scheduled.start === null || scheduled.end === null || scheduled.done || scheduled.hold || scheduled.blocked) return null;
  const slices: { day: number; span: number; parts: Parts }[] = [], totals = empty();
  let actualMeetingMinutes=0;
  for (let day = scheduled.start; day <= scheduled.end; day++) {
    const date = fromDay(day), parts = empty(), span=day===scheduled.end?(scheduled.endFraction??1):1;
    if (dow(day) === 0 || dow(day) === 6) parts.weekends = span;
    else if (engine.isHoliday(day)) parts.holidays = span;
    else if (engine.nonwork(day, task.assignee)) {
      const sick = data.leave.some(leave => leave.person === task.assignee && leave.type === 'sick' && asDay(leave.from) <= day && asDay(leave.to) >= day);
      parts[sick ? 'sick' : 'timeoff'] = span;
    }
    else {
      parts.meetings = task.assignee ? Math.min(span,engine.meetingDays(task.assignee, date)) : 0;
      actualMeetingMinutes += parts.meetings * data.settings.workHours * 60;
      const afterMeetings = Math.max(0, span - parts.meetings);
      parts.development = Math.min(afterMeetings, scheduled.alloc[date] || 0);
    }
    for (const [key] of timeCategories) totals[key] += parts[key];
    slices.push({ day, span, parts });
  }
  // Round the work item's combined meeting time once. The difference fits in
  // the final half-day planning slot; never replace allocated development.
  let padding=halfDay(totals.meetings)-totals.meetings;
  for(let i=slices.length-1;i>=0&&padding>.000001;i--){
    const slice=slices[i];if(engine.nonwork(slice.day,task.assignee))continue;
    const used=Object.values(slice.parts).reduce((sum,value)=>sum+value,0);
    const reserved=Math.min(padding,Math.max(0,slice.span-used));
    slice.parts.meetings+=reserved;totals.meetings+=reserved;padding-=reserved;
  }
  for (const [key] of timeCategories) totals[key] = rounded(totals[key]);
  return { slices, totals, days: scheduled.end-scheduled.start+(scheduled.endFraction??1), required: task.remaining ?? task.effort, allocated: totals.development, missing: scheduled.shortfall || 0, actualMeetingMinutes:rounded(actualMeetingMinutes) };
}
export type TimeBreakdown = NonNullable<ReturnType<typeof taskTimeBreakdown>>;

// Parent bars show the average mix of the active children on each calendar day.
// Their calendar fractions are deliberately separate from summed person-day effort.
export function featureTimeBreakdown(start: number, end: number, children: (TimeBreakdown | null)[],endFraction=1): TimeBreakdown | null {
  const active = children.filter((child): child is TimeBreakdown => child !== null);
  if (!active.length || end - start > 3650) return null;
  const indexed = new Map<number, TimeBreakdown['slices']>();
  for (const child of active) for (const slice of child.slices) {
    const values = indexed.get(slice.day) || []; values.push(slice); indexed.set(slice.day, values);
  }
  const totals = empty(), slices: TimeBreakdown['slices'] = [];
  for (let day = start; day <= end; day++) {
    const parts = empty(), values = indexed.get(day) || [],span=day===end?endFraction:1;
    if(values.length)for (const [key] of timeCategories) parts[key] = values.reduce((sum, value) => sum + value.parts[key]/value.span, 0) / values.length*span;
    for (const [key] of timeCategories) totals[key] += parts[key];
    slices.push({ day, span, parts });
  }
  return { slices, totals, days: end-start+endFraction, required: active.reduce((sum, child) => sum + child.required, 0), allocated: active.reduce((sum, child) => sum + child.allocated, 0), missing: active.reduce((sum, child) => sum + child.missing, 0),actualMeetingMinutes:active.reduce((sum,child)=>sum+child.actualMeetingMinutes,0) };
}

export function capacityGradient(breakdown: TimeBreakdown) {
  // A bar's length represents its calendar window. Its colors compare only
  // accounted time, so gaps never create an unlabeled tail or extra effort.
  const parts=timeCategories.filter(([key])=>breakdown.totals[key]>0);
  const total=parts.reduce((sum,[key])=>sum+breakdown.totals[key],0);
  if(!total)return 'none';
  let position=0;
  const stops=parts.map(([key,,color],index)=>{
    const end=index===parts.length-1?100:position+breakdown.totals[key]/total*100;
    const stop=`${color} ${position.toFixed(5)}% ${end.toFixed(5)}%`;position=end;return stop;
  });
  return `linear-gradient(90deg,${stops.join(',')})`;
}

export function dependencyPath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const bend = Math.max(22, Math.min(80, Math.abs(target.x - source.x) / 2));
  return `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`;
}
