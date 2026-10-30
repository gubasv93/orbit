import {test,expect,type BrowserContext,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {projectData} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000';let context:BrowserContext;
function workspace():Workspace{
 const data=projectData();data.settings.autoShiftDependencies=false;data.tasks[0].roleId='r1';
 data.roles.push({id:'rFront',name:'Frontend Developer',platform:'Frontend'},{id:'rQA',name:'QA Engineer',platform:'QA'},{id:'rReview',name:'Backend Reviewer',platform:'Backend'});
 return {version:1,activeId:'roles-project',preferences:{scale:'day',sidebarHidden:true},projects:[{id:'roles-project',name:'Story roles',onboardingStep:0,data}]};
}
async function snapshot(){return (await context.request.get('/api/workspace')).json();}
async function replace(value:Workspace){const current=await snapshot();expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace:value}})).status()).toBe(200);}
async function ready(page:Page){await expect(page.locator('.gantt-canvas')).toBeVisible();await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function openTask(page:Page,id:string){await page.locator(`.work-name[data-action=drawer-task][data-id="${id}"]`).click();}

test.describe.serial('paused children and expandable story roles',()=>{
 test.beforeAll(async({browser})=>{context=await browser.newContext();const page=await context.newPage(),password='Orbit9'+randomUUID();await page.goto('/signup');await page.getByLabel('First name',{exact:true}).fill('Test');await page.getByLabel('Last name',{exact:true}).fill('User');await page.getByLabel('Email address').fill(`orbit-story-roles-${randomUUID()}@example.com`);await page.getByLabel('Password',{exact:true}).fill(password);await page.getByLabel('Confirm password').fill(password);await page.getByRole('button',{name:'Create account',exact:true}).click();await expect(page).toHaveURL(/\/app$/);await page.close();});
 test.afterAll(async()=>{await context?.close();});

 test('keeps the epic and other tasks scheduled when a child is paused, displays the paused count, and clears it on resume',async()=>{
  const value=workspace(),data=value.projects[0].data;data.tasks.push({...data.tasks[0],id:'pause-me',title:'Paused backend work',assignee:'',effort:2},{...data.tasks[0],id:'next',title:'Independent work',assignee:'',effort:1,start:'2026-11-02'});
  await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);const original=(await snapshot()).workspace.projects[0].data.tasks;
  const feature=page.locator('.feature-bar[data-feature=f1]'),first=page.locator('.task-bar[data-task=t1]'),next=page.locator('.task-bar[data-task=next]');const firstStyle=await first.getAttribute('style'),nextStyle=await next.getAttribute('style');
  await openTask(page,'pause-me');await page.getByRole('button',{name:'Put on hold',exact:true}).click();await ready(page);await page.keyboard.press('Escape');await expect(feature).toBeVisible();await expect(feature).toHaveClass(/has-paused/);await expect(feature.getByRole('img',{name:'1 paused work item',exact:true})).toBeVisible();
  await expect(first).toHaveAttribute('style',firstStyle!);await expect(next).toHaveAttribute('style',nextStyle!);expect((await snapshot()).workspace.projects[0].data.tasks).toEqual(original.map((t:{id:string})=>t.id==='pause-me'?{...t,status:'hold'}:t));
  await page.locator('.work-name[data-action=drawer-feature][data-id=f1]').click();await expect(page.locator('.drawer')).toContainText('Work continues');await expect(page.locator('.drawer')).toContainText('Other work continues');await expect(page.getByLabel('End date')).not.toHaveValue('');await page.keyboard.press('Escape');
  await page.locator('[data-action=collapse][data-id=f1]').click();await ready(page);await expect(feature.getByRole('img',{name:'1 paused work item',exact:true})).toBeVisible();await page.screenshot({path:'test-results/epic-with-paused-child.png',fullPage:true});await page.reload();await ready(page);await expect(feature).toHaveClass(/has-paused/);
  await page.locator('[data-action=collapse][data-id=f1]').click();await ready(page);await openTask(page,'pause-me');await page.getByRole('button',{name:'Resume task',exact:true}).click();await ready(page);await page.keyboard.press('Escape');await expect(feature).not.toHaveClass(/has-paused/);await expect(first).toHaveAttribute('style',firstStyle!);await expect(next).toHaveAttribute('style',nextStyle!);await page.close();
 });

 test('creates selected roles without assignees or estimates and can estimate their work later',async()=>{
  await replace(workspace());const page=await context.newPage();await page.goto('/app');await ready(page);await page.getByRole('button',{name:'Add user story to Accounts',exact:true}).click();await page.getByLabel('User story name').fill('Rules story');
  for(const role of ['Backend Developer','Frontend Developer','QA Engineer']){await page.getByRole('checkbox',{name:'Include '+role,exact:true}).check();await expect(page.getByLabel(role+' estimate (days)')).toHaveValue('');await expect(page.getByLabel(role+' assignee',{exact:true})).toHaveValue('');}
  await expect(page.getByRole('button',{name:'Add user story',exact:true})).toBeEnabled();await page.getByRole('button',{name:'Add user story',exact:true}).click();await ready(page);
  const tasks=(await snapshot()).workspace.projects[0].data.tasks.filter((t:{title:string})=>t.title==='Rules story');expect(tasks).toHaveLength(3);expect(new Set(tasks.map((t:{storyId:string})=>t.storyId)).size).toBe(1);expect(tasks[0].storyId).toBeTruthy();expect(tasks.map((t:{roleId:string;assignee:string;effort:number})=>[t.roleId,t.assignee,t.effort])).toEqual([['r1','',0],['rFront','',0],['rQA','',0]]);
  for(const task of tasks){await expect(page.locator(`.task-bar[data-task="${task.id}"]`)).toHaveCount(0);await expect(page.locator(`[data-row-task="${task.id}"]`)).toContainText('Not estimated');}
  await expect(page.locator('.feature-bar[data-feature=f1]')).toBeVisible();await openTask(page,tasks[0].id);await page.getByLabel('Pure effort (days)',{exact:true}).fill('.5');await page.getByLabel('Pure effort (days)',{exact:true}).press('Tab');await ready(page);await page.keyboard.press('Escape');await expect(page.locator(`.task-bar[data-task="${tasks[0].id}"]`)).toBeVisible();await page.reload();await ready(page);expect((await snapshot()).workspace.projects[0].data.tasks.find((t:{id:string})=>t.id===tasks[0].id).storyId).toBe(tasks[0].storyId);await page.close();
 });

 test('adds more roles from a legacy task, preserves same-name unrelated stories, and retains the role group after reload',async()=>{
  test.setTimeout(90000);const value=workspace(),data=value.projects[0].data;data.tasks.push({...data.tasks[0],id:'unrelated'});await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);const before=(await snapshot()).workspace.projects[0].data.tasks;
  await openTask(page,'t1');await page.getByRole('button',{name:'+ Add roles',exact:true}).click();await expect(page.getByRole('heading',{name:'Add roles to user story',exact:true})).toBeVisible();await expect(page.getByLabel('User story name')).toHaveValue('API');await expect(page.getByLabel('User story name')).toHaveAttribute('readonly','');await expect(page.getByRole('checkbox',{name:'Include Backend Developer',exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Add roles',exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Include Frontend Developer',exact:true}).check();await page.getByRole('checkbox',{name:'Include QA Engineer',exact:true}).check();await page.getByLabel('QA Engineer estimate (days)').fill('.25');await expect(page.getByRole('button',{name:'Add roles',exact:true})).toBeDisabled();await page.getByLabel('QA Engineer estimate (days)').fill('1.5');
  for(const width of [375,320]){await page.setViewportSize({width,height:812});expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.getByRole('button',{name:'Add roles',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:`test-results/add-story-roles-${width}.png`,fullPage:true});}
  await page.getByRole('button',{name:'Add roles',exact:true}).click();await ready(page);const tasks=(await snapshot()).workspace.projects[0].data.tasks,source=tasks.find((t:{id:string})=>t.id==='t1'),related=tasks.filter((t:{storyId:string})=>t.storyId===source.storyId);
  expect(tasks).toHaveLength(4);expect(source.storyId).toBeTruthy();expect(source).toEqual({...before[0],storyId:source.storyId});expect(tasks.find((t:{id:string})=>t.id==='unrelated')).toEqual(before[1]);expect(related.map((t:{roleId:string;effort:number})=>[t.roleId,t.effort])).toEqual([['r1',3],['rFront',0],['rQA',1.5]]);
  await page.setViewportSize({width:1280,height:900});await page.reload();await ready(page);const frontend=related.find((t:{roleId:string})=>t.roleId==='rFront');await openTask(page,frontend.id);await expect(page.locator('[data-story-roles]')).toContainText('Backend Developer');await expect(page.locator('[data-story-roles]')).toContainText('QA Engineer');await page.getByRole('button',{name:'+ Add roles',exact:true}).click();for(const role of ['Backend Developer','Frontend Developer','QA Engineer'])await expect(page.getByRole('checkbox',{name:'Include '+role,exact:true})).toBeDisabled();
  await page.getByRole('checkbox',{name:'Include Backend Reviewer',exact:true}).check();await page.getByRole('button',{name:'Add roles',exact:true}).click();await ready(page);const added=(await snapshot()).workspace.projects[0].data.tasks.filter((t:{storyId:string})=>t.storyId===source.storyId);expect(added).toHaveLength(4);expect(added.find((t:{roleId:string})=>t.roleId==='rReview')).toMatchObject({platform:'Backend',effort:0,assignee:''});await page.close();
 });

 test('uses the existing name-only sub-item for the first selected role and chains further roles without an empty extra row',async()=>{
  const value=workspace(),source=value.projects[0].data.tasks[0];Object.assign(source,{effort:0,remaining:0,platform:'',assignee:''});delete source.roleId;
  await replace(value);const page=await context.newPage();await page.goto('/app');await ready(page);await openTask(page,'t1');await page.getByRole('button',{name:'+ Add roles',exact:true}).click();await page.getByRole('checkbox',{name:'Include Backend Developer',exact:true}).check();await page.getByRole('checkbox',{name:'Include QA Engineer',exact:true}).check();await page.getByLabel('Backend Developer estimate (days)').fill('.5');await page.getByRole('checkbox',{name:'Link new roles after this work item',exact:true}).check();await page.getByRole('button',{name:'Add roles',exact:true}).click();await ready(page);
  const tasks=(await snapshot()).workspace.projects[0].data.tasks;expect(tasks).toHaveLength(2);expect(tasks[0]).toMatchObject({id:'t1',roleId:'r1',platform:'Backend',effort:.5,assignee:'',dependsOn:[]});expect(tasks[0].remaining).toBeUndefined();expect(tasks[1]).toMatchObject({roleId:'rQA',platform:'QA',effort:0,assignee:'',dependsOn:['t1'],storyId:tasks[0].storyId});await page.reload();await ready(page);expect((await snapshot()).workspace.projects[0].data.tasks).toEqual(tasks);await page.close();
 });
});
