import {beforeAll,beforeEach,afterAll,describe,it,expect} from 'vitest';
import {PGlite} from '@electric-sql/pglite';
import {readFileSync,readdirSync} from 'node:fs';
import {fullWorkspace} from './fixtures';

let db:PGlite,token:string;
const owner='11111111-1111-4111-8111-111111111111',stranger='22222222-2222-4222-8222-222222222222';
const guest='b'.repeat(64),second='c'.repeat(64),spectator='d'.repeat(64);
type WorkItem={id:string;role:string|null;assignee:string|null;estimate:number|null};
type State={room:{projectId:string;projectName?:string;closed:boolean};self:{id:string;owner:boolean;spectator:boolean}|null;round:{id:string;issue:string;votes:{participantId:string;value?:string}[]};participants:{id:string;value?:string}[];epics:{id:string;stories:{id:string;canonicalId:string;workItems:WorkItem[]}[]}[]};
async function user(id:string|null){await db.exec('reset role');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[id||'']);await db.exec(`set role ${id?'authenticated':'anon'}`);}
async function rpc(action:string,input:Record<string,unknown>={},session='',room=token){return (await db.query<{result:State}>('select public.orbit_poker($1,$2,$3,$4::jsonb) as result',[action,room,session,JSON.stringify(input)])).rows[0].result;}
async function state(session='',issue='free',room=token){return (await db.query<{result:State}>('select public.orbit_poker_room_state($1,$2,$3::jsonb) as result',[room,session,JSON.stringify({issue})])).rows[0].result;}
async function workspace(){return (await db.query<{result:{revision:number;workspace:ReturnType<typeof fullWorkspace>}}>('select public.orbit_get_workspace() as result')).rows[0].result;}
async function save(value:Awaited<ReturnType<typeof workspace>>){await db.query('select public.orbit_save_workspace($1::jsonb,$2)',[JSON.stringify(value.workspace),value.revision]);}

