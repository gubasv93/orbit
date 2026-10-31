import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync} from 'node:fs';
const invite='a'.repeat(64),session='b'.repeat(64),secondSession='c'.repeat(64),thirdSession='d'.repeat(64),hash='scrypt-v1.'+'x'.repeat(22)+'.'+'x'.repeat(86),email='owner@example.com';
let db:PGlite;
type State={id:string;email:string;sessionId:string;credentialVersion:number;verified:boolean;mfaEnabled:boolean;freshUntil:string;totpSecret:string|null;pendingSecret:string|null;pendingExpiresAt:string|null};
async function role(name='service_role'){await db.exec('reset role');if(name)await db.exec('set role '+name);}
async function rpc<T=State>(action:string,input:Record<string,unknown>={}){return (await db.query<{result:T}>('select public.orbit_manager_auth($1,$2::jsonb) as result',[action,JSON.stringify(input)])).rows[0].result;}
async function bootstrap(){return rpc('bootstrap',{tokenHash:invite,email,passwordHash:hash,sessionHash:session});}
async function admin(sql:string,params:unknown[]=[]){await role('');try{return params.length?await db.query(sql,params):await db.exec(sql);}finally{await role();}}
async function startMfa(){const pending='v1.'+'e'.repeat(90);await rpc('mfa-start',{sessionHash:session,credentialVersion:1,pendingSecret:pending});return pending;}
beforeAll(async()=>{db=new PGlite();await db.exec('create role anon;create role authenticated;create role service_role;create schema orbit_private;revoke all on schema orbit_private from public,anon,authenticated,service_role;');await db.exec(readFileSync(new URL('../supabase/migrations/20261031000200_application_manager_auth.sql',import.meta.url),'utf8'));});
beforeEach(async()=>{await admin("truncate orbit_private.manager_identity,orbit_private.manager_sessions,orbit_private.manager_bootstrap,orbit_private.manager_attempts;insert into orbit_private.manager_bootstrap(token_hash,expires_at) values('"+invite+"',clock_timestamp()+interval '7 days');");});
afterAll(async()=>db?.close());
describe('service-only singleton manager authentication storage',()=>{
 it('denies all public identities direct credential/session access and security RPC execution',async()=>{
  await bootstrap();for(const name of ['anon','authenticated']){await role(name);await expect(rpc('credentials')).rejects.toThrow(/permission denied/);await expect(db.query('select * from orbit_private.manager_identity')).rejects.toThrow(/permission denied/);}
  await role();await expect(db.query('select * from orbit_private.manager_identity')).rejects.toThrow(/permission denied/);
 });
 it('atomically consumes the invitation once, rejects expired/wrong links and never reopens after identity deletion',async()=>{
  expect(await rpc<boolean>('bootstrap-available')).toBe(true);await expect(rpc('bootstrap-check',{tokenHash:secondSession})).rejects.toMatchObject({code:'PT404'});
  const created=await bootstrap();expect(created).toMatchObject({email,mfaEnabled:false});expect(await rpc<boolean>('bootstrap-available')).toBe(false);
  await expect(bootstrap()).rejects.toMatchObject({code:'PT404'});await expect(rpc('bootstrap-check',{tokenHash:invite})).rejects.toMatchObject({code:'PT404'});
  await admin('delete from orbit_private.manager_identity');expect(await rpc<boolean>('bootstrap-available')).toBe(false);await expect(bootstrap()).rejects.toMatchObject({code:'PT404'});
  await admin("update orbit_private.manager_bootstrap set token_hash='"+invite+"',consumed_at=null,expires_at=clock_timestamp()-interval '1 second'");expect(await rpc<boolean>('bootstrap-available')).toBe(false);await expect(bootstrap()).rejects.toMatchObject({code:'PT404'});
 });
 it('expires sessions after 30 minutes idle or 12 hours absolute, and enforces freshness separately',async()=>{
  await bootstrap();await admin("update orbit_private.manager_sessions set fresh_until=clock_timestamp()-interval '1 second'");
  expect((await rpc('session',{sessionHash:session})).verified).toBe(true);await expect(startMfa()).rejects.toMatchObject({code:'PT403'});
  await admin("update orbit_private.manager_sessions set last_seen=clock_timestamp()-interval '31 minutes'");await expect(rpc('session',{sessionHash:session})).rejects.toMatchObject({code:'PT401'});
  await admin("update orbit_private.manager_sessions set last_seen=clock_timestamp(),expires_at=clock_timestamp()-interval '1 second'");await expect(rpc('session',{sessionHash:session})).rejects.toMatchObject({code:'PT401'});
 });
 it('keeps password-only MFA logins pending and rejects replayed OTP counters and security mutations',async()=>{
  await bootstrap();const pending=await startMfa();await rpc('mfa-enable',{sessionHash:session,credentialVersion:1,pendingSecret:pending,counter:100,nextSessionHash:secondSession});
  expect(await rpc('login',{credentialVersion:2,sessionHash:thirdSession})).toMatchObject({requiresMfa:true});
  const state=await rpc('session',{sessionHash:thirdSession});expect(state).toMatchObject({verified:false,mfaEnabled:true});
  await expect(rpc('mfa-start',{sessionHash:thirdSession,credentialVersion:2,pendingSecret:pending})).rejects.toMatchObject({code:'PT401'});
  await expect(rpc('verify',{sessionHash:thirdSession,credentialVersion:2,counter:100,nextSessionHash:session})).rejects.toMatchObject({code:'PT409'});
  await rpc('verify',{sessionHash:thirdSession,credentialVersion:2,counter:101,nextSessionHash:session});expect((await rpc('session',{sessionHash:session})).verified).toBe(true);
  await expect(rpc('session',{sessionHash:thirdSession})).rejects.toMatchObject({code:'PT401'});
  await expect(rpc('verify',{sessionHash:session,credentialVersion:2,counter:101,nextSessionHash:thirdSession})).rejects.toMatchObject({code:'PT409'});
 });
 it('rotates security version and all session tokens on password/MFA changes, preserving only the updated session',async()=>{
  await bootstrap();await rpc('login',{credentialVersion:1,sessionHash:secondSession});
  await rpc('password',{sessionHash:session,credentialVersion:1,passwordHash:hash+'x',nextSessionHash:thirdSession});
  await expect(rpc('session',{sessionHash:session})).rejects.toMatchObject({code:'PT401'});await expect(rpc('session',{sessionHash:secondSession})).rejects.toMatchObject({code:'PT401'});
  expect((await rpc('session',{sessionHash:thirdSession})).credentialVersion).toBe(2);
  await expect(rpc('login',{credentialVersion:1,sessionHash:session})).rejects.toMatchObject({code:'PT401'});
  const pending='v1.'+'p'.repeat(90);await rpc('mfa-start',{sessionHash:thirdSession,credentialVersion:2,pendingSecret:pending});
  await rpc('mfa-enable',{sessionHash:thirdSession,credentialVersion:2,pendingSecret:pending,counter:100,nextSessionHash:session});
  await rpc('login',{credentialVersion:3,sessionHash:secondSession});
  await rpc('mfa-disable',{sessionHash:session,credentialVersion:3,counter:101,nextSessionHash:thirdSession});
  const state=await rpc('session',{sessionHash:thirdSession});expect(state).toMatchObject({credentialVersion:4,mfaEnabled:false,totpSecret:null,pendingSecret:null});
  await expect(rpc('session',{sessionHash:secondSession})).rejects.toMatchObject({code:'PT401'});
 });
 it('rejects expired enrollment/pending login challenges and has a durable bounded attempt limiter',async()=>{
  await bootstrap();const pending=await startMfa();await admin("update orbit_private.manager_identity set totp_pending_expires_at=clock_timestamp()-interval '1 second'");
  await expect(rpc('mfa-enable',{sessionHash:session,credentialVersion:1,pendingSecret:pending,counter:100,nextSessionHash:secondSession})).rejects.toMatchObject({code:'PT409'});
  await startMfa();await rpc('mfa-enable',{sessionHash:session,credentialVersion:1,pendingSecret:pending,counter:100,nextSessionHash:secondSession});
  await rpc('login',{credentialVersion:2,sessionHash:thirdSession});await admin("update orbit_private.manager_sessions set challenge_expires_at=clock_timestamp()-interval '1 second' where token_hash='"+thirdSession+"'");
  await expect(rpc('session',{sessionHash:thirdSession})).rejects.toMatchObject({code:'PT401'});
  expect(await rpc<boolean>('rate',{key:invite,limit:2})).toBe(true);expect(await rpc<boolean>('rate',{key:invite,limit:2})).toBe(true);expect(await rpc<boolean>('rate',{key:invite,limit:2})).toBe(false);
 });
});
