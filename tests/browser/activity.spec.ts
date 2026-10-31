import {test,expect,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';

type ActivityBody={action:string;surface?:string;sessionId?:string;sequence?:number;seconds?:number;end?:boolean;enabled?:boolean};
const notice=(page:Page)=>page.getByRole('region',{name:'Cookies and browser storage',exact:true});
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
// Chromium does not expose Blob-backed sendBeacon bodies through CDP. Keep
// those requests in the record so essential-only checks still detect them;
// detailed payload checks below concern readable fetch heartbeats.

test('essential-only choices and legacy notice acknowledgments never start usage tracking',async({browser})=>{
 const context=await browser.newContext(),page=await context.newPage(),requests:ActivityBody[]=[];
 try{
  await page.clock.install();page.on('request',request=>{if(request.url().endsWith('/api/activity'))requests.push(request.postDataJSON()||{action:'unreadable-beacon'});});
  await page.goto('/');await notice(page).getByRole('button',{name:'Got it',exact:true}).click();
  await page.clock.runFor(31_000);
  expect(requests).toEqual([]);expect((await context.cookies()).filter(cookie=>cookie.name.startsWith('orbit_analytics_'))).toEqual([]);
  await page.reload();await expect(notice(page)).toHaveCount(0);await page.clock.runFor(16_000);expect(requests).toEqual([]);
  await page.evaluate(()=>{localStorage.removeItem('orbit-analytics-preference');localStorage.setItem('orbit-cookie-notice','essential-v1');});
  await page.reload();await page.clock.runFor(16_000);expect(requests).toEqual([]);await expect(notice(page)).toHaveCount(0);
 }finally{await context.close();}
});

test('explicit analytics consent starts bounded first-party sessions and revocation stops future measurements',async({browser})=>{
 test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable backend with service-role activity RPCs.');
 test.setTimeout(90000);
 const context=await browser.newContext({viewport:{width:375,height:900}}),page=await context.newPage(),requests:ActivityBody[]=[];
 try{
  await page.clock.install();page.on('request',request=>{if(request.url().endsWith('/api/activity'))requests.push(request.postDataJSON()||{action:'unreadable-beacon'});});
  await page.goto('/');await page.bringToFront();
  expect(requests).toEqual([]);
  const consent=page.waitForResponse(response=>response.url().endsWith('/api/activity')&&response.request().postDataJSON()?.action==='consent');
  await notice(page).getByRole('button',{name:'Enable analytics',exact:true}).click();expect((await consent).status()).toBe(200);
  await expect.poll(()=>requests.filter(body=>body.action==='event').length).toBeGreaterThanOrEqual(1);
  const cookies=(await context.cookies()).filter(cookie=>cookie.name.startsWith('orbit_analytics_'));
  expect(cookies.map(cookie=>cookie.name).sort()).toEqual(['orbit_analytics_consent','orbit_analytics_visitor']);
  expect(cookies.every(cookie=>cookie.httpOnly&&cookie.sameSite==='Strict')).toBe(true);
  const heartbeat=page.waitForResponse(response=>response.url().endsWith('/api/activity')&&response.request().postDataJSON()?.action==='event'&&response.request().postDataJSON()?.sequence>0);
  await page.clock.runFor(16_000);expect((await heartbeat).status()).toBe(200);
  const events=requests.filter(body=>body.action==='event');
  expect(events.every(body=>body.surface==='landing'&&typeof body.sequence==='number'&&body.sequence>=0&&typeof body.seconds==='number'&&body.seconds>=0&&body.seconds<=60)).toBe(true);
  expect(events.every(body=>Object.keys(body).sort().join(',')==='action,end,seconds,sequence,sessionId,surface')).toBe(true);
  await page.getByRole('contentinfo').getByRole('button',{name:'Cookie settings',exact:true}).click();
  const details=page.getByRole('dialog',{name:'Cookies, kept simple',exact:true});await details.getByRole('checkbox',{name:/Allow usage analytics/}).uncheck();
  const revoke=page.waitForResponse(response=>response.url().endsWith('/api/activity')&&response.request().postDataJSON()?.action==='consent'&&response.request().postDataJSON()?.enabled===false);
  await details.getByRole('button',{name:'Got it',exact:true}).click();expect((await revoke).status()).toBe(200);await expect(details).toBeHidden();
  const count=requests.filter(body=>body.action==='event').length;await page.clock.runFor(46_000);
  expect(requests.filter(body=>body.action==='event')).toHaveLength(count);
  expect((await context.cookies()).filter(cookie=>cookie.name.startsWith('orbit_analytics_'))).toEqual([]);
 }finally{await context.close();}
});

test('background tabs do not send passive activity heartbeats and management pages are excluded',async({browser})=>{
 test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable backend with service-role activity RPCs.');
 test.setTimeout(90000);
 const context=await browser.newContext(),page=await context.newPage(),requests:ActivityBody[]=[];
 try{
  await page.clock.install();page.on('request',request=>{if(request.url().endsWith('/api/activity'))requests.push(request.postDataJSON()||{action:'unreadable-beacon'});});
  await page.goto('/');await page.bringToFront();await notice(page).getByRole('button',{name:'Enable analytics',exact:true}).click();await expect(notice(page)).toHaveCount(0);
  await expect.poll(()=>requests.filter(body=>body.action==='event').length).toBeGreaterThanOrEqual(1);
  // Playwright forces focus in every Chromium page by default. Turn that
  // emulation off so activating another tab exercises the browser's real
  // document.hasFocus() state rather than a permanently focused test page.
  const protocol=await context.newCDPSession(page);
  await protocol.send('Emulation.setFocusEmulationEnabled',{enabled:false});
  const sibling=await context.newPage();await sibling.goto('/cookies');await sibling.bringToFront();
  await expect.poll(()=>page.evaluate(()=>document.hasFocus())).toBe(false);
  // Allow a single flush of already measured time; subsequent timer ticks stop.
  await page.clock.runFor(2000);const count=requests.filter(body=>body.action==='event').length;await page.clock.runFor(46_000);
  expect(requests.filter(body=>body.action==='event')).toHaveLength(count);
  const firstSession=requests.find(body=>body.action==='event')!.sessionId;
  await page.clock.fastForward(31*60_000);await page.bringToFront();
  await expect.poll(()=>requests.filter(body=>body.action==='event'&&!body.end&&body.sessionId!==firstSession).length).toBeGreaterThanOrEqual(1);
  await page.goto('/applicationmanager');const before=requests.filter(body=>body.action==='event'&&!body.end).length;await page.clock.runFor(31_000);
  expect(requests.filter(body=>body.action==='event'&&!body.end)).toHaveLength(before);expect(requests.some(body=>body.surface==='applicationmanager')).toBe(false);
 }finally{await context.close();}
});

test('signed-in planner activity uses real server authentication without sending account or project contents',async({browser})=>{
 test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
 test.setTimeout(90000);
 const context=await browser.newContext(),page=await context.newPage(),requests:ActivityBody[]=[];
 try{
  const password='OrbitActivity9'+randomUUID(),email=`orbit-activity-${randomUUID()}@example.com`;
  const address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const signup=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{firstName:'Activity',lastName:'Fixture',email,password,confirm:password}});
  expect(signup.status(),await signup.text()).toBe(200);
  const initial=await (await context.request.get('/api/workspace')).json(),workspace=fullWorkspace();
  workspace.projects[0].name='Private activity fixture';
  const saved=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:initial.revision,workspace}});
  expect(saved.status(),await saved.text()).toBe(200);
  page.on('request',request=>{if(request.url().endsWith('/api/activity'))requests.push(request.postDataJSON()||{action:'unreadable-beacon'});});
  await page.goto('/app');await page.bringToFront();await expect(page.locator('.gantt-canvas')).toBeVisible();
  expect(requests).toEqual([]);
  const consent=page.waitForResponse(response=>response.url().endsWith('/api/activity')&&response.request().postDataJSON()?.action==='consent');
  const firstEvent=page.waitForResponse(response=>response.url().endsWith('/api/activity')&&response.request().postDataJSON()?.action==='event');
  await notice(page).getByRole('button',{name:'Enable analytics',exact:true}).click();expect((await consent).status()).toBe(200);
  const tracked=await firstEvent;expect(tracked.status()).toBe(200);
  const payload=tracked.request().postDataJSON();
  expect(payload).toMatchObject({action:'event',surface:'planner',end:false});
  expect(payload.seconds).toBeGreaterThanOrEqual(0);expect(payload.seconds).toBeLessThanOrEqual(60);
  expect(Object.keys(payload).sort()).toEqual(['action','end','seconds','sequence','sessionId','surface']);
  expect(JSON.stringify(requests)).not.toContain(email);expect(JSON.stringify(requests)).not.toContain(workspace.projects[0].name);
  expect(JSON.stringify(requests)).not.toContain(workspace.activeId!);
 }finally{await context.close();}
});
