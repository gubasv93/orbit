import { it, expect } from 'vitest';
import { featureEffort } from '../src/planner/features';
import { fullWorkspace } from './fixtures';
import { workspaceSchema } from '../src/lib/schema';

it('totals every child estimate, including done work, without counting other epics', () => {
  const workspace=fullWorkspace(), data=workspace.projects[0].data, feature=data.features[0];
  data.tasks[0].status='done';data.tasks[0].remaining=0;
  data.tasks.push({...data.tasks[0],id:'other',featureId:'another-epic',effort:100});
  expect(featureEffort(feature,data.tasks)).toEqual({calculated:6,total:6,manual:false});
  data.tasks[1].effort=2.5;
  expect(featureEffort(feature,data.tasks).total).toBe(7.5);
});
it('keeps manual totals stable as work items change and supports returning to automatic', () => {
  const data=fullWorkspace().projects[0].data, feature=data.features[0];
  feature.effortOverride=13.5;data.tasks[0].effort=10;
  expect(featureEffort(feature,data.tasks)).toEqual({calculated:13,total:13.5,manual:true});
  feature.effortOverride=0;expect(featureEffort(feature,data.tasks).total).toBe(0);
  delete feature.effortOverride;expect(featureEffort(feature,data.tasks).total).toBe(13);
  expect(featureEffort(feature,[]).total).toBe(0);
});
it('preserves valid manual estimates in portable backups and rejects invalid estimates', () => {
  const workspace=fullWorkspace(), feature=workspace.projects[0].data.features[0];feature.effortOverride=13.5;
  expect(workspaceSchema.parse(JSON.parse(JSON.stringify(workspace))).projects[0].data.features[0].effortOverride).toBe(13.5);
  for(const value of [-1,Infinity,NaN,10_950_001]){feature.effortOverride=value;expect(workspaceSchema.safeParse(workspace).success).toBe(false);}
});
