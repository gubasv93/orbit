import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {fullWorkspace} from './fixtures';
import type {Workspace} from '../src/lib/schema';

type Inventory={projects:number;features:number;stories:number;workItems:number;people:number;roles:number;platforms:number;pokerGames:number;meetings:number;holidays:number;timeOff:number;milestones:number};
type User={id:string;email:string;firstName:string;deletedAt:string|null;createdAt:string;createdAtSource:string;workspaceRevision:number|null;current:Inventory;lifetime:Record<string,number>;projects:{id:string;createdAtSource:string;deletedAt:string|null;lifetimeSeconds:number|null}[];poker:{games:number;participants:{min:number;max:number;median:number;average:number};averageDurationSeconds:number|null;durationSamples:number;rounds:number};planner:{sessions:number;activeSeconds:number;averageSessionSeconds:number|null;returningDays:number;averageDaysBetweenVisits:number|null}};
type Analytics={trackingStartedAt:string;totals:{accounts:number;deletedAccounts:number;current:Inventory};users:User[];landing:{visitors:number;sessions:number;activeSeconds:number;returningVisitors:number}};
let db:PGlite,owner:string,identity:string|null;let baseline:string;
const migrations=new URL('../supabase/migrations/',import.meta.url);
async function asUser(id:string|null,role=id?'authenticated':'service_role'){
 identity=id;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec('set role '+role);
}
async function admin<T=Record<string,unknown>>(sql:string,params:unknown[]=[]){const id=identity;await db.exec('reset role');try{return await db.query<T>(sql,params);}finally{await asUser(id);}}
async function load(){return (await db.query<{result:{revision:number;workspace:Workspace}}>('select public.orbit_get_workspace() result')).rows[0].result;}
async function save(snapshot:Workspace,revision:number){return (await db.query<{revision:number}>('select public.orbit_save_workspace($1::jsonb,$2) revision',[JSON.stringify(snapshot),revision])).rows[0].revision;}
async function analytics(id:string|null=owner){const prior=identity;await asUser(null);try{return (await db.query<{result:Analytics}>('select public.orbit_application_analytics($1,30) result',[id])).rows[0].result;}finally{await asUser(prior);}}
async function activity(session:string,surface:string,user:string|null,visitor:string|null,seconds=0,end=false,sequence=0){const prior=identity;await asUser(null);try{return await db.query('select public.orbit_application_activity($1,$2,$3,$4,$5,$6,$7)',[session,surface,user,visitor,seconds,end,sequence]);}finally{await asUser(prior);}}
async function room(){const token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');const created=await db.query<{result:{token:string}}>('select public.orbit_poker($1,$2,$3,$4::jsonb) result',['create',token,'',JSON.stringify({projectId:fullWorkspace().activeId,name:'Analytics fixture',deck:['1','3','5']})]);return created.rows[0].result.token;}
async function poker(token:string,action='state',input:Record<string,unknown>={},session=''){return (await db.query<{result:{room:{closed:boolean};self:{id:string};round:{id:string}}}>('select public.orbit_poker($1,$2,$3,$4::jsonb) result',[action,token,session,JSON.stringify(input)])).rows[0].result;}

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const files=readdirSync(migrations).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort();
 for(const file of files.filter(name=>name<'20261031000100'))await db.exec(readFileSync(new URL(file,migrations),'utf8'));
 baseline=crypto.randomUUID();await db.query("insert into auth.users(id,email,created_at) values($1,'baseline@example.com','2026-01-01T12:00:00Z')",[baseline]);
 await asUser(baseline);const initial=await load();await save(fullWorkspace(),initial.revision);await db.exec('reset role');
 await db.exec(readFileSync(new URL('20261031000100_application_analytics.sql',migrations),'utf8'));
});
beforeEach(async()=>{
 owner=crypto.randomUUID();await db.exec('reset role');await db.query("insert into auth.users(id,email,created_at,raw_user_meta_data) values($1,$2,clock_timestamp(),'{\"first_name\":\"Ada\",\"last_name\":\"Lovelace\"}')",[owner,owner+'@example.com']);
 await asUser(owner);const initial=await load();await save(fullWorkspace(),initial.revision);
});
afterAll(async()=>{await db?.close();});

