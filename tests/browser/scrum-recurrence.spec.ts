import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {signupLegalFields} from './legal-fixtures';
import {projectData} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');

async function account(context:BrowserContext){
  await context.addInitScript(()=>{try{localStorage.setItem('orbit-cookie-notice','essential-v1');}catch{}});
  const password='Orbit9'+randomUUID(),address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields,firstName:'Scrum',lastName:'Owner',email:`orbit-scrum-${randomUUID()}@example.com`,password,confirm:password}});
  expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(context:BrowserContext):Promise<{workspace:Workspace;revision:number}>{
  const response=await context.request.get('/api/workspace');expect(response.status(),await response.text()).toBe(200);return response.json();
}
function fixture(){
  const data=projectData();data.settings.autoShiftDependencies=false;
  Object.assign(data.tasks[0],{start:'2026-11-16',effort:3,manualEnd:'2026-12-04',manualEndFraction:1});
  Object.assign(data.features[0],{start:'2026-11-16',baseline:'2027-02-01'});
  Object.assign(data.iterations[0],{start:'2026-11-16',end:'2026-12-04'});
  return data;
}
async function seed(context:BrowserContext,data=fixture(),onboardingStep=0){
  const workspace:Workspace={version:1,activeId:'scrum-project',preferences:{sidebarHidden:false,scale:'day'},projects:[{id:'scrum-project',name:'Scrum recurrence checks',onboardingStep,data}]};
  const current=await snapshot(context),response=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{workspace,revision:current.revision}});
  expect(response.status(),await response.text()).toBe(200);
}
const meetings=async(context:BrowserContext)=>(await snapshot(context)).workspace.projects[0].data.meetings;
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function start(page:Page){
  await page.clock.install({time:new Date('2026-11-12T12:00:00Z')});await page.goto('/app');await saved(page);
}
async function management(page:Page){
  const show=page.getByRole('button',{name:'Show sidebar',exact:true});if(await show.isVisible())await show.click();
  await page.getByRole('button',{name:'Manage recurring meetings',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Recurring meetings',exact:true})).toBeVisible();
}
function row(page:Page,title:string){return page.locator('.meeting-item').filter({has:page.getByText(title,{exact:true})});}
async function closeManagement(page:Page){await page.getByRole('dialog').locator('.dialog-foot').getByRole('button',{name:'Close',exact:true}).click();}
async function createCustom(page:Page,title:string,startDate:string){
  await page.getByRole('button',{name:'Add meeting',exact:true}).click();
  await page.getByLabel('Meeting name',{exact:true}).fill(title);
  await page.getByLabel('Repeat',{exact:true}).selectOption('custom');
  await expect(page.getByLabel('Until (optional)',{exact:true})).toBeHidden();
  await page.getByLabel('Active from',{exact:true}).fill(startDate);
  await page.getByLabel('Start time',{exact:true}).fill('14:00');
  await page.getByLabel('Duration (minutes)',{exact:true}).fill('60');
}
async function chooseWeekdays(page:Page,days:string[]){
  for(const day of ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'])await page.getByRole('checkbox',{name:'Repeat on '+day,exact:true}).setChecked(days.includes(day));
}

test('Scrum presets add five editable meetings without duplicating or resetting existing choices',async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();
    data.meetings.push({id:'manual-meeting',title:'Existing review',recurrence:'weekly',weekday:2,interval:1,nth:1,startDate:'2026-11-16',endDate:'',startTime:'09:30',duration:15,allTeam:false,attendees:['u1'],enabled:true});
    await seed(context,data);const manual=(await meetings(context))[0];await start(page);await management(page);
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).length).toBe(6);await saved(page);
    const first=await meetings(context),preset=first.filter(meeting=>meeting.presetKey);
    expect(preset).toHaveLength(5);expect(first.find(meeting=>meeting.id==='manual-meeting')).toEqual(manual);
    const byKey=(key:string)=>preset.find(meeting=>meeting.presetKey===key);
    expect(byKey('scrum-daily')).toMatchObject({title:'Daily',startDate:'2026-11-12',startTime:'10:00',duration:30,recurrence:'custom',customRecurrence:{frequency:'day',interval:1,endType:'never'}});
    expect(byKey('scrum-refinement')).toMatchObject({title:'Refinement',startDate:'2026-11-12',startTime:'14:00',duration:60,customRecurrence:{frequency:'week',interval:1,weekdays:[2,4],endType:'never'}});
    expect(byKey('scrum-planning')).toMatchObject({title:'Planning',startDate:'2026-11-16',startTime:'11:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[1],endType:'never'}});
    expect(byKey('scrum-demo')).toMatchObject({title:'Demo',startDate:'2026-11-27',startTime:'14:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[5],endType:'never'}});
    expect(byKey('scrum-retro')).toMatchObject({title:'Retro',startDate:'2026-11-27',startTime:'16:00',duration:60,customRecurrence:{frequency:'week',interval:2,weekdays:[5],endType:'never'}});
    for(const meeting of preset)expect(meeting).toMatchObject({enabled:true,allTeam:true,attendees:[]});
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();await saved(page);expect(await meetings(context)).toEqual(first);
    await row(page,'Daily').getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Start time',{exact:true}).fill('12:30');await page.getByLabel('Duration (minutes)',{exact:true}).fill('45');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).find(meeting=>meeting.presetKey==='scrum-daily')?.duration).toBe(45);await saved(page);
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();await saved(page);
    expect((await meetings(context)).find(meeting=>meeting.presetKey==='scrum-daily')).toMatchObject({id:byKey('scrum-daily')!.id,startTime:'12:30',duration:45,presetKey:'scrum-daily'});
    page.once('dialog',dialog=>dialog.accept());await row(page,'Retro').getByTitle('Delete meeting',{exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).length).toBe(5);
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).length).toBe(6);await saved(page);
    const restored=await meetings(context);expect(restored.filter(meeting=>meeting.presetKey==='scrum-retro')).toHaveLength(1);
    expect(restored.find(meeting=>meeting.presetKey==='scrum-retro')!.id).not.toBe(byKey('scrum-retro')!.id);
    for(const meeting of first.filter(meeting=>!['scrum-daily','scrum-retro'].includes(meeting.presetKey||'')))expect(restored.find(entry=>entry.id===meeting.id)).toEqual(meeting);
    await page.reload();await saved(page);await management(page);
    await expect(row(page,'Daily')).toContainText('12:30');await expect(row(page,'Daily')).toContainText('45 min');await expect(page.locator('.meeting-item')).toHaveCount(6);
    await page.screenshot({path:test.info().outputPath('scrum-meetings-desktop.png'),fullPage:true});
    await closeManagement(page);await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();
    const expectedMinutes={'scrum-daily':675,'scrum-refinement':360,'scrum-planning':120,'scrum-demo':60,'scrum-retro':60};
    for(const [key,minutes] of Object.entries(expectedMinutes))await expect(page.locator(`[data-drawer-meeting="${restored.find(meeting=>meeting.presetKey===key)!.id}"]`)).toHaveAttribute('data-meeting-minutes',String(minutes));
    await expect(page.locator('.meeting-time-summary')).toContainText('22h');expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('project setup can add Scrum ceremonies before any team members exist',async({browser})=>{
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  try{
    await account(context);const data=fixture();data.people=[];data.roles=[];data.tasks=[];data.features=[];
    await seed(context,data,2);await start(page);await expect(page.getByRole('heading',{name:'Add recurring meetings',exact:true})).toBeVisible();
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).length).toBe(5);await saved(page);
    expect((await meetings(context)).every(meeting=>meeting.allTeam&&meeting.enabled&&meeting.attendees.length===0)).toBe(true);
    await page.getByRole('button',{name:'Add Scrum ceremonies',exact:true}).click();await saved(page);expect(await meetings(context)).toHaveLength(5);
    await page.reload();await saved(page);await expect(page.getByRole('heading',{name:'Add recurring meetings',exact:true})).toBeVisible();
    expect((await snapshot(context)).workspace.projects[0].onboardingStep).toBe(2);
    await page.getByRole('button',{name:'Continue to time off',exact:false}).click();
    await expect.poll(async()=>(await snapshot(context)).workspace.projects[0].onboardingStep).toBe(3);
  }finally{await context.close();}
});

test('custom alternating weekdays stop after their occurrence count and update real task meeting minutes when paused',async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  try{
    await account(context);await seed(context);await start(page);await management(page);await createCustom(page,'Alternating review','2026-11-16');
    await page.getByLabel('Repeat every',{exact:true}).fill('2');await page.getByLabel('Repeat unit',{exact:true}).selectOption('week');
    await chooseWeekdays(page,['Tuesday','Thursday']);await page.getByLabel('Ends',{exact:true}).selectOption('after');await page.getByLabel('Occurrences',{exact:true}).fill('3');
    await expect(page.locator('[data-meeting-preview]')).toContainText(/Every 2 weeks/);await expect(page.locator('[data-meeting-preview]')).toContainText(/Tuesday.*Thursday/);await expect(page.locator('[data-meeting-preview]')).toContainText(/3 occurrences/);
    await expect(page.locator('[data-meeting-dates]')).toContainText('17 November 2026');await expect(page.locator('[data-meeting-dates]')).toContainText('19 November 2026');await expect(page.locator('[data-meeting-dates]')).toContainText('1 December 2026');
    await page.getByRole('button',{name:'Create meeting',exact:true}).click();
    await expect.poll(async()=>(await meetings(context)).length).toBe(1);await saved(page);
    const meeting=(await meetings(context))[0];expect(meeting).toMatchObject({title:'Alternating review',recurrence:'custom',customRecurrence:{frequency:'week',interval:2,weekdays:[2,4],endType:'after',count:3}});
    await page.reload();await saved(page);await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();
    await expect(page.locator(`[data-drawer-meeting="${meeting.id}"]`)).toHaveAttribute('data-meeting-minutes','180');await expect(page.locator('.meeting-time-summary')).toContainText('3h');
    await expect(page.locator(`[data-drawer-meeting="${meeting.id}"]`)).toContainText('3 occurrences');await page.keyboard.press('Escape');
    await management(page);await row(page,'Alternating review').getByRole('button',{name:'Enabled',exact:true}).click();
    await expect.poll(async()=>(await meetings(context))[0].enabled).toBe(false);await saved(page);await closeManagement(page);
    await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.locator('[data-drawer-meetings]')).toHaveCount(0);await page.keyboard.press('Escape');
    await management(page);await row(page,'Alternating review').getByRole('button',{name:'Paused',exact:true}).click();
    await row(page,'Alternating review').getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Repeat every',{exact:true})).toHaveValue('2');await expect(page.getByLabel('Occurrences',{exact:true})).toHaveValue('3');
    await page.getByLabel('Ends',{exact:true}).selectOption('on');await page.getByLabel('Repeat until',{exact:true}).fill('2026-11-19');
    await expect(page.locator('[data-meeting-dates]')).toContainText('19 November 2026');await expect(page.locator('[data-meeting-dates]')).not.toContainText('December');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async()=>(await meetings(context))[0].customRecurrence?.endDate).toBe('2026-11-19');await saved(page);await closeManagement(page);
    await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.locator(`[data-drawer-meeting="${meeting.id}"]`)).toHaveAttribute('data-meeting-minutes','120');
    await expect(page.locator('.meeting-time-summary')).toContainText('2h');await page.keyboard.press('Escape');
    await management(page);await row(page,'Alternating review').getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByLabel('Day of week',{exact:true}).selectOption('4');await page.getByLabel('Repeat every (weeks)',{exact:true}).fill('2');await page.getByLabel('Until (optional)',{exact:true}).fill('2026-12-04');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await meetings(context))[0].recurrence).toBe('interval');await saved(page);
    expect((await meetings(context))[0]).not.toHaveProperty('customRecurrence');
    await row(page,'Alternating review').getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Repeat',{exact:true}).selectOption('custom');
    await expect(page.getByLabel('Repeat unit',{exact:true})).toHaveValue('week');await expect(page.getByLabel('Repeat every',{exact:true})).toHaveValue('2');await expect(page.getByRole('checkbox',{name:'Repeat on Thursday',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Repeat on Tuesday',exact:true})).not.toBeChecked();
    await expect(page.getByLabel('Ends',{exact:true})).toHaveValue('on');await expect(page.getByLabel('Repeat until',{exact:true})).toHaveValue('2026-12-04');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await meetings(context))[0].recurrence).toBe('custom');await saved(page);
  }finally{await context.close();}
});

