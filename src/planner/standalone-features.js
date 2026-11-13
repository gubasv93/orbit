// A work item without a breakdown can reserve its assignee's working time.
// Projections are calculation-only; they are never written as sub-items.
export function standaloneFeatureTask(data,feature){
 if(!feature||data.tasks.some(task=>task.featureId===feature.id))return null;
 if(feature.effortOverride===undefined&&!feature.assignee)return null;
 const person=data.people.find(person=>person.id===feature.assignee);
 return {id:`feature:${feature.id}`,featureId:feature.id,standaloneFeatureId:feature.id,
  title:feature.title,description:feature.description||'',platform:person?.platform||'',
  assignee:feature.assignee||'',...(person?.roleId?{roleId:person.roleId}:{}),
  effort:feature.effortOverride??0,start:feature.start,status:'planned',dependsOn:[],
  ...(feature.manualEnd?{manualEnd:feature.manualEnd,manualEndFraction:feature.manualEndFraction??1}:{})};
}

export function planningTasks(data){
 const parents=new Set(data.tasks.map(task=>task.featureId));
 return [...data.tasks,...data.features.flatMap(feature=>{
  if(parents.has(feature.id))return [];
  const task=standaloneFeatureTask(data,feature);return task?[task]:[];
 })];
}
