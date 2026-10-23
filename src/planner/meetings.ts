import type { ProjectData } from '../lib/schema';

type Pattern = Pick<ProjectData['meetings'][number], 'recurrence' | 'weekday' | 'interval' | 'nth'>;
const weekdays = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export function meetingRecurrenceLabel(meeting: Pattern) {
  const day = weekdays[Number(meeting.weekday)] || 'Monday';
  if (meeting.recurrence === 'workdays') return 'Every working day';
  if (meeting.recurrence === 'monthly') {
    const ordinal = new Map([[1, '1st'], [2, '2nd'], [3, '3rd'], [4, '4th'], [5, '5th'], [-1, 'Last']]);
    return `${ordinal.get(Number(meeting.nth)) || '1st'} ${day} of each month`;
  }
  if (meeting.recurrence === 'interval' && meeting.interval > 1) return `Every ${meeting.interval} weeks on ${day}`;
  return `Every ${day}`;
}
