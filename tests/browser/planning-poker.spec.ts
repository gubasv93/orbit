import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {projectData} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
let owner:BrowserContext,alex:BrowserContext,otherAlex:BrowserContext,spectator:BrowserContext,stranger:BrowserContext;
let ownerPage:Page,alexPage:Page,otherAlexPage:Page,token:string;
let alexId:string,otherAlexId:string,ownerId:string,freeRoundId:string;
const contexts:BrowserContext[]=[];
function workspace():Workspace{
 const data=projectData();data.features[0].title='Disable Rules';
 data.roles.push({id:'front',name:'Frontend Developer',platform:'Frontend'},{id:'qa',name:'QA Engineer',platform:'QA'});
 data.people.push({...data.people[0],id:'uFront',name:'Private frontend surname',firstName:'Private',lastName:'Frontend',roleId:'front',role:'Frontend Developer',platform:'Frontend'},{...data.people[0],id:'uQA',name:'Private QA surname',firstName:'Private',lastName:'QA',roleId:'qa',role:'QA Engineer',platform:'QA'},{...data.people[0],id:'uUnshared',name:'Private unassigned directory contact'});
 Object.assign(data.tasks[0],{title:'Search for a rule to disable',storyId:'story-a',roleId:'r1',effort:2,remaining:1,status:'progress',manualEnd:'2026-11-05',dependsOn:['t2']});
 data.tasks.push({...data.tasks[0],id:'tFront',roleId:'front',platform:'Frontend',assignee:'uFront',effort:1,remaining:undefined,status:'planned',manualEnd:undefined,dependsOn:[]},{...data.tasks[0],id:'tQA',roleId:'qa',platform:'QA',assignee:'uQA',effort:1,remaining:undefined,status:'done',completedDate:'2026-10-27',manualEnd:undefined,dependsOn:[]},{...data.tasks[0],id:'t2',title:'Review another rule',storyId:undefined,effort:1,remaining:undefined,status:'planned',manualEnd:undefined,dependsOn:[]},{...data.tasks[0],id:'same-name-legacy',storyId:undefined,remaining:undefined,status:'planned',manualEnd:undefined,dependsOn:[]});
 const privateProject=structuredClone(data);privateProject.features[0].title='Private payroll epic';privateProject.tasks[0].title='Private payroll task';
 return {version:1,activeId:'poker-project',preferences:{scale:'day',sidebarHidden:false},projects:[{id:'poker-project',name:'Poker integration project',onboardingStep:0,data},{id:'private-project',name:'Private payroll project',onboardingStep:0,data:privateProject}]};
}
async function signup(context:BrowserContext){
 // The disposable Next server has no proxy. Give these independent test clients documentation-only IPv6 addresses,
 // so creating fixtures does not consume another browser suite's shared localhost signup bucket.
 const fixtureAddress='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
 const password='Orbit9'+randomUUID();const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':fixtureAddress},data:{email:`orbit-poker-${randomUUID()}@example.com`,password,confirm:password}});expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(){const response=await owner.request.get('/api/workspace');expect(response.status()).toBe(200);return response.json();}
async function state(context:BrowserContext,issue='free',room=token){const response=await context.request.get(`/api/poker/${room}?issue=${encodeURIComponent(issue)}`);expect(response.status(),await response.text()).toBe(200);return response.json();}
async function action(context:BrowserContext,input:Record<string,unknown>,expected=200,room=token){if(['vote','reveal','restart','accept'].includes(String(input.action))&&!input.roundId){const current=await state(context,String(input.issue||'free'),room);input={...input,roundId:current.round?.id||(await state(owner,String(input.issue||'free'),room)).round.id};}const response=await context.request.post(`/api/poker/${room}`,{headers:{Origin:origin},data:input});expect(response.status(),await response.text()).toBe(expected);return response.json();}
async function publish(input:Record<string,unknown>,expected=200,context=owner){const response=await context.request.post(`/api/poker/${token}/publish`,{headers:{Origin:origin},data:input});expect(response.status(),await response.text()).toBe(expected);return response.json();}
async function join(page:Page,name:string,asSpectator=false){await page.goto(`/poker/${token}`);await page.getByLabel('Your name',{exact:true}).fill(name);if(asSpectator)await page.getByLabel('Join as Spectator',{exact:true}).check();await page.getByRole('button',{name:'Join room',exact:true}).click();await expect(page.getByRole('button',{name:'Join room',exact:true})).toHaveCount(0);}
function voteMap(value:{round:{votes:{participantId:string;value?:string}[]}}){return new Map(value.round.votes.map(vote=>[vote.participantId,vote.value]));}

test.describe.serial('Planning Poker shared state, privacy and real Orbit publication',()=>{
 test.beforeAll(async({browser})=>{
  for(let i=0;i<5;i++)contexts.push(await browser.newContext());[owner,alex,otherAlex,spectator,stranger]=contexts;
  await signup(owner);const initial=await snapshot();expect((await owner.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:initial.revision,workspace:workspace()}})).status()).toBe(200);
  ownerPage=await owner.newPage();alexPage=await alex.newPage();otherAlexPage=await otherAlex.newPage();
 });
 test.afterAll(async()=>{for(const context of contexts)await context.close();});

 test('creates a project-scoped room from the real create form and starts with a free round without changing planning records',async()=>{
  const before=await snapshot();await ownerPage.goto('/app');await expect(ownerPage.locator('.gantt-canvas')).toBeVisible();await expect(ownerPage.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');await ownerPage.getByRole('button',{name:'Planning Poker',exact:true}).click();await expect(ownerPage).toHaveURL(/\/poker\/new\?project=poker-project$/);await expect(ownerPage.getByRole('heading',{name:'Create Poker Room',exact:true})).toBeVisible();await expect(ownerPage.getByLabel('Room name',{exact:true})).toBeVisible();await ownerPage.getByLabel('Room name',{exact:true}).fill('Rule estimation');await ownerPage.getByRole('button',{name:'Create Poker Room',exact:true}).click();await expect(ownerPage).toHaveURL(/\/poker\/[A-Za-z0-9_-]+$/);token=new URL(ownerPage.url()).pathname.split('/').at(-1)!;
  const current=await state(owner);expect(current.room.projectId).toBe('poker-project');expect(current.room.projectName).toBe('Poker integration project');expect(current.room.name).toBe('Rule estimation');expect(current.round.issue).toBe('free');expect(current.round.revealed).toBe(false);expect(current.room.settings).toMatchObject({autoReveal:false,showAverage:true,countdown:true});expect(current.self.owner).toBe(true);ownerId=current.self.id;freeRoundId=current.round.id;
  expect(current.epics).toHaveLength(1);expect(current.epics[0].stories).toHaveLength(3);expect((await snapshot()).workspace.projects).toEqual(before.workspace.projects);await expect(ownerPage.locator('.poker-table')).toBeVisible();for(const width of [1280,375,320]){await ownerPage.setViewportSize({width,height:900});expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await ownerPage.screenshot({path:`test-results/planning-poker-room-${width}.png`,fullPage:true});}await ownerPage.setViewportSize({width:1280,height:900});await ownerPage.reload();expect((await state(owner)).round.id).toBe(freeRoundId);
 });

 test('joins independent same-name guests, protects hidden values, rejects spectator/admin actions and synchronizes reveal across browsers',async()=>{
  test.setTimeout(90000);const before=await snapshot(),preview=await state(alex);expect(preview.self).toBeNull();expect(preview.room.projectName).toBeUndefined();expect(preview.epics).toEqual([]);await join(alexPage,'Alex');await join(otherAlexPage,'Alex');const spectatorPage=await spectator.newPage();await join(spectatorPage,'Observer',true);
  const a=await state(alex),b=await state(otherAlex);alexId=a.self.id;otherAlexId=b.self.id;expect(alexId).not.toBe(otherAlexId);expect((await state(spectator)).self.spectator).toBe(true);
  await alexPage.getByRole('button',{name:'Vote 5',exact:true}).click();await otherAlexPage.getByRole('button',{name:'Vote 8',exact:true}).click();await ownerPage.getByRole('button',{name:'Vote 3',exact:true}).click();await action(spectator,{action:'vote',issue:'free',value:'13'},403);await action(alex,{action:'reveal',issue:'free'},403);await action(alex,{action:'restart',issue:'free'},403);
  await expect.poll(async()=>{const current=await state(owner);return current.participants.filter((p:{voted:boolean})=>p.voted).length;}).toBe(3);
  const ownerState=await state(owner),guestState=await state(alex),observerState=await state(spectator);expect(voteMap(ownerState).get(ownerId)).toBe('3');expect(voteMap(ownerState).get(alexId)).toBeUndefined();expect(voteMap(ownerState).get(otherAlexId)).toBeUndefined();expect(voteMap(guestState).get(alexId)).toBe('5');expect(voteMap(guestState).get(otherAlexId)).toBeUndefined();expect(voteMap(guestState).get(ownerId)).toBeUndefined();expect([...voteMap(observerState).values()].filter(value=>value!==undefined)).toEqual([]);
  for(const current of [ownerState,guestState,observerState])for(const participant of current.participants)if(participant.id!==current.self.id)expect(participant.value).toBeUndefined();
  const sharedWorkItems=[{id:'t1',role:'Backend Developer',assignee:'Alex Dev',estimate:2},{id:'tFront',role:'Frontend Developer',assignee:'Private frontend surname',estimate:1},{id:'tQA',role:'QA Engineer',assignee:'Private QA surname',estimate:1}];
  for(const current of [ownerState,guestState,observerState]){expect(current.room.projectName).toBe('Poker integration project');expect(current.epics[0].stories.find((story:{id:string})=>story.id==='t1').workItems).toEqual(sharedWorkItems);}
  const guestJSON=JSON.stringify(guestState);for(const secret of ['Private payroll','Private unassigned directory contact','capacity','owner_user_id'])expect(guestJSON).not.toContain(secret);
  await ownerPage.getByRole('button',{name:'Reveal cards',exact:true}).click();await expect.poll(async()=>(await state(alex)).round.revealed).toBe(true);for(const context of [owner,alex,otherAlex,spectator]){const revealed=await state(context);expect(voteMap(revealed).get(ownerId)).toBe('3');expect(voteMap(revealed).get(alexId)).toBe('5');expect(voteMap(revealed).get(otherAlexId)).toBe('8');}
  await alexPage.reload();expect((await state(alex)).self.id).toBe(alexId);expect((await state(alex)).participants.filter((p:{name:string})=>p.name==='Alex')).toHaveLength(2);expect((await snapshot()).workspace).toEqual(before.workspace);await spectatorPage.close();
 });

 test('isolates independent story rounds, preserves free history and resolves story groups by identity rather than duplicate titles',async()=>{
  const before=await snapshot();await action(owner,{action:'restart',issue:'free'});await action(alex,{action:'vote',issue:'t1',value:'13'});await action(otherAlex,{action:'vote',issue:'t2',value:'2'});await action(owner,{action:'vote',issue:'t1',value:'5'});
  const a=await state(alex,'t1'),b=await state(otherAlex,'t2');expect(a.round.id).not.toBe(b.round.id);expect(voteMap(a).get(alexId)).toBe('13');expect(voteMap(a).get(otherAlexId)).toBeUndefined();expect(voteMap(b).get(otherAlexId)).toBe('2');expect(voteMap(b).get(alexId)).toBeUndefined();expect((await state(owner,'tFront')).round.id).toBe(a.round.id);expect((await state(owner,'same-name-legacy')).round.id).not.toBe(a.round.id);
  await action(owner,{action:'reveal',issue:'t1'});expect((await state(otherAlex,'t2')).round.revealed).toBe(false);expect(voteMap(await state(alex,'t1')).get(ownerId)).toBe('5');await action(alex,{action:'vote',issue:'t1',value:'8'},409);
  await action(owner,{action:'restart',issue:'t1'});const fresh=await state(alex,'t1');expect(fresh.round.id).not.toBe(a.round.id);expect(fresh.round.revealed).toBe(false);expect((await state(otherAlex,'t2')).round.id).toBe(b.round.id);expect(fresh.history.some((round:{id:string})=>round.id===freeRoundId)).toBe(true);expect(fresh.history.some((round:{id:string})=>round.id===a.round.id)).toBe(true);await action(alex,{action:'vote',issue:'t1',value:'8',roundId:a.round.id},409);expect((await state(alex,'t1')).round.votes).toHaveLength(0);expect((await snapshot()).workspace).toEqual(before.workspace);
 });

 test('rejects cross-room guest sessions, unauthenticated workspace access, cross-owner management and cross-origin mutations',async()=>{
  await signup(stranger);const denied=await stranger.request.post('/api/poker',{headers:{Origin:origin},data:{action:'create',projectId:'poker-project',name:'Not mine',deck:['1','2','?'],settings:{autoReveal:false,showAverage:true,countdown:false}}});expect([403,404]).toContain(denied.status());
  expect((await alex.request.get('/api/workspace')).status()).toBe(401);const strangerState=await state(stranger);expect(strangerState.self?.owner).not.toBe(true);const forbidden=await stranger.request.post(`/api/poker/${token}`,{headers:{Origin:origin},data:{action:'reveal',issue:'free',roundId:(await state(owner)).round.id}});expect([401,403]).toContain(forbidden.status());
  const create=await owner.request.post('/api/poker',{headers:{Origin:origin},data:{action:'create',projectId:'poker-project',name:'Other room',deck:['1','2','?'],settings:{autoReveal:false,showAverage:false,countdown:false}}});expect(create.status()).toBe(200);const second=(await create.json()).token;expect((await state(alex,'free',second)).self).toBeNull();await action(alex,{action:'vote',issue:'free',value:'1'},401,second);
  expect((await alex.request.post(`/api/poker/${token}`,{headers:{Origin:'https://unrelated.example'},data:{action:'vote',issue:'free',value:'1'}})).status()).toBe(403);
  const invalid=await alex.request.post(`/api/poker/${token}`,{headers:{Origin:origin},data:{action:'vote',issue:'not-a-project-story',value:'1',roundId:randomUUID()}});expect([400,404]).toContain(invalid.status());
 });

 test('auto-reveals only after active eligible voters finish, excluding spectators and departed participants',async()=>{
  const created=await owner.request.post('/api/poker',{headers:{Origin:origin},data:{action:'create',projectId:'poker-project',name:'Auto reveal room',deck:['1','2','?'],settings:{autoReveal:true,showAverage:true,countdown:false}}});expect(created.status()).toBe(200);const room=(await created.json()).token;
  await state(owner,'free',room);const joined=await action(alex,{action:'join',name:'Auto voter',spectator:false},200,room);await action(spectator,{action:'join',name:'Auto observer',spectator:true},200,room);
  await action(owner,{action:'vote',issue:'free',value:'1'},200,room);expect((await state(owner,'free',room)).round.revealed).toBe(false);await action(alex,{action:'vote',issue:'free',value:'2'},200,room);expect((await state(spectator,'free',room)).round.revealed).toBe(true);
  await action(alex,{action:'leave',issue:'free'},200,room);await action(owner,{action:'restart',issue:'free'},200,room);await action(owner,{action:'vote',issue:'free',value:'1'},200,room);const final=await state(owner,'free',room);expect(final.round.revealed).toBe(true);expect(final.participants.find((participant:{id:string})=>participant.id===joined.self.id).active).toBe(false);
 });

 test('updates existing identities atomically, preserves schedule/history and rejects stale writes while publication retries remain idempotent',async()=>{
  test.setTimeout(90000);await action(owner,{action:'vote',issue:'t1',value:'5'});await action(owner,{action:'reveal',issue:'t1'});const selected=await state(owner,'t1'),before=await snapshot(),original=before.workspace.projects[0].data;
  const request={operationId:randomUUID(),revision:before.revision,kind:'story',featureId:'f1',taskId:'t1',title:'Search for a rule to disable',teams:[{roleId:'r1',assignee:'u1',effort:3},{roleId:'front',assignee:'uFront',effort:1.5},{roleId:'qa',assignee:'uQA',effort:1}],acceptedVote:'5',roundId:selected.round.id,confirmProgress:true};
  const guest=await alex.request.post(`/api/poker/${token}/publish`,{headers:{Origin:origin},data:request});expect([401,403]).toContain(guest.status());const confirmation=await publish({...request,confirmProgress:false},409);expect(confirmation.code).toBe('confirmation_required');expect(await snapshot()).toEqual(before);
  const saved=await publish(request);expect(saved.taskIds.slice().sort()).toEqual(['t1','tFront','tQA'].sort());const after=await snapshot(),data=after.workspace.projects[0].data;expect(data.tasks.map((task:{id:string})=>task.id)).toEqual(original.tasks.map((task:{id:string})=>task.id));expect(data.tasks.find((task:{id:string})=>task.id==='t1')).toMatchObject({...original.tasks[0],effort:3,remaining:2});expect(data.tasks.find((task:{id:string})=>task.id==='tFront').effort).toBe(1.5);expect(data.tasks.find((task:{id:string})=>task.id==='tQA')).toEqual(original.tasks.find((task:{id:string})=>task.id==='tQA'));expect(data.tasks.find((task:{id:string})=>task.id==='same-name-legacy')).toEqual(original.tasks.find((task:{id:string})=>task.id==='same-name-legacy'));expect(after.workspace.projects[1]).toEqual(before.workspace.projects[1]);
  expect(await publish(request)).toEqual(saved);expect(await snapshot()).toEqual(after);await publish({...request,operationId:randomUUID()},409);expect((await owner.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:before.revision,workspace:before.workspace}})).status()).toBe(409);expect(await snapshot()).toEqual(after);
  const competing=await Promise.all(['Race A','Race B'].map(title=>owner.request.post(`/api/poker/${token}/publish`,{headers:{Origin:origin},data:{operationId:randomUUID(),revision:after.revision,kind:'epic',title}})));expect(competing.map(response=>response.status()).sort()).toEqual([200,409]);const raced=await snapshot();expect(raced.workspace.projects[0].data.features.filter((feature:{title:string})=>feature.title.startsWith('Race '))).toHaveLength(1);expect(raced.workspace.projects[0].data.tasks).toEqual(data.tasks);
 });

 test('creates actual epics and grouped/unestimated stories, then re-estimates through the room form and opens the real Gantt',async()=>{
  test.setTimeout(120000);let current=await snapshot();const request={operationId:randomUUID(),revision:current.revision,kind:'story',newEpic:{title:'Poker-created epic'},title:'Poker-created story',description:'Persisted story notes',teams:[{roleId:'r1',assignee:'u1',effort:2},{roleId:'front',assignee:'uFront',effort:1},{roleId:'qa',assignee:'',effort:0}]};const [saved,replayed]=await Promise.all([publish(request),publish(request)]);expect(saved.taskIds).toHaveLength(3);expect(replayed).toEqual(saved);current=await snapshot();const items=current.workspace.projects[0].data.tasks.filter((task:{id:string})=>saved.taskIds.includes(task.id));expect(new Set(items.map((task:{storyId:string})=>task.storyId)).size).toBe(1);expect(items.every((task:{featureId:string})=>task.featureId===saved.featureId)).toBe(true);expect(items.map((task:{effort:number})=>task.effort)).toEqual([2,1,0]);
  const unestimated=await publish({operationId:randomUUID(),revision:current.revision,kind:'story',featureId:saved.featureId,title:'Name-only poker story',teams:[]});current=await snapshot();expect(unestimated.taskIds).toHaveLength(1);expect(current.workspace.projects[0].data.tasks.find((task:{id:string})=>task.id===unestimated.taskIds[0])).toMatchObject({effort:0,assignee:'',platform:''});
  await ownerPage.goto(`/poker/${token}`);await ownerPage.getByLabel('Search epics or stories',{exact:true}).fill('Poker-created story');await ownerPage.getByRole('button',{name:'Select story Poker-created story',exact:true}).click();await ownerPage.getByRole('button',{name:'Vote 5',exact:true}).click();await ownerPage.getByRole('button',{name:'Reveal cards',exact:true}).click();await expect(ownerPage.getByRole('button',{name:'Finalize Estimate',exact:true})).toBeVisible();await ownerPage.getByRole('button',{name:'Finalize Estimate',exact:true}).click();await expect(ownerPage.getByLabel('Backend Developer estimate (days)',{exact:true})).toHaveValue('2');await expect(ownerPage.getByLabel('Frontend Developer estimate (days)',{exact:true})).toHaveValue('1');for(const width of [1280,375,320]){await ownerPage.setViewportSize({width,height:900});expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);expect(await ownerPage.getByRole('dialog',{name:'Finalize Estimate',exact:true}).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await ownerPage.screenshot({path:`test-results/planning-poker-editor-${width}.png`,fullPage:true});}await ownerPage.setViewportSize({width:1280,height:900});await ownerPage.getByLabel('Backend Developer estimate (days)',{exact:true}).fill('2.5');await ownerPage.getByRole('button',{name:'Save / Update Orbit Work Items',exact:true}).click();await expect(ownerPage.getByText('Story saved to Orbit',{exact:true})).toBeVisible();await ownerPage.getByRole('link',{name:/^View in Gantt Chart/}).click();await expect(ownerPage.locator('.gantt-canvas')).toBeVisible();for(const id of saved.taskIds)await expect(ownerPage.locator(`[data-row-task="${id}"]`)).toBeVisible();current=await snapshot();expect(current.workspace.projects[0].data.tasks.find((task:{id:string;roleId:string})=>saved.taskIds.includes(task.id)&&task.roleId==='r1').effort).toBe(2.5);
  await ownerPage.reload();await expect(ownerPage.locator(`[data-row-task="${saved.taskIds[0]}"]`)).toBeVisible();
 });

 test('keeps shared story details, estimation controls and collapsible panels usable with a long backlog on short and narrow screens',async()=>{
  test.setTimeout(90000);
  const original=await snapshot(),temporary=structuredClone(original.workspace) as Workspace;
  const project=temporary.projects.find(project=>project.id==='poker-project')!,source=project.data.tasks.find(task=>task.id==='t1')!;
  for(let index=0;index<36;index++)project.data.tasks.push({...source,id:'poker-scroll-'+index,title:'Scroll story '+String(index).padStart(2,'0'),storyId:undefined,effort:index===35?0:0.5,remaining:undefined,status:'planned',manualEnd:undefined,completedDate:undefined,dependsOn:[]});
  expect((await owner.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:original.revision,workspace:temporary}})).status()).toBe(200);
  const inViewport=async(selector:ReturnType<Page['getByRole']>)=>{
   await expect(selector).toBeVisible();const box=await selector.boundingBox(),viewport=ownerPage.viewportSize()!;
   expect(box).not.toBeNull();expect(box!.x).toBeGreaterThanOrEqual(0);expect(box!.y).toBeGreaterThanOrEqual(0);expect(box!.x+box!.width).toBeLessThanOrEqual(viewport.width+1);expect(box!.y+box!.height).toBeLessThanOrEqual(viewport.height+1);
  };
  try{
   await ownerPage.setViewportSize({width:1280,height:720});await ownerPage.goto(`/poker/${token}`);
   const navigation=ownerPage.getByRole('complementary',{name:'Project navigation'}),features=ownerPage.getByRole('complementary',{name:'Features / Epics'}),game=ownerPage.locator('.poker-game');
   await expect(navigation.getByText('Poker integration project',{exact:true})).toBeVisible();await expect(ownerPage.getByText('Current project',{exact:true})).toHaveCount(0);
   const search=ownerPage.getByLabel('Search epics or stories',{exact:true});await search.fill('Search for a rule to disable');
   const story=features.getByRole('button',{name:'Select story Search for a rule to disable',exact:true}).filter({has:ownerPage.locator('.poker-story-work-items')}).first();
   await expect(story).toContainText('Backend Developer');await expect(story).toContainText('Alex Dev');await expect(story).toContainText('Frontend Developer');await expect(story).toContainText('Private frontend surname');await expect(story).toContainText('QA Engineer');
   await expect(story.locator('.poker-work-estimate')).toHaveText(['3d est.','1.5d est.','1d est.']);
   await story.click();await expect(story).toHaveAttribute('aria-pressed','true');
   const edit=ownerPage.getByRole('button',{name:'Edit story estimate',exact:true});await inViewport(edit);await expect(ownerPage.locator('.poker-current-story').getByRole('button',{name:'Edit story estimate',exact:true})).toBeVisible();await edit.click();
   const dialog=ownerPage.getByRole('dialog',{name:'Edit Story',exact:true});await expect(dialog).toBeVisible();await expect(dialog.getByLabel('Backend Developer estimate (days)',{exact:true})).toHaveValue('3');await expect(dialog.getByLabel('Frontend Developer estimate (days)',{exact:true})).toHaveValue('1.5');
   const close=dialog.getByRole('button',{name:'Close story form',exact:true});
   expect(await close.evaluate(button=>{const rect=button.getBoundingClientRect();return button.contains(document.elementFromPoint(rect.x+rect.width/2,rect.y+rect.height/2));})).toBe(true);await close.click();await expect(dialog).toHaveCount(0);

   const selectedIssue=new URL(ownerPage.url()).searchParams.get('issue'),wideBefore=(await game.boundingBox())!.width;
   await features.getByRole('button',{name:'Hide features list',exact:true}).click();await expect(features).toBeHidden();await expect.poll(async()=>(await game.boundingBox())!.width).toBeGreaterThan(wideBefore+100);expect(new URL(ownerPage.url()).searchParams.get('issue')).toBe(selectedIssue);
   await ownerPage.getByRole('button',{name:'Show features list',exact:true}).click();await expect(features).toBeVisible();await expect(features.getByRole('button',{name:'Select story Search for a rule to disable',exact:true}).first()).toHaveAttribute('aria-pressed','true');
   const beforeNav=(await game.boundingBox())!.width;await ownerPage.getByRole('button',{name:'Hide project navigation',exact:true}).click();await expect(navigation).toBeHidden();await expect(features).toBeVisible();await expect.poll(async()=>(await game.boundingBox())!.width).toBeGreaterThan(beforeNav+100);
   await ownerPage.getByRole('button',{name:'Show project navigation',exact:true}).click();await expect(navigation).toBeVisible();expect(new URL(ownerPage.url()).searchParams.get('issue')).toBe(selectedIssue);

   await search.fill('');const epic=features.locator('.poker-epic-trigger').filter({hasText:'Disable Rules'});if(await epic.getAttribute('aria-expanded')!=='true')await epic.click();
   const list=features.locator('.poker-epic-list'),addStory=features.getByRole('button',{name:'+ Add Story',exact:true}),addEpic=features.getByRole('button',{name:'+ Create New Epic / Feature',exact:true});
   await inViewport(addStory);await inViewport(addEpic);const initialActions=await features.locator('.poker-issues-actions').boundingBox();
   expect(await list.evaluate(element=>element.scrollHeight>element.clientHeight+100)).toBe(true);await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});
   expect(await list.evaluate(element=>element.scrollTop)).toBeGreaterThan(100);const unestimatedStory=features.getByRole('button',{name:'Select story Scroll story 35',exact:true});await expect(unestimatedStory).toBeInViewport();await expect(unestimatedStory.locator('.poker-work-estimate')).toHaveCount(0);await inViewport(addStory);await inViewport(addEpic);expect((await features.locator('.poker-issues-actions').boundingBox())!.y).toBe(initialActions!.y);
   await ownerPage.screenshot({path:'test-results/planning-poker-compact-1280.png',fullPage:true});

   for(const width of [375,320]){
    await ownerPage.setViewportSize({width,height:720});
    const featuresAlreadyOpen=await features.isVisible();
    if(await ownerPage.getByRole('button',{name:'Show project navigation',exact:true}).isVisible())await ownerPage.getByRole('button',{name:'Show project navigation',exact:true}).click();
    await expect(navigation).toBeVisible();await expect(navigation.getByText('Poker integration project',{exact:true})).toBeVisible();
    const focusedLinks=new Set<string>();
    for(let index=0;index<12;index++){
     await ownerPage.keyboard.press('Tab');expect(await navigation.evaluate(panel=>panel.contains(document.activeElement))).toBe(true);
     const focusedLink=await navigation.evaluate(()=>document.activeElement instanceof HTMLAnchorElement?document.activeElement.href:null);if(focusedLink)focusedLinks.add(focusedLink);
    }
    expect(focusedLinks.size).toBeGreaterThanOrEqual(2);await ownerPage.keyboard.press('Escape');await expect(navigation).toBeHidden();if(featuresAlreadyOpen)await expect(features).toBeVisible();
    if(await ownerPage.getByRole('button',{name:'Show features list',exact:true}).isVisible())await ownerPage.getByRole('button',{name:'Show features list',exact:true}).click();
    await expect(features).toBeVisible();await inViewport(addStory);await inViewport(addEpic);await list.evaluate(element=>{element.scrollTop=element.scrollHeight;});await inViewport(addStory);await inViewport(addEpic);
    expect(await ownerPage.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);await ownerPage.screenshot({path:`test-results/planning-poker-compact-${width}.png`,fullPage:true});
    await features.getByRole('button',{name:'Hide features list',exact:true}).click();await expect(features).toBeHidden();await inViewport(edit);expect(new URL(ownerPage.url()).searchParams.get('issue')).toBe(selectedIssue);
   }
  }finally{
   const latest=await snapshot();expect((await owner.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:latest.revision,workspace:original.workspace}})).status()).toBe(200);await ownerPage.setViewportSize({width:1280,height:900});
  }
 });
});
