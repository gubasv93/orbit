import { test, expect, type Locator, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fullWorkspace } from '../fixtures';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
type Theme = 'light' | 'dark';

async function theme(page:Page, value:Theme) {
  await expect(page.locator('html')).toHaveAttribute('data-theme',value);
}
async function noOverflow(page:Page) {
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true);
}
function luminance(color:number[]) {
  const channels=color.slice(0,3).map(value=>value/255);
  return channels.map(value=>value<=.04045?value/12.92:((value+.055)/1.055)**2.4)
    .reduce((sum,value,index)=>sum+value*[.2126,.7152,.0722][index],0);
}
async function readableSurface(locator:Locator, value:Theme) {
  await expect(locator).toBeVisible();
  const colors=await locator.evaluate(element=>{
    const style=getComputedStyle(element);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=1;
    const context=canvas.getContext('2d');if(!context)throw new Error('Cannot inspect rendered colors.');
    const channels=(color:string)=>{context.clearRect(0,0,1,1);context.fillStyle=color;context.fillRect(0,0,1,1);return Array.from(context.getImageData(0,0,1,1).data);};
    return {background:channels(style.backgroundColor),foreground:channels(style.color)};
  });
  const background=luminance(colors.background),foreground=luminance(colors.foreground);
  if(value==='dark')expect(background).toBeLessThan(.15);
  else expect(background).toBeGreaterThan(.5);
  expect((Math.max(background,foreground)+.05)/(Math.min(background,foreground)+.05)).toBeGreaterThanOrEqual(4.5);
}
async function switchTheme(page:Page,value:Theme) {
  const button=page.getByRole('button',{name:`Switch to ${value} theme`,exact:true});
  await button.focus();await page.keyboard.press('Enter');await theme(page,value);
  await expect(page.getByRole('button',{name:`Switch to ${value==='dark'?'light':'dark'} theme`,exact:true}))
    .toHaveAttribute('aria-pressed',String(value==='dark'));
}

async function workspaceTheme(page:Page,value:Theme,projectId:string) {
  // Keep the roadmap/Poker tab open while using its General settings in another
  // tab. This also verifies cross-tab theme sync without ending a live room.
  const settings=await page.context().newPage();
  try {
    await settings.goto('/app?'+new URLSearchParams({project:projectId,panel:'settings'}));
    await expect(settings.getByRole('heading',{name:'General settings',exact:true})).toBeVisible();
    const button=settings.getByRole('button',{name:value==='dark'?'Dark theme':'Light theme',exact:true});
    await button.focus();await settings.keyboard.press('Enter');
    await expect(button).toHaveAttribute('aria-pressed','true');
    await theme(settings,value);await theme(page,value);
  } finally {await settings.close();}
}

test('appearance defaults to light and an explicit keyboard choice persists through public navigation and reload',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.emulateMedia({colorScheme:'dark'});await page.setViewportSize({width:1440,height:900});
  await page.goto('/');await theme(page,'light');
  expect(await page.evaluate(()=>localStorage.getItem('orbit-appearance'))).toBeNull();
  await page.screenshot({path:'test-results/appearance-entry-light-1440.png',fullPage:true});
  await switchTheme(page,'dark');
  expect(await page.evaluate(()=>localStorage.getItem('orbit-appearance'))).toBe('dark');
  await page.reload();await theme(page,'dark');
  await page.goto('/login');await theme(page,'dark');
  await readableSurface(page.locator('.auth-card'),'dark');
  await readableSurface(page.getByLabel('Email address',{exact:true}),'dark');
  for(const width of [1440,375,320]) {
    await page.setViewportSize({width,height:900});await noOverflow(page);
    await expect(page.getByRole('button',{name:'Switch to light theme',exact:true})).toBeInViewport();
    await page.screenshot({path:`test-results/appearance-login-dark-${width}.png`,fullPage:true});
  }
  await switchTheme(page,'light');await readableSurface(page.locator('.auth-card'),'light');
  await page.goto('/signup');await theme(page,'light');await noOverflow(page);
  expect(await page.evaluate(()=>localStorage.getItem('orbit-appearance'))).toBe('light');
  const sibling=await page.context().newPage();
  try {await sibling.goto('/login');await theme(sibling,'light');await switchTheme(sibling,'dark');await theme(page,'dark');}
  finally {await sibling.close();}
  await switchTheme(page,'light');
  expect(errors).toEqual([]);
});

