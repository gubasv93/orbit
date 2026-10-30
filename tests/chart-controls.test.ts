import {it,expect} from 'vitest';
import {projectData,fullWorkspace} from './fixtures';
import {createScheduler} from '../src/planner/engine.js';
import {calendarSpan,halfDay,validEffort} from '../src/planner/precision.js';
import {taskTimeBreakdown,featureTimeBreakdown,capacityGradient,timeCategories} from '../src/planner/timeline';
import {matchingAssignees,assignTask} from '../src/planner/assignments';
import {timelineWindow,focusOffset,slideTimeline,firstTimelineDay,lastTimelineDay} from '../src/planner/viewport';
import {asDay,fromDay} from '../src/planner/dates.js';
import {workspaceSchema} from '../src/lib/schema';
const meeting={id:'mt',title:'Planning',recurrence:'workdays' as const,weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:120,allTeam:true,attendees:[],enabled:true};

it('renders half-day work and its epic as half a calendar day, with no unused category',()=>{
 const data=projectData();data.tasks[0].effort=.5;const engine=createScheduler(data),result=engine.calculate(),info=result.schedule.t1;
 expect(info.endFraction).toBe(.5);expect(calendarSpan(info)).toBe(.5);expect(info.end).toBe(info.start);
 const breakdown=taskTimeBreakdown(data.tasks[0],info,data,engine)!;
 expect(breakdown.days).toBe(.5);expect(breakdown.totals.development).toBe(.5);
 expect(capacityGradient(breakdown)).toBe('linear-gradient(90deg,#2e5cff 0.00000% 100.00000%)');
 expect(timeCategories.map(([key])=>key)).not.toContain('available');
 const parent=result.featureInfo.f1;expect(calendarSpan(parent)).toBe(.5);
 expect(featureTimeBreakdown(parent.start,parent.end!,[breakdown],parent.endFraction)!.days).toBe(.5);
});
it('rounds the combined quarter-day meeting time once while retaining exact daily availability',()=>{
 const data=projectData();data.tasks[0].effort=.5;data.meetings=[{...meeting,duration:60},{...meeting,id:'second',startTime:'11:00',duration:60}];
 const engine=createScheduler(data),info=engine.calculate().schedule.t1;
 expect(engine.meetingMinutes('u1','2026-10-26')).toBe(120);expect(engine.meetingDays('u1','2026-10-26')).toBe(.25);
 expect(calendarSpan(info)).toBe(1);expect(info.alloc['2026-10-26']).toBe(.5);
 expect(taskTimeBreakdown(data.tasks[0],info,data,engine)!.totals).toMatchObject({development:.5,meetings:.5});
 expect(data.meetings.map(m=>m.duration)).toEqual([60,60]);
});
it('unions meeting overlaps before calculating exact availability',()=>{
 const data=projectData();data.meetings=[{...meeting,duration:180},{...meeting,id:'overlap',startTime:'10:00',duration:120}];
 let engine=createScheduler(data);expect(engine.meetingMinutes('u1','2026-10-26')).toBe(180);expect(engine.meetingDays('u1','2026-10-26')).toBe(.375);
 data.meetings[0].duration=270;engine=createScheduler(data);expect(engine.meetingDays('u1','2026-10-26')).toBe(.5625);
});
it('retains weekends and half a final workday in a 1.5-day estimate starting Friday',()=>{
 const data=projectData();data.tasks[0].start='2026-10-30';data.tasks[0].effort=1.5;
 const engine=createScheduler(data),info=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],info,data,engine)!;
 expect(fromDay(info.end!)).toBe('2026-11-02');expect(info.endFraction).toBe(.5);expect(b.days).toBe(3.5);expect(b.totals.weekends).toBe(2);expect(b.totals.development).toBe(1.5);
});
it('fills deliberate manual windows with accounted-time colors without inventing work',()=>{
 const data=projectData();data.tasks[0].effort=.5;data.tasks[0].manualEnd='2026-10-28';
 const engine=createScheduler(data),info=engine.calculate().schedule.t1,b=taskTimeBreakdown(data.tasks[0],info,data,engine)!;
 expect(calendarSpan(info)).toBe(3);expect(b.totals.development).toBe(.5);expect(b.totals).not.toHaveProperty('available');expect(capacityGradient(b)).toBe('linear-gradient(90deg,#2e5cff 0.00000% 100.00000%)');
});
it('loads legacy fractional estimates without silently rewriting them',()=>{
 const w=fullWorkspace();w.projects[0].data.tasks[0].effort=.25;const parsed=workspaceSchema.parse(w),data=parsed.projects[0].data;
 const engine=createScheduler(data),info=engine.calculate().schedule.t1;
 expect(Object.values(info.alloc).reduce((sum,value)=>sum+value,0)).toBe(.5);expect(data.tasks[0].effort).toBe(.25);
});
it('accepts half-day steps and does not round new invalid inputs silently',()=>{
 for(const value of [.5,1,1.5,3650])expect(validEffort(value)).toBe(true);
 for(const value of [0,.1,.25,.75,NaN,Infinity,3650.5])expect(validEffort(value)).toBe(false);
 expect(validEffort(0,true)).toBe(true);expect(halfDay(.25)).toBe(.5);expect(halfDay(.5)).toBe(.5);expect(halfDay(.501)).toBe(1);
});
it('changes inline assignees only to members matching the exact role, with atomic rejection',()=>{
 const data=projectData();data.tasks[0].roleId='r1';data.roles.push({id:'review',name:'Reviewer',platform:'Backend'});
 data.people.push({...data.people[0],id:'u2',name:'Casey'}, {...data.people[0],id:'wrong',roleId:'review',role:'Reviewer'});
 expect(matchingAssignees(data,data.tasks[0]).map(p=>p.id)).toEqual(['u1','u2']);const original=structuredClone(data);
 expect(assignTask(data,'t1','wrong')).toBe(false);expect(assignTask(data,'missing','u1')).toBe(false);expect(data).toEqual(original);
 expect(assignTask(data,'t1','u2')).toBe(true);expect(data.tasks[0].assignee).toBe('u2');expect(assignTask(data,'t1','')).toBe(true);
});
it('reforecasts for the selected person’s leave without changing task dates, estimates or dependencies',()=>{
 const data=projectData();data.people.push({...data.people[0],id:'u2'});data.leave.push({id:'l',person:'u2',type:'sick',from:'2026-10-26',to:'2026-10-26',note:''});
 const before=structuredClone(data.tasks[0]),old=createScheduler(data).calculate().schedule.t1;
 assignTask(data,'t1','u2');const changed=createScheduler(data).calculate().schedule.t1;
 expect(changed.start).toBe(old.start!+1);expect({...data.tasks[0],assignee:before.assignee}).toEqual(before);
});
it('opens every scale with past and future dates and a visible Today focus',()=>{
 for(const [days,cell]of [[91,38],[224,14],[640,5],[1150,2.2],[2192,1.05]])for(const width of [180,900,4000]){
  const window=timelineWindow('2026-10-28',days,cell,width),start=asDay(window.rangeStart),focus=asDay('2026-10-28');
  expect(start).toBeLessThan(focus);expect(start+window.days).toBeGreaterThan(focus);expect(window.days*cell).toBeGreaterThan(width*2);
  expect((focus-start)*cell-focusOffset('2026-10-28',window.rangeStart,cell,width)).toBeCloseTo(width*.25);
 }
});
it('slides in both directions without changing screen dates or increasing the canvas length',()=>{
 const window=timelineWindow('2026-10-28',91,38,900),before=asDay(window.rangeStart),left=slideTimeline(window.rangeStart,window.days,38,0,900)!;
 expect(asDay(left.rangeStart)).toBeLessThan(before);expect(asDay(left.rangeStart)+left.left/38).toBe(before);
 const max=window.days*38-900,right=slideTimeline(window.rangeStart,window.days,38,max,900)!;
 expect(asDay(right.rangeStart)).toBeGreaterThan(before);expect(asDay(right.rangeStart)+right.left/38).toBeCloseTo(before+max/38);
 expect(slideTimeline(window.rangeStart,window.days,38,max/2,900)).toBeNull();
});
it('stops at supported calendar bounds and supports wide screens without a dead scroll edge',()=>{
 const low=timelineWindow('2000-01-01',91,38,900),high=timelineWindow('2200-12-31',91,38,900);
 expect(asDay(low.rangeStart)).toBe(firstTimelineDay);expect(asDay(high.rangeStart)+high.days-1).toBe(lastTimelineDay);
 expect(slideTimeline(low.rangeStart,low.days,38,0,900)).toBeNull();expect(slideTimeline(high.rangeStart,high.days,38,high.days*38-900,900)).toBeNull();
});

it('assigns a title-only sub-item by filling its real platform and role atomically',()=>{
 const data=projectData(),task=data.tasks[0];Object.assign(task,{platform:'',assignee:'',effort:0});delete task.roleId;
 expect(matchingAssignees(data,task).map(p=>p.id)).toEqual(['u1']);const before=structuredClone(task);expect(assignTask(data,task.id,'missing')).toBe(false);expect(task).toEqual(before);
 expect(assignTask(data,task.id,'u1')).toBe(true);expect(task).toMatchObject({assignee:'u1',platform:'Backend',roleId:'r1',effort:0});
});
