import {describe,it,expect} from 'vitest';
import {workspaceSchema} from '../src/lib/schema';
import {changeFeatureStatus,effectiveFeatureStatus,type FeatureStatus} from '../src/planner/feature-status';
import {createScheduler} from '../src/planner/engine.js';
import {fullWorkspace,projectData} from './fixtures';

const statuses:FeatureStatus[]=['planned','progress','hold','done'];

describe('independent work-item status',()=>{
  it.each(statuses)('round-trips an explicit %s status through workspace storage',status=>{
    const workspace=fullWorkspace(),feature=workspace.projects[0].data.features[0];
    feature.status=status;
    const restored=workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)));
    expect(restored).toEqual(workspace);
    expect(restored.projects[0].data.features[0].status).toBe(status);
  });

  it('accepts older workspaces without introducing an explicit status',()=>{
    const workspace=fullWorkspace(),restored=workspaceSchema.parse(JSON.parse(JSON.stringify(workspace)));
    expect(restored).toEqual(workspace);
    expect(restored.projects[0].data.features[0]).not.toHaveProperty('status');
  });

  it('rejects unsupported status values instead of silently dropping them',()=>{
    for(const status of ['risk','ok','paused','',null,0,true]){
      const workspace=fullWorkspace();
      const input={...workspace,projects:workspace.projects.map(project=>({...project,data:{...project.data,features:project.data.features.map(feature=>({...feature,status}))}}))};
      expect(workspaceSchema.safeParse(input).success).toBe(false);
    }
  });

  it.each(statuses)('changes only the parent metadata for %s without altering children or forecasts',status=>{
    const workspace=fullWorkspace(),data=workspace.projects[0].data,feature=data.features[0];
    Object.assign(feature,{effortOverride:12.5,manualEnd:'2026-11-12',manualEndFraction:.5});
    data.tasks[0].status='progress';data.tasks[1].status='hold';
    const before=structuredClone(workspace),scheduleBefore=createScheduler(data).calculate();
    expect(changeFeatureStatus(feature,status)).toBe(feature);
    before.projects[0].data.features[0].status=status;
    expect(workspace).toEqual(before);
    expect(createScheduler(data).calculate()).toEqual(scheduleBefore);
  });

  it('does not replace an explicitly chosen status when child statuses change',()=>{
    const data=projectData(),feature=data.features[0];changeFeatureStatus(feature,'planned');
    data.tasks[0].status='done';expect(effectiveFeatureStatus(feature,data.tasks)).toBe('planned');
    changeFeatureStatus(feature,'done');data.tasks[0].status='progress';
    expect(effectiveFeatureStatus(feature,data.tasks)).toBe('done');
  });

  it('keeps standalone work-item dates, estimate, assignee and forecast intact',()=>{
    const data=projectData(),feature=data.features[0];data.tasks=[];
    Object.assign(feature,{assignee:'u1',effortOverride:2.5,manualEnd:'2026-10-28',manualEndFraction:.5});
    const before=structuredClone(data),scheduleBefore=createScheduler(data).calculate();
    for(const status of statuses){
      changeFeatureStatus(feature,status);before.features[0].status=status;
      expect(data).toEqual(before);expect(createScheduler(data).calculate()).toEqual(scheduleBefore);
    }
  });

  it('leaves repeated selections unchanged',()=>{
    const data=projectData(),feature=data.features[0];feature.status='hold';
    const before=structuredClone(data);changeFeatureStatus(feature,'hold');expect(data).toEqual(before);
  });
});

describe('legacy work-item status',()=>{
  it.each([
    {children:[],expected:'planned'},
    {children:['planned'],expected:'planned'},
    {children:['progress','planned'],expected:'progress'},
    {children:['hold','progress'],expected:'progress'},
    {children:['hold','planned'],expected:'planned'},
    {children:['done','planned'],expected:'planned'},
    {children:['hold'],expected:'hold'},
    {children:['done','hold'],expected:'hold'},
    {children:['done','done'],expected:'done'},
  ] as {children:FeatureStatus[];expected:FeatureStatus}[])('derives $expected from $children without rewriting stored data',({children,expected})=>{
    const data=projectData(),feature=data.features[0];
    data.tasks=children.map((status,index)=>({...data.tasks[0],id:'t'+index,status}));
    const before=structuredClone(data);
    expect(effectiveFeatureStatus(feature,data.tasks)).toBe(expected);expect(data).toEqual(before);
  });

  it('ignores statuses belonging to other work items',()=>{
    const data=projectData(),feature=data.features[0];
    data.tasks.push({...data.tasks[0],id:'unrelated',featureId:'another',status:'progress'});
    expect(effectiveFeatureStatus(feature,data.tasks)).toBe('planned');
  });
});
