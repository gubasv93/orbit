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
  const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields,firstName:'Calendar',lastName:'Owner',email:`orbit-holidays-${randomUUID()}@example.com`,password,confirm:password}});
  expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(context:BrowserContext):Promise<{workspace:Workspace;revision:number}>{
  const response=await context.request.get('/api/workspace');expect(response.status(),await response.text()).toBe(200);return response.json();
}
async function seed(context:BrowserContext){
  const data=projectData();data.settings.autoShiftDependencies=false;data.tasks[0].effort=1;data.tasks[0].start='2026-04-03';data.features[0].start='2026-04-03';data.features[0].baseline='2027-12-31';
  data.holidays=[{date:'2026-04-03',name:'Company spring closure'},{date:'2026-12-24',name:'Company winter closure'},{date:'2026-12-25',name:'Company Christmas name'}];
  const workspace:Workspace={version:1,activeId:'holiday-project',preferences:{sidebarHidden:false,scale:'day'},projects:[{id:'holiday-project',name:'Country calendar checks',onboardingStep:0,data}]};
  const current=await snapshot(context),response=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{workspace,revision:current.revision}});
  expect(response.status(),await response.text()).toBe(200);
}
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function availability(page:Page){
  const show=page.getByRole('button',{name:'Show sidebar',exact:true});if(await show.isVisible())await show.click();
  await page.getByRole('button',{name:'Time off & holidays',exact:true}).click();
  await expect(page.getByLabel('Holiday country',{exact:true})).toBeVisible();
}
async function chooseCountry(page:Page,country:string){
  await page.getByLabel('Holiday country',{exact:true}).selectOption(country);
  const apply=page.getByRole('button',{name:'Apply holiday calendar',exact:true});await expect(apply).toBeEnabled();await apply.click();
  await expect.poll(async()=>(await snapshot(page.context())).workspace.projects[0].data.settings.holidayCalendar?.countryCode||'').toBe(country);await saved(page);
}
async function refreshHolidays(page:Page){
  const loaded=page.waitForResponse(response=>{const url=new URL(response.url());return url.pathname==='/api/holidays'&&url.searchParams.has('country');});
  await page.getByRole('button',{name:'Refresh public holidays',exact:true}).click();
  expect((await loaded).status()).toBe(200);await expect(page.getByRole('button',{name:'Refresh public holidays',exact:true})).toBeEnabled();await saved(page);
}
const holidays=async(context:BrowserContext)=>(await snapshot(context)).workspace.projects[0].data.holidays;
const row=(page:Page,date:string)=>page.locator(`[data-holiday-date="${date}"]`);

