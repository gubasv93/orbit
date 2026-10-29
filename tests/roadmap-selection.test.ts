import {it,expect} from 'vitest';
import {fullWorkspace} from './fixtures';
import {workspaceSchema} from '../src/lib/schema';
import {roadmapDeletionPlan,deleteRoadmapItems} from '../src/planner/roadmap-selection';

function roadmap(){
 const workspace=fullWorkspace(),data=workspace.projects[0].data;
 data.features.push({...data.features[0],id:'other',title:'Other epic',collapsed:true},{...data.features[0],id:'empty',title:'Empty epic'});
 data.tasks.push({...data.tasks[0],id:'external',featureId:'other',dependsOn:['t1','t3'],storyId:'story-external'});
 data.milestones[0].featureIds.push('other');return {workspace,data};
}
it('previews the exact parent-and-child union without mutating, duplicating or depending on collapse',()=>{
 const {data}=roadmap();data.features[0].collapsed=true;data.tasks[1].status='hold';data.tasks[2].status='done';
 const before=structuredClone(data),plan=roadmapDeletionPlan(data,{featureIds:['f1','f1','empty'],taskIds:['t1','t1','external','missing']});
 expect(plan.features.map(f=>f.id)).toEqual(['f1','empty']);expect(plan.tasks.map(t=>t.id)).toEqual(['t1','t2','t3','external']);expect(plan.total).toBe(6);expect(data).toEqual(before);
});
it('deletes only selected work items and removes incoming references while preserving their epic and all other work',()=>{
 const {workspace,data}=roadmap(),before=structuredClone(data),result=deleteRoadmapItems(data,{featureIds:[],taskIds:['t1','t2']});
 expect(result.total).toBe(2);expect(data.features).toEqual(before.features);expect(data.milestones).toEqual(before.milestones);
 expect(data.tasks).toEqual([before.tasks[2],{...before.tasks[3],dependsOn:['t3']}]);
 expect({...data,features:before.features,tasks:before.tasks,milestones:before.milestones}).toEqual(before);expect(workspaceSchema.parse(workspace)).toEqual(workspace);
});
it('deletes every child of selected epics and cleans dependencies and milestone links without affecting other projects',()=>{
 const {workspace,data}=roadmap();workspace.projects.push({...structuredClone(workspace.projects[0]),id:'unrelated'});const other=structuredClone(workspace.projects[1]),before=structuredClone(data);
 deleteRoadmapItems(data,{featureIds:['f1','empty'],taskIds:['t2']});
 expect(data.features).toEqual([before.features[1]]);expect(data.tasks).toEqual([{...before.tasks[3],dependsOn:[]}]);expect(data.milestones[0].featureIds).toEqual(['other']);expect(workspace.projects[1]).toEqual(other);expect(workspaceSchema.parse(workspace)).toEqual(workspace);
});
it('keeps the project, meetings, people and calendar when all roadmap items are removed',()=>{
 const {workspace,data}=roadmap(),before=structuredClone(data);deleteRoadmapItems(data,{featureIds:data.features.map(f=>f.id),taskIds:data.tasks.map(t=>t.id)});
 expect(data.features).toEqual([]);expect(data.tasks).toEqual([]);expect(data.milestones).toEqual(before.milestones.map(m=>({...m,featureIds:[]})));expect({...data,features:before.features,tasks:before.tasks,milestones:before.milestones}).toEqual(before);expect(workspaceSchema.parse(workspace)).toEqual(workspace);
});
it('ignores stale IDs and distinguishes task IDs from identical feature IDs',()=>{
 const {data}=roadmap(),before=structuredClone(data);expect(deleteRoadmapItems(data,{featureIds:['missing'],taskIds:['gone']}).total).toBe(0);expect(data).toEqual(before);
 data.tasks.push({...data.tasks[0],id:'f1'});deleteRoadmapItems(data,{featureIds:[],taskIds:['f1']});expect(data.features).toEqual(before.features);expect(data.tasks).toEqual(before.tasks);expect(data.milestones).toEqual(before.milestones);
});
