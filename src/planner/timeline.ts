import type { ProjectData } from '../lib/schema';
import type { ScheduledTask } from './engine';
import type { createScheduler } from './engine';
import { fromDay, asDay, dow } from './dates.js';

export const timeCategories = [
  ['development', 'Development', '#7870db'], ['meetings', 'Recurring meetings', '#e7c45f'],
  ['weekends', 'Weekends', '#cbd2de'], ['holidays', 'Public holidays', '#6abca8'],
  ['timeoff', 'Days off', '#91bce4'], ['sick', 'Sick leave', '#e9a09d'],
  ['available', 'Unused availability', '#edf0f6'],
] as const;
type Category = typeof timeCategories[number][0];
type Parts = Record<Category, number>;
type Engine = ReturnType<typeof createScheduler>;
const empty = (): Parts => Object.fromEntries(timeCategories.map(([key]) => [key, 0])) as Parts;
const rounded = (value: number) => Math.round(value * 1e6) / 1e6;
export function taskTimeBreakdown(task: ProjectData['tasks'][number], scheduled: ScheduledTask, data: ProjectData, engine: Engine) {
  if (scheduled.start === null || scheduled.end === null || scheduled.done || scheduled.hold || scheduled.blocked) return null;
  const slices: { day: number; parts: Parts }[] = [], totals = empty();
  for (let day = scheduled.start; day <= scheduled.end; day++) {
    const date = fromDay(day), parts = empty();
    if (dow(day) === 0 || dow(day) === 6) parts.weekends = 1;
    else if (engine.isHoliday(day)) parts.holidays = 1;
    else if (engine.nonwork(day, task.assignee)) {
      const sick = data.leave.some(leave => leave.person === task.assignee && leave.type === 'sick' && asDay(leave.from) <= day && asDay(leave.to) >= day);
      parts[sick ? 'sick' : 'timeoff'] = 1;
    }
    else {
      parts.meetings = task.assignee ? engine.meetingMinutes(task.assignee, date) / (data.settings.workHours * 60) : 0;
      const afterMeetings = Math.max(0, 1 - parts.meetings);
      parts.development = Math.min(afterMeetings, scheduled.alloc[date] || 0);
      parts.available = Math.max(0, afterMeetings - parts.development);
    }
    for (const [key] of timeCategories) totals[key] += parts[key];
    slices.push({ day, parts });
  }
  for (const [key] of timeCategories) totals[key] = rounded(totals[key]);
  return { slices, totals, days: slices.length, required: task.remaining ?? task.effort, allocated: totals.development, missing: scheduled.shortfall || 0 };
}
export type TimeBreakdown = NonNullable<ReturnType<typeof taskTimeBreakdown>>;

// Parent bars show the average mix of the active children on each calendar day.
// Their calendar fractions are deliberately separate from summed person-day effort.
export function featureTimeBreakdown(start: number, end: number, children: (TimeBreakdown | null)[]): TimeBreakdown | null {
  const active = children.filter((child): child is TimeBreakdown => child !== null);
  if (!active.length || end - start > 3650) return null;
  const indexed = new Map<number, Parts[]>();
  for (const child of active) for (const slice of child.slices) {
    const values = indexed.get(slice.day) || []; values.push(slice.parts); indexed.set(slice.day, values);
  }
  const totals = empty(), slices: TimeBreakdown['slices'] = [];
  for (let day = start; day <= end; day++) {
    const parts = empty(), values = indexed.get(day) || [];
    if (!values.length) parts.available = 1;
    else for (const [key] of timeCategories) parts[key] = values.reduce((sum, value) => sum + value[key], 0) / values.length;
    for (const [key] of timeCategories) totals[key] += parts[key];
    slices.push({ day, parts });
  }
  return { slices, totals, days: slices.length, required: active.reduce((sum, child) => sum + child.required, 0), allocated: active.reduce((sum, child) => sum + child.allocated, 0), missing: active.reduce((sum, child) => sum + child.missing, 0) };
}

export function capacityGradient(breakdown: TimeBreakdown) {
  const stops: string[] = []; let position = 0;
  for (const [key, , color] of timeCategories) {
    const size = breakdown.totals[key] / breakdown.days * 100;
    if (size < .00001) continue;
    stops.push(`${color} ${position.toFixed(5)}% ${(position + size).toFixed(5)}%`); position += size;
  }
  return `linear-gradient(90deg,${stops.join(',') || '#edf0f6 0% 100%'})`;
}

export function dependencyPath(source: { x: number; y: number }, target: { x: number; y: number }) {
  const bend = Math.max(22, Math.min(80, Math.abs(target.x - source.x) / 2));
  return `M ${source.x} ${source.y} C ${source.x + bend} ${source.y}, ${target.x - bend} ${target.y}, ${target.x} ${target.y}`;
}
