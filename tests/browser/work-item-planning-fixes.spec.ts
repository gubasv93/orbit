import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {signupLegalFields} from './legal-fixtures';
import {setRoadmapFilter} from './filters';
import {projectData} from '../fixtures';
import type {ProjectData,Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';

async function account(context:BrowserContext){
  await context.addInitScript(()=>{try{localStorage.setItem('orbit-cookie-notice','essential-v1');}catch{}});
  const password='Orbit9'+randomUUID(),address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields,firstName:'Planning',lastName:'Owner',email:`orbit-work-items-${randomUUID()}@example.com`,password,confirm:password}});
  expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(context:BrowserContext):Promise<{workspace:Workspace;revision:number}>{
  const response=await context.request.get('/api/workspace');expect(response.status(),await response.text()).toBe(200);return response.json();
}
async function seed(context:BrowserContext,data:ProjectData,onboardingStep=0){
  const workspace:Workspace={version:1,activeId:'work-items-project',preferences:{scale:'day',sidebarHidden:false},projects:[{id:'work-items-project',name:'Work item planning checks',onboardingStep,data}]};
  const current=await snapshot(context),response=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{workspace,revision:current.revision}});
  expect(response.status(),await response.text()).toBe(200);
}
const currentData=async(context:BrowserContext)=>(await snapshot(context)).workspace.projects[0].data;
function fixture(){
  const data=projectData();data.settings.autoShiftDependencies=false;
  Object.assign(data.features[0],{start:'2026-11-09',baseline:'2026-12-31'});
  Object.assign(data.tasks[0],{start:'2026-11-09',effort:3,remaining:1.5,roleId:'r1'});
  Object.assign(data.iterations[0],{start:'2026-11-09',end:'2026-12-31'});return data;
}
async function ready(page:Page){await expect(page.locator('.gantt-canvas')).toBeVisible();await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function open(page:Page){await page.clock.install({time:new Date('2026-11-13T12:00:00Z')});await page.goto('/app');await ready(page);}
async function taskDrawer(page:Page,id='t1'){await page.locator(`.work-name[data-action=drawer-task][data-id="${id}"]`).click();}
async function featureDrawer(page:Page,id:string){await page.locator(`.work-name[data-action=drawer-feature][data-id="${id}"]`).click();}
async function closeDrawer(page:Page){await page.keyboard.press('Escape');await expect(page.locator('.drawer')).toHaveCount(0);}

test('late status changes preserve the planned window, half-day finish and estimate through completion and resume',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);await seed(context,fixture());await open(page);const bar=page.locator('.task-bar[data-task=t1]');
    await expect(bar).toBeVisible();const original=(await bar.boundingBox())!;
    await taskDrawer(page);await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-09');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');
    await expect(page.getByLabel('Estimate (days)',{exact:true})).toHaveValue('3');await expect(page.getByLabel('Remaining effort (days)',{exact:true})).toHaveValue('1.5');
    await expect(page.locator('.schedule-dates')).toContainText('Ends halfway through the final day.');
    for(const status of ['progress','planned']){
      await page.getByLabel('Status',{exact:true}).selectOption(status);await ready(page);
      await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-09');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');
      expect((await currentData(context)).tasks[0]).toMatchObject({status,start:'2026-11-09',effort:3,remaining:1.5});
      expect((await bar.boundingBox())!.width).toBeCloseTo(original.width,1);
    }
    await page.getByLabel('Status',{exact:true}).selectOption('done');await ready(page);
    await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');await expect(page.locator('.schedule-dates')).toContainText('Ends halfway through the final day.');
    expect((await currentData(context)).tasks[0]).toMatchObject({status:'done',start:'2026-11-09',completedDate:'2026-11-10',manualEnd:'2026-11-10',manualEndFraction:.5,effort:3,remaining:1.5});
    expect((await bar.boundingBox())!.width).toBeCloseTo(original.width,1);
    await page.getByLabel('Status',{exact:true}).selectOption('planned');await ready(page);
    await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');expect((await currentData(context)).tasks[0].completedDate).toBeUndefined();
    await page.getByRole('button',{name:'Put on hold',exact:true}).click();await ready(page);
    expect((await currentData(context)).tasks[0]).toMatchObject({status:'hold',start:'2026-11-09',manualEnd:'2026-11-10',manualEndFraction:.5,effort:3,remaining:1.5});
    await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');expect((await bar.boundingBox())!.width).toBeCloseTo(original.width,1);
    await page.getByRole('button',{name:'Resume sub-item',exact:true}).click();await ready(page);
    await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-09');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');
    expect((await bar.boundingBox())!.width).toBeCloseTo(original.width,1);expect((await currentData(context)).tasks[0]).toMatchObject({status:'progress',effort:3,remaining:1.5});
    await page.reload();await ready(page);await taskDrawer(page);await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-09');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-10');
    await expect(page.getByLabel('Estimate (days)',{exact:true})).toHaveValue('3');await expect(page.locator('.schedule-dates')).toContainText('Ends halfway through the final day.');expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('a whole work item can own a half-day estimate and assignee without sub-items and counts their calendar and competing work',async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.tasks=[];data.features[0].start='2026-11-16';
    data.meetings=[{id:'daily30',title:'Daily standup',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-11-16',endDate:'',startTime:'09:00',duration:30,allTeam:true,attendees:[],enabled:true}];
    data.leave=[{id:'tuesday-off',person:'u1',type:'dayoff',from:'2026-11-17',to:'2026-11-17',note:'Planned day off'}];
    await seed(context,data);await open(page);await page.locator('.gantt-corner').getByRole('button',{name:'Add work item',exact:true}).click();
    await page.getByLabel('Work item name',{exact:true}).fill('Deliver the whole work item');await page.getByLabel('Earliest start',{exact:true}).fill('2026-11-16');
    await page.getByLabel('Baseline target date',{exact:true}).fill('2026-12-31');await page.getByLabel('Work item estimate (days)',{exact:true}).fill('2.5');
    await page.getByLabel('Work item assignee',{exact:true}).selectOption('u1');await page.getByRole('button',{name:'Create work item',exact:true}).click();await ready(page);
    let stored=await currentData(context),work=stored.features.find(feature=>feature.title==='Deliver the whole work item')!;
    expect(work).toMatchObject({effortOverride:2.5,assignee:'u1',start:'2026-11-16'});expect(stored.tasks).toHaveLength(0);
    const workId=work.id,bar=page.locator(`.feature-bar[data-feature="${workId}"]`);await expect(bar).toBeVisible();await expect(bar).toHaveAttribute('data-item-summary',/4 calendar days/);
    await featureDrawer(page,workId);await expect(page.getByLabel('Assignee',{exact:true})).toHaveValue('u1');await expect(page.getByLabel('Work item estimate (days)',{exact:true})).toHaveValue('2.5');
    await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-11-16');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-19');
    await expect(page.locator('[data-drawer-meeting=daily30]')).toHaveAttribute('data-meeting-minutes','90');
    await page.screenshot({path:test.info().outputPath('standalone-work-item-desktop.png'),fullPage:true});
    await page.getByLabel('Work item estimate (days)',{exact:true}).fill('3');await page.getByLabel('Work item estimate (days)',{exact:true}).press('Tab');await ready(page);
    await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-20');await expect(page.locator('.schedule-dates')).toContainText('Ends halfway through the final day.');
    await expect(page.locator('[data-drawer-meeting=daily30]')).toHaveAttribute('data-meeting-minutes','120');
    await page.getByLabel('Assignee',{exact:true}).selectOption('');await ready(page);await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-18');await expect(page.locator('[data-drawer-meetings]')).toHaveCount(0);
    await page.getByLabel('Assignee',{exact:true}).selectOption('u1');await ready(page);await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-20');
    await closeDrawer(page);await setRoadmapFilter(page,'people',['Alex Dev']);await expect(page.locator(`[data-row-feature="${workId}"]`)).toBeVisible();await setRoadmapFilter(page,'people',[]);
    await page.reload();await ready(page);await featureDrawer(page,workId);await expect(page.getByLabel('Assignee',{exact:true})).toHaveValue('u1');await expect(page.getByLabel('Work item estimate (days)',{exact:true})).toHaveValue('3');await expect(page.getByLabel('End date',{exact:true})).toHaveValue('2026-11-20');
    stored=await currentData(context);work=stored.features.find(feature=>feature.id===workId)!;expect(work).toMatchObject({effortOverride:3,assignee:'u1'});expect(stored.tasks).toHaveLength(0);
    await page.close();stored.tasks.push({id:'competing-task',featureId:'f1',title:'Concurrent support',platform:'Backend',assignee:'u1',roleId:'r1',start:'2026-11-16',effort:1,status:'planned',dependsOn:[]});await seed(context,stored);
    const conflictPage=await context.newPage();conflictPage.on('pageerror',error=>errors.push(error.message));await open(conflictPage);await featureDrawer(conflictPage,workId);
    await expect(conflictPage.locator('[data-drawer-conflicts]')).toContainText('Concurrent support');await expect(conflictPage.getByLabel('End date',{exact:true})).toHaveValue('2026-11-20');
    await conflictPage.locator('[data-drawer-conflicts] [data-action=drawer-task][data-id=competing-task]').click();await expect(conflictPage.locator('[data-update-task=title]')).toHaveValue('Concurrent support');
    await expect(conflictPage.locator('[data-drawer-conflicts]')).toContainText('Deliver the whole work item');
    await conflictPage.locator(`[data-drawer-conflicts] [data-action=drawer-feature][data-id="${workId}"]`).click();await expect(conflictPage.locator('[data-update-feature=title]')).toHaveValue('Deliver the whole work item');
    for(const width of [375,320]){
      await conflictPage.setViewportSize({width,height:900});expect(await conflictPage.locator('.drawer').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
      if(width===320){const estimate=await conflictPage.getByLabel('Work item estimate (days)',{exact:true}).boundingBox(),assignee=await conflictPage.getByLabel('Assignee',{exact:true}).boundingBox();expect(estimate).not.toBeNull();expect(assignee).not.toBeNull();expect(Math.abs(estimate!.y-assignee!.y)).toBeLessThanOrEqual(1);}
      await conflictPage.screenshot({path:test.info().outputPath(`standalone-work-item-${width}.png`),fullPage:true});
    }
    expect((await currentData(context)).tasks.filter(task=>task.featureId===workId)).toHaveLength(0);
    // A resumed setup can contain existing work, so removing its owner must
    // clear both direct work-item ownership and ordinary sub-item assignments.
    await conflictPage.close();stored=await currentData(context);await seed(context,stored,1);
    const setupPage=await context.newPage();setupPage.on('pageerror',error=>errors.push(error.message));await setupPage.clock.install({time:new Date('2026-11-13T12:00:00Z')});await setupPage.goto('/app');
    await expect(setupPage.getByRole('heading',{name:'Add your team',exact:true})).toBeVisible();await expect(setupPage.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
    setupPage.once('dialog',dialog=>dialog.accept());await setupPage.locator('[data-action=setup-remove-member][data-id=u1]').click();
    await expect.poll(async()=>(await currentData(context)).people.length).toBe(0);await expect(setupPage.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
    stored=await currentData(context);expect(stored.features.find(feature=>feature.id===workId)?.assignee).toBeFalsy();expect(stored.features.find(feature=>feature.id===workId)?.effortOverride).toBe(3);expect(stored.tasks.find(task=>task.id==='competing-task')?.assignee).toBe('');
    await setupPage.reload();await expect(setupPage.getByRole('heading',{name:'Add your team',exact:true})).toBeVisible();await expect(setupPage.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');await expect(setupPage.locator('.setup-empty')).toContainText('No team members yet');
    expect((await snapshot(context)).workspace.projects[0].onboardingStep).toBe(1);expect((await currentData(context)).features.find(feature=>feature.id===workId)?.assignee).toBeFalsy();expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('sub-item descriptions can be created and edited as plain text and survive reload',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.tasks=[];await seed(context,data);await open(page);
    await page.locator('.story-add-button[data-action=open-story][data-id=f1]').click();await page.getByLabel('Sub-item name',{exact:true}).fill('Document the rule');
    const description='Acceptance criteria:\n- Keep <b>markup</b> as text & preserve "quotes".\n</textarea><img src=x onerror="window.orbitDescriptionInjected=true"><textarea>';
    await page.getByLabel('Description',{exact:true}).fill(description);await page.getByRole('checkbox',{name:'Include Backend Developer',exact:true}).check();
    await page.getByLabel('Backend Developer estimate (days)',{exact:true}).fill('1.5');await page.getByLabel('Backend Developer assignee',{exact:true}).selectOption('u1');
    await page.getByRole('button',{name:'Add sub-item',exact:true}).click();await ready(page);
    const created=(await currentData(context)).tasks.find(task=>task.title==='Document the rule')!;expect(created.description).toBe(description);
    await taskDrawer(page,created.id);await expect(page.locator('[data-update-task=description]')).toHaveValue(description);await expect(page.locator('.drawer img,.drawer script')).toHaveCount(0);
    expect(await page.evaluate(()=>Boolean((window as unknown as {orbitDescriptionInjected?:boolean}).orbitDescriptionInjected))).toBe(false);
    const edited='Updated delivery notes\n- First rule\n- Second rule\n<b>Keep this literal</b>';
    await page.getByLabel('Description',{exact:true}).fill(edited);await page.getByLabel('Description',{exact:true}).press('Tab');await ready(page);
    expect((await currentData(context)).tasks.find(task=>task.id===created.id)?.description).toBe(edited);
    await page.reload();await ready(page);await taskDrawer(page,created.id);await expect(page.getByLabel('Description',{exact:true})).toHaveValue(edited);
    await page.screenshot({path:test.info().outputPath('sub-item-description-desktop.png'),fullPage:true});
    await page.setViewportSize({width:320,height:900});expect(await page.locator('.drawer').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
    const estimate=await page.getByLabel('Estimate (days)',{exact:true}).boundingBox(),remaining=await page.getByLabel('Remaining effort (days)',{exact:true}).boundingBox();expect(estimate).not.toBeNull();expect(remaining).not.toBeNull();expect(Math.abs(estimate!.y-remaining!.y)).toBeLessThanOrEqual(1);
    await page.screenshot({path:test.info().outputPath('sub-item-description-320.png'),fullPage:true});expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('milestones sharing a date use an accessible picker while individual milestones remain editable and draggable',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.milestones=[
      {id:'m1',title:'Internal release',date:'2026-11-16',color:'#7769e6',featureIds:['f1']},
      {id:'m2',title:'Customer preview',date:'2026-11-16',color:'#508fd0',featureIds:[]},
      {id:'m3',title:'Operations readiness',date:'2026-11-16',color:'#45a992',featureIds:[]},
      {id:'m4',title:'Separate release',date:'2026-11-18',color:'#ad72ca',featureIds:[]},
    ];await seed(context,data);await open(page);
    const group=page.locator('.milestone-group-pin[data-date="2026-11-16"]');await expect(group).toHaveCount(1);await expect(group).toHaveText(/3 milestones/);await expect(group).toHaveAttribute('aria-haspopup','dialog');await expect(group).not.toHaveAttribute('data-id');
    for(const id of ['m1','m2','m3'])await expect(page.locator(`.milestone-pin[data-id="${id}"]`)).toHaveCount(0);
    await group.focus();await page.keyboard.press('Enter');let picker=page.getByRole('dialog');await expect(picker).toBeVisible();
    for(const title of ['Internal release','Customer preview','Operations readiness'])await expect(picker.getByRole('button',{name:'Open milestone '+title,exact:true})).toBeVisible();
    await expect(picker.getByRole('button',{name:'Open milestone Internal release',exact:true})).toBeFocused();
    await page.screenshot({path:test.info().outputPath('same-day-milestones-desktop.png'),fullPage:true});
    await picker.getByRole('button',{name:'Open milestone Customer preview',exact:true}).click();await expect(page.locator('[data-update-milestone=title]')).toHaveValue('Customer preview');
    await page.locator('[data-update-milestone=title]').fill('Customer preview updated');await page.getByRole('button',{name:'Save milestone',exact:true}).click();await ready(page);
    await closeDrawer(page);await expect.poll(async()=>(await currentData(context)).milestones.find(item=>item.id==='m2')?.title).toBe('Customer preview updated');
    for(const width of [375,320]){
      await page.setViewportSize({width,height:900});await group.scrollIntoViewIfNeeded();await group.click();picker=page.getByRole('dialog');await expect(picker).toContainText('Customer preview updated');
      expect(await picker.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const id of ['m1','m2','m3']){const bounds=await picker.locator(`[data-action=drawer-milestone][data-id="${id}"]`).boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);}
      await page.screenshot({path:test.info().outputPath(`same-day-milestones-${width}.png`),fullPage:true});await page.keyboard.press('Escape');await expect(group).toBeFocused();
    }
    await page.setViewportSize({width:1440,height:1000});await page.getByLabel('Timeline scale',{exact:true}).selectOption('week');await expect(group).toHaveCount(1);await expect(group).toHaveText(/3 milestones/);
    await page.getByLabel('Timeline scale',{exact:true}).selectOption('day');const pin=page.locator('.milestone-pin[data-id=m4]');await pin.scrollIntoViewIfNeeded();const before=(await pin.boundingBox())!,cell=(await page.locator('.day-cell').first().boundingBox())!;
    await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2+cell.width,before.y+before.height/2,{steps:6});await page.mouse.up();
    await expect.poll(async()=>(await currentData(context)).milestones.find(item=>item.id==='m4')?.date).toBe('2026-11-19');await ready(page);
    expect((await currentData(context)).milestones.filter(item=>item.id!=='m4').every(item=>item.date==='2026-11-16')).toBe(true);
    await page.reload();await ready(page);await group.click();await expect(page.getByRole('dialog').getByRole('button',{name:'Open milestone Customer preview updated',exact:true})).toBeVisible();expect(errors).toEqual([]);
  }finally{await context.close();}
});