beforeAll(async()=>{
 db=new PGlite();await db.exec(`create role anon;create role authenticated;create schema auth;grant usage on schema auth to anon,authenticated;create table auth.users(id uuid primary key);insert into auth.users values('${owner}'),('${stranger}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
 const dir=new URL('../supabase/migrations/',import.meta.url);for(const file of readdirSync(dir).filter(name=>/^\d{14}_[a-z0-9_]+\.sql$/.test(name)).sort())await db.exec(readFileSync(new URL(file,dir),'utf8'));
});
beforeEach(async()=>{
 await user(owner);const initial=await workspace(),value=fullWorkspace(),data=value.projects[0].data;value.projects[0].name='Rule planning';
 data.people.push({...data.people[0],id:'uFront',roleId:'rfront',role:'Frontend Developer',platform:'Frontend',name:'Sam Front',firstName:'Sam',lastName:'Front'});
 Object.assign(data.tasks[0],{storyId:'shared-story',roleId:'r1',title:'One story'});
 Object.assign(data.tasks[1],{storyId:'shared-story',roleId:'rfront',assignee:'uFront',platform:'Frontend',title:'Frontend work',effort:0.5});
 data.tasks[2].title='One story';
 data.tasks.push({...data.tasks[2],id:'unestimated',title:'Unestimated placeholder',platform:'',effort:0});
 data.features.push({...data.features[0],id:'other-epic',title:'Another epic'});
 data.tasks.push({...data.tasks[0],id:'other-epic-item',featureId:'other-epic',title:'Separate story with same group ID'});
 const privateProject=structuredClone(value.projects[0]);privateProject.id='private-project';privateProject.name='Private project name';privateProject.data.people[0].name='Unshared person name';privateProject.data.roles[0].name='Unshared role name';privateProject.data.tasks[0].effort=123;value.projects.push(privateProject);
 await save({workspace:value,revision:initial.revision});token=crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
 await rpc('create',{projectId:value.activeId,name:'Shared estimation',deck:['1','2','3','5'],settings:{countdown:false}});
});
afterAll(async()=>{await db?.close();});

describe('invitation-scoped Poker story metadata',()=>{
 it('projects the current project and actual role work items without collapsing duplicate names or crossing epics',async()=>{
  const current=await state();expect(current.room.projectName).toBe('Rule planning');
  expect(current.epics[0].stories.find(story=>story.id==='t1')?.workItems).toEqual([
   {id:'t1',role:'Backend Developer',assignee:'Alex Dev',estimate:3},
   {id:'t2',role:'Frontend Developer',assignee:'Sam Front',estimate:0.5},
  ]);
  expect(current.epics[0].stories.find(story=>story.id==='t3')?.workItems).toEqual([{id:'t3',role:'Frontend Developer',assignee:null,estimate:2}]);
  expect(current.epics[0].stories.find(story=>story.id==='unestimated')?.workItems).toEqual([{id:'unestimated',role:null,assignee:null,estimate:null}]);
  expect(current.epics[1].stories[0].workItems.map(item=>item.id)).toEqual(['other-epic-item']);
 });
 it('shares only these details with joined guests and spectators and leaves hidden votes private',async()=>{
  const ownerState=await state();await user(null);await rpc('join',{name:'Guest'},guest);await rpc('join',{name:'Other guest'},second);await rpc('join',{name:'Observer',spectator:true},spectator);
  await rpc('vote',{issue:'free',roundId:ownerState.round.id,value:'5'},guest);await rpc('vote',{issue:'free',roundId:ownerState.round.id,value:'2'},second);
  for(const session of [guest,spectator]){const current=await state(session);expect(current.room.projectName).toBe('Rule planning');expect(current.epics).toEqual(ownerState.epics);expect(current.self?.owner).toBe(false);expect(current.round.votes.filter(vote=>vote.value!==undefined)).toEqual(session===guest?[{participantId:current.self!.id,value:'5'}]:[]);
   const serialized=JSON.stringify(current);for(const secret of ['Private project name','Unshared person name','Unshared role name','firstName','lastName','capacity','meetings','vacation','color'])expect(serialized).not.toContain(secret);
  }
  await expect(db.query('select * from public.orbit_work_items')).rejects.toThrow(/permission denied/);
  await expect(db.query('select * from public.orbit_people')).rejects.toThrow(/permission denied/);
 });
 it('does not enrich an unjoined invitation, unrelated login or a session from another room',async()=>{
  await user(null);const unjoined=await state();expect(unjoined.self).toBeNull();expect(unjoined.room).not.toHaveProperty('projectName');expect(unjoined.epics).toEqual([]);
  await rpc('join',{name:'Guest'},guest);await user(owner);const otherToken='e'.repeat(64);await rpc('create',{projectId:fullWorkspace().activeId,name:'Another room',deck:['1','2']},'',otherToken);
  await user(null);const wrongRoom=await state(guest,'free',otherToken);expect(wrongRoom.self).toBeNull();expect(wrongRoom.room).not.toHaveProperty('projectName');expect(wrongRoom.epics).toEqual([]);
  await user(stranger);const outsider=await state();expect(outsider.self).toBeNull();expect(outsider.room).not.toHaveProperty('projectName');expect(outsider.epics).toEqual([]);
  await expect(state('','free','f'.repeat(64))).rejects.toMatchObject({code:'PT404'});
 });
 it('refreshes names, estimates and role grouping after normal planner saves without changing the voting identity',async()=>{
  const first=await state('','t1'),loaded=await workspace(),project=loaded.workspace.projects[0];project.name='Renamed project';project.data.people[0].name='Renamed developer';project.data.tasks.find(task=>task.id==='t1')!.effort=1.5;project.data.tasks.find(task=>task.id==='t2')!.featureId='other-epic';project.data.tasks.reverse();await save(loaded);
  const current=await state('','t1');expect(current.round.id).toBe(first.round.id);expect(current.room.projectName).toBe('Renamed project');
  expect(current.epics[0].stories.find(story=>story.id==='t1')?.workItems).toEqual([{id:'t1',role:'Backend Developer',assignee:'Renamed developer',estimate:1.5}]);
  expect(current.epics[1].stories[0].workItems.map(item=>item.id)).toEqual(['other-epic-item','t2']);
  const moved=await state('','t2');expect(moved.round.id).not.toBe(first.round.id);expect(moved.epics[1].stories[0].workItems).toHaveLength(2);
 });
 it('uses legacy assignee roles and leaves an ambiguous unassigned platform without an invented role',async()=>{
  const loaded=await workspace(),data=loaded.workspace.projects[0].data;delete data.tasks[0].roleId;data.roles.push({...data.roles[1],id:'second-front-role',name:'Frontend architect'});await save(loaded);
  const current=await state();expect(current.epics[0].stories.find(story=>story.id==='t1')?.workItems[0].role).toBe('Backend Developer');
  expect(current.epics[0].stories.find(story=>story.id==='t3')?.workItems).toEqual([{id:'t3',role:null,assignee:null,estimate:2}]);
 });
 it('keeps metadata readable to existing players in a closed room without admitting new guests',async()=>{
  await user(null);await rpc('join',{name:'Observer',spectator:true},spectator);const before=await state(spectator);await user(owner);await rpc('close',{closed:true});await user(null);
  const closed=await state(spectator);expect(closed.room.closed).toBe(true);expect(closed.room.projectName).toBe('Rule planning');expect(closed.epics).toEqual(before.epics);
  expect((await state()).room).not.toHaveProperty('projectName');await expect(rpc('join',{name:'Late guest'},guest)).rejects.toMatchObject({code:'PT409'});
 });
 it('fails closed after project deletion instead of exposing stale metadata',async()=>{
  await state();const loaded=await workspace();loaded.workspace.projects.splice(0,1);loaded.workspace.activeId='private-project';await save(loaded);
  await expect(state()).rejects.toMatchObject({code:'PT404'});
 });
});
