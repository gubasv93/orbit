import type {ProjectData} from '../lib/schema';

export type RoadmapSelection={featureIds:readonly string[];taskIds:readonly string[]};

/** Parent selection includes every child, independent of filters or collapse. */
export function roadmapDeletionPlan(data:ProjectData,selection:RoadmapSelection){
 const featureIds=new Set(selection.featureIds),taskIds=new Set(selection.taskIds);
 const features=data.features.filter(f=>featureIds.has(f.id));
 const tasks=data.tasks.filter(t=>taskIds.has(t.id)||featureIds.has(t.featureId));
 return {features,tasks,total:features.length+tasks.length};
}

/** Remove the complete selection in one save, keeping references valid. */
export function deleteRoadmapItems(data:ProjectData,selection:RoadmapSelection){
 const plan=roadmapDeletionPlan(data,selection);if(!plan.total)return plan;
 const features=new Set(plan.features.map(f=>f.id)),tasks=new Set(plan.tasks.map(t=>t.id));
 data.features=data.features.filter(f=>!features.has(f.id));
 data.tasks=data.tasks.filter(t=>!tasks.has(t.id)).map(t=>t.dependsOn.some(id=>tasks.has(id))?{...t,dependsOn:t.dependsOn.filter(id=>!tasks.has(id))}:t);
 data.milestones=data.milestones.map(m=>m.featureIds.some(id=>features.has(id))?{...m,featureIds:m.featureIds.filter(id=>!features.has(id))}:m);
 return plan;
}
