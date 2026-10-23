import type { ProjectData } from '../lib/schema';

export function featureEffort(feature: ProjectData['features'][number], tasks: ProjectData['tasks']) {
  const calculated = Math.round(tasks.filter(task => task.featureId === feature.id)
    .reduce((sum, task) => sum + task.effort, 0) * 1_000_000) / 1_000_000;
  return { calculated, total: feature.effortOverride ?? calculated, manual: feature.effortOverride !== undefined };
}
