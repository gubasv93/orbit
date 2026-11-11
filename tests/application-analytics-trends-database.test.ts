import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {fullWorkspace} from './fixtures';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const migration='20261111000100_application_analytics_trends.sql';
type Day={date:string;[key:string]:number|string|null};
type Trends={userId:string|null;generatedAt:string;historyStartedAt:string;periodDays:number;timezone:string;startDate:string;endDate:string;coverage:Record<string,string>;days:Day[]};
let db:PGlite,today:string,preserved:boolean;
const date=(offset:number)=>new Date(Date.parse(today+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
const stamp=(offset:number,time='09:00:00Z')=>date(offset)+'T'+time;
async function as(role:'service_role'|'authenticated'|'anon'|'postgres',id:string|null=null){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);
 if(role!=='postgres')await db.exec('set role '+role);
}
async function trends(id:string|null=null,days:number|null=7){return (await db.query<{value:Trends}>('select public.orbit_application_analytics_trends($1,$2) as value',[id,days])).rows[0].value;}
const day=(value:Trends,offset:number)=>value.days.find(row=>row.date===date(offset))!;
async function account(id:string,created:string,source='auth',deleted:string|null=null){
 await db.query('insert into orbit_private.application_accounts(user_id,email,created_at,created_at_source,first_seen_at,deleted_at) values($1,$2,$3,$4,$5,$6)',[id,id+'@example.com',created,source,stamp(-4,'13:00:00Z'),deleted]);
}
async function project(user=owner,offset=-3,source='observed',deleted:string|null=null){
 const id=crypto.randomUUID(),observed=stamp(offset,'13:00:00Z');
 await db.query('insert into orbit_private.application_projects(id,user_id,workspace_id,project_key,name,created_at,created_at_source,first_seen_at,last_seen_at,deleted_at) values($1,$2,$3,$4,$4,$5,$6,$7,$7,$8)',[id,user,crypto.randomUUID(),id,source==='baseline-date'?stamp(-20):observed,source,observed,deleted]);return id;
}
async function entity(projectId:string,kind:string,key:string,offset=-3){
 await db.query('insert into orbit_private.application_entities(project_lifetime_id,kind,entity_key,first_seen_at,last_seen_at) values($1,$2,$3,$4,$4)',[projectId,kind,key,stamp(offset,'14:00:00Z')]);
}
async function game(user:string,offset:number,participants:number,duration:number,closed=true,known=true){
 const id=crypto.randomUUID();await db.query('insert into orbit_private.application_poker_games(room_id,user_id,project_key,created_at,started_at,closed_at,duration_seconds,duration_known) values($1,$2,$3,$4,$4,$5,$6,$7)',[id,user,'fixture',stamp(offset),closed?stamp(-1,'18:00:00Z'):null,duration,known]);
 for(let seat=0;seat<participants;seat++)await db.query('insert into orbit_private.application_poker_players(room_id,participant_id,first_joined_at,ever_voter) values($1,$2,$3,$4)',[id,crypto.randomUUID(),stamp(offset,'09:01:00Z'),seat!==0]);
 return id;
}
async function operationalRows(){
 return (await db.query<{value:unknown}>(`select jsonb_build_object(
 'accounts',(select jsonb_agg(to_jsonb(a) order by user_id) from orbit_private.application_accounts a),
 'projects',(select jsonb_agg(to_jsonb(p) order by id) from orbit_private.application_projects p),
 'entities',(select jsonb_agg(to_jsonb(e) order by project_lifetime_id,kind,entity_key) from orbit_private.application_entities e),
 'workspaces',(select jsonb_agg(to_jsonb(w) order by id) from public.orbit_workspaces w),
 'pageviews',(select jsonb_agg(to_jsonb(v) order by view_date) from orbit_private.application_landing_pageviews v),
 'activity',(select count(*) from orbit_private.application_activity_sessions)) as value`)).rows[0].value;
}

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)&&name<migration).sort())await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.query("insert into auth.users(id,email,created_at) values($1,'owner@example.com','2026-01-01T00:00:00Z'),($2,'other@example.com','2026-01-01T00:00:00Z')",[owner,other]);
 await as('authenticated',owner);const loaded=(await db.query<{value:{revision:number}}>('select public.orbit_get_workspace() as value')).rows[0].value;
 await db.query('select public.orbit_save_workspace($1::jsonb,$2)',[JSON.stringify(fullWorkspace()),loaded.revision]);
 await as('postgres');const before=await operationalRows();await db.exec(readFileSync(new URL(migration,directory),'utf8'));preserved=JSON.stringify(await operationalRows())===JSON.stringify(before);
 today=(await db.query<{today:string}>("select to_char((clock_timestamp() at time zone 'UTC')::date,'YYYY-MM-DD') as today")).rows[0].today;
});
beforeEach(async()=>{
 await as('postgres');await db.exec('set timezone=\'America/Los_Angeles\';truncate orbit_private.application_accounts,orbit_private.application_projects,orbit_private.application_poker_games,orbit_private.application_landing_pageviews cascade;');
 await db.query('update orbit_private.application_analytics_settings set started_at=$1',[stamp(-4,'12:00:00Z')]);
 await db.query('update orbit_private.application_privacy_settings set started_at=$1',[stamp(-2,'12:00:00Z')]);
 await account(owner,stamp(-3));await account(other,stamp(-1));
});
afterAll(async()=>{await db?.close();});