test('the same appearance works across real roadmap details and a Poker room without editing the workspace',async({browser})=>{
  test.skip(process.env.ORBIT_E2E_AUTH!=='1','Requires the disposable real-auth backend.');
  test.setTimeout(90000);
  const context=await browser.newContext({viewport:{width:1440,height:900}}),page=await context.newPage();
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  try {
    // Documentation-only fixture addresses keep this independent test from consuming
    // the other browser suites' shared localhost signup allowance.
    const fixtureAddress='2001:db8:'+randomUUID().replaceAll('-','').match(/.{1,4}/g)!.slice(0,6).join(':');
    const password='Orbit9'+randomUUID();
    const signup=await context.request.post('/api/auth/signup',{
      headers:{Origin:origin,'X-Forwarded-For':fixtureAddress},
      data:{firstName:'Test',lastName:'User',email:`orbit-appearance-${randomUUID()}@example.com`,password,confirm:password},
    });
    expect(signup.status(),await signup.text()).toBe(200);
    const initial=await (await context.request.get('/api/workspace')).json();
    const seeded=await context.request.put('/api/workspace',{
      headers:{Origin:origin},data:{revision:initial.revision,workspace:fullWorkspace()},
    });
    expect(seeded.status(),await seeded.text()).toBe(200);
    const before=await (await context.request.get('/api/workspace')).json();
    await page.goto('/app');await expect(page.locator('.gantt-canvas')).toBeVisible();
    await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
    await theme(page,'light');await readableSurface(page.locator('.gantt-corner'),'light');
    await page.screenshot({path:'test-results/appearance-roadmap-light-1440.png',fullPage:true});
    await workspaceTheme(page,'dark',before.workspace.activeId);
    await readableSurface(page.locator('.gantt-corner'),'dark');
    await page.locator('.work-name[data-action=drawer-task][data-id=t1]').click();
    await readableSurface(page.locator('.drawer'),'dark');
    await page.getByRole('region',{name:'Cookies and browser storage',exact:true}).getByRole('button',{name:'Cookie details',exact:true}).click();
    await expect(page.getByRole('dialog',{name:'Cookies, kept simple',exact:true})).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog',{name:'Cookies, kept simple',exact:true})).toBeHidden();
    await expect(page.locator('.drawer')).toBeVisible();
    await page.getByRole('region',{name:'Cookies and browser storage',exact:true}).getByRole('button',{name:'Got it',exact:true}).click();
    await expect(page.getByLabel('Pure effort (days)',{exact:true})).toHaveValue('3');
    await readableSurface(page.getByLabel('Pure effort (days)',{exact:true}),'dark');
    await page.screenshot({path:'test-results/appearance-drawer-dark-1440.png',fullPage:true});
    await page.keyboard.press('Escape');
    for(const width of [1280,375,320]) {
      await page.setViewportSize({width,height:900});await noOverflow(page);
      await expect(page.locator('.save-bar .appearance-toggle')).toHaveCount(0);
      await page.screenshot({path:`test-results/appearance-roadmap-dark-${width}.png`,fullPage:true});
    }
    await page.setViewportSize({width:1280,height:900});
    const created=await context.request.post('/api/poker',{
      headers:{Origin:origin},data:{action:'create',projectId:before.workspace.activeId,name:'Appearance review',deck:['1','2','3','5','8','?'],settings:{autoReveal:false,showAverage:true,countdown:false}},
    });
    expect(created.status(),await created.text()).toBe(200);const {token}=await created.json();
    await page.goto(`/poker/${token}?issue=t1`);await theme(page,'dark');
    await expect(page.locator('.poker-table')).toBeVisible();
    await readableSurface(page.locator('.poker-issues'),'dark');
    await readableSurface(page.getByLabel('Search epics or stories',{exact:true}),'dark');
    await page.getByRole('button',{name:'Vote 3',exact:true}).click();
    await page.getByRole('button',{name:'Reveal cards',exact:true}).click();
    await expect(page.getByRole('button',{name:'Finalize Estimate',exact:true})).toBeVisible();
    await page.screenshot({path:'test-results/appearance-poker-dark-1280.png',fullPage:true});
    await page.getByRole('button',{name:'Edit story estimate',exact:true}).click();
    await readableSurface(page.getByRole('dialog',{name:'Edit Story',exact:true}),'dark');
    await expect(page.getByLabel('Story title',{exact:true})).toHaveValue('API');
    await readableSurface(page.getByLabel('Story title',{exact:true}),'dark');
    await expect(page.getByLabel('Backend Developer estimate (days)',{exact:true})).toHaveValue('3');
    await readableSurface(page.getByLabel('Backend Developer estimate (days)',{exact:true}),'dark');
    await page.screenshot({path:'test-results/appearance-poker-editor-dark-1280.png',fullPage:true});
    await page.getByRole('button',{name:'Close story form',exact:true}).click();
    await workspaceTheme(page,'light',before.workspace.activeId);
    await readableSurface(page.locator('.poker-issues'),'light');
    await readableSurface(page.getByLabel('Search epics or stories',{exact:true}),'light');
    for(const width of [1280,375,320]) {
      await page.setViewportSize({width,height:900});
      const hideNavigation=page.getByRole('button',{name:'Hide project navigation',exact:true});
      if(width<900&&await hideNavigation.isVisible())await hideNavigation.click();
      const hideFeatures=page.getByRole('complementary',{name:'Features / Epics',exact:true}).getByRole('button',{name:'Hide features list',exact:true});
      if(width<651&&await hideFeatures.isVisible())await hideFeatures.click();
      await noOverflow(page);await expect(page.getByRole('button',{name:'Edit story estimate',exact:true})).toBeInViewport();
      await page.screenshot({path:`test-results/appearance-poker-light-${width}.png`,fullPage:true});
    }
    await page.reload();await theme(page,'light');await expect(page.locator('.poker-table')).toBeVisible();
    await page.goto('/app');await theme(page,'light');await expect(page.locator('.gantt-canvas')).toBeVisible();
    expect((await (await context.request.get('/api/workspace')).json()).workspace).toEqual(before.workspace);
    expect(errors).toEqual([]);
  } finally {await context.close();}
});