test('country public holidays populate dates, preserve manual overrides and affect the roadmap without either retired checkbox',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);await seed(context);await page.clock.install({time:new Date('2026-04-02T12:00:00Z')});await page.goto('/app');await saved(page);
    await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-04-06');await page.keyboard.press('Escape');
    await page.getByRole('button',{name:'General settings',exact:true}).click();
    await expect(page.getByRole('checkbox',{name:'Account for Ukrainian public holidays',exact:true})).toHaveCount(0);
    await expect(page.getByRole('dialog')).not.toContainText('Your company’s actual holiday policy may differ.');
    await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
    await availability(page);await expect(page.getByLabel('Holiday country',{exact:true})).toHaveValue('');
    await expect(page.getByText('Exclude public holidays',{exact:true})).toHaveCount(0);await expect(page.getByText('Use holiday calendar as non-working days',{exact:true})).toHaveCount(0);
    await expect(page.getByRole('button',{name:'Toggle holidays',exact:true})).toHaveCount(0);
    await chooseCountry(page,'DE');
    await expect.poll(async()=>(await snapshot(context)).workspace.projects[0].data.settings.holidayCalendar?.countryCode).toBe('DE');
    let entries=await holidays(context);
    expect(entries.some(holiday=>holiday.date==='2026-04-06')).toBe(true);expect(entries.some(holiday=>holiday.date==='2027-03-29')).toBe(true);
    expect(entries.filter(holiday=>holiday.date==='2026-12-25')).toEqual([{date:'2026-12-25',name:'Company Christmas name'}]);
    expect(entries.find(holiday=>holiday.date==='2026-12-24')?.name).toBe('Company winter closure');expect(new Set(entries.map(holiday=>holiday.date)).size).toBe(entries.length);
    expect(entries.some(holiday=>holiday.date==='2026-01-06')).toBe(false);
    await page.getByLabel('State / region',{exact:true}).selectOption('BY');
    await page.getByRole('button',{name:'Apply holiday calendar',exact:true}).click();
    await expect.poll(async()=>(await snapshot(context)).workspace.projects[0].data.settings.holidayCalendar?.stateCode).toBe('BY');await saved(page);
    expect((await holidays(context)).some(holiday=>holiday.date==='2026-01-06')).toBe(true);
    await page.getByRole('button',{name:'Roadmap',exact:true}).click();
    const holidayCell=page.locator('.day-cell[data-date="2026-04-06"]');await expect(holidayCell).toHaveClass(/holiday/);await expect(holidayCell).toHaveAttribute('title',/Easter|Oster/i);
    await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Start date',{exact:true})).toHaveValue('2026-04-07');await page.keyboard.press('Escape');
    await page.reload();await saved(page);await availability(page);await expect(page.getByLabel('Holiday country',{exact:true})).toHaveValue('DE');await expect(page.getByLabel('State / region',{exact:true})).toHaveValue('BY');
    entries=await holidays(context);expect(entries.some(holiday=>holiday.date==='2027-03-29')).toBe(true);
    await page.locator('.holiday-settings').evaluate(element=>element.scrollIntoView({block:'start'}));await page.screenshot({path:'test-results/country-holidays-1440.png',fullPage:true});
    for(const width of [375,320]){
      await page.setViewportSize({width,height:900});
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      expect(await page.getByLabel('Holiday country',{exact:true}).evaluate(element=>element.getBoundingClientRect().right<=innerWidth)).toBe(true);
      await page.locator('.holiday-settings').evaluate(element=>element.scrollIntoView({block:'start'}));
      await page.screenshot({path:`test-results/country-holidays-${width}.png`,fullPage:true});
    }
    expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('removing an imported date survives refresh and switching countries preserves manual holiday dates',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  try{
    await account(context);await seed(context);await page.clock.install({time:new Date('2026-11-12T12:00:00Z')});await page.goto('/app');await saved(page);await availability(page);await chooseCountry(page,'DE');
    const date='2027-03-29';await expect(row(page,date)).toBeVisible();
    page.once('dialog',dialog=>dialog.accept());await row(page,date).getByRole('button',{name:/^Remove holiday /}).click();await saved(page);
    await expect(row(page,date)).toHaveCount(0);
    await refreshHolidays(page);await expect(row(page,date)).toHaveCount(0);
    await page.reload();await saved(page);await availability(page);await expect(row(page,date)).toHaveCount(0);
    await page.getByRole('button',{name:'Add holiday',exact:true}).click();
    const manual=page.getByRole('dialog');await manual.getByLabel('Holiday title',{exact:true}).fill('Team May Day');await manual.getByLabel('Date',{exact:true}).fill('2026-05-01');
    await manual.getByRole('button',{name:'Add holiday',exact:true}).click();await saved(page);
    await expect.poll(async()=>(await holidays(context)).find(holiday=>holiday.date==='2026-05-01')?.name).toBe('Team May Day');
    await refreshHolidays(page);
    await expect(row(page,'2026-05-01')).toContainText('Team May Day');
    await chooseCountry(page,'GB');
    let entries=await holidays(context);expect(entries.some(holiday=>holiday.date==='2027-12-27')).toBe(true);expect(entries.some(holiday=>holiday.date==='2027-12-28')).toBe(true);
    expect(entries.some(holiday=>holiday.date==='2026-10-03')).toBe(false);
    expect(entries.find(holiday=>holiday.date==='2026-04-03')?.name).toBe('Company spring closure');
    expect(entries.find(holiday=>holiday.date==='2026-12-25')?.name).toBe('Company Christmas name');
    await chooseCountry(page,'');entries=await holidays(context);
    expect(entries.map(holiday=>holiday.name).sort()).toEqual(['Company Christmas name','Company spring closure','Company winter closure','Team May Day']);
    await page.reload();await saved(page);await availability(page);await expect(page.getByLabel('Holiday country',{exact:true})).toHaveValue('');
  }finally{await context.close();}
});

test('an open project refreshes its public holiday years at New Year and recalculates movable holidays without duplicates',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();
  try{
    await account(context);await seed(context);await page.clock.install({time:new Date('2026-12-31T23:59:40Z')});await page.goto('/app');await saved(page);await availability(page);await chooseCountry(page,'DE');
    expect((await holidays(context)).some(holiday=>holiday.date==='2027-03-29')).toBe(true);
    await page.clock.fastForward(120000);
    await expect.poll(async()=>(await holidays(context)).some(holiday=>holiday.date==='2028-04-17'),{timeout:20000}).toBe(true);await saved(page);
    const entries=await holidays(context);expect(new Set(entries.map(holiday=>holiday.date)).size).toBe(entries.length);
    expect((await snapshot(context)).workspace.projects[0].data.settings.holidayCalendar?.updatedForYear).toBe(2027);
    expect(entries.find(holiday=>holiday.date==='2026-12-24')?.name).toBe('Company winter closure');
    await page.reload();await saved(page);expect((await holidays(context)).some(holiday=>holiday.date==='2028-04-17')).toBe(true);
  }finally{await context.close();}
});
