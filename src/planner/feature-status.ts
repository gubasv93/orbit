import type {ProjectData} from '../lib/schema';

type Feature=ProjectData['features'][number];
type Task=ProjectData['tasks'][number];
export type FeatureStatus=NonNullable<Feature['status']>;

/** Older work items keep their derived status until an explicit status is set. */
export function effectiveFeatureStatus(feature:Feature,children:readonly Task[]):FeatureStatus{
  if(feature.status!==undefined)return feature.status;
  const tasks=children.filter(task=>task.featureId===feature.id);
  if(tasks.length>0&&tasks.every(task=>task.status==='done'))return 'done';
  const unfinished=tasks.filter(task=>task.status!=='done');
  if(unfinished.length>0&&unfinished.every(task=>task.status==='hold'))return 'hold';
  if(tasks.some(task=>task.status==='progress'))return 'progress';
  return 'planned';
}

/** Work-item status is independent metadata; child work and its plan stay intact. */
export function changeFeatureStatus(feature:Feature,nextStatus:FeatureStatus):Feature{
  feature.status=nextStatus;
  return feature;
}
