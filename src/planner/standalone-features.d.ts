import type {ProjectData} from '../lib/schema';
export type PlanningTask=ProjectData['tasks'][number]&{standaloneFeatureId?:string};
export function standaloneFeatureTask(data:ProjectData,feature:ProjectData['features'][number]):PlanningTask|null;
export function planningTasks(data:ProjectData):PlanningTask[];
