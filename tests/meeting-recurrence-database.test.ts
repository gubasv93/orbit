import {afterAll,beforeAll,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import type {Workspace} from '../src/lib/schema';
import {fullWorkspace} from './fixtures';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const migration='20261112000100_custom_meeting_recurrence.sql';
let db:PGlite,preserved:boolean,legacyOwner:unknown,legacyOther:unknown,oldChecks:unknown,oldRpcs:unknown;
async function user(id:string|null){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 await db.exec(`set role ${id?'authenticated':'anon'}`);
}
async function load(){return (await db.query<{result:{revision:number;workspace:Workspace}}>('select public.orbit_get_workspace() as result')).rows[0].result;}
async function save(workspace:Workspace,revision:number){return (await db.query<{revision:number}>('select public.orbit_save_workspace($1::jsonb,$2) as revision',[JSON.stringify(workspace),revision])).rows[0].revision;}
async function records(){
 const tables=(await db.query<{schema:string;name:string}>(`select n.nspname as schema,c.relname as name from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname in ('public','orbit_private') and c.relkind='r' order by 1,2`)).rows;
 const values:Record<string,unknown>={};
 for(const table of tables)values[table.schema+'.'+table.name]=(await db.query<{value:unknown}>(`select jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text) as value from "${table.schema}"."${table.name}" t`)).rows[0].value;
 return values;
}
async function constraints(){return (await db.query(`select oid,conname,pg_get_constraintdef(oid) as definition from pg_constraint
 where conrelid='public.orbit_recurring_meetings'::regclass and not(contype='c' and pg_get_expr(conbin,conrelid) ilike '%recurrence%') order by conname`)).rows;}
async function rpcs(){return (await db.query(`select oid,proowner,proacl,pg_get_functiondef(oid) as definition from pg_proc
 where oid in ('public.orbit_save_workspace(jsonb,bigint)'::regprocedure,'public.orbit_get_workspace()'::regprocedure) order by oid`)).rows;}

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)&&name<migration).sort())await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.query("insert into auth.users(id,email,created_at) values($1,'owner@example.com','2026-01-01T00:00:00Z'),($2,'other@example.com','2026-01-02T00:00:00Z')",[owner,other]);
 for(const id of [owner,other]){
  await user(id);const before=await load(),workspace=fullWorkspace();workspace.projects[0].name=id===owner?'Owner plan':'Other plan';
  const source=workspace.projects[0].data.meetings[0];
  workspace.projects[0].data.meetings=['workdays','weekly','interval','monthly'].map((recurrence,index)=>({...source,id:'legacy-'+index,recurrence,interval:2,nth:2})) as typeof workspace.projects[0]['data']['meetings'];
  await save(workspace,before.revision);if(id===owner)legacyOwner=await load();else legacyOther=await load();
 }
 await db.exec('reset role');const before=await records();oldChecks=await constraints();oldRpcs=await rpcs();
 await db.exec(readFileSync(new URL(migration,directory),'utf8'));preserved=JSON.stringify(await records())===JSON.stringify(before);
});
afterAll(async()=>{await db?.close();});

