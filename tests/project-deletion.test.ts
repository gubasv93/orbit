import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {emptyWorkspace,type Workspace} from '../src/lib/schema';
import {fullWorkspace} from './fixtures';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const projectTables=['projects','project_settings','roles','features','people','iterations','recurring_meetings','work_items','time_off','milestones','holidays','capacity_settings','dependencies','meeting_attendees','milestone_features'] as const;
let db:PGlite;

async function user(id:string|null){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 await db.exec(`set role ${id?'authenticated':'anon'}`);
}
async function load(){return (await db.query<{result:{revision:number;workspace:Workspace}}>('select public.orbit_get_workspace() as result')).rows[0].result;}
async function save(workspace:Workspace,revision:number){return (await db.query<{revision:number}>('select public.orbit_save_workspace($1::jsonb,$2) as revision',[JSON.stringify(workspace),revision])).rows[0].revision;}
async function workspaceId(){return (await db.query<{id:string}>('select id from public.orbit_workspaces')).rows[0].id;}
async function counts(workspace:string,project:string){
 const result:Record<string,number>={};
 for(const table of projectTables){
  // orbit_projects names its project key id; every child uses project_id.
  const key=table==='projects'?'id':'project_id';
  result[table]=(await db.query<{count:number}>(`select count(*)::int as count from public.orbit_${table} where workspace_id=$1 and ${key}=$2`,[workspace,project])).rows[0].count;
 }
 return result;
}
function twoProjects():Workspace{
 const workspace=fullWorkspace(),source=workspace.projects[0];
 source.id='source-project';source.name='Live source';source.data.tasks[0].description='Source work must remain untouched';
 const copied=structuredClone(source);
 copied.id='copy-project';copied.name='Copied team project';
 copied.data.meetings[0].copiedFromProjectId=source.id;
 copied.data.meetings[0].copiedFromMeetingId=source.data.meetings[0].id;
 // Identical person/role/task IDs are valid in different projects, including
 // imported backups. They must never become a shared deletion identity.
 workspace.projects.push(copied);workspace.activeId=copied.id;
 return workspace;
}

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(dir).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
});
beforeEach(async()=>{
 for(const id of [owner,other]){await user(id);const before=await load();await save(twoProjects(),before.revision);}
 await user(owner);
});
afterAll(async()=>{await db?.close();});

describe('project deletion through revision-safe workspace persistence',()=>{
 it('removes every project-owned planning row while preserving the live source and another account',async()=>{
  const initial=await load(),scope=await workspaceId();
  const sourceBefore=initial.workspace.projects[0],sourceCounts=await counts(scope,sourceBefore.id);
  expect(Object.values(await counts(scope,'copy-project')).every(count=>count>0)).toBe(true);
  await user(other);const otherBefore=await load();await user(owner);
  const workspace=structuredClone(initial.workspace);workspace.projects=workspace.projects.filter(project=>project.id!=='copy-project');workspace.activeId='source-project';
  const revision=await save(workspace,initial.revision),after=await load();
  expect(after.revision).toBe(revision);expect(after.workspace).toEqual(workspace);
  expect(after.workspace.projects[0]).toEqual(sourceBefore);
  expect(await counts(scope,'copy-project')).toEqual(Object.fromEntries(projectTables.map(table=>[table,0])));
  expect(await counts(scope,'source-project')).toEqual(sourceCounts);
  await user(other);expect(await load()).toEqual(otherBefore);
 });

 it('keeps an independent copied team and its recurring meetings when the source project is deleted',async()=>{
  const initial=await load(),scope=await workspaceId(),copyBefore=initial.workspace.projects[1];
  const workspace=structuredClone(initial.workspace);workspace.projects=workspace.projects.filter(project=>project.id!=='source-project');workspace.activeId='copy-project';
  await save(workspace,initial.revision);
  expect((await load()).workspace.projects).toEqual([copyBefore]);
  expect((await load()).workspace.projects[0].data.meetings[0].copiedFromProjectId).toBe('source-project');
  expect(await counts(scope,'source-project')).toEqual(Object.fromEntries(projectTables.map(table=>[table,0])));
  expect(Object.values(await counts(scope,'copy-project')).every(count=>count>0)).toBe(true);
 });

 it('rejects a stale deletion atomically and leaves newer project work intact',async()=>{
  const initial=await load(),updated=structuredClone(initial.workspace);
  updated.projects[1].data.tasks[0].title='A newer saved task';await save(updated,initial.revision);
  const beforeDelete=await load(),scope=await workspaceId(),beforeCounts=await counts(scope,'copy-project');
  const stale=structuredClone(initial.workspace);stale.projects=stale.projects.filter(project=>project.id!=='copy-project');stale.activeId='source-project';
  await expect(save(stale,initial.revision)).rejects.toMatchObject({code:'PT409'});
  expect(await load()).toEqual(beforeDelete);expect(await counts(scope,'copy-project')).toEqual(beforeCounts);
 });

 it('supports deleting the final project without deleting account ownership or another user’s same-ID projects',async()=>{
  const initial=await load(),scope=await workspaceId();await user(other);const otherBefore=await load();await user(owner);
  await save(emptyWorkspace(),initial.revision);
  expect((await load()).workspace).toEqual(emptyWorkspace());expect(await workspaceId()).toBe(scope);
  for(const project of initial.workspace.projects)expect(await counts(scope,project.id)).toEqual(Object.fromEntries(projectTables.map(table=>[table,0])));
  await user(other);expect(await load()).toEqual(otherBefore);
  await expect(db.query('delete from public.orbit_projects where workspace_id=$1',[scope])).rejects.toThrow(/permission denied/);
  expect((await db.query('select * from public.orbit_projects where workspace_id=$1',[scope])).rows).toEqual([]);
 });

 it('makes a deleted project’s poker invitation inaccessible without affecting another project’s room',async()=>{
  const initial=await load(),token='a'.repeat(64),sourceToken='b'.repeat(64);
  for(const [projectId,roomToken] of [['copy-project',token],['source-project',sourceToken]])await db.query('select public.orbit_poker($1,$2,$3,$4::jsonb)',['create',roomToken,'',JSON.stringify({projectId,name:'Deletion check',deck:['1','2','3']})]);
  const workspace=structuredClone(initial.workspace);workspace.projects=workspace.projects.filter(project=>project.id!=='copy-project');workspace.activeId='source-project';
  await save(workspace,initial.revision);
  await expect(db.query('select public.orbit_poker_room_state($1,$2,$3::jsonb)',[token,'','{}'])).rejects.toMatchObject({code:'PT404'});
  const sourceRoom=await db.query<{result:{room:{projectId:string;closed:boolean}}}>('select public.orbit_poker_room_state($1,$2,$3::jsonb) as result',[sourceToken,'','{}']);
  expect(sourceRoom.rows[0].result.room).toMatchObject({projectId:'source-project',closed:false});
  await user(null);await expect(db.query('select public.orbit_poker_room_state($1,$2,$3::jsonb)',[token,'','{}'])).rejects.toMatchObject({code:'PT404'});
 });
});
