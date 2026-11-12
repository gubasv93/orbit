import type {ProjectData} from '../lib/schema';
import {addDays,asDay,dow,fromDay} from './dates.js';

type Meeting=ProjectData['meetings'][number];
export const scrumPresetKeys=['scrum-daily','scrum-refinement','scrum-planning','scrum-demo','scrum-retro'] as const;
export type ScrumPresetKey=(typeof scrumPresetKeys)[number];

function validDate(value:string){
  return /^\d{4}-\d{2}-\d{2}$/.test(value)&&value>='2000-01-01'&&value<='2200-12-31'&&fromDay(asDay(value))===value;
}

/** Add ordinary, independently editable meetings; an existing preset is never reset. */
export function addScrumMeetings(data:ProjectData,today:string,idFactory:()=>string=()=> 'm'+crypto.randomUUID()):{data:ProjectData;added:number}{
  if(!validDate(today))throw new Error('Choose a valid Scrum ceremony start date between 2000 and 2200.');
  const present=new Set(data.meetings.map(meeting=>meeting.presetKey).filter(Boolean));
  const missing=scrumPresetKeys.filter(key=>!present.has(key));
  if(data.meetings.length+missing.length>1000)throw new Error('A project can contain at most 1,000 meetings. Remove unused meetings before adding Scrum ceremonies.');
  if(!missing.length)return {data,added:0};

  const monday=addDays(today,(1-dow(asDay(today))+7)%7),secondFriday=addDays(monday,11);
  const build=(presetKey:ScrumPresetKey,title:string,startDate:string,startTime:string,duration:number,frequency:'day'|'week',interval:number,weekdays?:number[]):Omit<Meeting,'id'>=>({
    presetKey,title,recurrence:'custom',weekday:weekdays?.[0]??1,interval,nth:1,
    startDate,endDate:'',startTime,duration,allTeam:true,attendees:[],enabled:true,
    customRecurrence:{frequency,interval,endType:'never',...(weekdays?{weekdays:[...weekdays]}:{})},
  });
  const templates=[
    build('scrum-daily','Daily',today,'10:00',30,'day',1),
    build('scrum-refinement','Refinement',today,'14:00',60,'week',1,[2,4]),
    build('scrum-planning','Planning',monday,'11:00',60,'week',2,[1]),
    build('scrum-demo','Demo',secondFriday,'14:00',60,'week',2,[5]),
    build('scrum-retro','Retro',secondFriday,'16:00',60,'week',2,[5]),
  ];
  const selected=templates.filter(template=>missing.includes(template.presetKey!));
  if(selected.some(template=>!validDate(template.startDate)))throw new Error('The Scrum ceremony dates exceed the supported calendar range.');
  const identifiers=new Set(data.meetings.map(meeting=>meeting.id));
  const added=selected.map(template=>{
    const id=idFactory();
    if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||identifiers.has(id))throw new Error('Unable to create unique meeting identifiers. Please try again.');
    identifiers.add(id);return {...template,id};
  });
  return {data:{...data,meetings:[...data.meetings,...added]},added:added.length};
}