describe('custom recurring meeting storage through the production workspace RPC',()=>{
 it('preserves all records, legacy meetings, independent checks and existing RPC definitions and grants',async()=>{
  expect(preserved).toBe(true);expect(await constraints()).toEqual(oldChecks);expect(await rpcs()).toEqual(oldRpcs);
  await user(owner);expect(await load()).toEqual(legacyOwner);await user(other);expect(await load()).toEqual(legacyOther);
  const checks=(await db.query<{conname:string;definition:string}>(`select conname,pg_get_constraintdef(oid) as definition from pg_constraint
   where conrelid='public.orbit_recurring_meetings'::regclass and contype='c' and pg_get_expr(conbin,conrelid) ilike '%recurrence%'`)).rows;
  expect(checks).toHaveLength(1);expect(checks[0].conname).toBe('orbit_recurring_meetings_recurrence_check');
  expect(checks[0].definition).toContain('valid_custom_meeting_recurrence');
 });

 it('round-trips multi-weekday, endless, calendar-end and occurrence-count rules with ordinary meeting metadata',async()=>{
  await user(owner);const before=await load(),workspace=structuredClone(before.workspace),base=workspace.projects[0].data.meetings[0];
  const rules=[
   {frequency:'day',interval:1,weekdays:[],endType:'never'},
   {frequency:'week',interval:1,weekdays:[2,4],endType:'never'},
   {frequency:'month',interval:2,monthlyMode:'weekday',monthlyOrdinal:-1,endType:'on',endDate:'2027-02-28'},
   {frequency:'year',interval:1,endType:'after',count:3},
   {frequency:'week',interval:2,weekdays:[1],endType:'after',count:6},
  ];
  const meetings=rules.map((customRecurrence,index)=>({...base,id:'custom-'+index,recurrence:'custom',customRecurrence,
   presetKey:index===1?'scrum-refinement':undefined,allTeam:index===1,attendees:index===1?[]:['u1']}));
  workspace.projects[0].data.meetings=meetings as typeof workspace.projects[0]['data']['meetings'];
  const revision=await save(workspace,before.revision);expect(await load()).toEqual({revision,workspace});
  expect((await db.query<{document:unknown}>('select document from public.orbit_recurring_meetings order by position')).rows.map(row=>row.document)).toEqual(JSON.parse(JSON.stringify(meetings.map(({attendees,...document})=>document))));
  expect((await db.query<{count:number}>('select count(*)::int as count from public.orbit_meeting_attendees')).rows[0].count).toBe(4);
 });

 it('rejects malformed or impossible custom rules atomically while retaining the previously saved workspace',async()=>{
  await user(owner);const before=await load();
  const valid={frequency:'week',interval:1,weekdays:[2,4],endType:'never'};
  const invalid=[null,[],{}, {...valid,frequency:'hour'}, {...valid,interval:'2'}, {...valid,interval:0}, {...valid,interval:100}, {...valid,interval:1.5},
   {...valid,weekdays:[]}, {...valid,weekdays:[2,2]}, {...valid,weekdays:[7]}, {...valid,weekdays:['2']}, {...valid,weekdays:[1.5]},
   {...valid,endType:'sometimes'}, {...valid,endType:'after'}, {...valid,endType:'after',count:0}, {...valid,endType:'after',count:1001}, {...valid,endType:'after',count:2.5},
   {...valid,endType:'on'}, {...valid,endType:'on',endDate:'2026-02-30'}, {...valid,endType:'on',endDate:'2026-01-01'},
   {...valid,monthlyMode:'other'}, {...valid,monthlyOrdinal:0}, {...valid,count:'3'}, {...valid,endDate:42}];
  for(const customRecurrence of invalid){
   const workspace=structuredClone(before.workspace);Object.assign(workspace.projects[0].data.meetings[0],{customRecurrence});
   await expect(save(workspace,before.revision)).rejects.toMatchObject({code:'23514',constraint:'orbit_recurring_meetings_recurrence_check'});
   expect(await load()).toEqual(before);
  }
 });

 it('keeps all four legacy formats editable and preserves the separate duration restriction',async()=>{
  await user(owner);const before=await load(),workspace=structuredClone(before.workspace),base=fullWorkspace().projects[0].data.meetings[0];
  workspace.projects[0].data.meetings=['workdays','weekly','interval','monthly'].map((recurrence,index)=>({...base,id:'edited-legacy-'+index,recurrence,title:'Edited '+recurrence,interval:2,nth:2})) as typeof workspace.projects[0]['data']['meetings'];
  const revision=await save(workspace,before.revision),after=await load();expect(after).toEqual({revision,workspace});
  const invalid=structuredClone(workspace);invalid.projects[0].data.meetings[0].duration=481;
  await expect(save(invalid,revision)).rejects.toMatchObject({code:'23514'});expect(await load()).toEqual(after);
 });

 it('keeps owner scopes isolated and denies anonymous saves, direct writes and private validator calls',async()=>{
  await user(other);expect(await load()).toEqual(legacyOther);expect((await db.query<{count:number}>('select count(*)::int as count from public.orbit_recurring_meetings')).rows[0].count).toBe(4);
  await expect(db.exec('delete from public.orbit_recurring_meetings')).rejects.toThrow(/permission denied/);
  await expect(db.query('select orbit_private.valid_custom_meeting_recurrence($1::jsonb)',['{}'])).rejects.toThrow(/permission denied/);
  await user(null);await expect(db.query('select public.orbit_save_workspace($1::jsonb,0)',[JSON.stringify(fullWorkspace())])).rejects.toThrow(/permission denied/);
  await db.exec('reset role');
  const privacy=(await db.query<{sessions:number;limits:number;checks:number;optional:boolean;events:boolean}>(`select
   (select count(*)::int from orbit_private.application_activity_sessions) as sessions,
   (select count(*)::int from orbit_private.application_activity_limits) as limits,
   (select count(*)::int from pg_constraint where conname in ('application_activity_retired','application_activity_limits_retired') and convalidated and pg_get_expr(conbin,conrelid)='false') as checks,
   has_function_privilege('service_role','public.orbit_application_activity_allow(text)','execute') as optional,
   has_function_privilege('service_role','public.orbit_application_activity(uuid,text,uuid,text,integer,boolean,integer)','execute') as events`)).rows[0];
  expect(privacy).toEqual({sessions:0,limits:0,checks:2,optional:false,events:false});
 });

 it('fails closed if the legacy check was changed rather than dropping an unrelated constraint',async()=>{
  await db.exec('reset role');await db.exec('begin');
  try{
   await db.exec('alter table public.orbit_recurring_meetings drop constraint orbit_recurring_meetings_recurrence_check;drop function orbit_private.valid_custom_meeting_recurrence(jsonb);');
   await expect(db.exec(readFileSync(new URL('../supabase/migrations/'+migration,import.meta.url),'utf8').replace(/^([\s\S]*?)begin;/,'$1').replace(/commit;\s*$/,''))).rejects.toThrow(/exactly one reviewed legacy/);
  }finally{await db.exec('rollback');}
  expect((await db.query("select 1 from pg_constraint where conname='orbit_recurring_meetings_recurrence_check'")).rows).toHaveLength(1);
 });
});
