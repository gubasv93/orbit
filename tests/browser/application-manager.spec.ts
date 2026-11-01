import {signupLegalFields} from './legal-fixtures';
import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {createHmac,randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend and its local-only bootstrap fixture.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
const bootstrapToken='ab'.repeat(32),adminEmail='manager-fixture@example.com';
const adminPassword='OrbitManagerFixture2026',nextAdminPassword='OrbitManagerUpdated2026';
const accountEmail=`orbit-manager-user-${randomUUID()}@example.com`,changedEmail=`orbit-manager-changed-${randomUUID()}@example.com`,accountPassword='OrbitUser9'+randomUUID();
const contexts:BrowserContext[]=[];
let manager:BrowserContext,normal:BrowserContext,outsider:BrowserContext,page:Page;
let userId:string,secret:string;

function workspace():Workspace{
 const value=fullWorkspace(),source=value.projects[0];source.id='manager-source';source.name='Manager source project';
 Object.assign(source.data.tasks[0],{roleId:'r1',storyId:'grouped-story'});
 Object.assign(source.data.tasks[1],{roleId:'rfront',platform:'Frontend',assignee:'',storyId:'grouped-story'});
 source.data.tasks[2].roleId='rfront';
 const copy=structuredClone(source);copy.id='manager-copy';copy.name='Manager copied project';
 copy.data.meetings[0].copiedFromProjectId=source.id;copy.data.meetings[0].copiedFromMeetingId=source.data.meetings[0].id;
 value.projects.push(copy);value.activeId=source.id;value.preferences={scale:'day',sidebarHidden:false};return value;
}
async function api(context:BrowserContext,method:string,path:string,body?:unknown,status=200){
 const response=await context.request.fetch(path,{method,headers:{Origin:origin},...(body===undefined?{}:{data:body})});
 expect(response.status(),await response.text()).toBe(status);return response;
}
async function data(context:BrowserContext,method:string,path:string,body?:unknown,status=200){return (await api(context,method,path,body,status)).json();}
async function dashboard(){return data(manager,'GET','/api/applicationmanager?days=30');}
async function userMetrics(){const value=await dashboard();return value.analytics.users.find((user:{id:string})=>user.id===userId);}
async function privateResponse(response:Awaited<ReturnType<typeof api>>){expect(response.headers()['cache-control']).toBe('private, no-store');}
async function dismissCookieNotice(target:Page){const notice=target.getByRole('region',{name:'Cookies and browser storage',exact:true});if(await notice.isVisible())await notice.getByRole('button',{name:'Got it',exact:true}).click();}
async function overview(){await expect(page.getByRole('heading',{name:'Product overview',exact:true})).toBeVisible();await expect(page.getByRole('table',{name:'Current inventory and observed creations',exact:true})).toBeVisible();}
async function openUser(){
 await page.getByRole('button',{name:'Users',exact:true}).click();
 const all=page.getByRole('button',{name:'← All users',exact:true});if(await all.isVisible())await all.click();
 const current=await userMetrics();expect(current).toBeTruthy();
 await page.getByRole('searchbox',{name:'Search users',exact:true}).fill(current.email);
 const name=[current.firstName,current.lastName].filter(Boolean).join(' ')||current.email;
 await page.getByRole('button',{name:'View '+name,exact:true}).click();await expect(page.getByRole('heading',{name:'User details',exact:true,level:1})).toBeVisible();
}
function card(name:string){return page.locator('.am-card').filter({has:page.getByRole('heading',{name,exact:true})});}
function totp(value:string,counter:number){
 const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';let bits=0,accumulator=0;const decoded:number[]=[];
 for(const character of value){accumulator=(accumulator<<5)|alphabet.indexOf(character);bits+=5;if(bits>=8){bits-=8;decoded.push((accumulator>>>bits)&255);}}
 const moving=Buffer.alloc(8);moving.writeBigUInt64BE(BigInt(counter));
 const hmac=createHmac('sha1',Buffer.from(decoded)).update(moving).digest(),offset=hmac[hmac.length-1]&15;
 return String((hmac.readUInt32BE(offset)&0x7fffffff)%1_000_000).padStart(6,'0');
}
function wrongCode(value:string){const counter=Math.floor(Date.now()/30000),valid=new Set([-1,0,1].map(offset=>totp(value,counter+offset)));return Array.from({length:4},(_,index)=>String(index).padStart(6,'0')).find(code=>!valid.has(code))!;}

test.describe.serial('single-administrator management and real user lifecycle',()=>{
 test.beforeAll(async({browser})=>{
  for(let i=0;i<3;i++)contexts.push(await browser.newContext({viewport:{width:1440,height:1000}}));[manager,normal,outsider]=contexts;page=await manager.newPage();
  const address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const signup=await normal.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields, firstName:'Story',lastName:'Fixture',email:accountEmail,password:accountPassword,confirm:accountPassword}});expect(signup.status(),await signup.text()).toBe(200);
  const initial=await data(normal,'GET','/api/workspace');await api(normal,'PUT','/api/workspace',{revision:initial.revision,workspace:workspace()});
 });
 test.afterAll(async()=>{for(const context of contexts)await context.close();});

 test('keeps ordinary accounts out and consumes the one-time administrator setup without leaving another registration form',async()=>{
  test.setTimeout(90000);
  for(const context of [normal,outsider]){const denied=await api(context,'GET','/api/applicationmanager',undefined,401);await privateResponse(denied);expect(await denied.json()).not.toHaveProperty('analytics');}
  await api(normal,'POST','/api/applicationmanager/auth/login',{email:accountEmail,password:accountPassword},401);
  const external=await outsider.newPage();await external.goto('/applicationmanager/bootstrap#setup='+'cd'.repeat(32));
  await expect(external.getByRole('heading',{name:'Setup link unavailable',exact:true})).toBeVisible();await expect(external.getByLabel('Administrator password',{exact:true})).toHaveCount(0);
  const urls:string[]=[];page.on('request',request=>urls.push(request.url()));
  await page.goto('/applicationmanager/bootstrap#setup='+bootstrapToken);
  await expect(page.getByRole('heading',{name:'Create your administrator',exact:true})).toBeVisible();
  await expect(page).toHaveURL(/\/applicationmanager\/bootstrap$/);
  await page.getByLabel('Administrator email',{exact:true}).fill(adminEmail);
  await page.getByLabel('Administrator password',{exact:true}).fill(adminPassword);
  await page.getByLabel('Confirm administrator password',{exact:true}).fill(adminPassword);
  await page.getByRole('button',{name:'Create administrator',exact:true}).click();await expect(page).toHaveURL(/\/applicationmanager$/);await overview();await dismissCookieNotice(page);await page.screenshot({path:'.vercel/e2e-manager/overview-1440.png',fullPage:true});
  expect(urls.every(url=>!url.includes(bootstrapToken))).toBe(true);
  const cookie=(await manager.cookies()).find(value=>value.name.endsWith('orbit-manager'));expect(cookie).toBeTruthy();expect(cookie!.httpOnly).toBe(true);expect(cookie!.sameSite).toBe('Strict');expect(cookie!.path).toBe('/');
  expect(await page.evaluate(()=>Object.keys(localStorage).some(key=>/manager|session|auth/i.test(key)))).toBe(false);
  await external.goto('/applicationmanager');
  const unavailable=await external.goto('/applicationmanager/bootstrap#setup='+bootstrapToken);expect(unavailable?.status()).toBe(404);
  expect(unavailable!.headers()['cache-control']).toContain('no-store');expect(unavailable!.headers()['referrer-policy']).toBe('no-referrer');
  await expect(external.getByLabel('Administrator password',{exact:true})).toHaveCount(0);
  await api(outsider,'POST','/api/applicationmanager/auth/bootstrap',{token:bootstrapToken,email:'second-admin@example.com',password:adminPassword,confirm:adminPassword},404);
  await api(normal,'PATCH','/api/applicationmanager/users/11111111-1111-4111-8111-111111111111',{firstName:'No',lastName:'Access',email:'no@example.com'},401);
  await external.close();
 });

 test('reports logical stories and participant statistics, then changes only the selected user email without confirmation mail',async()=>{
  test.setTimeout(90000);
  let value=await dashboard();const observed=value.analytics.users.find((user:{email:string})=>user.email===accountEmail);expect(observed).toBeTruthy();userId=observed.id;
  expect(Number.isFinite(Date.parse(observed.createdAt))).toBe(true);
  expect(value.analytics).not.toHaveProperty('landing');
  expect(value.analytics.totals).not.toHaveProperty('planner');
  expect(value.analytics.coverage).not.toHaveProperty('engagement');
  expect(value.analytics.users.every((user:Record<string,unknown>)=>!('planner' in user))).toBe(true);
  const initialViews=value.analytics.landingPageviews.pageviews;
  const documentHeaders={'Accept':'text/html','Sec-Fetch-Dest':'document','User-Agent':'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'};
  expect((await manager.request.get('/',{headers:documentHeaders})).status()).toBe(200);
  await expect.poll(async()=>(await dashboard()).analytics.landingPageviews.pageviews).toBe(initialViews+1);
  await manager.request.head('/',{headers:documentHeaders});
  const excludedRequests:Record<string,string>[]=[{'Purpose':'prefetch'},{'User-Agent':'Googlebot/2.1'}];
  for(const excluded of excludedRequests)await manager.request.get('/',{headers:{...documentHeaders,...excluded}});
  // Real RSC requests are fetches with a cache-key query, not document loads.
  await manager.request.get('/?_rsc=fixture',{headers:{...documentHeaders,'Accept':'text/x-component','Sec-Fetch-Dest':'empty','RSC':'1'}});
  const minimal=await dashboard();expect(minimal.analytics.landingPageviews).toMatchObject({pageviews:initialViews+1,days:30});
  expect(Number.isFinite(Date.parse(minimal.analytics.landingPageviews.startedAt))).toBe(true);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();
  await expect(card('Landing page')).toContainText('Page views');
  await expect(page.getByRole('heading',{name:'Planner engagement',exact:true})).toHaveCount(0);
  expect(observed.current).toMatchObject({projects:2,features:2,stories:4,workItems:6,people:2,roles:4,platforms:2,meetings:2,holidays:2,timeOff:2,milestones:2});
  const room=await data(normal,'POST','/api/poker',{action:'create',projectId:'manager-source',name:'Manager analytics fixture',deck:['1','2','3'],settings:{autoReveal:false,showAverage:true,countdown:false}}),ownerConnection=randomUUID(),guestConnection=randomUUID();
  await data(normal,'GET','/api/poker/'+room.token+'?connectionId='+ownerConnection);
  await data(outsider,'POST','/api/poker/'+room.token,{action:'join',name:'Guest fixture',connectionId:guestConnection,issue:'free',spectator:false});
  await data(normal,'POST','/api/poker/'+room.token,{action:'leave',connectionId:ownerConnection,issue:'free',departing:false});
  await data(outsider,'POST','/api/poker/'+room.token,{action:'leave',connectionId:guestConnection,issue:'free',departing:false});
  const poker=(await userMetrics()).poker;expect(poker.games).toBe(1);expect(poker.participants).toMatchObject({min:2,max:2,median:2,average:2});expect(poker.durationSamples).toBe(1);expect(poker.averageDurationSeconds).toBeGreaterThanOrEqual(0);expect(poker.gamesPerWeek).toBeGreaterThan(0);
  await page.getByRole('button',{name:'Refresh',exact:true}).click();await openUser();
  await page.getByLabel('First name',{exact:true}).fill('Managed');await page.getByLabel('Last name',{exact:true}).fill('Fixture');await page.getByLabel('User email',{exact:true}).fill(changedEmail);
  await page.getByRole('button',{name:'Save user details',exact:true}).click();await expect(page.getByRole('status').filter({hasText:'User details updated.'})).toBeVisible();
  expect((await userMetrics()).email).toBe(changedEmail);
  const verifier=await manager.browser()!.newContext();contexts.push(verifier);
  await api(verifier,'POST','/api/auth/login',{email:changedEmail,password:accountPassword});
  const profile=await data(verifier,'GET','/api/profile');expect(profile.profile).toMatchObject({email:changedEmail,firstName:'Managed',lastName:'Fixture'});
  await api(verifier,'GET','/api/applicationmanager',undefined,401);
 });

 test('enrolls an authenticator and requires a fresh unreplayed code before granting manager access',async()=>{
  test.setTimeout(90000);
  await page.getByRole('button',{name:'Admin security',exact:true}).click();const authenticator=card('Authenticator app');
  await authenticator.getByRole('button',{name:'Set up 2FA',exact:true}).click();
  const qr=authenticator.getByRole('img',{name:'Authenticator setup QR code',exact:true});await expect(qr).toBeVisible();await expect(qr).toHaveAttribute('src',/^data:image\/png;base64,/);
  await authenticator.getByText('Enter the setup key manually',{exact:true}).click();secret=(await authenticator.locator('.am-manual-secret code').textContent())!;expect(secret).toMatch(/^[A-Z2-7]{32}$/);
  await authenticator.getByLabel('Authenticator code',{exact:true}).fill(totp(secret,Math.floor(Date.now()/30000)-1));await authenticator.getByRole('button',{name:'Enable 2FA',exact:true}).click();
  await expect(authenticator.getByText('Two-factor authentication is enabled.',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}))).not.toContain(secret);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();
  await page.getByLabel('Administrator email',{exact:true}).fill(adminEmail);await page.getByLabel('Password',{exact:true}).fill('WrongManagerPassword2026');await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page.locator('.am-root').getByRole('alert')).toContainText('Email or password is incorrect.');
  await page.getByLabel('Password',{exact:true}).fill(adminPassword);await page.getByRole('button',{name:'Sign in',exact:true}).click();await expect(page.getByRole('heading',{name:'Authenticator verification',exact:true})).toBeVisible();
  await api(manager,'GET','/api/applicationmanager',undefined,401);
  await page.getByLabel('Authenticator code',{exact:true}).fill(wrongCode(secret));await page.getByRole('button',{name:'Verify and sign in',exact:true}).click();await expect(page.locator('.am-root').getByRole('alert')).toContainText('incorrect');
  const counter=Math.floor(Date.now()/30000),code=totp(secret,counter);
  await page.getByLabel('Authenticator code',{exact:true}).fill(code);await page.getByRole('button',{name:'Verify and sign in',exact:true}).click();await page.getByRole('button',{name:'Overview',exact:true}).click();await overview();
  const replay=await manager.browser()!.newContext();contexts.push(replay);
  const pending=await data(replay,'POST','/api/applicationmanager/auth/login',{email:adminEmail,password:adminPassword});expect(pending.requiresMfa).toBe(true);
  await api(replay,'POST','/api/applicationmanager/auth/verify',{code},409);await api(replay,'GET','/api/applicationmanager',undefined,401);
  await page.getByRole('button',{name:'Admin security',exact:true}).click();const enabled=card('Authenticator app');
  await enabled.getByLabel('Administrator password',{exact:true}).fill(adminPassword);
  await enabled.getByLabel('Authenticator code',{exact:true}).fill(totp(secret,Math.floor(Date.now()/30000)+1));await enabled.getByRole('button',{name:'Disable 2FA',exact:true}).click();
  await expect(enabled.getByRole('button',{name:'Set up 2FA',exact:true})).toBeVisible();expect((await data(manager,'GET','/api/applicationmanager/auth/status')).mfaEnabled).toBe(false);
 });

 test('deletes a selected project and user with durable lifecycle history while preserving the other project until account deletion',async()=>{
  test.setTimeout(90000);await openUser();
  const original=(await data(normal,'GET','/api/workspace')).workspace as Workspace,source=original.projects.find(project=>project.id==='manager-source')!;
  const copiedRow=page.getByRole('row').filter({hasText:'Manager copied project'});await copiedRow.getByRole('button',{name:'Delete project',exact:true}).click();
  let dialog=page.getByRole('dialog',{name:'Delete project',exact:true});await dialog.getByLabel('Type project name',{exact:true}).fill('Manager source project');await expect(dialog.getByRole('button',{name:'Delete project',exact:true})).toBeDisabled();
  await dialog.getByLabel('Type project name',{exact:true}).fill('Manager copied project');await dialog.getByRole('button',{name:'Delete project',exact:true}).click();await expect(dialog).toHaveCount(0);
  await expect.poll(async()=>(await data(normal,'GET','/api/workspace')).workspace.projects.length).toBe(1);
  expect((await data(normal,'GET','/api/workspace')).workspace.projects).toEqual([source]);
  let metrics=await userMetrics();expect(metrics.current.projects).toBe(1);expect(metrics.lifetime.projectsDeleted).toBe(1);expect(metrics.projects.find((project:{id:string})=>project.id==='manager-copy').deletedAt).toBeTruthy();
  await page.setViewportSize({width:375,height:900});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:'.vercel/e2e-manager/user-details-375.png',fullPage:true});
  await page.getByRole('button',{name:'Delete user and workspace',exact:true}).click();dialog=page.getByRole('dialog',{name:'Delete user and workspace',exact:true});await dialog.getByLabel('Type user email',{exact:true}).fill(changedEmail);await dialog.getByRole('button',{name:'Delete user',exact:true}).click();await expect(dialog).toHaveCount(0);
  await api(normal,'GET','/api/workspace',undefined,401);
  metrics=await userMetrics();expect(Number.isFinite(Date.parse(metrics.deletedAt))).toBe(true);expect(metrics.current.projects).toBe(0);expect(metrics.lifetime.projectsDeleted).toBe(2);expect(metrics.projects.every((project:{deletedAt:string|null})=>Boolean(project.deletedAt))).toBe(true);
  await page.getByRole('button',{name:'Lifecycle history',exact:true}).click();await expect(page.getByRole('table',{name:'Deleted accounts',exact:true})).toContainText(changedEmail);await expect(page.getByRole('table',{name:'Deleted projects and their recorded lifetimes',exact:true})).toContainText('Manager source project');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.setViewportSize({width:1440,height:1000});
 });

 test('changes the dedicated administrator password without creating a regular Orbit identity',async()=>{
  await page.getByRole('button',{name:'Admin security',exact:true}).click();const password=card('Change administrator password');
  await password.getByLabel('Current password',{exact:true}).fill(adminPassword);await password.getByLabel('New password',{exact:true}).fill(nextAdminPassword);await password.getByLabel('Confirm new password',{exact:true}).fill(nextAdminPassword);await password.getByRole('button',{name:'Change password',exact:true}).click();
  await expect(page.getByRole('status').filter({hasText:'Administrator password changed.'})).toBeVisible();
  const verifier=await manager.browser()!.newContext();contexts.push(verifier);
  await api(verifier,'POST','/api/applicationmanager/auth/login',{email:adminEmail,password:adminPassword},401);
  expect((await data(verifier,'POST','/api/applicationmanager/auth/login',{email:adminEmail,password:nextAdminPassword})).requiresMfa).toBe(false);
  const last=await data(verifier,'GET','/api/applicationmanager');expect(last.manager.email).toBe(adminEmail);expect(last.analytics.users.some((user:{email:string})=>user.email===adminEmail)).toBe(false);
  await api(verifier,'GET','/api/workspace',undefined,401);
 });
});
