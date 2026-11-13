import {describe,expect,it} from 'vitest';
import {projectData,fullWorkspace} from './fixtures';
import {createScheduler} from '../src/planner/engine.js';
import {getItemDetails} from '../src/planner/item-details';
import {planningTasks,standaloneFeatureTask} from '../src/planner/standalone-features.js';
import {workspaceSchema} from '../src/lib/schema';
import {asDay,fromDay} from '../src/planner/dates.js';

function standalone(effort=2.5){
 const data=projectData();data.tasks=[];data.settings.autoShiftDependencies=false;
 Object.assign(data.features[0],{assignee:'u1',effortOverride:effort,start:'2026-11-16'});
 return data;
}

describe('work items planned without sub-items',()=>{
 it('reserves the assignee’s meetings and time off from a single work-item estimate',()=>{
  const data=standalone();
  data.meetings.push({id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-11-16',endDate:'',startTime:'10:00',duration:30,allTeam:true,attendees:[],enabled:true});
  data.leave.push({id:'away',person:'u1',type:'dayoff',from:'2026-11-17',to:'2026-11-17',note:''});
  const source=structuredClone(data),computed=createScheduler(data).calculate(),scheduled=computed.featureSchedules.f1;
  expect(scheduled.start).toBe(asDay('2026-11-16'));expect(fromDay(scheduled.end!)).toBe('2026-11-19');expect(scheduled.endFraction).toBe(1);
  expect(scheduled.alloc).toEqual({'2026-11-16':.9375,'2026-11-18':.9375,'2026-11-19':.625});
  expect(computed.featureInfo.f1).toMatchObject({standalone:true,blocked:false,activeCount:1,shortfall:0});
  const details=getItemDetails(data,computed,'feature','f1')!;
  expect(details).toMatchObject({state:'scheduled',estimate:2.5,knownEstimate:2.5,estimateUnit:'work days',estimateHours:20,start:'2026-11-16',end:'2026-11-19',calendarDays:4,meetingMinutes:90,meetingUnit:'minutes',forecastComplete:true});
  expect(details.meetings).toMatchObject([{id:'daily',minutes:90,attendeeOccurrences:3,dates:['2026-11-16','2026-11-18','2026-11-19']}]);
  expect(details.timeAway.find(part=>part.kind==='dayoff')).toMatchObject({days:1,unit:'calendar days'});
  expect(data).toEqual(source);expect(data.tasks).toEqual([]);
 });

 it('forecasts an unassigned work item in half days without reserving another person’s meetings',()=>{
  const data=standalone();data.features[0].assignee='';
  const computed=createScheduler(data).calculate(),schedule=computed.featureSchedules.f1;
  expect(fromDay(schedule.end!)).toBe('2026-11-18');expect(schedule.endFraction).toBe(.5);
  expect(Object.values(schedule.alloc).reduce((sum,value)=>sum+value,0)).toBe(2.5);
  expect(getItemDetails(data,computed,'feature','f1')).toMatchObject({calendarDays:2.5,meetingMinutes:0,estimate:2.5,estimateUnit:'work days',forecastComplete:true});
 });

 it('counts weekends, holidays and personal absences across the standalone calendar window',()=>{
  const data=standalone(2);data.features[0].start='2026-11-20';
  data.holidays.push({date:'2026-11-24',name:'Company holiday'});
  data.leave.push({id:'away',person:'u1',type:'dayoff',from:'2026-11-23',to:'2026-11-23',note:''});
  const computed=createScheduler(data).calculate(),detail=getItemDetails(data,computed,'feature','f1')!;
  expect(detail).toMatchObject({start:'2026-11-20',end:'2026-11-25',calendarDays:6,estimate:2});
  expect(detail.timeAway).toMatchObject([{kind:'weekends',days:2},{kind:'holidays',days:1},{kind:'vacation',days:0},{kind:'dayoff',days:1},{kind:'sick',days:0}]);
 });

 it('shares capacity warnings with ordinary sub-items and exposes real work-item references',()=>{
  const data=standalone(1),other={...data.features[0],id:'other',title:'Another epic',effortOverride:undefined,assignee:undefined};data.features.push(other);
  data.tasks.push({id:'real-task',featureId:'other',title:'Other person’s delivery',platform:'Backend',assignee:'u1',effort:1,start:'2026-11-16',status:'planned',dependsOn:[]});
  const computed=createScheduler(data).calculate();
  expect(computed.working.get('u1:2026-11-16')).toBe(2);expect(computed.conflicts['real-task']).toEqual(['2026-11-16']);expect(computed.featureConflicts.f1).toEqual(['2026-11-16']);
  const taskDetail=getItemDetails(data,computed,'task','real-task')!,featureDetail=getItemDetails(data,computed,'feature','f1')!;
  expect(taskDetail.conflicts.find(conflict=>conflict.kind==='capacity')).toMatchObject({relatedTask:{id:'f1',kind:'feature',title:'Accounts'}});
  expect(featureDetail.conflicts.find(conflict=>conflict.kind==='capacity')).toMatchObject({task:{id:'f1',kind:'feature'},relatedTask:{id:'real-task',kind:'task'}});
  expect(JSON.stringify([taskDetail.conflicts,featureDetail.conflicts])).not.toContain('feature:f1');
 });

 it('detects overlap between directly assigned work items without creating persisted sub-items',()=>{
  const data=standalone(1);data.features.push({...data.features[0],id:'f2',title:'Second work item'});
  const computed=createScheduler(data).calculate();
  expect(computed.featureConflicts).toEqual({f1:['2026-11-16'],f2:['2026-11-16']});expect(data.tasks).toHaveLength(0);
  expect(getItemDetails(data,computed,'feature','f1')!.conflicts[0]).toMatchObject({task:{kind:'feature',id:'f1'},relatedTask:{kind:'feature',id:'f2'}});
 });

 it('uses only real children once a work item has a breakdown, retaining its manual total',()=>{
  const data=standalone(10);data.tasks.push({id:'child',featureId:'f1',title:'Actual child',platform:'Backend',assignee:'u1',effort:1,start:'2026-11-16',status:'planned',dependsOn:[]});
  const computed=createScheduler(data).calculate();
  expect(standaloneFeatureTask(data,data.features[0])).toBeNull();expect(planningTasks(data)).toEqual(data.tasks);
  expect(computed.featureSchedules).toEqual({});expect(computed.working.get('u1:2026-11-16')).toBe(1);expect(computed.featureInfo.f1.end).toBe(asDay('2026-11-16'));
  expect(getItemDetails(data,computed,'feature','f1')).toMatchObject({estimate:10,knownEstimate:1,estimateUnit:'person-days'});
  data.tasks=[];expect(createScheduler(data).calculate().featureSchedules.f1).toBeDefined();
 });

 it('keeps manual date windows and reports estimates that do not fit',()=>{
  const data=standalone(3);Object.assign(data.features[0],{manualEnd:'2026-11-16',manualEndFraction:.5});
  const computed=createScheduler(data).calculate(),detail=getItemDetails(data,computed,'feature','f1')!;
  expect(computed.featureSchedules.f1).toMatchObject({start:asDay('2026-11-16'),end:asDay('2026-11-16'),endFraction:.5,manual:true,shortfall:2.5});
  expect(computed.featureInfo.f1).toMatchObject({standalone:true,manual:true,shortfall:2.5,atRisk:true});
  expect(detail).toMatchObject({estimate:3,calendarDays:.5,dateMode:'manual',forecastComplete:false});expect(detail.conflicts).toMatchObject([{kind:'shortfall',task:{id:'f1',kind:'feature'}}]);
 });

 it('requires an estimate to forecast an assigned work item and leaves empty work items unchanged',()=>{
  const data=standalone();delete data.features[0].effortOverride;
  const computed=createScheduler(data).calculate();expect(computed.featureInfo.f1).toMatchObject({standalone:true,needsEstimate:true,end:null});
  expect(getItemDetails(data,computed,'feature','f1')).toMatchObject({state:'unestimated',estimate:null,forecastComplete:false});
  delete data.features[0].assignee;expect(planningTasks(data)).toEqual([]);expect(createScheduler(data).calculate().featureSchedules).toEqual({});
 });

 it('preserves direct assignees in backups and rejects references outside the project team',()=>{
  const workspace=fullWorkspace(),feature=workspace.projects[0].data.features[0];feature.assignee='u1';
  expect(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).projects[0].data.features[0].assignee).toBe('u1');
  feature.assignee='someone-else';expect(workspaceSchema.safeParse(workspace).success).toBe(false);
  feature.assignee='';expect(workspaceSchema.safeParse(workspace).success).toBe(true);
  delete feature.assignee;expect(workspaceSchema.safeParse(workspace).success).toBe(true);
 });
});
