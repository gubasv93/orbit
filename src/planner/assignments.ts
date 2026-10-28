import type {ProjectData} from '../lib/schema';
type Task=ProjectData['tasks'][number];
export function matchingAssignees(data:ProjectData,task:Task){return data.people.filter(person=>person.platform===task.platform&&(!task.roleId||person.roleId===task.roleId));}
export function assignTask(data:ProjectData,taskId:string,personId:string){
 const task=data.tasks.find(item=>item.id===taskId);
 if(!task||personId&&!matchingAssignees(data,task).some(person=>person.id===personId))return false;
 task.assignee=personId;return true;
}