test('monthly last-weekday, yearly and daily custom schedules stay readable and persist on small screens',async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.tasks[0].manualEnd='2027-01-29';await seed(context,data);await start(page);await management(page);await createCustom(page,'Monthly review','2026-11-27');
    await page.getByLabel('Repeat every',{exact:true}).fill('1');await page.getByLabel('Repeat unit',{exact:true}).selectOption('month');
    await page.getByLabel('Monthly pattern',{exact:true}).selectOption('weekday');await page.getByLabel('Weekday occurrence',{exact:true}).selectOption('-1');
    await page.getByLabel('Ends',{exact:true}).selectOption('on');await page.getByLabel('Repeat until',{exact:true}).fill('2027-01-29');
    await expect(page.locator('[data-meeting-preview]')).toContainText(/last Friday/i);
    for(const date of ['27 November 2026','25 December 2026','29 January 2027'])await expect(page.locator('[data-meeting-dates]')).toContainText(date);
    for(const width of [375,320]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      await expect(page.getByLabel('Meeting name',{exact:true})).toHaveValue('Monthly review');await expect(page.getByLabel('Repeat unit',{exact:true})).toHaveValue('month');await expect(page.getByLabel('Weekday occurrence',{exact:true})).toHaveValue('-1');await expect(page.getByLabel('Repeat until',{exact:true})).toHaveValue('2027-01-29');
      for(const label of ['Repeat every','Repeat unit','Monthly pattern','Weekday occurrence','Ends','Repeat until']){
        const bounds=await page.getByLabel(label,{exact:true}).boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);
      }
      await page.screenshot({path:test.info().outputPath(`custom-recurrence-${width}.png`),fullPage:true});
    }
    await page.getByRole('button',{name:'Create meeting',exact:true}).click();await expect.poll(async()=>(await meetings(context)).length).toBe(1);await saved(page);
    const meeting=(await meetings(context))[0];expect(meeting.customRecurrence).toMatchObject({frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:-1,endType:'on',endDate:'2027-01-29'});
    await page.setViewportSize({width:1440,height:1000});await closeManagement(page);await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();
    await expect(page.locator(`[data-drawer-meeting="${meeting.id}"]`)).toHaveAttribute('data-meeting-minutes','180');await page.keyboard.press('Escape');
    await management(page);await row(page,'Monthly review').getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Active from',{exact:true}).fill('2027-01-15');await page.getByLabel('Repeat unit',{exact:true}).selectOption('year');await page.getByLabel('Ends',{exact:true}).selectOption('never');
    await expect(page.getByLabel('Monthly pattern',{exact:true})).toBeHidden();await expect(page.getByLabel('Repeat until',{exact:true})).toBeHidden();
    await expect(page.locator('[data-meeting-preview]')).toContainText(/Every year/i);await expect(page.locator('[data-meeting-dates]')).toContainText('15 January 2027');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await meetings(context))[0].customRecurrence?.frequency).toBe('year');await saved(page);
    await row(page,'Monthly review').getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Repeat unit',{exact:true}).selectOption('day');await page.getByLabel('Repeat every',{exact:true}).fill('3');
    await page.getByLabel('Ends',{exact:true}).selectOption('after');await page.getByLabel('Occurrences',{exact:true}).fill('2');
    await expect(page.locator('[data-meeting-dates]')).toContainText('15 January 2027');await expect(page.locator('[data-meeting-dates]')).toContainText('18 January 2027');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await meetings(context))[0].customRecurrence?.frequency).toBe('day');await saved(page);
    await page.reload();await saved(page);await management(page);await row(page,'Monthly review').getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Repeat unit',{exact:true})).toHaveValue('day');await expect(page.getByLabel('Repeat every',{exact:true})).toHaveValue('3');await expect(page.getByLabel('Ends',{exact:true})).toHaveValue('after');await expect(page.getByLabel('Occurrences',{exact:true})).toHaveValue('2');
    await page.getByLabel('Occurrences',{exact:true}).fill('0');await page.getByLabel('Ends',{exact:true}).selectOption('never');
    await expect(page.getByLabel('Occurrences',{exact:true})).toBeHidden();await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async()=>(await meetings(context))[0].customRecurrence?.endType).toBe('never');await saved(page);expect((await meetings(context))[0].customRecurrence).not.toHaveProperty('count');
    await row(page,'Monthly review').getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Repeat',{exact:true}).selectOption('monthly');
    await page.getByLabel('Active from',{exact:true}).fill('2026-11-16');await page.getByLabel('Day of week',{exact:true}).selectOption('4');await page.getByLabel('Which occurrence',{exact:true}).selectOption('2');await page.getByLabel('Until (optional)',{exact:true}).fill('2027-01-20');
    await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect.poll(async()=>(await meetings(context))[0].recurrence).toBe('monthly');await saved(page);
    await row(page,'Monthly review').getByRole('button',{name:'Edit',exact:true}).click();await page.getByLabel('Repeat',{exact:true}).selectOption('custom');
    await expect(page.getByLabel('Active from',{exact:true})).toHaveValue('2026-12-10');await expect(page.getByLabel('Repeat unit',{exact:true})).toHaveValue('month');await expect(page.getByLabel('Monthly pattern',{exact:true})).toHaveValue('weekday');await expect(page.getByLabel('Weekday occurrence',{exact:true})).toHaveValue('2');
    await expect(page.locator('[data-custom-conversion-note]')).toContainText('2026-11-16 to 2026-12-10');
    for(const date of ['10 December 2026','14 January 2027'])await expect(page.locator('[data-meeting-dates]')).toContainText(date);
    await expect(page.locator('[data-meeting-preview]')).toContainText(/2nd Thursday/);await page.getByRole('button',{name:'Save changes',exact:true}).click();
    await expect.poll(async()=>(await meetings(context))[0].startDate).toBe('2026-12-10');await saved(page);
    expect((await meetings(context))[0]).toMatchObject({recurrence:'custom',customRecurrence:{frequency:'month',interval:1,monthlyMode:'weekday',monthlyOrdinal:2,endType:'on',endDate:'2027-01-20'}});
    expect(errors).toEqual([]);
  }finally{await context.close();}
});
