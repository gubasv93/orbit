import type {ProjectData} from '../lib/schema';
export type CustomRecurrence=NonNullable<ProjectData['meetings'][number]['customRecurrence']>;
export type RecurrenceMeeting={enabled:boolean;startDate:string;endDate?:string;recurrence:string;weekday?:number;interval?:number;nth?:number;customRecurrence?:CustomRecurrence};
export function meetingOccursOnDate(meeting:RecurrenceMeeting,date:string):boolean;
/** Enabled occurrences on/after fromDate, inclusive; limit defaults to 3 and is capped at 1000. */
export function upcomingMeetingDates(meeting:RecurrenceMeeting,fromDate:string,limit?:number):string[];
