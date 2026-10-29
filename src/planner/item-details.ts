import type { ProjectData } from '../lib/schema';
import type { Schedule, ScheduledTask } from './engine';
import { createScheduler } from './engine.js';
import { asDay, fromDay, dow } from './dates.js';
import { featureEffort } from './features';

type Task = ProjectData['tasks'][number];
type Kind = 'task' | 'feature';
type AwayKind = 'weekends' | 'holidays' | 'vacation' | 'dayoff' | 'sick';
export interface DetailTaskReference {
  id: string; title: string; featureId: string; featureTitle: string;
  platform: string; role: string; assigneeId: string; assigneeName: string;
}
export interface ItemConflict {
  id: string; kind: 'capacity' | 'dependency' | 'window' | 'shortfall';
  task: DetailTaskReference; relatedTask: DetailTaskReference | null;
  dates: string[]; message: string; overloadMinutes?: number;
}
export interface ItemIssue {
  kind: 'unestimated' | 'paused' | 'blocked'; task: DetailTaskReference; message: string;
}
export interface TimeAwayDetail {
  kind: AwayKind; label: string; days: number | null; unit: 'calendar days' | 'person-days';
}
export interface ItemDetails {
  kind: Kind; id: string; title: string;
  state: 'scheduled' | 'unestimated' | 'paused' | 'blocked' | 'completed' | 'empty';
  estimate: number | null; knownEstimate: number; estimateUnit: 'work days' | 'person-days';
  estimateHours: number | null; estimateManual: boolean; unestimatedCount: number;
  start: string | null; end: string | null; endFraction: number; calendarDays: number | null;
  dateMode: 'automatic' | 'manual' | 'recorded'; forecastComplete: boolean;
  meetingMinutes: number | null; meetingHours: number | null;
  meetingUnit: 'minutes' | 'person-minutes';
  timeAway: TimeAwayDetail[]; conflicts: ItemConflict[]; issues: ItemIssue[]; notes: string[];
}
const round = (n: number) => Math.round(n * 1e6) / 1e6;
const positive = (n: number | undefined) => (n || 0) > 1e-6;
const dated = (s: ScheduledTask | undefined): s is ScheduledTask & {start: number; end: number} => Boolean(s && s.start !== null && s.end !== null);
const active = (s: ScheduledTask | undefined): s is ScheduledTask & {start: number; end: number} => dated(s) && !s.done && !s.hold && !s.blocked;

// Calendar dates are counted once, even if the epic contains parallel work.
function countWeekends(start: number, finish: number) {
  const whole = Math.floor(finish) - start;
  const weeks = Math.floor(Math.max(0, whole) / 7);
  let total = weeks * 2;
  for (let day = start + weeks * 7; day < Math.floor(finish); day++) if ([0, 6].includes(dow(day))) total++;
  if (finish % 1 && [0, 6].includes(dow(Math.floor(finish)))) total += finish % 1;
  return round(total);
}

