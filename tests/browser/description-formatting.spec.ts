import {test,expect,type BrowserContext,type Locator,type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {signupLegalFields} from './legal-fixtures';
import {projectData} from '../fixtures';
import type {ProjectData,Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
const origin=process.env.E2E_BASE_URL||'http://localhost:3000',projectId='description-project';
async function account(context:BrowserContext){
  await context.addInitScript(()=>{try{localStorage.setItem('orbit-cookie-notice','essential-v1');}catch{}});
  const password='Orbit9'+randomUUID(),address='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
  const response=await context.request.post('/api/auth/signup',{headers:{Origin:origin,'X-Forwarded-For':address},data:{...signupLegalFields,firstName:'Description',lastName:'Owner',email:`orbit-description-${randomUUID()}@example.com`,password,confirm:password}});
  expect(response.status(),await response.text()).toBe(200);
}
async function snapshot(context:BrowserContext):Promise<{workspace:Workspace;revision:number}>{
  const response=await context.request.get('/api/workspace');expect(response.status(),await response.text()).toBe(200);return response.json();
}
const currentData=async(context:BrowserContext)=>(await snapshot(context)).workspace.projects[0].data;
function fixture(){
  const data=projectData();data.settings.autoShiftDependencies=false;
  Object.assign(data.features[0],{start:'2026-11-16',baseline:'2026-12-31'});data.tasks[0].start='2026-11-16';data.tasks[0].roleId='r1';
  Object.assign(data.iterations[0],{start:'2026-11-16',end:'2026-12-31'});return data;
}
async function seed(context:BrowserContext,data=fixture()){
  const workspace:Workspace={version:1,activeId:projectId,preferences:{scale:'day',sidebarHidden:false},projects:[{id:projectId,name:'Description formatting checks',onboardingStep:0,data}]};
  const before=await snapshot(context),response=await context.request.put('/api/workspace',{headers:{Origin:origin},data:{revision:before.revision,workspace}});
  expect(response.status(),await response.text()).toBe(200);
}
async function saved(page:Page){await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function open(page:Page){await page.clock.install({time:new Date('2026-11-17T12:00:00Z')});await page.goto('/app');await expect(page.locator('.gantt-canvas')).toBeVisible();await saved(page);}
function description(scope:Page|Locator,label='Description'){
  return scope.getByLabel(label,{exact:true}).locator('xpath=ancestor::*[@data-description-field][1]');
}
const source=(field:Locator)=>field.locator('[data-description-input]');
const rendered=(field:Locator)=>field.locator('[data-description-preview]');
async function edit(field:Locator){if(!await source(field).isVisible())await field.getByRole('button',{name:'Edit',exact:true}).click();await expect(source(field)).toBeVisible();}
async function preview(field:Locator){if(!await rendered(field).isVisible())await field.getByRole('button',{name:'Preview',exact:true}).click();await expect(rendered(field)).toBeVisible();}
async function select(field:Locator,text:string){
  await edit(field);const value=await source(field).inputValue(),start=value.indexOf(text);expect(start,`Selection text is present: ${text}`).toBeGreaterThanOrEqual(0);
  await source(field).evaluate((element,range)=>{const input=element as HTMLTextAreaElement;input.focus();input.setSelectionRange(range.start,range.end);},{start,end:start+text.length});
}
async function command(field:Locator,text:string,name:string){await select(field,text);await field.getByRole('button',{name,exact:true}).click();}
async function link(field:Locator,text:string,label:string,url:string){
  await select(field,text);await field.getByRole('button',{name:'Insert link',exact:true}).click();const panel=field.locator('[data-description-link-panel]');
  await expect(panel).toBeVisible();await panel.getByLabel('Link text',{exact:true}).fill(label);await panel.getByLabel('Link URL',{exact:true}).fill(url);await panel.getByRole('button',{name:'Add link',exact:true}).click();await expect(panel).toBeHidden();
}
async function featureDrawer(page:Page,id:string){await page.locator(`.work-name[data-action=drawer-feature][data-id="${id}"]`).click();}
async function taskDrawer(page:Page,id='t1'){await page.locator(`.work-name[data-action=drawer-task][data-id="${id}"]`).click();}
async function safeLink(link:Locator,url:string){await expect(link).toHaveAttribute('href',url);await expect(link).toHaveAttribute('target','_blank');await expect(link).toHaveAttribute('rel',/noopener/);await expect(link).toHaveAttribute('rel',/noreferrer/);}

test('formats a work-item description with the toolbar and preserves its preview, cloud data and workspace export',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);await seed(context);await open(page);await page.locator('.gantt-corner').getByRole('button',{name:'Add work item',exact:true}).click();
    await page.getByLabel('Work item name',{exact:true}).fill('Formatted work item');await page.getByLabel('Earliest start',{exact:true}).fill('2026-11-16');await page.getByLabel('Baseline target date',{exact:true}).fill('2026-12-31');
    let field=description(page.getByRole('dialog')),text=source(field);await text.fill('Delivery goals\nShip safely\nReview the rule\nFirst item\nSecond item\nSee documentation');
    await command(field,'Delivery goals','Heading');await command(field,'Ship safely','Bold');await command(field,'Review the rule','Italic');await command(field,'First item\nSecond item','Bulleted list');
    const guide=origin+'/how-it-works?from=description';await link(field,'documentation','Product guide',guide);const stored=await text.inputValue();
    await preview(field);await expect(rendered(field).locator('h2')).toHaveText('Delivery goals');await expect(rendered(field).locator('strong')).toHaveText('Ship safely');await expect(rendered(field).locator('em')).toHaveText('Review the rule');await expect(rendered(field).locator('ul li')).toHaveText(['First item','Second item']);await safeLink(rendered(field).getByRole('link',{name:'Product guide',exact:true}),guide);
    const opened=context.waitForEvent('page');await rendered(field).getByRole('link',{name:'Product guide',exact:true}).click();const guidePage=await opened;await expect(guidePage).toHaveURL(guide);await guidePage.close();await expect(page.getByRole('dialog')).toBeVisible();await expect(text).toHaveValue(stored);
    await page.getByRole('button',{name:'Create work item',exact:true}).click();await saved(page);const created=(await currentData(context)).features.find(item=>item.title==='Formatted work item')!;expect(created.description).toBe(stored);
    await featureDrawer(page,created.id);field=description(page.locator('.drawer'));await expect(rendered(field)).toBeVisible();await expect(source(field)).toHaveValue(stored);await expect(rendered(field).locator('strong')).toHaveText('Ship safely');await safeLink(rendered(field).getByRole('link',{name:'Product guide',exact:true}),guide);
    await page.keyboard.press('Escape');const show=page.getByRole('button',{name:'Show sidebar',exact:true});if(await show.isVisible())await show.click();await page.getByRole('button',{name:'General settings',exact:true}).click();
    const download=page.waitForEvent('download');await page.getByRole('button',{name:'Export workspace',exact:true}).click();const file=await download,path=await file.path();expect(path).toBeTruthy();const exported=JSON.parse(await readFile(path!,'utf8')) as {workspace:Workspace};expect(exported.workspace.projects[0].data.features.find(item=>item.id===created.id)?.description).toBe(stored);
    await page.keyboard.press('Escape');await page.reload();await saved(page);await featureDrawer(page,created.id);field=description(page.locator('.drawer'));await expect(source(field)).toHaveValue(stored);await expect(rendered(field).locator('h2')).toHaveText('Delivery goals');await expect(rendered(field).locator('ul li')).toHaveText(['First item','Second item']);
    await page.screenshot({path:test.info().outputPath('formatted-work-item-desktop.png'),fullPage:true});expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('keeps legacy descriptions literal and safe, makes URLs clickable, and copies formatted descriptions to additional roles',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture(),legacy='Legacy notes\nhttps://example.com/docs\n<strong>literal HTML</strong>\n<img src=x onerror="window.orbitDescriptionInjected=true">\n[Unsafe](javascript:alert(1))';data.tasks[0].description=legacy;data.roles.push({id:'front',name:'Frontend Developer',platform:'Frontend'});await seed(context,data);await open(page);await taskDrawer(page);
    let field=description(page.locator('.drawer'));await expect(rendered(field)).toBeVisible();await expect(rendered(field)).toContainText('<strong>literal HTML</strong>');await expect(rendered(field).locator('strong,img,script,iframe')).toHaveCount(0);await safeLink(rendered(field).locator('a[href="https://example.com/docs"]'),'https://example.com/docs');await expect(rendered(field).locator('a[href^="javascript:"],a[href^="data:"]')).toHaveCount(0);
    expect(await page.evaluate(()=>Boolean((window as unknown as {orbitDescriptionInjected?:boolean}).orbitDescriptionInjected))).toBe(false);expect((await currentData(context)).tasks[0].description).toBe(legacy);
    await select(field,'Legacy notes');await source(field).press('Control+b');const bolded=await source(field).inputValue();await expect.poll(async()=>(await currentData(context)).tasks[0].description).toBe(bolded);await expect(source(field)).toBeFocused();await edit(field);await source(field).press('Control+End');await source(field).press('Enter');await source(field).pressSequentially('Quoted context');await source(field).press('Enter');await source(field).pressSequentially('const rule = true;');await command(field,'Quoted context','Quote');await command(field,'const rule = true;','Inline code');const formatted=await source(field).inputValue();
    await preview(field);await saved(page);await expect(rendered(field).locator('strong')).toHaveText('Legacy notes');await expect(rendered(field).locator('blockquote')).toContainText('Quoted context');await expect(rendered(field).locator('code')).toHaveText('const rule = true;');await expect.poll(async()=>(await currentData(context)).tasks[0].description).toBe(formatted);
    await page.getByRole('button',{name:'+ Add roles',exact:true}).click();const dialog=page.getByRole('dialog');field=description(dialog);await expect(rendered(field)).toBeVisible();await expect(source(field)).toHaveAttribute('readonly','');await expect(source(field)).toHaveValue(formatted);await expect(field.getByRole('button',{name:'Edit',exact:true})).toHaveCount(0);
    await page.getByRole('checkbox',{name:'Include Frontend Developer',exact:true}).check();await page.getByRole('button',{name:'Add roles',exact:true}).click();await saved(page);
    const tasks=(await currentData(context)).tasks;expect(tasks).toHaveLength(2);expect(tasks.every(item=>item.description===formatted)).toBe(true);const added=tasks.find(item=>item.roleId==='front')!;
    await page.reload();await saved(page);await taskDrawer(page,added.id);field=description(page.locator('.drawer'));await expect(source(field)).toHaveValue(formatted);await expect(rendered(field).locator('strong')).toHaveText('Legacy notes');await safeLink(rendered(field).locator('a[href="https://example.com/docs"]'),'https://example.com/docs');await expect(rendered(field).locator('img,script')).toHaveCount(0);expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('keeps Poker description editing stable through live refreshes and publishes formatted sub-items back to the planner',async({browser})=>{
  test.setTimeout(120000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);await seed(context);const created=await context.request.post('/api/poker',{headers:{Origin:origin},data:{action:'create',projectId,name:'Description formatting',deck:['1','2','3','?'],settings:{autoReveal:false,showAverage:true,countdown:false}}});expect(created.status(),await created.text()).toBe(200);const {token}=await created.json() as {token:string};
    await page.goto('/poker/'+token);await expect(page.locator('.poker-table')).toBeVisible();await page.getByRole('button',{name:'+ Add sub-item',exact:true}).click();let dialog=page.getByRole('dialog',{name:'Add sub-item',exact:true});await dialog.getByLabel('Sub-item name',{exact:true}).fill('Poker formatted story');
    let field=description(dialog);await source(field).fill('Poker notes\nCheck rules\nConfirm the result\nRead the spec');await command(field,'Poker notes','Bold');await command(field,'Check rules\nConfirm the result','Numbered list');await link(field,'the spec','Specification',origin+'/how-it-works');
    await select(field,'Poker notes');const selection=await source(field).evaluate(element=>{const input=element as HTMLTextAreaElement;(window as unknown as {descriptionNode?:HTMLTextAreaElement}).descriptionNode=input;return {start:input.selectionStart,end:input.selectionEnd,value:input.value};});
    await page.waitForResponse(response=>response.request().method()==='GET'&&new URL(response.url()).pathname==='/api/poker/'+token&&response.status()===200,{timeout:15000});await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    expect(await source(field).evaluate(element=>{const input=element as HTMLTextAreaElement;return {same:input===(window as unknown as {descriptionNode?:HTMLTextAreaElement}).descriptionNode,start:input.selectionStart,end:input.selectionEnd,value:input.value,focused:document.activeElement===input};})).toEqual({same:true,...selection,focused:true});
    await source(field).press('Control+End');await source(field).press('Enter');await source(field).pressSequentially('After room refresh');await command(field,'After room refresh','Italic');const first=await source(field).inputValue();await preview(field);await expect(rendered(field).locator('strong')).toHaveText('Poker notes');await expect(rendered(field).locator('ol li')).toHaveText(['Check rules','Confirm the result']);await expect(rendered(field).locator('em')).toHaveText('After room refresh');await safeLink(rendered(field).getByRole('link',{name:'Specification',exact:true}),origin+'/how-it-works');
    await dialog.getByRole('button',{name:'Save sub-item',exact:true}).click();await expect(page.getByText('Sub-item saved to Orbit',{exact:true})).toBeVisible();let task=(await currentData(context)).tasks.find(item=>item.title==='Poker formatted story')!;expect(task.description).toBe(first);const id=task.id;
    await page.getByLabel('Search work items or sub-items',{exact:true}).fill('Poker formatted story');await page.getByRole('button',{name:'Select sub-item Poker formatted story',exact:true}).click();await page.getByRole('button',{name:'Edit sub-item estimate',exact:true}).click();dialog=page.getByRole('dialog',{name:'Edit sub-item',exact:true});field=description(dialog);await expect(source(field)).toHaveValue(first);await source(field).press('Control+End');await source(field).press('Enter');await source(field).pressSequentially('Updated in Poker');await command(field,'Updated in Poker','Italic');const updated=await source(field).inputValue();await dialog.getByRole('button',{name:'Save sub-item',exact:true}).click();await expect.poll(async()=>(await currentData(context)).tasks.find(item=>item.id===id)?.description).toBe(updated);
    await page.goto('/app');await saved(page);await taskDrawer(page,id);field=description(page.locator('.drawer'));await expect(rendered(field)).toBeVisible();await expect(source(field)).toHaveValue(updated);await expect(rendered(field).locator('em')).toHaveText(['After room refresh','Updated in Poker']);await safeLink(rendered(field).getByRole('link',{name:'Specification',exact:true}),origin+'/how-it-works');expect((await currentData(context)).tasks.filter(item=>item.title==='Poker formatted story')).toHaveLength(1);expect(errors).toEqual([]);
  }finally{await context.close();}
});

test('keeps formatting controls usable on small screens, rejects unsafe links and preserves drafts and the length limit',async({browser})=>{
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:1000},timezoneId:'UTC'}),page=await context.newPage();const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try{
    await account(context);const data=fixture();data.people=[];data.roles=[];data.tasks=[];await seed(context,data);await open(page);await page.locator('.gantt-corner').getByRole('button',{name:'Add work item',exact:true}).click();await page.getByLabel('Work item name',{exact:true}).fill('Mobile formatted work');let dialog=page.getByRole('dialog'),field=description(dialog);
    const maximum='x'.repeat(10000);await source(field).fill(maximum);await select(field,'xxxxx');await field.getByRole('button',{name:'Bold',exact:true}).click();await expect(field.getByRole('alert')).toBeVisible();expect(await source(field).inputValue()).toBe(maximum);
    await source(field).fill('Draft stays here');await select(field,'Draft');await source(field).press('Control+b');await select(field,'stays here');await source(field).press('Meta+i');const draft=await source(field).inputValue();
    for(const width of [375,320]){
      await page.setViewportSize({width,height:900});await expect(source(field)).toHaveValue(draft);expect(await dialog.evaluate(node=>node.scrollWidth<=node.clientWidth)).toBe(true);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      for(const name of ['Bold','Italic','Heading','Bulleted list','Numbered list','Quote','Inline code','Insert link']){const control=field.getByRole('button',{name,exact:true}),bounds=await control.boundingBox();expect(bounds).not.toBeNull();expect(bounds!.x).toBeGreaterThanOrEqual(0);expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(width);}
      await page.screenshot({path:test.info().outputPath(`description-editor-${width}.png`),fullPage:true});
    }
    await field.getByRole('button',{name:'Bold',exact:true}).focus();await page.keyboard.press('ArrowRight');await expect(field.getByRole('button',{name:'Italic',exact:true})).toBeFocused();
    await select(field,'Draft');await field.getByRole('button',{name:'Insert link',exact:true}).click();const panel=field.locator('[data-description-link-panel]');await panel.getByLabel('Link URL',{exact:true}).fill('javascript:alert(1)');await panel.getByRole('button',{name:'Add link',exact:true}).click();await expect(field.getByRole('alert')).toBeVisible();expect(await source(field).inputValue()).toBe(draft);await expect(dialog).toBeVisible();await page.keyboard.press('Escape');await expect(panel).toBeHidden();await expect(dialog).toBeVisible();await expect(source(field)).toHaveValue(draft);
    await preview(field);await expect(rendered(field).locator('strong')).toHaveText('Draft');await dialog.getByRole('button',{name:'Add team member',exact:true}).click();await expect(page.getByRole('button',{name:'Return to item',exact:true})).toBeVisible();await page.getByRole('button',{name:'Return to item',exact:true}).click();dialog=page.getByRole('dialog');field=description(dialog);await expect(source(field)).toHaveValue(draft);await page.getByRole('button',{name:'Create work item',exact:true}).click();await saved(page);
    const created=(await currentData(context)).features.find(item=>item.title==='Mobile formatted work')!;expect(created.description).toBe(draft);await featureDrawer(page,created.id);field=description(page.locator('.drawer'));await expect(rendered(field).locator('strong')).toHaveText('Draft');expect(errors).toEqual([]);
  }finally{await context.close();}
});
