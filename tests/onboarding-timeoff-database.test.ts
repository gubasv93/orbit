import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import type {Workspace} from '../src/lib/schema';
import {fullWorkspace} from './fixtures';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const version='20261101000200';
let db:PGlite,cutover:string;
async function user(id:string|null){
 await db.exec('reset role');
 await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 await db.exec(`set role ${id?'authenticated':'anon'}`);
}
async function load(){return (await db.query<{result:{revision:number;workspace:Workspace}}>('select public.orbit_get_workspace() as result')).rows[0].result;}
async function save(workspace:Workspace,revision:number){return (await db.query<{revision:number}>('select public.orbit_save_workspace($1::jsonb,$2) as revision',[JSON.stringify(workspace),revision])).rows[0].revision;}

beforeAll(async()=>{
 db=new PGlite();
 await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;grant usage on schema auth to anon,authenticated;
 create table auth.users(id uuid primary key,created_at timestamptz default '2026-01-01T00:00:00Z');insert into auth.users(id) values('${owner}'),('${other}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const file of readdirSync(directory).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort()){
  const source=readFileSync(new URL(file,directory),'utf8');
  if(file.startsWith(version+'_'))cutover=source;else await db.exec(source);
 }
});
afterAll(async()=>{await db?.close();});

describe('optional onboarding time-off step storage',()=>{
 it('widens only the existing setup constraint while preserving completed, team and meeting projects',async()=>{
  await user(owner);const workspace=fullWorkspace();
  workspace.projects[0].onboardingStep=0;
  for(const step of [1,2]){const copy=structuredClone(workspace.projects[0]);copy.id='in-progress-'+step;copy.onboardingStep=step;workspace.projects.push(copy);}
  const initial=await load();await save(workspace,initial.revision);const before=await load();
  await user(other);const privateWorkspace=fullWorkspace();privateWorkspace.projects[0].name='Other account';const otherInitial=await load();await save(privateWorkspace,otherInitial.revision);const otherBefore=await load();
  await db.exec('reset role');await db.exec(cutover);
  const constraint=(await db.query<{definition:string}>(`select pg_get_constraintdef(oid) as definition from pg_constraint where conrelid='public.orbit_projects'::regclass and conname='orbit_projects_onboarding_step_check'`)).rows[0].definition;
  expect(constraint).toContain('<= 3');
  await user(owner);expect(await load()).toEqual(before);
  await user(other);expect(await load()).toEqual(otherBefore);
 });

 it('round-trips step 3 and its inclusive absences through the existing normalized workspace RPC',async()=>{
  await user(owner);const before=await load(),workspace=structuredClone(before.workspace);
  workspace.projects[0].onboardingStep=3;
  workspace.projects[0].data.leave=[
   {id:'onboarding-vacation',person:'u1',type:'vacation',from:'2026-11-02',to:'2026-11-04',note:'Planned break'},
   {id:'onboarding-dayoff',person:'u1',type:'dayoff',from:'2026-11-05',to:'2026-11-05',note:''},
   {id:'onboarding-sick',person:'u1',type:'sick',from:'2026-11-06',to:'2026-11-06',note:''},
  ];
  const revision=await save(workspace,before.revision),after=await load();
  expect(after).toEqual({revision,workspace});
  const saved=await db.query<{document:unknown}>('select document from public.orbit_time_off where project_id=$1 order by position',[workspace.projects[0].id]);
  expect(saved.rows.map(row=>row.document)).toEqual(workspace.projects[0].data.leave);
 });

 it('rejects unsupported steps and stale writes atomically without losing time off or another account',async()=>{
  await user(other);const otherBefore=await load();await user(owner);const before=await load();
  for(const step of [-1,4]){const invalid=structuredClone(before.workspace);invalid.projects[0].onboardingStep=step;await expect(save(invalid,before.revision)).rejects.toThrow(/check constraint/);expect(await load()).toEqual(before);}
  await expect(save(before.workspace,before.revision-1)).rejects.toMatchObject({code:'PT409'});expect(await load()).toEqual(before);
  await user(other);expect(await load()).toEqual(otherBefore);
 });

 it('finishes the wizard with its absences intact and keeps ordinary users from writing the project table directly',async()=>{
  await user(owner);const before=await load(),workspace=structuredClone(before.workspace),leave=workspace.projects[0].data.leave;
  workspace.projects[0].onboardingStep=0;await save(workspace,before.revision);const after=await load();
  expect(after.workspace.projects[0].onboardingStep).toBe(0);expect(after.workspace.projects[0].data.leave).toEqual(leave);
  await expect(db.exec('update public.orbit_projects set onboarding_step=3')).rejects.toThrow(/permission denied/);
  await user(null);await expect(load()).rejects.toThrow(/permission denied/);
 });
});