describe('service-only operational analytics trends',()=>{
 it('adds a read-only reporting function without rewriting workspaces, facts or privacy settings',async()=>{
  expect(preserved).toBe(true);const before=await operationalRows();await trends();expect(await operationalRows()).toEqual(before);
  const catalog=(await db.query<{security:boolean;config:string[];volatility:string}>("select prosecdef as security,proconfig as config,provolatile as volatility from pg_proc where oid='public.orbit_application_analytics_trends(uuid,integer)'::regprocedure")).rows[0];
  expect(catalog).toEqual({security:true,config:['search_path=""'],volatility:'s'});
  await as('service_role');await expect(db.query('select public.orbit_application_activity_allow($1)',['a'.repeat(64)])).rejects.toThrow(/permission denied/);
 });

 it('returns exactly the requested UTC dates, preserves unavailable history as null and reports observed empty days as zero',async()=>{
  await as('service_role');
  for(const period of [7,30,90,365]){
   const value=await trends(null,period);expect(value).toMatchObject({userId:null,periodDays:period,timezone:'UTC',startDate:date(-(period-1)),endDate:today});
   expect(value.days).toHaveLength(period);expect(value.days.map(row=>row.date)).toEqual(Array.from({length:period},(_,index)=>date(index-period+1)));
   expect(new Date(value.generatedAt).toISOString().slice(0,10)).toBe(today);expect(new Date(value.historyStartedAt).toISOString()).toBe(stamp(-4,'12:00:00.000Z'));
   for(const row of value.days.filter(row=>row.date<date(-4)))expect(Object.entries(row).filter(([key])=>key!=='date').every(([,value])=>value===null)).toBe(true);
   expect(day(value,0)).toMatchObject({accountsCreated:0,accountsDeleted:0,featuresCreated:0,pokerGamesPlayed:0,pokerDurationSamples:0,pokerParticipantsAverage:null,pokerAverageDurationSeconds:null,projectAverageLifetimeSeconds:null,projectLifetimeSamples:0,landingPageviews:0});
  }
 });

 it('uses UTC event boundaries and excludes pre-cutover, unknown, future and out-of-window registration dates',async()=>{
  await account(crypto.randomUUID(),stamp(-1,'00:30:00Z'));
  await account(crypto.randomUUID(),stamp(-2,'23:30:00-01:00'));
  await account(crypto.randomUUID(),stamp(-4,'10:00:00Z'));
  await account(crypto.randomUUID(),stamp(-4,'13:00:00Z'));
  await account(crypto.randomUUID(),stamp(-2),'observed');
  await account(crypto.randomUUID(),stamp(1));await account(crypto.randomUUID(),stamp(-20));
  await db.query('update orbit_private.application_accounts set deleted_at=$1 where user_id=$2',[stamp(-1,'23:30:00Z'),owner]);
  const value=await trends();expect(day(value,-1).accountsCreated).toBe(3);expect(day(value,-2).accountsCreated).toBe(0);expect(day(value,-4).accountsCreated).toBe(1);expect(day(value,-1).accountsDeleted).toBe(1);
  expect(value.days.reduce((sum,row)=>sum+Number(row.accountsCreated||0),0)).toBe(5);
  expect((await trends(owner)).days.reduce((sum,row)=>sum+Number(row.accountsCreated||0),0)).toBe(1);
 });

 it('counts first observed project-owned resources, keeps re-additions stable and deduplicates platform types across the selected scope',async()=>{
  const first=await project(),copy=await project(owner,-1),otherProject=await project(other,-2);
  const kinds=['feature','story','workItem','person','role','meeting','holiday','timeOff','milestone'];
  for(const kind of kinds){await entity(first,kind,'same-key');await entity(copy,kind,'same-key',-1);await entity(otherProject,kind,'same-key',-2);}
  await entity(first,'workItem','another-role-row');
  await entity(first,'platform','backend');await entity(copy,'platform','backend',-1);await entity(otherProject,'platform','backend',-2);await entity(otherProject,'platform','frontend',-2);
  const global=await trends(),scoped=await trends(owner),another=await trends(other);
  expect(day(scoped,-3)).toMatchObject({projectsCreated:1,featuresCreated:1,storiesCreated:1,workItemsCreated:2,peopleCreated:1,rolesCreated:1,platformsCreated:1,meetingsCreated:1,holidaysCreated:1,timeOffCreated:1,milestonesCreated:1});
  expect(day(scoped,-1)).toMatchObject({projectsCreated:1,featuresCreated:1,storiesCreated:1,workItemsCreated:1,peopleCreated:1,platformsCreated:0});
  expect(day(global,-2).platformsCreated).toBe(1);expect(day(another,-2).platformsCreated).toBe(2);
  expect(day(scoped,-2).featuresCreated).toBe(0);
  await db.query('update orbit_private.application_entities set removed_at=$1 where project_lifetime_id=$2',[stamp(-1),first]);
  await db.query('update orbit_private.application_entities set removed_at=null,last_seen_at=clock_timestamp() where project_lifetime_id=$1',[first]);
  expect((await trends(owner)).days).toEqual(scoped.days);
  expect(scoped.coverage.resources).toMatch(/first observed|first observation/i);expect(scoped.coverage.resources).toMatch(/re-adding/);
 });

 it('places baseline inventory on its first observation and averages only known project lifetimes on the deletion date',async()=>{
  const baseline=await project(owner,-4,'baseline-date',stamp(-1,'13:00:00Z'));
  await entity(baseline,'feature','baseline',-4);await project(owner,-3,'observed',stamp(-1,'13:00:00Z'));
  await project(other,-2,'observed',stamp(-1,'13:00:00Z'));
  const value=await trends(owner);expect(day(value,-4)).toMatchObject({projectsCreated:1,featuresCreated:1});
  expect(day(value,-1)).toMatchObject({projectsDeleted:2,projectLifetimeSamples:1,projectAverageLifetimeSeconds:172800});
  expect(day(await trends(),-1)).toMatchObject({projectsDeleted:3,projectLifetimeSamples:2,projectAverageLifetimeSeconds:129600});
  expect(value.coverage.resources).toMatch(/baseline/);
 });

 it('groups poker statistics by room creation day and excludes unused, open and unknown durations from their averages',async()=>{
  await game(owner,-3,2,60);await game(owner,-3,4,180);await game(owner,-3,0,100000);
  await game(owner,-2,8,1000,false);await game(owner,-2,1,300,true,false);await game(other,-3,9,3600);
  await game(owner,-5,1,100);await game(owner,1,1,100);
  const own=await trends(owner);expect(day(own,-3)).toMatchObject({pokerGamesCreated:3,pokerGamesPlayed:2,pokerParticipantsMin:2,pokerParticipantsMax:4,pokerParticipantsMedian:3,pokerParticipantsAverage:3,pokerAverageDurationSeconds:120,pokerDurationSamples:2});
  expect(day(own,-2)).toMatchObject({pokerGamesCreated:2,pokerGamesPlayed:2,pokerParticipantsMin:1,pokerParticipantsMax:8,pokerParticipantsMedian:4.5,pokerParticipantsAverage:4.5,pokerAverageDurationSeconds:null,pokerDurationSamples:0});
  expect(day(await trends(),-3)).toMatchObject({pokerGamesCreated:4,pokerGamesPlayed:3,pokerParticipantsMedian:4,pokerParticipantsAverage:5,pokerAverageDurationSeconds:1280,pokerDurationSamples:3});
  expect(day(own,-1)).toMatchObject({pokerGamesCreated:0,pokerGamesPlayed:0,pokerParticipantsMin:null,pokerAverageDurationSeconds:null});
 });

 it('returns landing totals only globally and distinguishes unavailable landing history from measured zero',async()=>{
  for(const [offset,count] of [[-5,99],[-3,80],[-2,7],[-1,11],[0,5],[1,1000]])await db.query('insert into orbit_private.application_landing_pageviews(view_date,pageviews) values($1,$2)',[date(offset),count]);
  const global=await trends(),own=await trends(owner),missing=await trends(crypto.randomUUID());
  expect(day(global,-3).landingPageviews).toBeNull();expect(day(global,-2).landingPageviews).toBe(7);expect(day(global,-1).landingPageviews).toBe(11);expect(day(global,0).landingPageviews).toBe(5);
  expect(own.days.every(row=>row.landingPageviews===null)).toBe(true);expect(own.coverage.landing).toMatch(/cannot be attributed/);
  expect(missing.days.filter(row=>row.date>=date(-4)).every(row=>row.accountsCreated===0&&row.projectsCreated===0&&row.pokerGamesCreated===0)).toBe(true);
  expect(missing.days.every(row=>row.landingPageviews===null)).toBe(true);
 });

 it.each(['anon','authenticated'] as const)('denies %s privileged charts even when a target user is supplied',async role=>{
  await as(role,role==='authenticated'?owner:null);
  await expect(trends()).rejects.toThrow(/permission denied/);await expect(trends(other)).rejects.toThrow(/permission denied/);
  await expect(db.exec('select * from orbit_private.application_entities')).rejects.toThrow(/permission denied/);
 });

 it('permits only bounded periods and never revives optional browsing analytics',async()=>{
  await as('service_role');for(const invalid of [-1,0,1,8,31,10000,null])await expect(trends(null,invalid)).rejects.toMatchObject({code:'22023'});
  await as('postgres');expect((await db.query<{count:number}>('select count(*)::int as count from orbit_private.application_activity_sessions')).rows[0].count).toBe(0);
  await expect(db.exec(`insert into orbit_private.application_activity_sessions(session_id,surface,visitor_hash) values(gen_random_uuid(),'landing',repeat('a',64))`)).rejects.toThrow(/application_activity_retired/);
 });
});
