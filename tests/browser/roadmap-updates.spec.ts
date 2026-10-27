import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {projectData} from '../fixtures';
test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';let context:BrowserContext;
function workspace(){const data=projectData();data.people[0].capacity={feature:50,bugs:20,ongoing:20,ops:10};
 data.roles.push({id:'rReview',name:'Backend Reviewer',platform:'Backend'});
 data.people.push({...data.people[0],id:'u2',name:'Riley Reviewer',roleId:'rReview',role:'Backend Reviewer',capacity:{feature:100,bugs:0,ongoing:0,ops:0}});
 data.features[0].title='Configure suggestion categories as an administrator';data.features[0].baseline='2026-12-31';
 data.tasks[0].title='Configure categories';data.tasks[0].effort=6;data.tasks[0].roleId='r1';
 data.tasks.push({...data.tasks[0],id:'t2',title:'Review categories',roleId:'rReview',assignee:'u2',effort:1}, {...data.tasks[0],id:'t3',title:'Release categories',roleId:undefined,assignee:'',effort:1});
 return {version:1,activeId:'project',preferences:{scale:'day',sidebarHidden:true},projects:[{id:'project',name:'Release checks',onboardingStep:0,data}]};}
async function snapshot(){return(await context.request.get('/api/workspace')).json();}
async function reset(){const current=await snapshot();expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace:workspace()}})).status()).toBe(200);}
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
test.describe.serial('roles, capacity bands, dates and dependency arrows',()=>{
 test.beforeAll(async({browser})=>{context=await browser.newContext();const page=await context.newPage(),password='Orbit9'+randomUUID();await page.goto('/signup');await page.getByLabel('Email address').fill(`orbit-map-${randomUUID()}@example.com`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password').fill(password);await page.getByRole('button',{name:'Create account'}).click();await expect(page).toHaveURL(/\/app$/);await page.close();});
 test.afterAll(async()=>{await context?.close();});
 test('selects distinct compact roles sharing a platform and persists role-matched assignments',async()=>{
  await reset();const page=await context.newPage();await page.goto('/app');await page.locator('.gantt-corner').getByRole('button',{name:'Add feature'}).click();await page.getByLabel('Feature name').fill('Role-based epic');
  await expect(page.getByRole('checkbox',{name:'Include Backend',exact:true})).toHaveCount(0);
  const row=page.locator('[data-story-team]').first();expect((await row.boundingBox())!.height).toBeLessThan(48);
  for(const [role,person,estimate]of [['Backend Developer','u1','3'],['Backend Reviewer','u2','2']]){await page.getByRole('checkbox',{name:'Include '+role,exact:true}).check();await page.getByLabel(role+' estimate (days)').fill(estimate);await page.getByLabel(role+' assignee',{exact:true}).selectOption(person);}
  expect(await page.getByLabel('Backend Developer assignee',{exact:true}).locator('option').evaluateAll(nodes=>nodes.map(node=>(node as HTMLOptionElement).value))).toEqual(['','u1']);
  expect((await row.boundingBox())!.height).toBeLessThan(72);
  await page.setViewportSize({width:375,height:812});expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect((await row.boundingBox())!.height).toBeLessThan(105);
  await page.screenshot({path:'test-results/compact-roles.png',fullPage:true});await page.getByRole('button',{name:'Create feature',exact:true}).click();await saved(page);
  const data=(await snapshot()).workspace.projects[0].data,created=data.features.find((f:{title:string})=>f.title==='Role-based epic');expect(data.tasks.filter((t:{featureId:string})=>t.featureId===created.id).map((t:{roleId:string;assignee:string})=>[t.roleId,t.assignee])).toEqual([['r1','u1'],['rReview','u2']]);await page.reload();await saved(page);await page.close();
 });
 test('explains six effort days over sixteen calendar days and synchronizes manual and automatic dates',async()=>{
  await reset();const page=await context.newPage();await page.goto('/app');const bar=page.locator('.task-bar[data-task=t1]');
  await expect(bar).toHaveAttribute('title',/16 calendar days/);await expect(bar.locator('.capacity-band')).toHaveAttribute('style',/linear-gradient/);await expect(page.getByLabel('Timeline colors')).toContainText('Bug fixes');
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-26');await expect(page.getByLabel('End date')).toHaveValue('2026-11-10');
  await expect(page.locator('.drawer-content')).toContainText('6d effort · 16 calendar days');
  await page.getByLabel('End date').fill('2026-10-28');await page.getByLabel('End date').press('Tab');await saved(page);
  await expect(page.getByLabel('Date mode')).toHaveValue('manual');await expect(page.locator('.drawer-content')).toContainText('4.5d of effort does not fit');expect((await snapshot()).workspace.projects[0].data.tasks[0].effort).toBe(6);
  await page.getByLabel('Start date').fill('2026-10-27');await page.getByLabel('Start date').press('Tab');await saved(page);await expect(page.getByLabel('End date')).toHaveValue('2026-10-29');
  await page.getByLabel('Date mode').selectOption('automatic');await saved(page);await expect(page.getByLabel('End date')).toHaveValue('2026-11-11');
  await page.keyboard.press('Escape');await bar.scrollIntoViewIfNeeded();const before=(await bar.boundingBox())!;await page.mouse.move(before.x+before.width/2,before.y+before.height/2);await page.mouse.down();await page.mouse.move(before.x+before.width/2+76,before.y+before.height/2,{steps:8});await page.mouse.up();await saved(page);
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-29');await page.keyboard.press('Escape');
  await page.locator('.work-name[data-action=drawer-feature][data-id=f1]').click();const automaticEnd=await page.getByLabel('End date').inputValue();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-26');
  await page.getByLabel('End date').fill('2026-10-28');await page.getByLabel('End date').press('Tab');await saved(page);await expect(page.locator('.drawer-content')).toContainText('outside this feature window');await page.reload();await saved(page);
  await page.locator('.work-name[data-action=drawer-feature][data-id=f1]').click();await expect(page.getByLabel('End date')).toHaveValue('2026-10-28');await page.getByLabel('Date mode').selectOption('automatic');await saved(page);await expect(page.getByLabel('End date')).toHaveValue(automaticEnd);await page.keyboard.press('Escape');await page.screenshot({path:'test-results/capacity-bands.png',fullPage:true});await page.close();
 });
 test('draws dependencies on the map, prevents cycles, and supports keyboard/tap removal across zoom and filters',async()=>{
  await reset();const page=await context.newPage();await page.goto('/app');const from=page.locator('[data-action=link-from][data-id=t1]'),target=page.locator('.task-bar[data-task=t2]');await from.scrollIntoViewIfNeeded();const a=(await from.boundingBox())!,b=(await target.boundingBox())!;
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:14});await page.mouse.up();await saved(page);
  let data=(await snapshot()).workspace.projects[0].data;expect(data.tasks.find((t:{id:string})=>t.id==='t2').dependsOn).toEqual(['t1']);const edge=page.locator('.dependency-edge[data-from=t1][data-to=t2]');await expect(edge).toHaveCount(1);const path=await edge.getAttribute('d');
  await page.getByLabel('Timeline scale').selectOption('week');await expect(edge).not.toHaveAttribute('d',path!);
  await page.getByLabel('Filter by team member').selectOption('u2');await expect(edge).toHaveCount(0);await page.getByRole('button',{name:'Clear filters'}).click();await expect(edge).toHaveCount(1);
  await page.locator('[data-action=link-from][data-id=t2]').click();await page.locator('[data-action=link-to][data-id=t1]').click();await expect(page.locator('#toast-root')).toContainText('Circular dependencies');data=(await snapshot()).workspace.projects[0].data;expect(data.tasks[0].dependsOn).toEqual([]);
  await edge.focus();await page.keyboard.press('Enter');await page.getByRole('button',{name:'Remove selected dependency'}).click();await saved(page);await expect(edge).toHaveCount(0);expect((await snapshot()).workspace.projects[0].data.tasks[1].dependsOn).toEqual([]);
  await page.locator('[data-action=link-from][data-id=t1]').click();await page.locator('.task-bar[data-task=t3]').click();await saved(page);await page.reload();await saved(page);await expect(page.locator('.dependency-edge[data-from=t1][data-to=t3]')).toHaveCount(1);await page.screenshot({path:'test-results/dependency-arrows.png',fullPage:true});await page.close();
 });
});
