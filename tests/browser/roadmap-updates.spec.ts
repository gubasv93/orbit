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
async function reset(value=workspace()){const current=await snapshot();expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace:value}})).status()).toBe(200);}
async function openSettings(page:Page){const show=page.getByRole('button',{name:'Show sidebar',exact:true});if(await show.isVisible())await show.click();await page.getByRole('button',{name:'General settings',exact:true}).click();}
async function saved(page:Page){await expect(page.locator('.gantt-canvas')).toBeVisible();await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
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
  const data=(await snapshot()).workspace.projects[0].data,created=data.features.find((f:{title:string})=>f.title==='Role-based epic');expect(data.tasks.filter((t:{featureId:string})=>t.featureId===created.id).map((t:{roleId:string;assignee:string})=>[t.roleId,t.assignee])).toEqual([['r1','u1'],['rReview','u2']]);await page.reload();await saved(page);
  await page.setViewportSize({width:1280,height:720});
  for(const task of data.tasks.filter((item:{featureId:string})=>item.featureId===created.id)){
   const bar=page.locator(`.task-bar[data-task="${task.id}"]`),name=task.roleId==='r1'?'Backend Developer':'Backend Reviewer';
   await expect(bar.locator('[data-bar-field=title]')).toHaveText(task.title);await expect(bar.locator('[data-bar-field=role]')).toHaveText(name);await expect(bar).not.toContainText(/\b\d+(?:\.\d+)?d\b/);await expect(bar).toHaveAttribute('title',new RegExp('Role: '+name+' · Platform: Backend · '+task.effort+'d effort'));
  }
  await expect(page.locator('.task-bar[data-task=t3] [data-bar-field=title]')).toHaveText('Release categories');await expect(page.locator('.task-bar[data-task=t3] [data-bar-field=role]')).toHaveText('Backend');
  await page.screenshot({path:'test-results/role-platform-bar-labels.png',fullPage:true});await page.close();
 });
 test('explains six effort days over eight calendar days and synchronizes manual and automatic dates',async()=>{
  await reset();const page=await context.newPage();await page.goto('/app');const bar=page.locator('.task-bar[data-task=t1]');
  await expect(bar).toHaveAttribute('title',/8 calendar days/);await expect(bar.locator('.capacity-band')).toHaveAttribute('style',/linear-gradient/);await expect(page.getByLabel('Timeline colors')).toContainText('Recurring meetings');
  const fill=bar.locator('.capacity-band'),gradient=(await fill.getAttribute('style'))!,colors=gradient.match(/#[a-f0-9]{6}/g)!;
  expect(colors).toHaveLength(2);expect(new Set(colors).size).toBe(2);
  const parentColors=(await page.locator('.feature-bar .capacity-band').getAttribute('style'))!.match(/#[a-f0-9]{6}/g)!;expect(new Set(parentColors).size).toBe(parentColors.length);
  await expect(bar).toHaveAttribute('title',/Accounted time mix/);
  for(const scale of ['week','month','quarter','year','day']){await page.getByLabel('Timeline scale').selectOption(scale);await expect(fill).toHaveAttribute('style',gradient);}
  await page.screenshot({path:'test-results/capacity-totals.png',fullPage:true});
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-26');await expect(page.getByLabel('End date')).toHaveValue('2026-11-02');
  await expect(page.locator('.drawer-content')).toContainText('6d effort · 8 calendar days');
  await page.getByLabel('End date').fill('2026-10-28');await page.getByLabel('End date').press('Tab');await saved(page);
  await expect(page.getByLabel('Date mode')).toHaveValue('manual');await expect(page.locator('.drawer-content')).toContainText('3d of effort does not fit');expect((await snapshot()).workspace.projects[0].data.tasks[0].effort).toBe(6);
  await page.getByLabel('Start date').fill('2026-10-27');await page.getByLabel('Start date').press('Tab');await saved(page);await expect(page.getByLabel('End date')).toHaveValue('2026-10-29');
  await page.getByLabel('Date mode').selectOption('automatic');await saved(page);await expect(page.getByLabel('End date')).toHaveValue('2026-11-03');
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
 test('controls automatic dependency movement in per-project general settings without moving manual links',async()=>{
  test.setTimeout(90000);
  const legacy=workspace();legacy.projects[0].data.tasks[1].dependsOn=['t1'];delete legacy.projects[0].data.settings.autoShiftDependencies;
  await reset(legacy);const page=await context.newPage();await page.goto('/app');await saved(page);await openSettings(page);await page.keyboard.press('Escape');
  await expect.poll(async()=>(await snapshot()).workspace.projects[0].data.settings.autoShiftDependencies).toBe(false);
  expect((await snapshot()).workspace.projects[0].data.tasks[1].start).toBe('2026-11-11');
  await page.locator('[data-action=link-from][data-id=t1]').click();await page.locator('.task-bar[data-task=t3]').click();await saved(page);
  expect((await snapshot()).workspace.projects[0].data.tasks[2].start).toBe('2026-10-26');await expect(page.locator('.dependency-edge[data-to=t3]')).toHaveClass(/timing-warning/);
  await page.locator('.work-name[data-action=drawer-task][data-id=t3]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-26');await page.keyboard.press('Escape');
  await openSettings(page);await expect(page.getByRole('heading',{name:'General settings'})).toBeVisible();
  const automatic=page.getByRole('checkbox',{name:'Auto-shift dependent work items',exact:true});await expect(automatic).not.toBeChecked();await expect(page.getByLabel('Gap between dependent items')).toBeDisabled();
  await automatic.check();await page.getByLabel('Gap between dependent items').fill('5');await page.getByLabel('Gap unit').selectOption('calendar');
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  await page.locator('.work-name[data-action=drawer-task][data-id=t3]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-11-09');
  await page.getByLabel('Start date').fill('2026-11-23');await page.getByLabel('Start date').press('Tab');await saved(page);await expect(page.getByLabel('Start date')).toHaveValue('2026-11-23');await page.keyboard.press('Escape');
  await openSettings(page);await page.getByLabel('When dates change').selectOption('follow');await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  await page.locator('.work-name[data-action=drawer-task][data-id=t3]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-11-09');await page.keyboard.press('Escape');
  await openSettings(page);await page.getByLabel('Gap unit').selectOption('working');await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  await page.locator('.work-name[data-action=drawer-task][data-id=t3]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-11-10');await page.keyboard.press('Escape');
  await openSettings(page);await automatic.uncheck();await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  expect((await snapshot()).workspace.projects[0].data.tasks[2].start).toBe('2026-11-10');await page.reload();await saved(page);
  await page.locator('.work-name[data-action=drawer-task][data-id=t3]').click();await expect(page.getByLabel('Start date')).toHaveValue('2026-11-10');
  await page.getByLabel('Start date').fill('2026-10-26');await page.getByLabel('Start date').press('Tab');await saved(page);await page.keyboard.press('Escape');await expect(page.locator('.dependency-edge[data-to=t3]')).toHaveClass(/timing-warning/);
  await openSettings(page);await automatic.check();await page.getByLabel('Gap between dependent items').fill('7');await automatic.uncheck();await page.getByRole('checkbox',{name:'Show dependency timing warnings',exact:true}).uncheck();await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  await expect(page.locator('.dependency-edge[data-to=t3]')).not.toHaveClass(/timing-warning/);let current=await snapshot();expect(current.workspace.projects[0].data.settings).toMatchObject({autoShiftDependencies:false,dependencyGapDays:7,dependencyGapUnit:'working',dependencyShiftPolicy:'follow',showDependencyWarnings:false});
  current.workspace.projects.push({id:'other',name:'Other project',onboardingStep:0,data:projectData()});
  expect((await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:current.revision,workspace:current.workspace}})).status()).toBe(200);await page.reload();await saved(page);
  if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await page.locator('.project-trigger').click();await page.locator('.project-pick-row').filter({hasText:'Other project'}).getByRole('button',{name:'Open project',exact:false}).click();await saved(page);
  await openSettings(page);await expect(automatic).toBeChecked();await expect(page.getByLabel('Gap between dependent items')).toHaveValue('0');
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Save settings',exact:true}).scrollIntoViewIfNeeded();await expect(page.getByRole('button',{name:'Save settings',exact:true})).toBeInViewport();expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.screenshot({path:'test-results/general-dependency-settings.png',fullPage:true});
  await page.getByRole('button',{name:'Cancel',exact:true}).click();current=await snapshot();expect(current.workspace.projects[0].data.settings.autoShiftDependencies).toBe(false);expect(current.workspace.projects[1].data.settings.autoShiftDependencies).toBe(true);await page.close();
 });
 test('reorders epic groups and reparents work items with pointer, keyboard and mobile move controls',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  data.features[0].title='First epic';data.features.push({...data.features[0],id:'f2',title:'Second epic',collapsed:false},{...data.features[0],id:'f3',title:'Empty epic',collapsed:true});
  data.tasks[1].dependsOn=['t1'];data.tasks.push({...data.tasks[2],id:'t4',title:'Destination task',featureId:'f2'});
  const originals=structuredClone(data.tasks);await reset(w);const page=await context.newPage();await page.setViewportSize({width:1280,height:1100});await page.goto('/app');await saved(page);
  const order=()=>page.locator('[data-row-feature],[data-row-task]').evaluateAll(rows=>rows.map(row=>row.getAttribute('data-row-feature')||row.getAttribute('data-row-task')));
  async function drag(kind:string,id:string,target:string,position:'before'|'after'|'inside'){
   const grip=page.locator(`[data-row-drag=${kind}][data-id=${id}]`),row=page.locator(target);await grip.scrollIntoViewIfNeeded();await row.scrollIntoViewIfNeeded();
   const a=(await grip.boundingBox())!,b=(await row.boundingBox())!,meta=(await row.locator('.meta').boundingBox())!;
   await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(meta.x+110,b.y+(position==='before'?4:position==='after'?b.height-4:b.height/2),{steps:12});await page.mouse.up();await saved(page);
  }
  await drag('feature','f3','[data-row-feature=f1]','before');expect(await order()).toEqual(['f3','f1','t1','t2','t3','f2','t4']);
  await drag('feature','f1','[data-row-task=t4]','after');expect(await order()).toEqual(['f3','f2','t4','f1','t1','t2','t3']);
  await drag('task','t1','[data-row-task=t4]','before');expect(await order()).toEqual(['f3','f2','t1','t4','f1','t2','t3']);
  await expect(page.locator('[data-feature-effort=f1]')).toHaveText('2d effort');await expect(page.locator('[data-feature-effort=f2]')).toHaveText('7d effort');
  await expect(page.locator('.dependency-edge[data-from=t1][data-to=t2]')).toHaveCount(1);
  await drag('task','t3','[data-row-feature=f3]','inside');expect(await order()).toEqual(['f3','t3','f2','t1','t4','f1','t2']);
  const stable=await snapshot(),grip=page.locator('[data-row-drag=task][data-id=t2]');await grip.scrollIntoViewIfNeeded();const a=(await grip.boundingBox())!;
  await page.mouse.move(a.x+10,a.y+12);await page.mouse.down();await page.mouse.move(a.x+30,a.y-65,{steps:8});await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot()).workspace).toEqual(stable.workspace);await expect(page.locator('.row-drag-ghost')).toHaveCount(0);
  await page.mouse.move(a.x+10,a.y+12);await page.mouse.down();await page.mouse.move(a.x+35,a.y-65,{steps:8});await page.dispatchEvent('body','pointercancel');await page.mouse.up();expect((await snapshot()).workspace).toEqual(stable.workspace);
  // Keyboard fallback uses the same validated move command.
  await page.waitForTimeout(270);await grip.focus();await page.keyboard.press('Enter');await expect(page.getByRole('heading',{name:'Move item',exact:true})).toBeVisible();
  await page.getByLabel('Parent epic', {exact:true}).selectOption('f2');await page.getByLabel('Position', {exact:true}).selectOption('t4');await page.getByRole('button',{name:'Move item',exact:true}).click();await saved(page);
  expect(await order()).toEqual(['f3','t3','f2','t1','t2','t4','f1']);
  const updated=(await snapshot()).workspace.projects[0].data;
  for(const task of updated.tasks){const original=originals.find(item=>item.id===task.id)!;expect({...task,featureId:original.featureId}).toEqual(original);}
  await page.reload();await saved(page);expect(await order()).toEqual(['f3','t3','f2','t1','t2','t4','f1']);
  await page.setViewportSize({width:375,height:812});await page.locator('[data-row-drag=task][data-id=t2]').click();await page.getByLabel('Parent epic',{exact:true}).selectOption('f1');
  expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.screenshot({path:'test-results/move-roadmap-item-mobile.png',fullPage:true});
  await page.getByRole('button',{name:'Move item',exact:true}).click();await saved(page);expect((await snapshot()).workspace.projects[0].data.tasks.find((t:{id:string})=>t.id==='t2').featureId).toBe('f1');
  // Backup carries the chosen order and new parent references.
  await openSettings(page);const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export JSON',exact:true}).click();expect((await download).suggestedFilename()).toMatch(/\.json$/);
  await page.close();
 });
 test('shows recurring meetings and separate absences in one total color split with retired capacity ignored',async()=>{
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  data.meetings=[{id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:60,allTeam:true,attendees:[],enabled:true}];
  data.leave=[{id:'sick',person:'u1',type:'sick',from:'2026-10-27',to:'2026-10-27',note:''},{id:'off',person:'u1',type:'vacation',from:'2026-10-30',to:'2026-11-01',note:''}];
  await reset(w);const page=await context.newPage();await page.goto('/app');const bar=page.locator('.task-bar[data-task=t1]');
  await expect(bar).toHaveAttribute('title',/11 calendar days/);await expect(bar).toHaveAttribute('title',/Recurring meetings: 1d.*Weekends: 2d.*Days off: 1d.*Sick leave: 1d/);
  expect(new Set((await bar.locator('.capacity-band').getAttribute('style'))!.match(/#[a-f0-9]{6}/g)).size).toBe(5);
  if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await expect(page.getByRole('button',{name:'Team capacity',exact:true})).toHaveCount(0);
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('End date')).toHaveValue('2026-11-05');await expect(page.locator('.drawer-content')).toContainText('Sick leave');await page.keyboard.press('Escape');
  await openSettings(page);await page.getByRole('button',{name:'Manage meetings',exact:true}).click();await expect(page.getByRole('heading',{name:'Recurring meetings',exact:true})).toBeVisible();await expect(page.locator('.meeting-list')).toContainText('Daily');await page.keyboard.press('Escape');await page.screenshot({path:'test-results/full-work-meetings-absences.png',fullPage:true});await page.close();
 });

 test('auto-scrolls a long roadmap while dragging an epic and preserves its child group',async()=>{
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  for(let i=2;i<=24;i++)data.features.push({...data.features[0],id:'f'+i,title:'Epic '+i,collapsed:true});
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const scroller=page.locator('#ganttScroller'),grip=page.locator('[data-row-drag=feature][data-id=f1]'),a=(await grip.boundingBox())!,bounds=(await scroller.boundingBox())!;
  await page.mouse.move(a.x+10,a.y+14);await page.mouse.down();await page.mouse.move(bounds.x+110,bounds.y+bounds.height-8,{steps:10});
  await expect(page.locator('.row-drag-ghost')).toBeVisible();
  await expect.poll(()=>scroller.evaluate(node=>node.scrollHeight-node.clientHeight-node.scrollTop),{timeout:10000}).toBeLessThan(3);
  const last=(await page.locator('[data-row-feature=f24] .meta').boundingBox())!;await page.mouse.move(last.x+110,last.y+last.height-5,{steps:4});await page.mouse.up();await saved(page);
  expect((await snapshot()).workspace.projects[0].data.features.at(-1).id).toBe('f1');
  await expect(page.locator('[data-row-feature=f1]')).toHaveCount(1);await expect(page.locator('[data-parent-feature=f1]')).toHaveCount(3);await expect(page.locator('.row-drag-ghost')).toHaveCount(0);
  await page.close();
 });

 test('scrolls into past and future on every scale and Today restores the current date without changing work',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  const today=new Date().toISOString().slice(0,10),past=new Date(Date.now()-30*86400000).toISOString().slice(0,10);
  data.tasks[0].start=past;data.tasks[0].completedDate=past;data.tasks[0].status='done';
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);const canvas=page.locator('.gantt-canvas'),scroller=page.locator('#ganttScroller');
  const original=(await snapshot()).workspace.projects[0].data;
  await expect(page.locator('.today-tag')).toBeInViewport();expect(await scroller.evaluate(node=>node.scrollLeft)).toBeGreaterThan(0);
  const initial=(await canvas.getAttribute('data-range-start'))!;
  await scroller.focus();await scroller.evaluate(node=>node.scrollLeft=0);await expect(canvas).not.toHaveAttribute('data-range-start',initial);await expect(scroller).toBeFocused();await expect(page.locator('.task-bar[data-task=t1]')).toBeInViewport();
  const leading=()=>scroller.evaluate(node=>{const canvas=node.querySelector<HTMLElement>('.gantt-canvas')!;return Date.parse(canvas.dataset.rangeStart!)/86400000+node.scrollLeft/parseFloat(canvas.style.getPropertyValue('--cell'));});const before=await leading();await page.mouse.move(1000,300);await page.mouse.wheel(-600,0);await expect.poll(leading).toBeLessThan(before);
  await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page.locator('.today-tag')).toBeInViewport();
  for(const scale of ['day','week','month','quarter','year']){
   await page.getByLabel('Timeline scale').selectOption(scale);const start=(await canvas.getAttribute('data-range-start'))!;
   await scroller.evaluate(node=>node.scrollLeft=node.scrollWidth);await expect(canvas).not.toHaveAttribute('data-range-start',start);
   const future=(await canvas.getAttribute('data-range-start'))!;expect(future>start).toBe(true);
   await scroller.evaluate(node=>node.scrollLeft=0);await expect(canvas).not.toHaveAttribute('data-range-start',future);
   await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page.locator('.today-tag')).toBeInViewport();
  }
  await page.getByLabel('Timeline scale').selectOption('day');await page.getByRole('button',{name:'Earlier',exact:true}).click();await page.getByRole('button',{name:'Later',exact:true}).click();await page.getByRole('button',{name:'Today',exact:true}).click();await saved(page);
  await expect(page.locator(`.day-cell[data-date="${today}"]`)).toBeInViewport();expect((await snapshot()).workspace.projects[0].data).toEqual(original);
  await page.screenshot({path:'test-results/scroll-history.png',fullPage:true});await page.close();
 });
 test('creates half-day estimates, rounds quarter-day meetings and draws genuine half-width bars without unused work',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;data.tasks[0].effort=.5;data.tasks[1].effort=1;data.tasks[1].assignee='';
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const bar=page.locator('.task-bar[data-task=t1]'),full=page.locator('.task-bar[data-task=t2]');
  await expect(bar).toHaveAttribute('title',/0.5 calendar days/);expect((await bar.boundingBox())!.width/(await full.boundingBox())!.width).toBeCloseTo(.5,2);
  await expect(page.getByLabel('Timeline colors')).not.toContainText('Unused');await expect(page.locator('.capacity-band').first()).not.toHaveAttribute('style',/#edf0f6/);
  await page.getByRole('button',{name:'Add user story to Configure suggestion categories as an administrator',exact:true}).click();await page.getByLabel('User story name').fill('Half-day change');await page.getByRole('checkbox',{name:'Include Backend Developer',exact:true}).check();
  const input=page.getByLabel('Backend Developer estimate (days)');await expect(input).toHaveAttribute('min','0.5');await expect(input).toHaveAttribute('step','0.5');await input.fill('.25');await expect(page.getByRole('button',{name:'Add user story',exact:true})).toBeDisabled();await input.fill('.5');await page.getByRole('button',{name:'Add user story',exact:true}).click();await saved(page);
  const created=(await snapshot()).workspace.projects[0].data.tasks.find((task:{title:string})=>task.title==='Half-day change');expect(created.effort).toBe(.5);await expect(page.locator(`.task-bar[data-task="${created.id}"]`)).toHaveAttribute('title',/0.5 calendar days/);
  const changed=workspace();changed.projects[0].data.settings.autoShiftDependencies=false;changed.projects[0].data.tasks[0].effort=.5;
  changed.projects[0].data.meetings=[{id:'quarter',title:'Quarter day',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:120,allTeam:true,attendees:[],enabled:true}];
  await reset(changed);await page.reload();await saved(page);await expect(bar).toHaveAttribute('title',/1 calendar days/);await expect(bar).toHaveAttribute('title',/Development: 0.5d.*Recurring meetings: 0.5d/);
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.locator('.drawer-content')).not.toContainText('Unused');await expect(page.getByLabel('Pure effort (days)',{exact:true})).toHaveValue('0.5');await page.keyboard.press('Escape');
  expect((await snapshot()).workspace.projects[0].data.meetings[0].duration).toBe(120);await page.screenshot({path:'test-results/half-day-chart.png',fullPage:true});await page.close();
 });
 test('changes assignees directly in roadmap rows with exact-role choices and persistence',async()=>{
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;data.tasks[0].effort=.5;
  data.people.push({...data.people[0],id:'u3',name:'Casey Dev'});data.leave.push({id:'sick',person:'u3',type:'sick',from:'2026-10-26',to:'2026-10-26',note:''});
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);const select=page.locator('[data-row-assignee=t1]');
  expect(await select.locator('option').evaluateAll(nodes=>nodes.map(node=>(node as HTMLOptionElement).value))).toEqual(['','u1','u3']);const original=structuredClone(data.tasks[0]);
  await select.selectOption('u3');await saved(page);const changed=(await snapshot()).workspace.projects[0].data.tasks[0];expect(changed).toEqual({...original,assignee:'u3'});await expect(page.locator('.drawer-wrap')).toHaveCount(0);await expect(page.locator('.task-bar[data-task=t1]')).toHaveAttribute('title',/27 Oct/);
  await page.reload();await saved(page);await expect(select).toHaveValue('u3');await select.selectOption('');await saved(page);await expect(select).toHaveValue('');
  // An injected option still goes through the same role validation as the inspector.
  await select.evaluate(node=>{const option=document.createElement('option');option.value='u2';option.textContent='Wrong role';node.append(option);});await select.selectOption('u2');await expect(page.locator('#toast-root')).toContainText('matching team member');expect((await snapshot()).workspace.projects[0].data.tasks[0].assignee).toBe('');
  await page.setViewportSize({width:375,height:812});await select.selectOption('u1');await saved(page);await expect(select).toHaveValue('u1');expect((await select.boundingBox())!.width).toBeGreaterThan(20);await page.screenshot({path:'test-results/inline-assignee-mobile.png',fullPage:true});await page.close();
 });
 test('keeps the chart compact while row editing, filters, date dragging and mobile scrolling remain usable',async()=>{
  await reset();const page=await context.newPage();await page.goto('/app');await saved(page);
  expect((await page.locator('.gantt-row[data-row-task=t1]').boundingBox())!.height).toBeLessThanOrEqual(44);expect((await page.locator('[data-row-feature=f1]').boundingBox())!.height).toBeLessThanOrEqual(50);
  expect((await page.locator('#ganttScroller').boundingBox())!.height).toBeGreaterThan(430);expect((await page.locator('#ganttScroller').boundingBox())!.y).toBeLessThan(160);
  await page.getByLabel('Filter by team member').selectOption('u1');await expect(page.locator('[data-row-task]')).toHaveCount(1);await page.getByRole('button',{name:'Clear filters',exact:true}).click();await expect(page.locator('[data-row-task]')).toHaveCount(3);
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Today',exact:true}).scrollIntoViewIfNeeded();await page.getByRole('button',{name:'Today',exact:true}).click();await expect(page.locator('.today-tag')).toBeInViewport();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);const canvas=page.locator('.gantt-canvas'),start=await canvas.getAttribute('data-range-start');await page.locator('#ganttScroller').evaluate(node=>node.scrollLeft=0);await expect(canvas).not.toHaveAttribute('data-range-start',start!);
  await expect(page.locator('[data-row-assignee=t1]')).toBeInViewport();await page.screenshot({path:'test-results/compact-chart-mobile.png',fullPage:true});await page.close();
 });

 test('resizes work items and epic date windows with half-day ends, keyboard controls and cancellation',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;data.tasks[0].assignee='';data.tasks[0].effort=2;
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const handle=(kind:string,id:string,edge:string)=>page.locator(`[data-resize-kind=${kind}][data-id=${id}][data-resize-edge=${edge}]`);
  const drag=async(kind:string,id:string,edge:string,dx:number)=>{const h=handle(kind,id,edge);await h.scrollIntoViewIfNeeded();const box=(await h.boundingBox())!;await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+dx,box.y+box.height/2,{steps:8});await expect(page.locator('.bar-resize-preview')).toBeVisible();await page.mouse.up();await saved(page);};
  const original=(await snapshot()).workspace.projects[0].data;
  await drag('task','t1','end',19);
  await expect.poll(async()=>(await snapshot()).workspace.projects[0].data.tasks[0].manualEnd).toBe('2026-10-28');
  let task=(await snapshot()).workspace.projects[0].data.tasks[0];expect(task).toMatchObject({effort:2,start:'2026-10-26',manualEndFraction:.5});
  await expect(page.locator('.task-bar[data-task=t1]')).toHaveAttribute('title',/2.5 calendar days/);
  await drag('task','t1','end',-57);await expect(page.locator('.task-bar[data-task=t1]')).toHaveAttribute('title',/1d does not fit/);
  await handle('task','t1','end').focus();await page.keyboard.press('ArrowLeft');await saved(page);
  expect((await snapshot()).workspace.projects[0].data.tasks[0]).toMatchObject({effort:2,manualEnd:'2026-10-26',manualEndFraction:.5});
  await page.keyboard.press('ArrowLeft');await saved(page);await expect(page.locator('.task-bar[data-task=t1]')).toHaveAttribute('title',/0.5 calendar days/);
  for(let i=0;i<3;i++){await page.keyboard.press('ArrowRight');await saved(page);}
  await drag('task','t1','start',38);task=(await snapshot()).workspace.projects[0].data.tasks[0];expect(task).toMatchObject({start:'2026-10-27',manualEnd:'2026-10-27',effort:2});
  const stable=(await snapshot()).workspace.projects[0].data;
  const h=handle('task','t1','end'),b=(await h.boundingBox())!;await page.mouse.move(b.x+3,b.y+8);await page.mouse.down();await page.mouse.move(b.x+60,b.y+8,{steps:6});await page.keyboard.press('Escape');await page.mouse.up();
  expect((await snapshot()).workspace.projects[0].data).toEqual(stable);await expect(page.locator('.bar-resize-preview')).toHaveCount(0);
  await drag('feature','f1','end',19);let current=(await snapshot()).workspace.projects[0].data;expect(current.tasks).toEqual(stable.tasks);expect(current.features[0].manualEndFraction).toBe(.5);
  await page.reload();await saved(page);await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Date mode')).toHaveValue('manual');await expect(page.getByLabel('Start date')).toHaveValue('2026-10-27');
  await page.getByLabel('Date mode').selectOption('automatic');await saved(page);await page.keyboard.press('Escape');
  task=(await snapshot()).workspace.projects[0].data.tasks[0];expect(task).not.toHaveProperty('manualEnd');expect(task).not.toHaveProperty('manualEndFraction');expect(task.effort).toBe(2);
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Today',exact:true}).click();await drag('task','t1','end',19);await page.screenshot({path:'test-results/resize-bars-mobile.png',fullPage:true});
  current=(await snapshot()).workspace.projects[0].data;expect(current.tasks[0].manualEndFraction).toBe(.5);expect(current.tasks.slice(1)).toEqual(original.tasks.slice(1));await page.close();
 });
 test('opens recurring meetings directly and shows exact hours with one combined half-day planning reserve',async()=>{
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;data.tasks[0].effort=6;
  const base={enabled:true,endDate:'',allTeam:true,attendees:[],weekday:1,interval:1,nth:1,startDate:'2026-10-26'};
  data.meetings=[{...base,id:'daily',title:'Daily 30 minutes',recurrence:'workdays',startTime:'09:00',duration:30},
   {...base,id:'planning',title:'Weekly planning',recurrence:'weekly',startTime:'10:00',duration:60},
   {...base,id:'demo',title:'Fortnightly demo',recurrence:'interval',weekday:5,interval:2,startDate:'2026-10-30',startTime:'14:00',duration:60}];
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const bar=page.locator('.task-bar[data-task=t1]');await expect(bar).toHaveAttribute('title',/9 calendar days.*Recurring meetings: 1d.*Actual meeting time: 6.5h/);
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.locator('.meeting-time-summary')).toContainText('6.5h');await expect(page.locator('.meeting-time-summary')).toContainText('Planning reserve: 1d');await page.keyboard.press('Escape');
  if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await page.getByRole('button',{name:'Manage recurring meetings',exact:true}).click();await expect(page.getByRole('heading',{name:'Recurring meetings',exact:true})).toBeVisible();
  await page.locator('.meeting-item').filter({hasText:'Weekly planning'}).getByRole('button',{name:'Edit',exact:true}).click();await expect(page.getByLabel('Repeat every (weeks)')).toHaveValue('1');
  await page.getByLabel('Duration (minutes)').fill('30');await page.getByRole('button',{name:'Save changes',exact:true}).click();await saved(page);
  await page.locator('.dialog-foot').getByRole('button',{name:'Close',exact:true}).click();await expect(bar).toHaveAttribute('title',/Actual meeting time: 5.5h/);
  if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await page.getByRole('button',{name:'Manage recurring meetings',exact:true}).click();
  for(const title of ['Daily 30 minutes','Weekly planning','Fortnightly demo']){await page.locator('.meeting-item').filter({hasText:title}).getByRole('button',{name:'Enabled',exact:true}).click();await saved(page);}
  await page.setViewportSize({width:375,height:812});await expect(page.locator('.dialog-feedback')).toBeVisible();const feedback=(await page.locator('.dialog-feedback').boundingBox())!,actions=(await page.locator('.dialog-foot').boundingBox())!;expect(feedback.y+feedback.height).toBeLessThanOrEqual(actions.y);await page.screenshot({path:'test-results/meeting-management-mobile.png',fullPage:true});
  await page.locator('.dialog-foot').getByRole('button',{name:'Close',exact:true}).click();await expect(bar).toHaveAttribute('title',/8 calendar days/);await expect(bar).not.toHaveAttribute('title',/Recurring meetings:/);
  await page.reload();await saved(page);if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await page.getByRole('button',{name:'Manage recurring meetings',exact:true}).click();await expect(page.getByRole('button',{name:'Paused',exact:true})).toHaveCount(3);await page.close();
 });
 test('keeps long labels and controls aligned on desktop, tablet and narrow mobile screens',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  w.projects[0].name='A project with a very long name for planning cross-functional product development and releases';
  data.roles[0].name='Backend developer responsible for configuration and administrator permissions';
  data.people[0].name='Alexandra Developer With A Very Long Display Name';data.features[0].title+=' with a long descriptive feature name';data.tasks[0].title='A user story with a long descriptive name for administrator configuration';
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  for(const width of [1440,1100,768,375,320]){
   await page.setViewportSize({width,height:900});await page.getByRole('button',{name:'Today',exact:true}).click();
   expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
   const app=(await page.locator('.app').boundingBox())!,container=(await page.locator('.planner-root').boundingBox())!;expect(Math.abs(app.height-container.height)).toBeLessThan(1);
   const chart=(await page.locator('#ganttScroller').boundingBox())!;expect(chart.y+chart.height).toBeLessThanOrEqual(900);
   const taskBar=page.locator('.task-bar[data-task=t1]'),caption=taskBar.locator('[data-bar-field=title]');await expect(caption).toHaveText(data.tasks[0].title);const box=(await caption.boundingBox())!,barBox=(await taskBar.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(barBox.x);expect(box.x+box.width).toBeLessThanOrEqual(barBox.x+barBox.width+.5);await expect(taskBar.locator('[data-bar-field=role]')).toBeHidden();
   const left=(await page.locator('.topbar-start').boundingBox())!,right=(await page.locator('.top-right').boundingBox())!;expect(left.x+left.width).toBeLessThanOrEqual(right.x+1);
   for(const selector of ['.top-right .btn','.save-bar button','.save-bar .import-label'])for(const element of await page.locator(selector+':visible').all()){const box=(await element.boundingBox())!;expect(box.x).toBeGreaterThanOrEqual(0);expect(box.x+box.width).toBeLessThanOrEqual(width+1);}
   if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();await page.getByRole('button',{name:'Manage recurring meetings',exact:true}).click();await page.getByRole('button',{name:'Add meeting',exact:true}).click();await page.getByRole('checkbox',{name:'Entire team'}).uncheck();
   const person=page.locator('.meeting-person').first();await expect(person).toBeVisible();expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   const check=(await person.locator('input').boundingBox())!,name=(await person.locator('.meeting-person-name').boundingBox())!;expect(check.x+check.width).toBeLessThan(name.x);expect(name.x+name.width).toBeLessThanOrEqual(width);
   if(width===375)await page.screenshot({path:'test-results/aligned-meeting-attendees-mobile.png',fullPage:true});await page.keyboard.press('Escape');
   await page.locator('.gantt-corner').getByRole('button',{name:'Add feature',exact:true}).click();await page.getByRole('checkbox',{name:'Include '+data.roles[0].name,exact:true}).check();expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
   if(width===375)await page.screenshot({path:'test-results/aligned-story-estimates-mobile.png',fullPage:true});await page.keyboard.press('Escape');
  }
  if(await page.getByRole('button',{name:'Show sidebar',exact:true}).isVisible())await page.getByRole('button',{name:'Show sidebar',exact:true}).click();
  for(const selector of ['.project-new','.project-trigger'])expect(await page.locator(selector).evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);
  for(const pageId of ['team','availability','milestones']){await page.locator(`.nav-item[data-action=page][data-id=${pageId}]`).click();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:`test-results/aligned-${pageId}-mobile.png`,fullPage:true});}
  await page.close();
 });

 test('moves an entire epic with manual windows, hidden children, completed dates, keyboard and mobile controls',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  Object.assign(data.features[0],{manualEnd:'2026-11-03',manualEndFraction:.5});data.tasks[0].effort=2;
  Object.assign(data.tasks[1],{start:'2026-10-27',manualEnd:'2026-10-30',manualEndFraction:.5});Object.assign(data.tasks[2],{status:'done',completedDate:'2026-10-27'});
  data.features.push({...data.features[0],id:'f2',title:'Other epic',manualEnd:undefined});data.tasks.push({...data.tasks[1],id:'t4',featureId:'f2',dependsOn:['t1']});
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const bar=page.locator('.feature-bar[data-feature=f1]');
  const begin=async(dx:number)=>{const b=(await bar.boundingBox())!,corner=(await page.locator('.gantt-corner').boundingBox())!,scroller=(await page.locator('#ganttScroller').boundingBox())!;const x=(Math.max(b.x+12,corner.x+corner.width+12)+Math.min(b.x+b.width-12,scroller.x+scroller.width-12))/2;await page.mouse.move(x,b.y+b.height/2);await page.mouse.down();await page.mouse.move(x+dx,b.y+b.height/2,{steps:8});};
  const drop=async()=>{await page.mouse.up();await saved(page);await page.waitForTimeout(270);};
  const initial=(await snapshot()).workspace.projects[0].data,edge=page.locator('.dependency-edge[data-from=t1][data-to=t4]'),oldPath=await edge.getAttribute('d');
  await begin(76);await expect(bar).toHaveClass(/dragging/);expect((await snapshot()).workspace.projects[0].data).toEqual(initial);await expect(edge).not.toHaveAttribute('d',oldPath!);await drop();
  await expect.poll(async()=>(await snapshot()).workspace.projects[0].data.features[0].start).toBe('2026-10-28');
  let current=(await snapshot()).workspace.projects[0].data;expect(current.features[0]).toEqual({...initial.features[0],start:'2026-10-28',manualEnd:'2026-11-05'});
  expect(current.tasks[0]).toEqual({...initial.tasks[0],start:'2026-10-28'});expect(current.tasks[1]).toEqual({...initial.tasks[1],start:'2026-10-29',manualEnd:'2026-11-01'});expect(current.tasks[2]).toEqual({...initial.tasks[2],start:'2026-10-28',completedDate:'2026-10-29'});expect(current.tasks[3]).toEqual(initial.tasks[3]);await expect(page.locator('.drawer')).toHaveCount(0);
  const stable=current;await begin(-38);await page.keyboard.press('Escape');await page.mouse.up();expect((await snapshot()).workspace.projects[0].data).toEqual(stable);await expect(page.locator('.dragging')).toHaveCount(0);
  await begin(38);await bar.dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();expect((await snapshot()).workspace.projects[0].data).toEqual(stable);
  await page.getByLabel('Filter by team member').selectOption('u1');await saved(page);await expect(page.locator('[data-parent-feature=f1]')).toHaveCount(1);await begin(38);await drop();
  current=(await snapshot()).workspace.projects[0].data;expect(current.tasks[1].start).toBe('2026-10-30');expect(current.tasks[2].completedDate).toBe('2026-10-30');expect(current.tasks[3]).toEqual(initial.tasks[3]);
  await page.getByRole('button',{name:'Clear filters',exact:true}).click();await page.locator('[data-row-feature=f1] .chevron').click();await saved(page);await expect(page.locator('[data-parent-feature=f1]')).toHaveCount(0);await begin(-38);await drop();
  expect((await snapshot()).workspace.projects[0].data.features[0].collapsed).toBe(true);await bar.focus();await page.keyboard.press('ArrowRight');await saved(page);expect((await snapshot()).workspace.projects[0].data.tasks[0].start).toBe('2026-10-29');
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Today',exact:true}).click();await begin(-38);await drop();await page.screenshot({path:'test-results/whole-epic-move-mobile.png',fullPage:true});
  await page.reload();await saved(page);current=(await snapshot()).workspace.projects[0].data;expect(current.features[0]).toMatchObject({start:'2026-10-28',manualEnd:'2026-11-05',manualEndFraction:.5,collapsed:true});expect(current.tasks[0].effort).toBe(2);expect(current.tasks[3]).toEqual(initial.tasks[3]);
  await bar.click();await expect(page.getByRole('heading',{name:initial.features[0].title,exact:true})).toBeVisible();await expect(page.getByLabel('Start date')).toHaveValue('2026-10-28');await page.close();
 });
 test('reforecasts an automatically dated epic after dragging while preserving estimates and date mode',async()=>{
  const w=workspace();w.projects[0].data.settings.autoShiftDependencies=false;w.projects[0].data.tasks[0].effort=3;
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);const bar=page.locator('.feature-bar[data-feature=f1]');await expect(bar).toHaveAttribute('title',/3 calendar days/);
  const b=(await bar.boundingBox())!;await page.mouse.move(b.x+b.width/2,b.y+b.height/2);await page.mouse.down();await page.mouse.move(b.x+b.width/2+152,b.y+b.height/2,{steps:10});await page.mouse.up();await saved(page);
  await expect.poll(async()=>(await snapshot()).workspace.projects[0].data.tasks[0].start).toBe('2026-10-30');await expect(bar).toHaveAttribute('title',/5 calendar days/);
  const data=(await snapshot()).workspace.projects[0].data;expect(data.tasks.map((task:{effort:number})=>task.effort)).toEqual([3,1,1]);expect(data.features[0]).not.toHaveProperty('manualEnd');expect(data.tasks[0]).not.toHaveProperty('manualEnd');await page.close();
 });

 test('fills the whole task and epic color mix without white tails, changing dates or inventing effort',async()=>{
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;data.features[0].manualEnd='2026-11-03';
  Object.assign(data.tasks[0],{effort:1,manualEnd:'2026-10-28'});data.tasks[1].start='2026-10-30';data.tasks[2].start='2026-11-02';
  data.meetings=[{id:'daily',title:'Daily',recurrence:'workdays',weekday:1,interval:1,nth:1,startDate:'2026-10-26',endDate:'',startTime:'09:00',duration:30,allTeam:true,attendees:[],enabled:true}];
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const parent=page.locator('.feature-bar[data-feature=f1]'),task=page.locator('.task-bar[data-task=t1]');
  const before=(await snapshot()).workspace.projects[0].data,parentMix=(await parent.locator('.capacity-band').getAttribute('style'))!,taskMix=(await task.locator('.capacity-band').getAttribute('style'))!;
  expect(parentMix).not.toMatch(/transparent|NaN|Infinity/);expect(parentMix).toContain('100.00000%');expect(taskMix).toContain('#7870db 0.00000% 66.66667%');expect(taskMix).toContain('#e7c45f 66.66667% 100.00000%');
  await expect(parent).toHaveAttribute('title',/9 calendar days/);await expect(task).toHaveAttribute('title',/1d effort.*3 calendar days/);await expect(page.getByLabel('Timeline colors')).not.toContainText('Unused');
  for(const scale of ['week','month','quarter','year','day']){await page.getByLabel('Timeline scale').selectOption(scale);await expect(parent.locator('.capacity-band')).toHaveAttribute('style',parentMix);await expect(task.locator('.capacity-band')).toHaveAttribute('style',taskMix);}
  expect((await snapshot()).workspace.projects[0].data).toEqual(before);
  await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();await expect(page.getByLabel('Pure effort (days)',{exact:true})).toHaveValue('1');await expect(page.getByLabel('End date')).toHaveValue('2026-10-28');await expect(page.locator('.drawer-content')).toContainText('relative mix of accounted');await page.keyboard.press('Escape');
  await page.setViewportSize({width:375,height:812});await page.getByRole('button',{name:'Today',exact:true}).click();await page.screenshot({path:'test-results/filled-accounted-time-mix-mobile.png',fullPage:true});
  const outside=workspace();outside.projects[0].data.settings.autoShiftDependencies=false;outside.projects[0].data.features[0].manualEnd='2026-10-27';for(const t of outside.projects[0].data.tasks)t.start='2026-11-09';
  // Scale preferences autosave too; finish that write before replacing fixtures.
  await saved(page);await reset(outside);await page.reload();await saved(page);await expect(parent).toHaveClass(/no-time-mix/);await expect(parent.locator('.capacity-band')).toHaveCount(0);await expect(parent).toHaveAttribute('title',/No scheduled work inside this date window/);
  expect(await parent.evaluate(node=>getComputedStyle(node).backgroundImage)).toContain('repeating-linear-gradient');expect((await snapshot()).workspace.projects[0].data.tasks[0].start).toBe('2026-11-09');await page.close();
 });

 test('customizes bar information durably per project and keeps navigation and account details in the sidebar',async()=>{
  test.setTimeout(90000);
  const w=workspace(),data=w.projects[0].data;data.settings.autoShiftDependencies=false;
  Object.assign(data.tasks[0],{title:'API',effort:1.5,manualEnd:'2026-11-13'});
  w.projects.push({...structuredClone(w.projects[0]),id:'other',name:'Other project'});
  await reset(w);const page=await context.newPage();await page.goto('/app');await saved(page);
  const bar=page.locator('.task-bar[data-task=t1]'),field=(key:string)=>bar.locator(`[data-bar-field=${key}]`);
  await expect(field('title')).toHaveText('API');await expect(field('title')).toBeVisible();await expect(field('role')).toBeVisible();
  await expect(page.getByLabel('Iteration',{exact:true})).toHaveCount(0);await expect(page.locator('.dependency-mode')).toHaveCount(0);
  await expect(page.locator('.topbar [data-action=open-feature],.topbar [data-action=manage-meetings],.topbar [data-action=open-settings]')).toHaveCount(0);
  await expect(page.locator('.save-bar')).toHaveText('Saved to cloud');
  await openSettings(page);await saved(page);
  await expect(page.locator('.side-user .workspace-email')).toHaveText((await snapshot()).email);await expect(page.locator('.sidebar [data-action=manage-meetings]')).toHaveCount(1);
  const original=(await snapshot()).workspace.projects[0].data;
  for(const label of ['Name','Role'])await expect(page.getByRole('checkbox',{name:label,exact:true})).toBeChecked();
  for(const label of ['Dev effort','Calendar effort','Assignee full name'])await page.getByRole('checkbox',{name:label,exact:true}).check();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);
  for(const [key,value]of [['title','API'],['role','Backend Developer'],['devEffort','1.5d dev'],['calendarEffort','19d calendar'],['assignee','Alex Dev']]){await expect(field(key)).toHaveText(value);await expect(field(key)).toBeVisible();}
  await expect(page.locator('.side-user .workspace-email')).toBeInViewport();const stored=(await snapshot()).workspace.projects[0].data;expect(stored.tasks).toEqual(original.tasks);expect(stored.features).toEqual(original.features);
  expect(stored.settings.barFields).toEqual(['title','role','devEffort','calendarEffort','assignee']);
  await expect(page.locator('.feature-bar[data-feature=f1] [data-bar-field=title]')).toHaveText(data.features[0].title);
  await page.screenshot({path:'test-results/custom-bar-fields-desktop.png',fullPage:true});
  await page.getByLabel('Timeline scale').selectOption('week');await expect(field('title')).toBeVisible();await expect(field('assignee')).toBeHidden();
  await page.reload();await saved(page);await openSettings(page);for(const label of ['Name','Role','Dev effort','Calendar effort','Assignee full name'])await expect(page.getByRole('checkbox',{name:label,exact:true})).toBeChecked();
  await page.getByRole('checkbox',{name:'Name',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Dev effort',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Calendar effort',exact:true}).uncheck();await page.getByRole('checkbox',{name:'Assignee full name',exact:true}).uncheck();
  await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);await expect(field('title')).toHaveCount(0);await expect(field('role')).toBeVisible();
  await openSettings(page);await page.getByRole('checkbox',{name:'Role',exact:true}).uncheck();await page.getByRole('button',{name:'Save settings',exact:true}).click();await saved(page);await expect(page.locator('.bar-label [data-bar-field]')).toHaveCount(0);
  await page.reload();await saved(page);await expect(page.locator('.bar-label [data-bar-field]')).toHaveCount(0);await expect(bar).toHaveAttribute('title',/^API/);
  await page.locator('.project-trigger').click();await page.locator('.project-pick-row').filter({hasText:'Other project'}).getByRole('button',{name:'Open project',exact:false}).click();await saved(page);
  await expect(field('title')).toBeVisible();await openSettings(page);await expect(page.getByRole('checkbox',{name:'Name',exact:true})).toBeChecked();await expect(page.getByRole('checkbox',{name:'Dev effort',exact:true})).not.toBeChecked();
  await page.setViewportSize({width:375,height:812});expect(await page.getByRole('dialog').evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);await page.getByRole('button',{name:'Save settings',exact:true}).scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/custom-bar-fields-mobile.png',fullPage:true});await page.close();
 });

});
