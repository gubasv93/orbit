import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {signupLegalFields} from './legal-fixtures';
import {projectData} from '../fixtures';
import type {ProjectData,Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000',projectId='status-project';
const labels={planned:'Planned',progress:'In Progress',hold:'On Hold',done:'Done'} as const;
type Status=keyof typeof labels;

async function account(context:BrowserContext){
  await context.addInitScript(()=>{try{localStorage.setItem('orbit-cookie-notice','essential-v1');}catch{}});
  const password='Orbit9'+randomUUID(),address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields,firstName:'Status',lastName:'Owner',email:`orbit-status-${randomUUID()}@example.com`,password,confirm:password}});
  expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(context:BrowserContext):Promise<{workspace:Workspace;revision:number}>{
  const response=await context.request.get('/api/workspace');expect(response.status(),await response.text()).toBe(200);return response.json();
}
const currentData=async(context:BrowserContext)=>(await snapshot(context)).workspace.projects[0].data;
function fixture(){
  const data=projectData();data.settings.autoShiftDependencies=false;
  Object.assign(data.features[0],{start:'2026-11-16',baseline:'2026-12-31',manualEnd:'2026-11-23',manualEndFraction:.5});
  Object.assign(data.tasks[0],{start:'2026-11-16',effort:3,remaining:1.5,roleId:'r1',status:'progress'});
  data.tasks.push({...data.tasks[0],id:'paused',title:'Paused delivery',status:'hold',effort:1,remaining:1,start:'2026-11-19',dependsOn:[]});
  data.tasks.push({...data.tasks[0],id:'finished',title:'Finished delivery',status:'done',effort:1,remaining:1,start:'2026-11-16',manualEnd:'2026-11-16',manualEndFraction:1,completedDate:'2026-11-16',dependsOn:[]});
  Object.assign(data.iterations[0],{start:'2026-11-16',end:'2026-12-31'});return data;
}
async function seed(context:BrowserContext,data=fixture()){
  const workspace:Workspace={version:1,activeId:projectId,preferences:{scale:'day',sidebarHidden:false},projects:[{id:projectId,name:'Independent work item status',onboardingStep:0,data}]};
  const before=await snapshot(context),response=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:before.revision,workspace}});
  expect(response.status(),await response.text()).toBe(200);
}
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function open(page:Page){await page.clock.install({time:new Date('2026-11-17T12:00:00Z')});await page.goto('/app');await expect(page.locator('.gantt-canvas')).toBeVisible();await saved(page);}
async function featureDrawer(page:Page,id='f1'){await page.locator(`.work-name[data-action=drawer-feature][data-id="${id}"]`).click();await expect(page.locator('#featureStatus')).toBeVisible();}
async function taskDrawer(page:Page,id='t1'){await page.locator(`.work-name[data-action=drawer-task][data-id="${id}"]`).click();await expect(page.locator('#taskStatus')).toBeVisible();}
async function closeDrawer(page:Page){await page.keyboard.press('Escape');await expect(page.locator('.drawer')).toHaveCount(0);}
async function chooseStatus(page:Page,context:BrowserContext,id:string,status:Status){
  await page.getByLabel('Status',{exact:true}).selectOption(status);
  await expect.poll(async()=>(await currentData(context)).features.find(feature=>feature.id===id)?.status).toBe(status);await saved(page);
  await expect(page.locator('#featureStatus')).toHaveValue(status);
  await expect(page.locator(`[data-feature-status="${id}"]`)).toHaveText(labels[status]);
}
async function barBounds(page:Page){
  return page.locator('.feature-bar[data-feature],.task-bar[data-task]').evaluateAll(elements=>elements.map(element=>{
    const node=element as HTMLElement,bounds=node.getBoundingClientRect();return {id:node.dataset.feature||node.dataset.task,x:bounds.x,width:bounds.width};
  }));
}

