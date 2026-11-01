import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {fullWorkspace} from './fixtures';

const version='2026-11-01',migration='20261101000100_minimal_analytics_and_legal.sql';
const oldUser='11111111-1111-4111-8111-111111111111';
let db:PGlite,newUser:string,otherUser:string;
type Legal={required:boolean;termsVersion:string;privacyVersion:string;acceptedAt:string|null};
async function as(role:'postgres'|'service_role'|'authenticated'|'anon',user:string|null=null){
 await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[user||'']);
 if(role!=='postgres')await db.exec('set role '+role);
}
async function status(){return (await db.query<{result:Legal}>('select public.orbit_legal_status() result')).rows[0].result;}
async function accept(terms=version,privacy=version){return (await db.query<{result:Legal}>('select public.orbit_accept_legal($1,$2) result',[terms,privacy])).rows[0].result;}
async function views(days=30){return (await db.query<{result:{pageviews:number;days:number;startedAt:string}}>('select public.orbit_landing_pageviews($1) result',[days])).rows[0].result;}
beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role;create schema auth;grant usage on schema auth to anon,authenticated,service_role;
 create table auth.users(id uuid primary key,email text,created_at timestamptz,raw_user_meta_data jsonb default '{}'::jsonb);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const directory=new URL('../supabase/migrations/',import.meta.url);
 for(const name of readdirSync(directory).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)&&name<migration).sort())await db.exec(readFileSync(new URL(name,directory),'utf8'));
 await db.query("insert into auth.users(id,email,created_at) values($1,'existing@example.com','2026-01-01T00:00:00Z')",[oldUser]);
 await as('authenticated',oldUser);const loaded=(await db.query<{result:{revision:number}}>('select public.orbit_get_workspace() result')).rows[0].result;
 await db.query('select public.orbit_save_workspace($1::jsonb,$2)',[JSON.stringify(fullWorkspace()),loaded.revision]);
 await as('service_role');
 await db.query('select public.orbit_application_activity($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),'planner',oldUser,null,0,false,0]);
 await db.query('select public.orbit_application_activity($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),'landing',null,'a'.repeat(64),0,false,0]);
 await db.query('select public.orbit_application_activity_allow($1)',['a'.repeat(64)]);
 await as('postgres');await db.exec(readFileSync(new URL(migration,directory),'utf8'));
});
beforeEach(async()=>{
 await as('postgres');newUser=crypto.randomUUID();otherUser=crypto.randomUUID();
 await db.query("insert into auth.users(id,email,created_at,raw_user_meta_data) values($1,$2,clock_timestamp(),'{\"terms_accepted\":true,\"terms_version\":\"2026-11-01\"}'),($3,$4,clock_timestamp(),'{}')",[newUser,newUser+'@example.com',otherUser,otherUser+'@example.com']);
});
afterAll(async()=>{await db?.close();});

