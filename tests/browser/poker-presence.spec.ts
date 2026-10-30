import {test,expect,type Browser,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {projectData} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
const contexts:BrowserContext[]=[];

async function context(browser:Browser){const value=await browser.newContext();contexts.push(value);return value;}
async function createRoom(browser:Browser){
 const owner=await context(browser),password='Orbit9'+randomUUID();
 const response=await owner.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':'2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':')},data:{firstName:'Presence',lastName:'Facilitator',email:`orbit-presence-${randomUUID()}@example.com`,password,confirm:password}});
 expect(response.status(),await response.text()).toBe(200);
 const initial=await (await owner.request.get('/api/workspace')).json();
 const workspace:Workspace={version:1,activeId:'presence-project',preferences:{scale:'day',sidebarHidden:false},projects:[{id:'presence-project',name:'Presence checks',onboardingStep:0,data:projectData()}]};
 expect((await owner.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:initial.revision,workspace}})).status()).toBe(200);
 const room=await owner.request.post('/api/poker',{headers:{Origin:origin},data:{action:'create',projectId:'presence-project',name:'Presence room',deck:['1','3','5','8'],settings:{autoReveal:false,showAverage:true,countdown:false}}});
 expect(room.status(),await room.text()).toBe(200);const {token}=await room.json();
 const page=await owner.newPage();return {owner,page,token:token as string};
}
async function openRoom(page:Page,token:string){await page.goto('/poker/'+token);await expect(page.locator('.poker-table')).toBeVisible();}
async function observe(observer:BrowserContext,token:string){const response=await observer.request.get('/api/poker/'+token);expect(response.status(),await response.text()).toBe(200);return response.json();}

test.afterEach(async()=>{for(const value of contexts.splice(0))await value.close();});

test('reload reconnects, closing one tab preserves the other, and closing the final tab ends the room',async({browser})=>{
 test.setTimeout(60000);
 const {owner,page,token}=await createRoom(browser),observer=await context(browser);
 await openRoom(page,token);await page.reload();await expect(page.locator('.poker-table')).toBeVisible();
 const sibling=await owner.newPage();await openRoom(sibling,token);
 await page.goto('/how-it-works');await expect(page.getByRole('heading',{name:'How Orbit works',exact:true})).toBeVisible();
 expect((await observe(observer,token)).room.closed).toBe(false);
 await sibling.getByRole('button',{name:'Vote 5',exact:true}).click();await expect(sibling.getByRole('button',{name:'Vote 5',exact:true})).toHaveAttribute('aria-pressed','true');
 await sibling.close();
 await expect.poll(async()=>(await observe(observer,token)).room.closed,{timeout:20000,intervals:[500,1000]}).toBe(true);
 expect((await observe(observer,token)).room.closeReason).toBe('empty');
 await page.goto('/poker/'+token);await expect(page.getByRole('heading',{name:'This room is closed',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Reopen room',exact:true})).toHaveCount(0);
});

test('guest tabs share an identity while keeping independent seats and can explicitly leave and rejoin an open room',async({browser})=>{
 const {page:ownerPage,token}=await createRoom(browser);await openRoom(ownerPage,token);
 const guest=await context(browser),first=await guest.newPage();await first.goto('/poker/'+token);
 const name='Long registered participant '+ 'Surname '.repeat(12).trim();
 await first.getByLabel('Your name',{exact:true}).fill(name);await first.getByRole('button',{name:'Join room',exact:true}).click();await expect(first.locator('.poker-table')).toBeVisible();
 const sibling=await guest.newPage();await openRoom(sibling,token);await expect(sibling.locator('.poker-player.is-self strong')).toHaveAttribute('title',name);
 await first.close();await sibling.getByRole('button',{name:'Vote 8',exact:true}).click();await expect(sibling.getByRole('button',{name:'Vote 8',exact:true})).toHaveAttribute('aria-pressed','true');
 await sibling.getByRole('button',{name:'Leave room',exact:true}).click();await expect(sibling.getByRole('heading',{name:'You left the room',exact:true})).toBeVisible();
 await sibling.getByRole('button',{name:'Rejoin room',exact:true}).click();await expect(sibling.locator('.poker-table')).toBeVisible();await expect(sibling.locator('.poker-player.is-self strong')).toHaveAttribute('title',name);
});

test('inactivity warns, Keep working renews activity, and the final idle participant closes the session',async({browser})=>{
 const {page,token}=await createRoom(browser);await page.clock.install();await openRoom(page,token);
 await page.clock.fastForward(14*60*1000+1000);await expect(page.locator('.poker-idle-warning')).toContainText('due to inactivity');
 await page.getByRole('button',{name:'Keep working',exact:true}).click();await expect(page.locator('.poker-idle-warning')).toHaveCount(0);
 await page.clock.fastForward(15*60*1000+1000);await expect(page.getByRole('heading',{name:'This room is closed',exact:true})).toBeVisible();
 await expect(page.getByRole('status').filter({hasText:'You left due to inactivity.'})).toBeVisible();
});

test('a facilitator can reopen a manually closed room without reopening an empty-ended room',async({browser})=>{
 const {page,token}=await createRoom(browser);await openRoom(page,token);
 await page.getByLabel('Room options',{exact:true}).click();page.once('dialog',dialog=>void dialog.accept());await page.getByRole('button',{name:'Close room',exact:true}).click();
 await expect(page.getByRole('button',{name:'Vote 3',exact:true})).toBeDisabled();
 await page.getByRole('button',{name:'Reopen room',exact:true}).click();await expect(page.getByRole('button',{name:'Vote 3',exact:true})).toBeEnabled();
 await page.getByRole('button',{name:'Vote 3',exact:true}).click();await expect(page.getByRole('button',{name:'Vote 3',exact:true})).toHaveAttribute('aria-pressed','true');
});
