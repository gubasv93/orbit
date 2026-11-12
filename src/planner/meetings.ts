import type { ProjectData } from '../lib/schema';

type Pattern = Pick<ProjectData['meetings'][number], 'recurrence' | 'weekday' | 'interval' | 'nth'>
  & Partial<Pick<ProjectData['meetings'][number], 'customRecurrence' | 'startDate'>>;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ordinals = new Map([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [5, '5th'], [-1, 'Last']]);
function joinDays(days: string[]) {
  return days.length < 3 ? days.join(' and ') : `${days.slice(0, -1).join(', ')} and ${days.at(-1)}`;
}
function customLabel(meeting: Pattern) {
  const rule = meeting.customRecurrence;
  if (!rule || !['day', 'week', 'month', 'year'].includes(rule.frequency) || !Number.isInteger(rule.interval) || rule.interval < 1) return 'Custom recurrence';
  const repeat = `Every ${rule.interval === 1 ? rule.frequency : `${rule.interval} ${rule.frequency}s`}`;
  const anchor = new Date(`${meeting.startDate || ''}T12:00:00Z`), hasAnchor = Number.isFinite(anchor.getTime());
  let label = repeat;
  if (rule.frequency === 'week') {
    const days = [...new Set(rule.weekdays || [])].filter(day => Number.isInteger(day) && day >= 0 && day <= 6).sort((a, b) => (a + 6) % 7 - (b + 6) % 7).map(day => weekdays[day]);
    if (!days.length) return 'Custom recurrence';
    label += ` on ${joinDays(days)}`;
  } else if (rule.frequency === 'month') {
    if (!hasAnchor) return 'Custom recurrence';
    if (rule.monthlyMode === 'weekday') {
      const ordinal = ordinals.get(rule.monthlyOrdinal ?? Math.ceil(anchor.getUTCDate() / 7));
      if (!ordinal) return 'Custom recurrence';
      label += ` on the ${ordinal.toLowerCase()} ${weekdays[anchor.getUTCDay()]}`;
    } else label += ` on day ${anchor.getUTCDate()}`;
  } else if (rule.frequency === 'year') {
    if (!hasAnchor) return 'Custom recurrence';
    label += ` on ${anchor.toLocaleDateString('en-US', { month: 'long', day: 'numeric', timeZone: 'UTC' })}`;
  }
  if (rule.endType === 'on' && rule.endDate) label += ` · until ${rule.endDate}`;
  else if (rule.endType === 'after' && rule.count) label += ` · after ${rule.count} ${rule.count === 1 ? 'occurrence' : 'occurrences'}`;
  return label;
}
export function meetingRecurrenceLabel(meeting: Pattern) {
  const day = weekdays[Number(meeting.weekday)] || 'Monday';
  if (meeting.recurrence === 'custom') return customLabel(meeting);
  if (meeting.recurrence === 'workdays') return 'Every working day';
  if (meeting.recurrence === 'monthly') {
    return `${ordinals.get(Number(meeting.nth)) || '1st'} ${day} of each month`;
  }
  if (meeting.recurrence === 'interval' && meeting.interval > 1) return `Every ${meeting.interval} weeks on ${day}`;
  return `Every ${day}`;
}