test('work-item statuses are independent of mixed sub-items and preserve all dates, effort and timeline bounds',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);await seed(context);await open(page);const before=await currentData(context);expect(before.features[0].status).toBeUndefined();
    await featureDrawer(page);await expect(page.locator('#featureStatus')).toHaveValue('progress');
    const bounds=await barBounds(page),start=await page.getByLabel('Start date',{exact:true}).inputValue(),end=await page.getByLabel('End date',{exact:true}).inputValue();
    for(const status of ['planned','hold','done','progress'] as const){
      await chooseStatus(page,context,'f1',status);
      expect(await currentData(context)).toEqual({...before,features:[{...before.features[0],status}]});
      await expect(page.getByLabel('Date mode',{exact:true})).toBeVisible();await expect(page.getByLabel('Date mode',{exact:true})).toHaveValue('manual');
      await expect(page.getByLabel('Start date',{exact:true})).toHaveValue(start);await expect(page.getByLabel('End date',{exact:true})).toHaveValue(end);
      expect(await barBounds(page)).toEqual(bounds);
      await expect(page.locator('.feature-bar[data-feature=f1] .epic-paused-marker')).toHaveAttribute('aria-label','1 paused sub-item');
    }
    await page.screenshot({path:test.info().outputPath('independent-work-item-status-desktop.png'),fullPage:true});
    await closeDrawer(page);await page.reload();await saved(page);await featureDrawer(page);await expect(page.locator('#featureStatus')).toHaveValue('progress');
    expect(await currentData(context)).toEqual({...before,features:[{...before.features[0],status:'progress'}]});expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('an explicit parent status survives subsequent sub-item status changes and reloads',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.tasks=[{...data.tasks[2],id:'t1',title:'Delivered API'}];await seed(context,data);await open(page);await featureDrawer(page);
    // Legacy data still reflects completed children until the user chooses a parent status.
    await expect(page.locator('#featureStatus')).toHaveValue('done');expect((await currentData(context)).features[0].status).toBeUndefined();
    await chooseStatus(page,context,'f1','planned');const chosenParent=(await currentData(context)).features[0];await closeDrawer(page);await taskDrawer(page);
    await page.getByLabel('Status',{exact:true}).selectOption('progress');await expect.poll(async()=>(await currentData(context)).tasks[0].status).toBe('progress');await saved(page);
    expect((await currentData(context)).features[0]).toEqual(chosenParent);await closeDrawer(page);await featureDrawer(page);await expect(page.locator('#featureStatus')).toHaveValue('planned');
    await chooseStatus(page,context,'f1','done');const parentDone=(await currentData(context)).features[0];expect((await currentData(context)).tasks[0].status).toBe('progress');
    await closeDrawer(page);await taskDrawer(page);await page.getByLabel('Status',{exact:true}).selectOption('hold');await expect.poll(async()=>(await currentData(context)).tasks[0].status).toBe('hold');await saved(page);
    expect((await currentData(context)).features[0]).toEqual(parentDone);await closeDrawer(page);await page.reload();await saved(page);await featureDrawer(page);
    await expect(page.locator('#featureStatus')).toHaveValue('done');await expect(page.getByLabel('Date mode',{exact:true})).toBeVisible();expect((await currentData(context)).tasks[0].status).toBe('hold');expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('new standalone work items have their own editable status without changing their estimate, owner or half-day dates',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.tasks=[];delete data.features[0].manualEnd;delete data.features[0].manualEndFraction;await seed(context,data);await open(page);
    await page.locator('.gantt-corner').getByRole('button',{name:'Add work item',exact:true}).click();await page.getByLabel('Work item name',{exact:true}).fill('Independent delivery');
    await page.getByLabel('Earliest start',{exact:true}).fill('2026-11-16');await page.getByLabel('Baseline target date',{exact:true}).fill('2026-12-31');await page.getByLabel('Work item estimate (days)',{exact:true}).fill('2.5');await page.getByLabel('Work item assignee',{exact:true}).selectOption('u1');
    await page.getByRole('button',{name:'Create work item',exact:true}).click();await saved(page);let stored=await currentData(context);const work=stored.features.find(feature=>feature.title==='Independent delivery')!;
    expect(work).toMatchObject({status:'planned',assignee:'u1',effortOverride:2.5});expect(stored.tasks).toHaveLength(0);await featureDrawer(page,work.id);
    await page.getByLabel('Date mode',{exact:true}).selectOption('manual');await expect.poll(async()=>(await currentData(context)).features.find(feature=>feature.id===work.id)?.manualEndFraction).toBe(.5);await saved(page);
    const before=await currentData(context);expect(before.features.find(feature=>feature.id===work.id)).toMatchObject({start:'2026-11-16',manualEnd:'2026-11-18',manualEndFraction:.5});
    for(const status of ['hold','done','progress'] as const){
      await chooseStatus(page,context,work.id,status);
      expect(await currentData(context)).toEqual({...before,features:before.features.map(feature=>feature.id===work.id?{...feature,status}:feature)});
      await expect(page.getByLabel('Date mode',{exact:true})).toBeVisible();await expect(page.getByLabel('Date mode',{exact:true})).toHaveValue('manual');
      await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-18');await expect(page.getByLabel('Work item estimate (days)',{exact:true})).toHaveValue('2.5');await expect(page.getByLabel('Assignee',{exact:true})).toHaveValue('u1');
    }
    await page.setViewportSize({width:320,height:900});await page.locator('#featureStatus').scrollIntoViewIfNeeded();await chooseStatus(page,context,work.id,'planned');
    expect(await page.locator('.drawer').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const statusBounds=(await page.locator('#featureStatus').boundingBox())!;expect(statusBounds.x).toBeGreaterThanOrEqual(0);expect(statusBounds.x+statusBounds.width).toBeLessThanOrEqual(320);
    await page.screenshot({path:test.info().outputPath('independent-work-item-status-320.png'),fullPage:true});await closeDrawer(page);await page.setViewportSize({width:1440,height:1000});
    const show=page.getByRole('button',{name:'Show sidebar',exact:true});if(await show.isVisible())await show.click();await page.getByRole('button',{name:'General settings',exact:true}).click();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export workspace',exact:true}).click();const file=await download,path=await file.path();expect(path).toBeTruthy();
    const exported=JSON.parse(await readFile(path!,'utf8')) as {workspace:Workspace};stored=await currentData(context);expect(exported.workspace.projects[0].data).toEqual(stored);
    await page.keyboard.press('Escape');await page.reload();await saved(page);await featureDrawer(page,work.id);await expect(page.locator('#featureStatus')).toHaveValue('planned');
    await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-18');expect((await currentData(context)).features.find(feature=>feature.id===work.id)).toMatchObject({status:'planned',effortOverride:2.5,assignee:'u1',manualEndFraction:.5});expect(errors).toEqual([]);
  }finally{await context.close();}
});