describe('service-only analytics with durable operational facts',()=>{
 it('baselines auth creation dates and marks historical project dates as approximate',async()=>{
  const row=(await analytics(baseline)).users[0];expect(row.createdAt).toBe('2026-01-01T12:00:00+00:00');expect(row.createdAtSource).toBe('auth');
  expect(row.projects[0].createdAtSource).toBe('baseline-date');expect(row.projects[0].deletedAt).toBeNull();expect(row.poker.averageDurationSeconds).toBeNull();
 });
 it('counts logical stories once across roles and keeps project-owned people and role records distinct',async()=>{
  const current=await load(),workspace=structuredClone(current.workspace);workspace.projects[0].data.tasks[0].storyId='shared-story';workspace.projects[0].data.tasks[1].storyId='shared-story';await save(workspace,current.revision);
  const row=(await analytics()).users[0];expect(row.current).toMatchObject({projects:1,features:1,stories:2,workItems:3,people:1,roles:2,platforms:2,meetings:1,holidays:1,timeOff:1,milestones:1});
  expect(row.workspaceRevision).toBe((await load()).revision);
 });
 it('counts distinct platform labels globally rather than summing the same labels across users',async()=>{
  const global=await analytics(null);
  expect(global.totals.accounts).toBeGreaterThanOrEqual(2);
  expect(global.totals.current.platforms).toBe(2);
  expect((await analytics()).users[0].current.platforms).toBe(2);
 });
 it('does not invent project deletions or repeated creations during snapshot replacement and rejected stale writes',async()=>{
  const before=(await analytics()).users[0],current=await load();const changed=structuredClone(current.workspace);changed.projects[0].data.tasks[0].title='Updated task';await save(changed,current.revision);
  expect((await analytics()).users[0].lifetime).toEqual(before.lifetime);
  await expect(save({...changed,activeId:null,projects:[]},current.revision)).rejects.toMatchObject({code:'PT409'});
  expect((await analytics()).users[0].lifetime).toEqual(before.lifetime);
  await save({...changed,activeId:null,projects:[]},(await load()).revision);
  const after=(await analytics()).users[0];expect(after.current.projects).toBe(0);expect(after.lifetime.projectsCreated).toBe(1);expect(after.lifetime.projectsDeleted).toBe(1);expect(after.projects[0].lifetimeSeconds).toBeGreaterThanOrEqual(0);
 });
 it('records a restored project identifier as a new lifetime without changing another owner',async()=>{
  const current=await load();await save({...current.workspace,activeId:null,projects:[]},current.revision);await save(current.workspace,(await load()).revision);
  const after=(await analytics()).users[0];expect(after.lifetime.projectsCreated).toBe(2);expect(after.lifetime.projectsDeleted).toBe(1);expect(after.current.projects).toBe(1);
  expect((await analytics(baseline)).users[0].current.projects).toBe(1);
 });
 it('keeps a legacy story identity when roles are added or reordered',async()=>{
  const initial=await load(),workspace=structuredClone(initial.workspace);workspace.projects[0].data.tasks=[workspace.projects[0].data.tasks[0]];await save(workspace,initial.revision);
  const before=(await analytics()).users[0].lifetime.storiesCreated,task=workspace.projects[0].data.tasks[0];task.storyId='expanded';
  workspace.projects[0].data.tasks.unshift({...task,id:'new-front-role',roleId:'rfront',platform:'Frontend',assignee:'',dependsOn:[]});
  await save(workspace,(await load()).revision);const after=(await analytics()).users[0];expect(after.current.stories).toBe(1);expect(after.lifetime.storiesCreated).toBe(before);
  workspace.projects[0].data.tasks.reverse();await save(workspace,(await load()).revision);expect((await analytics()).users[0].lifetime.storiesCreated).toBe(before);
 });
 it('captures trusted account edits and durable deletion timestamps before cascading project cleanup',async()=>{
  await admin("update auth.users set email='renamed@example.com',raw_user_meta_data='{\"first_name\":\"Grace\",\"last_name\":\"Hopper\"}' where id=$1",[owner]);
  expect((await analytics()).users[0]).toMatchObject({email:'renamed@example.com',firstName:'Grace',deletedAt:null});
  await admin('delete from auth.users where id=$1',[owner]);const after=(await analytics()).users[0];expect(after.deletedAt).not.toBeNull();expect(after.current.projects).toBe(0);expect(after.current.people).toBe(0);expect(after.lifetime.projectsDeleted).toBe(1);expect(after.workspaceRevision).toBeNull();
 });
 it('denies normal users and guests all cross-account analytics, audit and administrative mutation functions',async()=>{
  await expect(db.query('select public.orbit_application_analytics(null,30)')).rejects.toThrow(/permission denied/);
  await expect(db.query('select * from orbit_private.application_accounts')).rejects.toThrow(/permission denied/);
  await expect(db.query('select orbit_private.application_save_workspace_storage($1::jsonb,$2)',[JSON.stringify(fullWorkspace()),0])).rejects.toThrow(/permission denied/);
  await asUser(null,'anon');await expect(db.query('select public.orbit_application_analytics(null,30)')).rejects.toThrow(/permission denied/);
  await expect(db.query('select public.orbit_application_delete_project($1,$2,$3)',[owner,fullWorkspace().activeId,1])).rejects.toThrow(/permission denied/);
  await expect(db.query('select public.orbit_application_activity($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),'landing',null,'a'.repeat(64),0,false,0])).rejects.toThrow(/permission denied/);
  await expect(db.query('select public.orbit_application_audit($1,$2,$3,$4::jsonb)',['outsider','delete',owner,'{}'])).rejects.toThrow(/permission denied/);
 });
 it('allows service-only version-guarded project deletion and restores the caller identity after failure',async()=>{
  const before=await load();await asUser(null);
  await expect(db.query('select public.orbit_application_delete_project($1,$2,$3)',[owner,fullWorkspace().activeId,before.revision-1])).rejects.toMatchObject({code:'PT409'});
  expect((await db.query<{id:string}>('select auth.uid()::text id')).rows[0].id).toBeNull();
  await db.query('select public.orbit_application_delete_project($1,$2,$3)',[owner,fullWorkspace().activeId,before.revision]);
  const result=(await db.query<{result:{workspace:Workspace}}>('select public.orbit_application_user_workspace($1) result',[owner])).rows[0].result;
  expect(result.workspace.projects).toEqual([]);expect((await analytics()).users[0].lifetime.projectsDeleted).toBe(1);
 });
 it('accepts only immutable activity bindings, ignores sequence replay and caps claimed time to server elapsed time',async()=>{
  const session=crypto.randomUUID();await activity(session,'planner',owner,null,0,false,0);
  await admin("update orbit_private.application_activity_sessions set started_at=clock_timestamp()-interval '60 seconds' where session_id=$1",[session]);
  await activity(session,'planner',owner,null,30,false,1);await activity(session,'planner',owner,null,30,false,1);
  expect((await analytics()).users[0].planner).toMatchObject({sessions:1,activeSeconds:30,averageSessionSeconds:30});
  await expect(activity(session,'landing',null,'a'.repeat(64),30,false,2)).rejects.toMatchObject({code:'22023'});
  await activity(session,'planner',owner,null,60,true,2);const finished=(await analytics()).users[0].planner.activeSeconds;expect(finished).toBeLessThanOrEqual(62);expect(finished).toBeGreaterThanOrEqual(60);
  await activity(session,'planner',owner,null,60,false,3);expect((await analytics()).users[0].planner.activeSeconds).toBe(finished);
 });
 it('separates consented landing browser visitors from account usage and measures return days',async()=>{
  const first=crypto.randomUUID(),second=crypto.randomUUID();await activity(first,'landing',null,'b'.repeat(64));await activity(second,'landing',null,'b'.repeat(64));
  expect((await analytics()).landing).toMatchObject({visitors:1,sessions:2,activeSeconds:0,returningVisitors:1});
  const dayA=crypto.randomUUID(),dayB=crypto.randomUUID();await activity(dayA,'planner',owner,null);await activity(dayB,'planner',owner,null);
  await admin("update orbit_private.application_activity_sessions set started_at=clock_timestamp()-interval '2 days' where session_id=$1",[dayA]);
  expect((await analytics()).users[0].planner).toMatchObject({sessions:2,returningDays:1,averageDaysBetweenVisits:2});
 });
 it('counts joined seats once across tabs and records complete game duration without manual closed intervals',async()=>{
  const token=await room(),a=crypto.randomUUID(),b=crypto.randomUUID();await poker(token,'state',{connectionId:a});await poker(token,'state',{connectionId:b});
  const guest='d'.repeat(64);await asUser(null,'anon');await poker(token,'join',{connectionId:crypto.randomUUID(),name:'Guest',spectator:true},guest);await asUser(owner);
  await admin("update orbit_private.application_poker_games set segment_started_at=clock_timestamp()-interval '60 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  await poker(token,'close',{connectionId:a,closed:true});let stats=(await analytics()).users[0].poker;expect(stats.participants).toMatchObject({min:2,max:2,median:2,average:2});expect(stats.durationSamples).toBe(1);expect(stats.averageDurationSeconds).toBeGreaterThanOrEqual(60);
  await poker(token,'close',{connectionId:crypto.randomUUID(),closed:false});await admin("update orbit_private.application_poker_games set segment_started_at=clock_timestamp()-interval '30 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  await poker(token,'close',{connectionId:crypto.randomUUID(),closed:true});stats=(await analytics()).users[0].poker;expect(stats.averageDurationSeconds).toBeGreaterThanOrEqual(90);expect(stats.averageDurationSeconds).toBeLessThan(93);expect(stats.games).toBe(1);
 });
 it('uses the effective stale-lease close deadline rather than delayed observation time',async()=>{
  const token=await room();await poker(token,'state',{connectionId:crypto.randomUUID()});
  await admin("update orbit_private.application_poker_games set segment_started_at=clock_timestamp()-interval '180 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  await admin("update orbit_private.poker_connections set last_seen=clock_timestamp()-interval '120 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  const state=await poker(token);expect(state.room.closed).toBe(true);const stats=(await analytics()).users[0].poker;expect(stats.averageDurationSeconds).toBeGreaterThan(119);expect(stats.averageDurationSeconds).toBeLessThan(123);
 });
 it('retains the effective game deadline after abandoned presence rows are pruned days later',async()=>{
  const token=await room();await poker(token,'state',{connectionId:crypto.randomUUID()});
  await admin("update orbit_private.application_poker_games set segment_started_at=clock_timestamp()-interval '2 days',presence_deadline=clock_timestamp()-interval '2 days'+interval '180 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  await admin("update public.orbit_poker_participants set last_seen=clock_timestamp()-interval '2 days'+interval '120 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  await admin("update orbit_private.poker_connections set last_seen=clock_timestamp()-interval '2 days'+interval '120 seconds' where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);
  const state=await poker(token);expect(state.room.closed).toBe(true);
  const remaining=await admin<{count:number}>("select count(*)::int count from orbit_private.poker_connections where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)",[token]);expect(remaining.rows[0].count).toBe(0);
  const stats=(await analytics()).users[0].poker;expect(stats.averageDurationSeconds).toBeGreaterThanOrEqual(179);expect(stats.averageDurationSeconds).toBeLessThan(183);
 });
 it('bounds activity request buckets and exposes zero-safe metrics for an unknown filter',async()=>{
  await asUser(null);const key=owner.replaceAll('-','').repeat(2);let allowed=true;
  for(let i=0;i<121;i++)allowed=(await db.query<{allowed:boolean}>('select public.orbit_application_activity_allow($1) allowed',[key])).rows[0].allowed;
  expect(allowed).toBe(false);
  const empty=await analytics(crypto.randomUUID());expect(empty.users).toEqual([]);expect(empty.totals).toMatchObject({accounts:0,deletedAccounts:0,current:{projects:0,features:0,people:0}});
 });
 it('writes admin audit facts without giving ordinary clients table access',async()=>{
  await asUser(null);await db.query('select public.orbit_application_audit($1,$2,$3,$4::jsonb)',['admin@example.com','user.update',owner,'{"fields":["firstName"]}']);
  const rows=await admin<{action:string}>('select action from orbit_private.application_audit where target=$1',[owner]);expect(rows.rows).toEqual([{action:'user.update'}]);
  await asUser(owner);await expect(db.query('select * from orbit_private.application_audit')).rejects.toThrow(/permission denied/);
 });
});
