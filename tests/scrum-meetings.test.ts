import {describe,expect,it} from 'vitest';
import {addScrumMeetings} from '../src/planner/scrum-meetings';
import {createScheduler} from '../src/planner/engine.js';
import {projectDataSchema,type ProjectData} from '../src/lib/schema';
import {projectData} from './fixtures';

const ids=()=>{let index=0;return()=> 'scrum-'+(++index);};
const manual=(id='manual'):ProjectData['meetings'][number]=>({id,title:'Daily',recurrence:'weekly',weekday:3,interval:1,nth:1,startDate:'2026-11-12',endDate:'',startTime:'09:00',duration:30,allTeam:true,attendees:[],enabled:false});
const week=(start:string,end:string)=>({id:'week',name:'Week',start,end,overrides:{}});

describe('default Scrum ceremony schedules',()=>{
  it('adds five ordinary editable ceremonies with the requested times and one shared two-week sprint cycle',()=>{
    const original=projectData(),before=structuredClone(original),result=addScrumMeetings(original,'2026-11-12',ids());
    expect(result.added).toBe(5);expect(original).toEqual(before);
    expect(result.data.meetings).toMatchObject([
      {presetKey:'scrum-daily',title:'Daily',startDate:'2026-11-12',startTime:'10:00',duration:30,customRecurrence:{frequency:'day',interval:1,endType:'never'}},
      {presetKey:'scrum-refinement',title:'Refinement',startDate:'2026-11-12',startTime:'14:00',duration:60,customRecurrence:{frequency:'week',interval:1,weekdays:[2,4],endType:'never'}},
      {presetKey:'scrum-planning',title:'Planning',startDate:'2026-11-16',startTime:'11:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[1],endType:'never'}},
      {presetKey:'scrum-demo',title:'Demo',startDate:'2026-11-27',startTime:'14:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[5],endType:'never'}},
      {presetKey:'scrum-retro',title:'Retro',startDate:'2026-11-27',startTime:'16:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[5],endType:'never'}},
    ]);
    expect(result.data.meetings.every(meeting=>meeting.enabled&&meeting.allTeam&&meeting.attendees.length===0&&meeting.endDate==='')).toBe(true);
    expect(new Set(result.data.meetings.map(meeting=>meeting.id)).size).toBe(5);
    expect(projectDataSchema.parse(result.data)).toEqual(result.data);
  });

  it('uses today when it is Monday and the next Monday when the button is used on a weekend',()=>{
    for(const date of ['2026-11-16','2026-11-14','2026-11-15']){
      const result=addScrumMeetings(projectData(),date,ids()).data;
      expect(result.meetings.find(meeting=>meeting.presetKey==='scrum-planning')?.startDate).toBe('2026-11-16');
      expect(result.meetings.find(meeting=>meeting.presetKey==='scrum-retro')?.startDate).toBe('2026-11-27');
    }
  });

  it('keeps user changes and manual meetings intact on repeated clicks, while restoring a deleted ceremony',()=>{
    const original=projectData();original.meetings=[manual()];
    const first=addScrumMeetings(original,'2026-11-12',ids()).data;
    const daily=first.meetings.find(meeting=>meeting.presetKey==='scrum-daily')!;daily.title='Our short daily';daily.duration=15;daily.startTime='10:45';daily.enabled=false;
    const before=structuredClone(first),repeat=addScrumMeetings(first,'2026-12-07',()=>{throw new Error('No new identifiers should be needed.');});
    expect(repeat.added).toBe(0);expect(repeat.data).toBe(first);expect(first).toEqual(before);
    expect(first.meetings[0]).toEqual(manual());
    const removed={...first,meetings:first.meetings.filter(meeting=>meeting.presetKey!=='scrum-retro')};
    const restored=addScrumMeetings(removed,'2026-12-07',()=> 'restored-retro');
    expect(restored.added).toBe(1);expect(restored.data.meetings).toHaveLength(6);
    expect(restored.data.meetings.find(meeting=>meeting.presetKey==='scrum-daily')).toEqual(daily);
    expect(restored.data.meetings.at(-1)).toMatchObject({id:'restored-retro',presetKey:'scrum-retro',startDate:'2026-12-18'});
  });

  it('reserves 330 working minutes in the first sprint week and 390 in the second, with no weekend charge',()=>{
    const data=addScrumMeetings(projectData(),'2026-11-12',ids()).data,scheduler=createScheduler(data);
    expect(scheduler.meetingOccurs(data.meetings.find(meeting=>meeting.presetKey==='scrum-daily')!,'2026-11-21')).toBe(true);
    expect(scheduler.meetingHoursInIteration('u1',week('2026-11-16','2026-11-22'))).toBe(5.5);
    expect(scheduler.meetingHoursInIteration('u1',week('2026-11-23','2026-11-29'))).toBe(6.5);
    expect(scheduler.meetingMinutes('u1','2026-11-16')).toBe(90);
    expect(scheduler.meetingMinutes('u1','2026-11-27')).toBe(150);
    expect(scheduler.meetingMinutes('u1','2026-11-20')).toBe(30);
  });

  it('merges overlaps with existing meetings instead of double counting their minutes',()=>{
    const data=addScrumMeetings(projectData(),'2026-11-12',ids()).data;
    data.meetings.push({...manual(),enabled:true,startTime:'10:15'});
    const scheduler=createScheduler(data);
    expect(scheduler.meetingMinutes('u1','2026-11-18')).toBe(45);
    expect(scheduler.meetingHoursInIteration('u1',week('2026-11-16','2026-11-22'))).toBe(5.75);
  });

  it('rejects overflow, invalid start dates and duplicate IDs without partially changing the project',()=>{
    const full=projectData();full.meetings=Array.from({length:996},(_,index)=>manual('existing-'+index));const before=structuredClone(full);
    expect(()=>addScrumMeetings(full,'2026-11-12',ids())).toThrow('1,000');expect(full).toEqual(before);
    for(const date of ['2026-02-31','1999-12-31','2200-12-31'])expect(()=>addScrumMeetings(projectData(),date,ids())).toThrow();
    const data=projectData();data.meetings=[manual('duplicate')];expect(()=>addScrumMeetings(data,'2026-11-12',()=> 'duplicate')).toThrow('unique');expect(data.meetings).toEqual([manual('duplicate')]);
    const fits=projectData();fits.meetings=Array.from({length:995},(_,index)=>manual('existing-'+index));expect(addScrumMeetings(fits,'2026-11-12',ids()).data.meetings).toHaveLength(1000);
  });
});