describe('minimal analytics cutover preserves service operations',()=>{
 it('removes optional identifiers/time records while preserving existing workspace and operational facts',async()=>{
  expect((await db.query<{count:number}>('select count(*)::int count from orbit_private.application_activity_sessions')).rows[0].count).toBe(0);
  const inventory=(await db.query<{result:{users:{id:string;current:{projects:number;features:number;stories:number}}[]}}>('select public.orbit_application_analytics($1,30) result',[oldUser])).rows[0].result;
  expect(inventory.users[0]).toMatchObject({id:oldUser,current:{projects:1,features:1,stories:3}});
  await as('authenticated',oldUser);expect((await db.query<{result:{workspace:unknown}}>('select public.orbit_get_workspace() result')).rows[0].result.workspace).toEqual(fullWorkspace());
 });
 it('does not allow a stale service caller to resume visitor/session tracking',async()=>{
  await as('service_role');
  await expect(db.query('select public.orbit_application_activity($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),'landing',null,'b'.repeat(64),15,false,0])).rejects.toThrow(/permission denied|disabled|retired/i);
  await expect(db.query('select public.orbit_application_activity_allow($1)',['b'.repeat(64)])).rejects.toThrow(/permission denied|disabled|retired/i);
  await as('postgres');expect((await db.query<{count:number}>('select count(*)::int count from orbit_private.application_activity_sessions')).rows[0].count).toBe(0);
 });
 it('accepts only server increments and exposes daily totals rather than visitor identifiers',async()=>{
  await db.exec('delete from orbit_private.application_landing_pageviews');
  await as('service_role');await db.exec('select public.orbit_record_landing_pageview();select public.orbit_record_landing_pageview();');
  const result=await views(7);expect(result).toMatchObject({pageviews:2,days:7});expect(Number.isFinite(Date.parse(result.startedAt))).toBe(true);
  expect(Object.keys(result).sort()).toEqual(['days','pageviews','startedAt']);
  await as('postgres');
  const columns=(await db.query<{column_name:string}>("select column_name from information_schema.columns where table_schema='orbit_private' and table_name='application_landing_pageviews' order by ordinal_position")).rows.map(row=>row.column_name);
  expect(columns).toEqual(['view_date','pageviews']);
 });
 it('uses exactly N UTC dates for reporting, including today but excluding future and older totals',async()=>{
  await db.exec("delete from orbit_private.application_landing_pageviews;insert into orbit_private.application_landing_pageviews(view_date,pageviews) values((clock_timestamp() at time zone 'UTC')::date,2),((clock_timestamp() at time zone 'UTC')::date-6,3),((clock_timestamp() at time zone 'UTC')::date-7,11),((clock_timestamp() at time zone 'UTC')::date+1,101)");
  await as('service_role');expect((await views(7)).pageviews).toBe(5);expect((await views(30)).pageviews).toBe(16);
  for(const days of [0,1,8,31,-1,10000])await expect(views(days)).rejects.toMatchObject({code:'22023'});
 });
 it.each(['anon','authenticated'] as const)('denies %s reading or forging aggregate counters',async role=>{
  await as(role,role==='authenticated'?newUser:null);
  await expect(db.exec('select public.orbit_record_landing_pageview()')).rejects.toThrow(/permission denied/);
  await expect(views()).rejects.toThrow(/permission denied/);
  await expect(db.exec('select * from orbit_private.application_landing_pageviews')).rejects.toThrow(/permission denied/);
  await expect(db.exec("insert into orbit_private.application_landing_pageviews values(current_date,9999)")).rejects.toThrow(/permission denied/);
 });
});

describe('server-controlled terms acceptance',()=>{
 it('grandfathers existing accounts but does not treat mutable metadata as acceptance for new accounts',async()=>{
  await as('authenticated',oldUser);expect(await status()).toEqual({required:false,termsVersion:version,privacyVersion:version,acceptedAt:null});
  await as('authenticated',newUser);expect(await status()).toEqual({required:true,termsVersion:version,privacyVersion:version,acceptedAt:null});
 });
 it('binds acceptance to the authenticated user, fixes versions and keeps the first server timestamp',async()=>{
  await as('authenticated',newUser);const first=await accept();expect(first.required).toBe(false);expect(Number.isFinite(Date.parse(first.acceptedAt!))).toBe(true);
  expect(await accept()).toEqual(first);expect(await status()).toEqual(first);
  await as('authenticated',otherUser);expect((await status()).required).toBe(true);expect((await status()).acceptedAt).toBeNull();
 });
 it('rejects stale or invented versions without recording acceptance',async()=>{
  await as('authenticated',newUser);
  for(const [terms,privacy] of [['2026-10-31',version],[version,'2099-01-01'],['',version]])await expect(accept(terms,privacy)).rejects.toMatchObject({code:'22023'});
  expect((await status()).required).toBe(true);
 });
 it('keeps a user with unknown creation date behind acceptance rather than grandfathering it',async()=>{
  await db.query('update auth.users set created_at=null where id=$1',[newUser]);await as('authenticated',newUser);expect((await status()).required).toBe(true);
 });
 it('rejects anonymous status/acceptance and unauthenticated claimed identities',async()=>{
  await as('anon',newUser);await expect(status()).rejects.toThrow(/permission denied/);await expect(accept()).rejects.toThrow(/permission denied/);
  await as('authenticated');await expect(status()).rejects.toMatchObject({code:'PT401'});await expect(accept()).rejects.toMatchObject({code:'PT401'});
 });
});
