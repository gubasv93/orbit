import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {projectData} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
let context:BrowserContext;
function workspace():Workspace{
 const data=projectData();data.settings.autoShiftDependencies=false;data.tasks[0].roleId='r1';
 return {version:1,activeId:'details-project',preferences:{scale:'day',sidebarHidden:true},projects:[{id:'details-project',name:'Breakdown checks',onboardingStep:0,data}]};
}
function daily(minutes=30){return {id:'daily',title:'Daily standup',recurrence:'workdays' as const,weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:minutes,allTeam:true,attendees:[],enabled:true};}
async function snapshot(){return (await context.request.get('/api/workspace')).json();}
async function replace(value:Workspace){const current=await snapshot();expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace:value}})).status()).toBe(200);}
async function ready(page:Page){await expect(page.locator('.gantt-canvas')).toBeVisible();await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
const popupFor=(page:Page)=>page.getByRole('dialog',{name:'Item breakdown',exact:true});
const metric=(page:Page,name:string)=>popupFor(page).locator(`[data-detail-metric="${name}"]`);

test.describe.serial('readable item breakdowns and calendar-based estimates',()=>{
 test.beforeAll(async({browser})=>{
  context=await browser.newContext();const page=await context.newPage(),password='Orbit9'+randomUUID();
  await page.goto('/signup');await page.getByLabel('Email address').fill(`orbit-item-details-${randomUUID()}@example.com`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password').fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/\/app$/);await page.close();
 });
 test.afterAll(async()=>{await context?.close();});

 test('shows exact meeting time and every non-working category with expandable concrete conflicts',async()=>{
  const value=workspace(),data=value.projects[0].data;data.settings.observeHolidays=true;data.meetings=[daily()];data.holidays=[{date:'2026-10-28',name:'Company holiday'}];
  data.leave=[{id:'vacation',person:'u1',type:'vacation',from:'2026-10-29',to:'2026-10-29',note:''},{id:'sick',person:'u1',type:'sick',from:'2026-10-30',to:'2026-10-30',note:''},{id:'dayoff',person:'u1',type:'dayoff',from:'2026-11-02',to:'2026-11-02',note:''}];
  Object.assign(data.tasks[0],{title:'Configuration work',effort:2,manualEnd:'2026-11-05',manualEndFraction:1});
  for(let i=1;i<=6;i++)data.tasks.push({...data.tasks[0],id:'conflict'+i,title:'Competing work '+i,effort:.5,manualEnd:undefined,manualEndFraction:undefined});
  await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);const before=(await snapshot()).workspace.projects[0].data,bar=page.locator('.task-bar[data-task=t1]'),popup=popupFor(page);
  await bar.hover();await expect(popup).toBeVisible();await expect(metric(page,'estimate')).toContainText(/\b2\b/);await expect(metric(page,'calendar')).toContainText(/\b11\b/);await expect(metric(page,'meetings')).toContainText(/150\s*(?:min|minutes)/i);await expect(metric(page,'meetings')).toContainText(/2\s*(?:h|hours)/i);
  await expect(metric(page,'weekends')).toContainText(/\b2\b/);for(const key of ['holidays','vacation','dayoff','sick'])await expect(metric(page,key)).toContainText(/\b1\b/);
  const conflicts=popup.locator('.item-conflict-list > li');await expect(conflicts).toHaveCount(4);await popup.getByRole('button',{name:/^Show more/}).click();await expect(conflicts).toHaveCount(6);for(let i=1;i<=6;i++)await expect(popup.locator('.item-conflict-list')).toContainText('Competing work '+i);
  await popup.hover();await page.waitForTimeout(350);await expect(popup).toBeVisible();await popup.getByRole('button',{name:'Show less',exact:true}).click();await expect(conflicts).toHaveCount(4);
  await page.screenshot({path:'test-results/item-breakdown-conflicts.png',fullPage:true});await popup.getByRole('button',{name:'Open details',exact:true}).click();await expect(popup).toHaveCount(0);await expect(page.getByLabel('Pure effort (days)',{exact:true})).toHaveValue('2');await expect(page.getByLabel('End date')).toHaveValue('2026-11-05');await page.keyboard.press('Escape');await ready(page);expect((await snapshot()).workspace.projects[0].data).toEqual(before);await page.close();
 });

 test('distinguishes epic person-days from elapsed days, deduplicates meetings, and explains unestimated work safely',async()=>{
  const value=workspace(),data=value.projects[0].data,malicious='<img src=x onerror="window.orbitHoverXss=true">';data.features[0].title=malicious;data.meetings=[daily()];data.people.push({...data.people[0],id:'u2',name:'Riley Developer',firstName:'Riley',lastName:'Developer'});
  Object.assign(data.tasks[0],{effort:3,manualEnd:'2026-10-29',manualEndFraction:1});data.tasks.push({...data.tasks[0],id:'parallel',title:'Parallel implementation',assignee:'u2'},{...data.tasks[0],id:'same-person',title:'Additional review',effort:1});
  data.features.push({...data.features[0],id:'pending-feature',title:'Unestimated follow-up'});data.tasks.push({...data.tasks[0],id:'pending',featureId:'pending-feature',title:'Write estimate later',effort:0,platform:'',assignee:'',roleId:undefined,manualEnd:undefined,manualEndFraction:undefined});
  await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);const popup=popupFor(page),feature=page.locator('.feature-bar[data-feature=f1]');
  await feature.focus();await expect(popup).toBeVisible();await expect(popup.getByText(malicious,{exact:true})).toBeVisible();await expect(popup.locator('img')).toHaveCount(0);expect(await page.evaluate(()=>Boolean((window as unknown as {orbitHoverXss?:boolean}).orbitHoverXss))).toBe(false);
  await expect(metric(page,'estimate')).toContainText(/\b7\b/);await expect(metric(page,'estimate')).toContainText(/person.day/i);await expect(metric(page,'calendar')).toContainText(/\b4\b/);await expect(metric(page,'meetings')).toContainText(/240\s*(?:min|minutes)/i);await expect(metric(page,'meetings')).not.toContainText(/360\s*(?:min|minutes)/i);
  await page.keyboard.press('Escape');await expect(popup).toHaveCount(0);await page.locator('.work-name[data-action=drawer-task][data-id=pending]').hover();await expect(popup).toBeVisible();await expect(popup.getByRole('heading',{name:'Write estimate later',exact:true})).toBeVisible();await expect(metric(page,'estimate')).toContainText(/not estimated/i);await expect(metric(page,'calendar')).toContainText(/not scheduled|not available|unknown|—|pending/i);await expect(page.locator('.task-bar[data-task=pending]')).toHaveCount(0);
  await page.screenshot({path:'test-results/item-breakdown-pending.png',fullPage:true});await page.locator('.breadcrumb').click();await expect(popup).toHaveCount(0);await ready(page);await page.close();
 });

 test('recalculates estimate from resized working availability and keeps hover details usable on narrow screens',async()=>{
  const value=workspace(),data=value.projects[0].data;data.tasks[0].effort=1;data.meetings=[daily(60)];await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);
  const handle=page.locator('[data-resize-kind=task][data-id=t1][data-resize-edge=end]');await handle.focus();await page.keyboard.press('ArrowRight');await ready(page);
  const stored=(await snapshot()).workspace.projects[0].data.tasks[0];expect(stored).toMatchObject({effort:1.5,manualEnd:'2026-10-27',manualEndFraction:1});
  await page.locator('.task-bar[data-task=t1]').hover();await expect(metric(page,'estimate')).toContainText('1.5');await expect(metric(page,'calendar')).toContainText(/\b2\b/);await expect(metric(page,'meetings')).toContainText(/120\s*(?:min|minutes)/i);await page.keyboard.press('Escape');
  for(const width of [375,320]){
   await page.setViewportSize({width,height:812});await page.locator('.work-name[data-action=drawer-task][data-id=t1]').hover();const popup=popupFor(page);await expect(popup).toBeVisible();const box=(await popup.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(7);expect(box.y).toBeGreaterThanOrEqual(7);expect(box.x+box.width).toBeLessThanOrEqual(width-7);expect(box.y+box.height).toBeLessThanOrEqual(805);expect(await popup.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   await popup.hover();await page.waitForTimeout(350);await expect(popup).toBeVisible();await page.screenshot({path:`test-results/item-breakdown-${width}.png`,fullPage:true});await popup.getByRole('button',{name:'Close item breakdown',exact:true}).click();await expect(popup).toHaveCount(0);
  }
  await page.reload();await ready(page);expect((await snapshot()).workspace.projects[0].data.tasks[0].effort).toBe(1.5);await page.close();
 });
});
