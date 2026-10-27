import type {ProjectData} from '../lib/schema';

export type RoadmapMove = {
  kind: 'feature' | 'task'; id: string;
  targetKind: 'feature' | 'task'; targetId: string;
  placement: 'before' | 'after' | 'inside';
};

// Array order is persisted by the existing workspace snapshot. Moving a row never
// changes dates, estimates, ownership or dependency IDs.
export function moveRoadmapItem(data: ProjectData, move: RoadmapMove): boolean {
  const targetFeature = move.targetKind === 'feature' ? data.features.find(f => f.id === move.targetId) : undefined;
  const targetTask = move.targetKind === 'task' ? data.tasks.find(t => t.id === move.targetId) : undefined;
  if (!targetFeature && !targetTask) return false;
  if (move.kind === 'feature') {
    if (move.placement === 'inside') return false;
    const source = data.features.find(f => f.id === move.id);
    const targetId = targetFeature?.id ?? targetTask?.featureId;
    if (!source || source.id === targetId || !data.features.some(f => f.id === targetId)) return false;
    const reordered = data.features.filter(f => f.id !== source.id);
    const index = reordered.findIndex(f => f.id === targetId) + (move.placement === 'after' ? 1 : 0);
    reordered.splice(index, 0, source);
    if (reordered.every((f, i) => data.features[i] === f)) return false;
    data.features = reordered;
    return true;
  }
  const source = data.tasks.find(t => t.id === move.id);
  const parentId = targetFeature?.id ?? targetTask?.featureId;
  if (!source || source.id === targetTask?.id || !data.features.some(f => f.id === parentId)) return false;
  if ((move.placement === 'inside') !== !!targetFeature) return false;
  const reordered = data.tasks.filter(t => t.id !== source.id);
  let index: number;
  if (targetTask) index = reordered.findIndex(t => t.id === targetTask.id) + (move.placement === 'after' ? 1 : 0);
  else {
    let last = -1;
    reordered.forEach((t, i) => { if (t.featureId === parentId) last = i; });
    index = last < 0 ? reordered.length : last + 1;
  }
  reordered.splice(index, 0, source);
  const parent = data.features.find(f => f.id === parentId)!;
  if (source.featureId === parentId && reordered.every((t, i) => data.tasks[i] === t) && !parent.collapsed) return false;
  source.featureId = parentId!;
  parent.collapsed = false;
  data.tasks = reordered;
  return true;
}