/** Details describe the existing schedule. They never change dates or allocations. */
export function getItemDetails(data: ProjectData, computed: Schedule, kind: Kind, id: string): ItemDetails | null {
  const task = kind === 'task' ? data.tasks.find(t => t.id === id) : undefined;
  const feature = kind === 'feature' ? data.features.find(f => f.id === id) : undefined;
  if (!task && !feature) return null;
  const tasks = task ? [task] : data.tasks.filter(t => t.featureId === id);
  const engine = createScheduler(data), hours = data.settings.workHours;
  const people = new Map(data.people.map(p => [p.id, p]));
  const roles = new Map(data.roles.map(r => [r.id, r]));
  const features = new Map(data.features.map(f => [f.id, f]));
  const taskMap = new Map(data.tasks.map(t => [t.id, t]));
  const reference = (t: Task): DetailTaskReference => {
    const person = people.get(t.assignee);
    return { id: t.id, title: t.title, featureId: t.featureId, featureTitle: features.get(t.featureId)?.title || '',
      platform: t.platform, role: roles.get(t.roleId || '')?.name || person?.role || t.platform,
      assigneeId: t.assignee, assigneeName: person ? [person.firstName, person.lastName].filter(Boolean).join(' ').trim() || person.name : 'Unassigned' };
  };
  const s = task ? computed.schedule[id] : computed.featureInfo[id];
  if (!s) return null;
  const completed = task ? task.status === 'done' : Boolean(computed.featureInfo[id].allDone);
  const unestimatedCount = tasks.filter(t => t.effort === 0).length;
  const pendingCount = tasks.filter(t => t.effort === 0 && t.status !== 'done').length;
  const effort = feature ? featureEffort(feature, tasks) : null;
  const knownEstimate = effort?.calculated ?? task!.effort;
  const estimateManual = effort?.manual || false;
  const estimate = estimateManual ? effort!.total : unestimatedCount ? null : knownEstimate;
  const manualEnd = task?.status === 'done' ? undefined : task?.manualEnd || feature?.manualEnd;
  let start: number | null = s.start;
  let end: number | null = s.end;
  let endFraction = s.endFraction ?? 1;
  // A stored manual date is a target window, even when no forecast is available.
  if (end === null && manualEnd) {
    start = asDay(task?.start || feature!.start); end = asDay(manualEnd);
    endFraction = task?.manualEndFraction ?? feature?.manualEndFraction ?? 1;
  }
  const finish = end === null ? null : end + endFraction;
  const calendarDays = start === null || finish === null ? null : round(Math.max(0, finish - start));
  const state: ItemDetails['state'] = completed ? 'completed' : task?.status === 'hold' ? 'paused' : !tasks.length ? 'empty' : pendingCount ? 'unestimated' : s.blocked ? 'blocked' : 'scheduled';
  const notes: string[] = [], issues: ItemIssue[] = [], conflicts: ItemConflict[] = [];
  const unknown = tasks.filter(t => t.effort === 0 && t.status !== 'done');
  for (const t of tasks) {
    const scheduled = computed.schedule[t.id];
    if (t.effort === 0 && t.status !== 'done') issues.push({kind: 'unestimated', task: reference(t), message: 'Add an estimate to calculate this work item’s dates.'});
    if (t.status === 'hold') issues.push({kind: 'paused', task: reference(t), message: 'This work item is paused and has no reliable finish date.'});
    else if (scheduled?.blocked && !scheduled.needsEstimate) issues.push({kind: 'blocked', task: reference(t), message: scheduled.reason || 'This work item has no reliable forecast.'});
  }
  if (task && !completed && task.remaining !== undefined && task.remaining < task.effort) notes.push(`Estimate includes ${round(task.effort - task.remaining)} work days already completed; ${round(task.remaining)} work days remain.`);
  if (feature) notes.push('Estimate uses person-days across work items. Parallel work can finish in fewer calendar days.');
  if (estimateManual) notes.push(`The estimate is manual. Work-item estimates sum to ${round(knownEstimate)} person-days.`);
  if (unestimatedCount) notes.push(`${unestimatedCount} work item${unestimatedCount === 1 ? ' has' : 's have'} no estimate. Known estimates total ${round(knownEstimate)} ${feature ? 'person-days' : 'work days'}.`);

  // Build each overbooked person/date once. Epic rows name affected tasks, not
  // every task pair; otherwise N simultaneous children create N² popup rows.
  const selectedIds = new Set(tasks.map(t => t.id));
  const wanted = new Set<string>();
  for (const t of tasks) if (t.assignee) for (const date of computed.conflicts[t.id] || []) wanted.add(`${t.assignee}:${date}`);
  const occupants = new Map<string, Task[]>();
  if (wanted.size) for (const t of data.tasks) if (t.assignee) {
    for (const [date, allocation] of Object.entries(computed.schedule[t.id]?.alloc || {})) {
      const key = `${t.assignee}:${date}`;
      if (!wanted.has(key) || !positive(allocation)) continue;
      const list = occupants.get(key) || []; list.push(t); occupants.set(key, list);
    }
  }
  const capacity = new Map<string, ItemConflict>();
  const addCapacity = (affected: Task, related: Task | null, date: string, overload: number) => {
    const key = feature ? `capacity:${affected.id}` : `capacity:${affected.id}:${related?.id || affected.id}`;
    let conflict = capacity.get(key);
    if (!conflict) {
      const ref = reference(affected);
      conflict = {id: key, kind: 'capacity', task: ref, relatedTask: related ? reference(related) : null,
        dates: [], message: `${ref.assigneeName} has more assigned work than available time.`, overloadMinutes: 0};
      capacity.set(key, conflict);
    }
    // Each task appears at most once in its person/date group.
    conflict.dates.push(date);
    conflict.overloadMinutes = round((conflict.overloadMinutes || 0) + overload);
  };
  for (const [key, list] of occupants) {
    const selected = list.find(t => selectedIds.has(t.id));
    if (!selected) continue;
    const date = key.slice(-10);
    const overload = Math.max(0, (computed.working.get(key) || 0) - engine.featureCapacity(selected.assignee, date)) * hours * 60;
    if (feature) for (const affected of list) addCapacity(affected, null, date, overload);
    else {
      const others = list.filter(t => t.id !== selected.id);
      if (others.length) for (const other of others) addCapacity(selected, other, date, overload);
      else addCapacity(selected, null, date, overload);
    }
  }
  conflicts.push(...capacity.values());

  // Hover details remain accurate even when map timing warnings are hidden.
  for (const t of tasks) {
    const target = computed.schedule[t.id];
    if (!target) continue;
    if (t.status !== 'done') {
      for (const depId of t.dependsOn || []) {
        const dependency = taskMap.get(depId), source = computed.schedule[depId];
        if (!dependency || !source) continue;
        let message = '';
        if (source.end === null) message = source.needsEstimate ? 'The predecessor needs an estimate.' : source.hold ? 'The predecessor is paused.' : 'The predecessor has no reliable finish date.';
        else if (positive(source.shortfall)) message = 'The predecessor’s estimate does not fit its date window.';
        else {
          let ready = source.end + 1;
          const gap = Math.max(0, Math.min(365, Number(data.settings.dependencyGapDays) || 0));
          if (data.settings.dependencyGapUnit === 'working') for (let i = 0; i < gap; i++) ready = engine.nextWork(ready, t.assignee) + 1;
          else ready += gap;
          if (target.start !== null && target.start < ready) message = 'This work item starts before its predecessor is ready.';
        }
        if (message) conflicts.push({id: `dependency:${t.id}:${depId}`, kind: 'dependency', task: reference(t), relatedTask: reference(dependency), dates: target.start === null ? [] : [fromDay(target.start)], message});
      }
      if (positive(target.shortfall)) conflicts.push({id: `shortfall:${t.id}`, kind: 'shortfall', task: reference(t), relatedTask: null,
        dates: dated(target) ? [fromDay(target.start), fromDay(target.end)] : [], message: `${round(target.shortfall!)} work days of remaining work do not fit this date window.`});
    }
    if (feature?.manualEnd && start !== null && finish !== null) {
      const before = target.start !== null && target.start < start;
      const startsAfter = target.start !== null && target.start >= finish;
      const endsAfter = target.end !== null && target.end + (target.endFraction ?? 1) > finish;
      const after = startsAfter || endsAfter;
      if (before || after) conflicts.push({id: `window:${t.id}`, kind: 'window', task: reference(t), relatedTask: null,
        dates: [...new Set([before && target.start !== null || startsAfter ? fromDay(target.start!) : '', endsAfter ? fromDay(target.end!) : ''].filter(Boolean))],
        message: 'This work item falls outside the feature’s manual date window.'});
    }
  }

  const activeTasks = tasks.filter(t => active(computed.schedule[t.id]));
  const peopleDays = new Map<string, Map<number, number>>();
  let includedWindows = 0;
  for (const t of activeTasks) {
    const scheduled = computed.schedule[t.id];
    if (!dated(scheduled)) continue;
    const windowStart = Math.max(scheduled.start, feature && start !== null ? start : scheduled.start);
    const windowFinish = Math.min(scheduled.end + (scheduled.endFraction ?? 1), feature && finish !== null ? finish : Infinity);
    if (windowFinish <= windowStart) continue;
    includedWindows++;
    if (!t.assignee) continue;
    const days = peopleDays.get(t.assignee) || new Map<number, number>();
    for (let day = windowStart; day < windowFinish; day++) days.set(day, Math.max(days.get(day) || 0, Math.min(1, windowFinish - day)));
    peopleDays.set(t.assignee, days);
  }
  let meetingMinutes: number | null = includedWindows ? 0 : null;
  const personal = {vacation: 0, dayoff: 0, sick: 0};
  for (const [person, days] of peopleDays) {
    const leave = data.leave.filter(l => l.person === person);
    for (const [day, span] of days) {
      if ([0, 6].includes(dow(day)) || engine.isHoliday(day)) continue;
      const absences = leave.filter(l => asDay(l.from) <= day && asDay(l.to) >= day);
      const type = absences.some(l => l.type === 'sick') ? 'sick' : absences.some(l => l.type === 'dayoff') ? 'dayoff' : absences.length ? 'vacation' : null;
      if (type) personal[type] += span;
      else meetingMinutes = (meetingMinutes || 0) + Math.min(span * hours * 60, engine.meetingMinutes(person, fromDay(day)));
    }
  }
  if (meetingMinutes !== null) meetingMinutes = round(meetingMinutes);
  const weekends = start !== null && finish !== null ? countWeekends(start, finish) : null;
  const holidays = start !== null && finish !== null && !completed ? round(data.settings.observeHolidays ? [...new Set(data.holidays.map(h => h.date))].reduce((sum, date) => {
    const day = asDay(date);
    return day >= start! && day < finish! && ![0, 6].includes(dow(day)) ? sum + Math.min(1, finish! - day) : sum;
  }, 0) : 0) : null;
  const timeAway: TimeAwayDetail[] = [
    {kind: 'weekends', label: 'Weekends', days: weekends, unit: 'calendar days'},
    {kind: 'holidays', label: 'Public holidays', days: holidays, unit: 'calendar days'},
    ...(['vacation', 'dayoff', 'sick'] as const).map(key => ({kind: key, label: {vacation: 'Vacation', dayoff: 'Days off', sick: 'Sick leave'}[key], days: includedWindows ? round(personal[key]) : null, unit: feature ? 'person-days' as const : 'calendar days' as const})),
  ];
  if (completed) notes.push('Meeting time and personal leave were not tracked as history. Current rules are not applied retrospectively.');
  else if (!includedWindows) notes.push('Meeting and personal-leave totals become available when work items have scheduled date windows.');
  else if (feature) {
    notes.push('Recurring meetings and personal leave count each person/date once across overlapping work items. Meeting totals use participant time.');
    if (tasks.some(t => !active(computed.schedule[t.id]))) notes.push('Meeting and personal-leave totals cover scheduled, unfinished work items only.');
    if (feature.manualEnd) notes.push('Time breakdown is limited to this feature’s manual date window.');
  }
  if (task && !task.assignee && !completed) notes.push('Select an assignee to include their recurring meetings and personal leave.');
  const hasShortfall = tasks.some(t => positive(computed.schedule[t.id]?.shortfall));
  const outsideWindow = conflicts.some(c => c.kind === 'window');
  const forecastComplete = Boolean(tasks.length && end !== null && (state === 'scheduled' || state === 'completed') && !s.blocked && !unknown.length && !hasShortfall && !outsideWindow);
  return {kind, id, title: task?.title || feature!.title, state, estimate, knownEstimate: round(knownEstimate),
    estimateUnit: feature ? 'person-days' : 'work days', estimateHours: estimate === null ? null : round(estimate * hours), estimateManual,
    unestimatedCount, start: start === null ? null : fromDay(start), end: end === null ? null : fromDay(end), endFraction, calendarDays,
    dateMode: manualEnd ? 'manual' : completed ? 'recorded' : 'automatic', forecastComplete,
    meetingMinutes, meetingHours: meetingMinutes === null ? null : round(meetingMinutes / 60), meetingUnit: feature ? 'person-minutes' : 'minutes',
    timeAway, conflicts: conflicts.map(c => ({...c, dates: [...c.dates].sort()})), issues, notes};
}
