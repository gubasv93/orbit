import {it,expect} from 'vitest';
import {projectData,fullWorkspace} from './fixtures';
import {moveRoadmapItem} from '../src/planner/roadmap-order';
import {createScheduler} from '../src/planner/engine.js';
import {featureEffort} from '../src/planner/features';
import {workspaceSchema} from '../src/lib/schema';

function roadmap(){
 const data=projectData();data.settings.autoShiftDependencies=false;
 data.features.push({...data.features[0],id:'f2',title:'Second epic',collapsed:true},{...data.features[0],id:'f3',title:'Empty epic'});
 data.tasks.push({...data.tasks[0],id:'t2',effort:2,dependsOn:['t1'],manualEnd:'2026-10-29'}, {...data.tasks[0],id:'t3',featureId:'f2',effort:1});
 return data;
}
it('reorders entire epics while preserving all work-item data and forecasts',()=>{
 const data=roadmap(),tasks=structuredClone(data.tasks),before=createScheduler(data).calculate().schedule;
 expect(moveRoadmapItem(data,{kind:'feature',id:'f1',targetKind:'task',targetId:'t3',placement:'after'})).toBe(true);
 expect(data.features.map(f=>f.id)).toEqual(['f2','f1','f3']);expect(data.tasks).toEqual(tasks);
 expect(createScheduler(data).calculate().schedule).toEqual(before);
});
it('reorders children before and after siblings, including completed and paused rows',()=>{
 const data=roadmap();data.tasks[0].status='done';data.tasks[1].status='hold';
 expect(moveRoadmapItem(data,{kind:'task',id:'t1',targetKind:'task',targetId:'t2',placement:'after'})).toBe(true);
 expect(data.tasks.filter(t=>t.featureId==='f1').map(t=>t.id)).toEqual(['t2','t1']);
 expect(moveRoadmapItem(data,{kind:'task',id:'t1',targetKind:'task',targetId:'t2',placement:'before'})).toBe(true);
 expect(data.tasks.filter(t=>t.featureId==='f1').map(t=>t.id)).toEqual(['t1','t2']);
});
it('reparents children and expands the destination without changing dates, links or estimates',()=>{
 const data=roadmap(),original=structuredClone(data.tasks[1]),schedule=createScheduler(data).calculate().schedule;
 expect(moveRoadmapItem(data,{kind:'task',id:'t2',targetKind:'feature',targetId:'f2',placement:'inside'})).toBe(true);
 expect(data.tasks.find(t=>t.id==='t2')).toEqual({...original,featureId:'f2'});expect(data.features[1].collapsed).toBe(false);
 expect(data.tasks.filter(t=>t.featureId==='f2').map(t=>t.id)).toEqual(['t3','t2']);
 expect(featureEffort(data.features[0],data.tasks).total).toBe(3);expect(featureEffort(data.features[1],data.tasks).total).toBe(3);
 expect(createScheduler(data).calculate().schedule).toEqual(schedule);
});
it('reparents before a target child and supports an empty epic while retaining the old epic',()=>{
 const data=roadmap();moveRoadmapItem(data,{kind:'task',id:'t1',targetKind:'task',targetId:'t3',placement:'before'});
 expect(data.tasks.filter(t=>t.featureId==='f2').map(t=>t.id)).toEqual(['t1','t3']);
 moveRoadmapItem(data,{kind:'task',id:'t2',targetKind:'feature',targetId:'f3',placement:'inside'});
 expect(data.features.map(f=>f.id)).toEqual(['f1','f2','f3']);expect(data.tasks.filter(t=>t.featureId==='f1')).toEqual([]);
});
it('leaves the snapshot untouched for invalid moves and does not nest epics',()=>{
 const data=roadmap(),original=structuredClone(data);
 for(const move of [
  {kind:'task',id:'t1',targetKind:'feature',targetId:'missing',placement:'inside'},
  {kind:'task',id:'missing',targetKind:'task',targetId:'t1',placement:'before'},
  {kind:'task',id:'t1',targetKind:'task',targetId:'t1',placement:'after'},
  {kind:'feature',id:'f1',targetKind:'feature',targetId:'f2',placement:'inside'},
  {kind:'task',id:'t1',targetKind:'task',targetId:'t2',placement:'inside'},
 ] as const)expect(moveRoadmapItem(data,move)).toBe(false);
 expect(data).toEqual(original);
});
it('retains parent references, visual order and archived capacity in portable backups',()=>{
 const w=fullWorkspace();w.projects[0].data=roadmap();moveRoadmapItem(w.projects[0].data,{kind:'task',id:'t2',targetKind:'feature',targetId:'f3',placement:'inside'});
 expect(workspaceSchema.parse(JSON.parse(JSON.stringify(w)))).toEqual(w);
});
