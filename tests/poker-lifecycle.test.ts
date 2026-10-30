import {afterAll,beforeAll,beforeEach,describe,expect,it} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {fullWorkspace} from './fixtures';

const owner='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const guest='b'.repeat(64),secondGuest='c'.repeat(64);
const tabA='11111111-1111-4111-8111-11111111111a',tabB='11111111-1111-4111-8111-11111111111b',tabC='11111111-1111-4111-8111-11111111111c';
type State={room:{closed:boolean;closeReason:string|null};self:{id:string;name:string;owner:boolean}|null;connectionLeft?:boolean;participants:{id:string;active:boolean}[];round:{id:string;revealed:boolean};rooms?:unknown[];decks?:unknown[]};
let db:PGlite,token:string,identity:string|null;
async function user(id:string|null){identity=id;await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${id?'authenticated':'anon'}`);}
async function rpc(action:string,input:Record<string,unknown>={},session=''){return (await db.query<{result:State}>('select public.orbit_poker($1,$2,$3,$4::jsonb) as result',[action,token,session,JSON.stringify(input)])).rows[0].result;}
async function state(connectionId=tabA,session='',extra:Record<string,unknown>={}){return (await db.query<{result:State}>('select public.orbit_poker_room_state($1,$2,$3::jsonb) as result',[token,session,JSON.stringify({connectionId,...extra})])).rows[0].result;}
async function admin<T=Record<string,unknown>>(sql:string,params:unknown[]=[]) {const restore=identity;await db.exec('reset role');try{return await db.query<T>(sql,params);}finally{await user(restore);}}
async function ageConnections(seconds:number){await admin('update orbit_private.poker_connections set last_seen=clock_timestamp()-$1::int*interval \'1 second\' where room_id=(select id from public.orbit_poker_rooms where invite_token=$2)',[seconds,token]);}
async function ageRoom(seconds:number){await admin('update public.orbit_poker_rooms set created_at=clock_timestamp()-$1::int*interval \'1 second\' where invite_token=$2',[seconds,token]);}
async function ageEmpty(seconds:number){await admin('update public.orbit_poker_rooms set empty_since=clock_timestamp()-$1::int*interval \'1 second\' where invite_token=$2',[seconds,token]);}

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${other}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of readdirSync(dir).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
 await user(owner);const loaded=(await db.query<{result:{revision:number}}>('select public.orbit_get_workspace() as result')).rows[0].result;
 await db.query('select public.orbit_save_workspace($1::jsonb,$2)',[JSON.stringify(fullWorkspace()),loaded.revision]);
});
beforeEach(async()=>{await user(owner);token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');await rpc('create',{projectId:fullWorkspace().activeId,name:'Lifecycle fixture',deck:['1','2','3'],settings:{autoReveal:false}});});
afterAll(async()=>{await db?.close();});

describe('per-document Poker presence and empty-room lifecycle',()=>{
 it('gives a newly created room arrival grace without allowing an expired invitation to resurrect',async()=>{
  await user(null);expect((await state()).room.closed).toBe(false);expect((await state()).self).toBeNull();
  await ageRoom(91);expect((await state()).room).toMatchObject({closed:true,closeReason:'empty'});
  await user(owner);expect((await state()).room.closed).toBe(true);
  await expect(rpc('close',{closed:false,connectionId:tabB})).rejects.toMatchObject({code:'PT409'});
  await user(null);await expect(rpc('join',{name:'Late arrival',connectionId:tabA},guest)).rejects.toMatchObject({code:'PT409'});
 });
 it('closes immediately when the final participant explicitly leaves and keeps archived details readable',async()=>{
  const joined=await state();const left=await rpc('leave',{connectionId:tabA});
  expect(left.room).toMatchObject({closed:true,closeReason:'empty'});expect(left.connectionLeft).toBe(true);
  const archived=await state(tabB);expect(archived.self?.id).toBe(joined.self?.id);expect(archived.room.closed).toBe(true);
  const counts=await admin<{count:number}>('select count(*)::int as count from orbit_private.poker_connections where room_id=(select id from public.orbit_poker_rooms where invite_token=$1) and left_at is null',[token]);expect(counts.rows[0].count).toBe(0);
 });
 it('retires only one tab for a shared guest identity and rejects a late request from that retired document',async()=>{
  await user(null);const first=await rpc('join',{name:'Same participant',connectionId:tabA},guest),sibling=await state(tabB,guest);
  expect(sibling.self?.id).toBe(first.self?.id);const left=await rpc('leave',{connectionId:tabA},guest);expect(left.room.closed).toBe(false);
  expect((await state(tabB,guest)).participants.find(person=>person.id===first.self?.id)?.active).toBe(true);
  expect((await state(tabA,guest)).connectionLeft).toBe(true);
  await expect(rpc('vote',{connectionId:tabA,roundId:first.round.id,value:'3'},guest)).rejects.toMatchObject({code:'PT409'});
  expect((await rpc('leave',{connectionId:tabB},guest)).room.closed).toBe(true);
 });
 it('allows a reload within the passive departure grace, then closes after the final grace expires',async()=>{
  await user(null);const first=await rpc('join',{name:'Reloading guest',connectionId:tabA},guest);
  expect((await rpc('leave',{connectionId:tabA,departing:true},guest)).room.closed).toBe(false);
  const reloaded=await state(tabB,guest);expect(reloaded.room.closed).toBe(false);expect(reloaded.self?.id).toBe(first.self?.id);
  await rpc('leave',{connectionId:tabB,departing:true},guest);await ageEmpty(11);
  const expired=await state(tabC,guest);expect(expired.room).toMatchObject({closed:true,closeReason:'empty'});
  expect(expired.participants.every(person=>!person.active)).toBe(true);
 });
 it('closes a silently disconnected final lease before accepting its delayed heartbeat',async()=>{
  await state();await ageConnections(61);expect((await state(tabA)).room).toMatchObject({closed:true,closeReason:'empty'});
  const count=await admin<{count:number}>('select count(*)::int as count from orbit_private.poker_connections where room_id=(select id from public.orbit_poker_rooms where invite_token=$1) and last_seen>clock_timestamp()-interval \'60 seconds\'',[token]);expect(count.rows[0].count).toBe(0);
 });
 it('keeps the room open while a second tab remains live, even after another lease expires',async()=>{
  await state();await ageConnections(61);
  // Model a heartbeat committed by the other document before the stale one returns.
  await admin('insert into orbit_private.poker_connections(room_id,participant_id,connection_hash,last_seen) select room_id,id,encode(sha256(convert_to($1,\'UTF8\')),\'hex\'),clock_timestamp() from public.orbit_poker_participants where room_id=(select id from public.orbit_poker_rooms where invite_token=$2)',[tabB,token]);
  expect((await state(tabA)).room.closed).toBe(false);expect((await rpc('leave',{connectionId:tabA})).room.closed).toBe(false);
  expect((await rpc('leave',{connectionId:tabB})).room.closed).toBe(true);
 });
 it('scopes connection IDs to the participant and prevents direct presence inspection',async()=>{
  await user(null);const first=await rpc('join',{name:'First',connectionId:tabA},guest);await rpc('join',{name:'Second',connectionId:tabB},secondGuest);
  // Knowing a sibling participant's UUID is insufficient to retire their lease.
  await rpc('leave',{connectionId:tabA},secondGuest);const current=await state(tabB,secondGuest);
  expect(current.participants.find(person=>person.id===first.self?.id)?.active).toBe(true);
  await expect(db.query('select * from orbit_private.poker_connections')).rejects.toThrow(/permission denied/);
  await expect(db.query('select orbit_private.poker_refresh_lifecycle(gen_random_uuid())')).rejects.toThrow(/permission denied/);
  await expect(rpc('leave',{connectionId:'not-a-uuid'},guest)).rejects.toMatchObject({code:'22023'});
 });
 it('does not let internal observation create phantom participation or extend an empty room',async()=>{
  const observed=await state(tabA,'',{observeOnly:true});expect(observed.self?.owner).toBe(true);
  const counts=await admin<{count:number}>('select count(*)::int as count from orbit_private.poker_connections where room_id=(select id from public.orbit_poker_rooms where invite_token=$1)',[token]);expect(counts.rows[0].count).toBe(0);
  await ageRoom(91);expect((await state(tabB,'',{observeOnly:true})).room.closed).toBe(true);
 });
 it('retains manual closure as manual and permits the facilitator to reopen it',async()=>{
  await state();expect((await rpc('close',{closed:true,connectionId:tabA})).room.closeReason).toBe('manual');
  await ageConnections(61);expect((await state(tabB)).room).toMatchObject({closed:true,closeReason:'manual'});
  expect((await rpc('close',{closed:false,connectionId:tabC})).room).toMatchObject({closed:false,closeReason:null});
 });
 it('returns saved decks without keeping a recent-room directory',async()=>{
  await rpc('save-deck',{projectId:fullWorkspace().activeId,name:'Lifecycle deck',values:['1','2']});
  const listing=await rpc('list',{projectId:fullWorkspace().activeId});expect(listing.rooms).toEqual([]);expect(listing.decks).toContainEqual({name:'Lifecycle deck',values:['1','2']});
 });
 it('rejects a new publication after everyone leaves without changing the saved workspace',async()=>{
  await state();const loaded=(await db.query<{result:{revision:number;workspace:unknown}}>('select public.orbit_get_workspace() as result')).rows[0].result;
  await rpc('leave',{connectionId:tabA});
  await expect(db.query('select public.orbit_poker_publish($1,$2,$3::jsonb,$4::uuid,$5,$6::jsonb)',[token,loaded.revision,JSON.stringify(loaded.workspace),crypto.randomUUID(),'t1',JSON.stringify({projectId:fullWorkspace().activeId,featureId:'f1',taskIds:['t1']})])).rejects.toMatchObject({code:'PT409'});
  expect((await db.query<{result:unknown}>('select public.orbit_get_workspace() as result')).rows[0].result).toEqual(loaded);
 });
 it('preserves a registered full name across owner refreshes without truncating it to a guest nickname',async()=>{
  const fullName='A'.repeat(100)+' '+'B'.repeat(100);
  expect((await state(tabA,'',{ownerName:fullName})).self?.name).toBe(fullName);
  expect((await state(tabA,'',{ownerName:'Updated registered name'})).self?.name).toBe('Updated registered name');
 });
});
