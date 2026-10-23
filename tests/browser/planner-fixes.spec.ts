import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real authentication backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';
let context:BrowserContext;
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function snapshot(){return (await context.request.get('/api/workspace')).json();}
async function replace(workspace:ReturnType<typeof fullWorkspace>){
  const current=await snapshot();
  expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace}})).status()).toBe(200);
}
test.describe.serial('project setup and epic effort regressions',()=>{
  test.beforeAll(async({browser})=>{
    context=await browser.newContext();const page=await context.newPage(),password='Orbit9'+randomUUID();
    await page.goto('/signup');await page.getByLabel('Email address').fill(`orbit-fixes-${randomUUID()}@example.com`);
    await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button',{name:'Create account'}).click();await expect(page).toHaveURL(/\/app$/);
    await expect(page.getByRole('heading',{name:"Let's create your first project."})).toBeVisible();await page.close();
  });
  test.afterAll(async()=>{await context?.close();});

  test('keeps weekly Thursdays distinct from fortnightly and monthly patterns and fixes attendee selection',async()=>{
    test.setTimeout(60000);
    const workspace=fullWorkspace(),data=workspace.projects[0].data;
    workspace.projects[0].onboardingStep=2;data.meetings=[];
    for(const [index,name]of ['Casey Dev','Dana Dev','Evan Dev','Fatima Dev','Gabriel With A Long Name'].entries()){
      data.people.push({...data.people[0],id:'u'+(index+2),name,firstName:name.split(' ')[0],lastName:name.slice(name.indexOf(' ')+1)});
    }
    await replace(workspace);const page=await context.newPage();await page.goto('/app');
    await page.getByRole('button',{name:'Add meeting',exact:true}).click();
    await page.getByLabel('Meeting name').fill('Weekly planning');
    await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');
    await page.getByLabel('Day of week').selectOption('4');await page.getByLabel('Active from').fill('2026-10-29');
    await expect(page.getByLabel('Repeat every (weeks)')).toHaveValue('1');
    await expect(page.getByLabel('Which occurrence')).toBeHidden();
    await expect(page.locator('[data-meeting-preview]')).toHaveText('Every Thursday');
    const dates=(await page.locator('[data-meeting-dates]').textContent())!.replace('Next:','').split('·').map(value=>Date.parse(value.trim()+' 00:00 UTC'));
    expect(dates).toHaveLength(3);expect(dates.every(value=>new Date(value).getUTCDay()===4)).toBe(true);
    expect(dates[1]-dates[0]).toBe(7*86400000);expect(dates[2]-dates[1]).toBe(7*86400000);
    await page.getByRole('checkbox',{name:'Entire team'}).uncheck();
    await expect(page.getByRole('button',{name:'Create meeting'})).toBeDisabled();
    await page.getByLabel('Search attendees').fill('Alex');
    await page.getByRole('checkbox',{name:'Alex Dev',exact:true}).check();
    await expect(page.locator('[data-meeting-count]')).toHaveText('1 of 6 attendees selected');
    await page.getByLabel('Search attendees').fill('Casey');await page.getByRole('checkbox',{name:'Casey Dev',exact:true}).check();
    await page.getByLabel('Search attendees').clear();
    const checkbox=(await page.getByRole('checkbox',{name:'Alex Dev',exact:true}).boundingBox())!;
    expect(checkbox.width).toBeLessThanOrEqual(18);expect(checkbox.height).toBeLessThanOrEqual(18);
    await page.setViewportSize({width:375,height:812});
    await expect(page.getByRole('checkbox',{name:'Alex Dev',exact:true})).toBeVisible();
    await expect(page.locator('[data-meeting-count]')).toBeInViewport();
    await expect(page.getByRole('button',{name:'Close',exact:true})).toBeVisible();
    await expect(page.getByRole('button',{name:'Create meeting',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/meeting-picker.png',fullPage:true});
    await page.setViewportSize({width:1280,height:720});
    await page.getByRole('button',{name:'Create meeting'}).click();await saved(page);
    let stored=(await snapshot()).workspace.projects[0].data.meetings[0];
    expect(stored).toMatchObject({recurrence:'weekly',weekday:4,interval:1,attendees:['u1','u2'],allTeam:false});
    const legacy=await snapshot();legacy.workspace.projects[0].data.meetings[0].interval=2;
    await replace(legacy.workspace);await page.reload();
    await page.locator('.setup-meeting-list').getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Repeat every (weeks)')).toHaveValue('1');
    await expect(page.locator('[data-meeting-preview]')).toHaveText('Every Thursday');
    await page.getByLabel('Repeat every (weeks)').fill('2');
    await expect(page.locator('[data-meeting-preview]')).toHaveText('Every 2 weeks on Thursday');
    await page.getByRole('button',{name:'Save changes'}).click();await saved(page);
    stored=(await snapshot()).workspace.projects[0].data.meetings[0];expect(stored.recurrence).toBe('interval');
    await page.locator('.setup-meeting-list').getByRole('button',{name:'Edit',exact:true}).click();
    await expect(page.getByLabel('Repeat every (weeks)')).toHaveValue('2');
    await page.getByLabel('Repeat',{exact:true}).selectOption('monthly');await page.getByLabel('Which occurrence').selectOption('2');
    await expect(page.getByLabel('Repeat every (weeks)')).toBeHidden();
    await expect(page.locator('[data-meeting-preview]')).toHaveText('2nd Thursday of each month');
    await page.getByRole('button',{name:'Save changes'}).click();await saved(page);
    await page.locator('.setup-meeting-list').getByRole('button',{name:'Edit',exact:true}).click();
    await page.getByLabel('Repeat',{exact:true}).selectOption('weekly');await page.getByLabel('Day of week').selectOption('0');
    await expect(page.getByLabel('Repeat every (weeks)')).toHaveValue('1');
    await expect(page.locator('[data-meeting-preview]')).toHaveText('Every Sunday');
    await page.getByRole('checkbox',{name:'Entire team'}).check();
    await page.getByRole('button',{name:'Save changes'}).click();await saved(page);
    stored=(await snapshot()).workspace.projects[0].data.meetings[0];
    expect(stored).toMatchObject({recurrence:'weekly',weekday:0,interval:1,allTeam:true,attendees:[]});
    await page.close();
  });

  test('adds features inside the roadmap table and persists automatic and manual epic effort',async()=>{
    await replace(fullWorkspace());const page=await context.newPage();await page.goto('/app');
    const effort=page.locator('[data-feature-effort=f1]');await expect(effort).toHaveText('6d effort');
    await page.locator('[data-action=drawer-task][data-id=t1]').first().click();
    await page.getByLabel('Pure effort (days)',{exact:true}).fill('5');await page.getByLabel('Pure effort (days)',{exact:true}).press('Tab');
    await saved(page);await page.keyboard.press('Escape');await expect(effort).toHaveText('8d effort');
    await page.locator('.work-name[data-action=drawer-feature][data-id=f1]').click();
    await page.getByLabel('Effort estimate').selectOption('manual');
    await page.getByLabel('Manual total effort (days)').fill('13.5');await page.getByLabel('Manual total effort (days)').press('Tab');
    await saved(page);await page.keyboard.press('Escape');await expect(effort).toHaveText('13.5d manual effort');
    await page.locator('[data-action=drawer-task][data-id=t1]').first().click();await page.getByLabel('Pure effort (days)',{exact:true}).fill('7');await page.getByLabel('Pure effort (days)',{exact:true}).press('Tab');
    await saved(page);await page.keyboard.press('Escape');await page.reload();await expect(effort).toHaveText('13.5d manual effort');
    await page.locator('.work-name[data-action=drawer-feature][data-id=f1]').click();
    await expect(page.locator('.metric-row').filter({hasText:'Work items combined'})).toContainText('10d');
    await page.getByLabel('Effort estimate').selectOption('automatic');await saved(page);await page.keyboard.press('Escape');
    await expect(effort).toHaveText('10d effort');
    expect((await snapshot()).workspace.projects[0].data.features[0]).not.toHaveProperty('effortOverride');
    await page.getByLabel('Filter by platform').selectOption('Frontend');await expect(effort).toHaveText('10d effort');
    await page.locator('.gantt-corner').getByRole('button',{name:'Add feature'}).click();await page.getByLabel('Feature name').fill('Table-created epic');
    await page.getByLabel('Manual total effort (days)').fill('9.5');
    for(const checkbox of await page.locator('#modalForm input[type=checkbox][name^=phase_]').all())await checkbox.uncheck();
    await page.getByRole('button',{name:'Create feature',exact:true}).click();await saved(page);
    await expect(page.getByLabel('Filter by platform')).toHaveValue('');
    const created=(await snapshot()).workspace.projects[0].data.features.find((f:{title:string})=>f.title==='Table-created epic');
    expect(created.effortOverride).toBe(9.5);await expect(page.locator(`[data-feature-effort="${created.id}"]`)).toHaveText('9.5d manual effort');
    await page.reload();await expect(page.locator(`[data-feature-effort="${created.id}"]`)).toHaveText('9.5d manual effort');
    await page.setViewportSize({width:375,height:812});await expect(page.locator('.gantt-corner').getByRole('button',{name:'Add feature'})).toBeVisible();
    await page.screenshot({path:'test-results/epic-effort.png',fullPage:true});await page.close();
  });
});
