import {describe,it,expect} from 'vitest';
import {buildStoryWorkItems,planStoryRoles} from '../src/planner/stories';
import {projectDataSchema} from '../src/lib/schema';
import {projectData} from './fixtures';

describe('sub-item descriptions',()=>{
 it('preserves multiline plain text on unassigned and role-specific sub-items and portable data',()=>{
  const data=projectData();data.tasks=[];
  const description='  Acceptance criteria\n<script>window.pwned=true</script> & <detail>\nKeep formatting.  ';
  const plain=buildStoryWorkItems('f1',{title:'A sub-item',description,start:'2026-11-16',teams:[]},data);
  const role=buildStoryWorkItems('f1',{title:'Role work',description,start:'2026-11-16',teams:[{roleId:data.roles[0].id,assignee:'',effort:.5}]},data);
  expect(plain[0].description).toBe(description);expect(role[0].description).toBe(description);
  data.tasks=[...plain,...role];expect(projectDataSchema.parse(JSON.parse(JSON.stringify(data))).tasks.map(task=>task.description)).toEqual([description,description]);
 });
 it('copies the source description to added roles while preserving the existing work item',()=>{
  const data=projectData(),source=data.tasks[0];source.description='Existing task details\nSecond line';
  data.roles.push({id:'review-role',name:'Reviewer',platform:'Review'});
  const before=structuredClone(source);
  const addition=planStoryRoles(source.id,{title:source.title,start:source.start,teams:[{roleId:'review-role',assignee:'',effort:0}]},data);
  expect(addition.items[0].description).toBe(source.description);expect(addition.updatedSource.description).toBe(source.description);expect(source).toEqual(before);
 });
 it('rejects oversized descriptions before creating role rows',()=>{
  const data=projectData(),before=structuredClone(data.tasks);
  expect(()=>buildStoryWorkItems('f1',{title:'Too long',description:'x'.repeat(10001),start:'2026-11-16',teams:[]},data)).toThrow();
  expect(data.tasks).toEqual(before);
 });
});
