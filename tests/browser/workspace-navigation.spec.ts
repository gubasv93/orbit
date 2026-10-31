import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');

async function prepare(context: BrowserContext) {
  const password = 'Orbit9' + randomUUID(), email = `orbit-navigation-${randomUUID()}@example.com`;
  const fixtureAddress = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
  const signup = await context.request.post('/api/auth/signup', {
    headers: {Origin: origin, 'X-Forwarded-For': fixtureAddress},
    data: {firstName: 'Ada', lastName: 'Lovelace', email, password, confirm: password},
  });
  expect(signup.status(), await signup.text()).toBe(200);
  const initial = await (await context.request.get('/api/workspace')).json();
  const workspace = fullWorkspace();
  workspace.preferences = {...workspace.preferences, sidebarHidden: false};
  const saved = await context.request.put('/api/workspace', {
    headers: {Origin: origin}, data: {workspace, revision: initial.revision},
  });
  expect(saved.status(), await saved.text()).toBe(200);
  return {workspace, email};
}

async function ready(page: Page) {
  await expect(page.locator('.gantt-canvas')).toBeVisible();
  await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
}

async function acknowledgeCookies(page: Page) {
  await page.getByRole('region', {name: 'Cookies and browser storage', exact: true}).getByRole('button', {name: 'Got it', exact: true}).click();
}

async function addFeature(page: Page, title: string) {
  await page.getByRole('button', {name: 'Add feature', exact: true}).click();
  await page.getByLabel('Feature name', {exact: true}).fill(title);
  await page.getByRole('button', {name: 'Create feature', exact: true}).click();
}

test('guide, profile and poker stay in the signed-in workspace and navigation saves edits before leaving', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  let releaseSave!: () => void;
  const blocked = new Promise<void>(resolve => {releaseSave = resolve;});
  let sawSave!: () => void;
  const saving = new Promise<void>(resolve => {sawSave = resolve;});
  const logouts: string[] = [], errors: string[] = [];
  page.on('request', request => {if (new URL(request.url()).pathname === '/api/auth/logout') logouts.push(request.url());});
  page.on('pageerror', error => errors.push(error.message));
  try {
    const {workspace, email} = await prepare(context);
    await page.goto('/app'); await ready(page); await acknowledgeCookies(page);
    const marker = randomUUID();
    await page.evaluate(value => {(window as unknown as {orbitNavigationMarker: string}).orbitNavigationMarker = value;}, marker);
    await page.route('**/api/workspace', async route => {
      if (route.request().method() === 'PUT') {sawSave(); await blocked;}
      await route.continue();
    });
    await addFeature(page, 'Saved before opening the guide');
    await page.locator('.workspace-help').click();
    await saving;
    await expect(page).toHaveURL(/\/app$/);
    releaseSave();
    await expect(page).toHaveURL(/\/how-it-works\?project=project-shared-id$/);
    await expect(page.getByRole('heading', {name: 'How Orbit works', exact: true})).toBeVisible();
    await expect(page.locator('.workspace-frame .workspace-sidebar')).toBeVisible();
    await expect(page.locator('.workspace-sidebar .project-trigger')).toContainText(workspace.projects[0].name);
    await expect(page.getByRole('link', {name: /Back to (website|site)/i})).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as {orbitNavigationMarker: string}).orbitNavigationMarker)).toBe(marker);
    let stored = await (await context.request.get('/api/workspace')).json();
    expect(stored.email).toBe(email);
    expect(stored.workspace.projects[0].data.features.some((feature: {title: string}) => feature.title === 'Saved before opening the guide')).toBe(true);

    await page.locator('.workspace-profile').click();
    await expect(page).toHaveURL(/\/profile\?project=project-shared-id$/);
    await expect(page.getByLabel('Email address', {exact: true})).toHaveValue(email);
    await expect(page.locator('.workspace-frame .workspace-sidebar')).toBeVisible();
    await page.locator('.workspace-main-nav').getByRole('link', {name: 'Planning Poker', exact: true}).click();
    await expect(page).toHaveURL(/\/poker\/new\?project=project-shared-id$/);
    await page.getByLabel('Room name', {exact: true}).fill('Navigation regression');
    await page.getByRole('button', {name: 'Create Poker Room', exact: true}).click();
    await expect(page.locator('.poker-table')).toBeVisible();
    await expect(page.locator('.workspace-sidebar .project-trigger')).toContainText(workspace.projects[0].name);
    await page.locator('.workspace-help').click();
    await expect(page.getByRole('heading', {name: 'How Orbit works', exact: true})).toBeVisible();
    await page.locator('.workspace-main-nav').getByRole('link', {name: 'Roadmap', exact: true}).click();
    await ready(page);
    expect(new URL(page.url()).pathname).toBe('/app');
    expect(await page.evaluate(() => (window as unknown as {orbitNavigationMarker: string}).orbitNavigationMarker)).toBe(marker);
    stored = await (await context.request.get('/api/workspace')).json();
    expect(stored.email).toBe(email);
    expect(logouts).toEqual([]);
    expect(errors).toEqual([]);

    // A direct visit, without a project query, should use this account's
    // current project rather than showing a disconnected room-creation page.
    await page.goto('/poker/new');
    await expect(page.getByLabel('Room name', {exact: true})).toBeVisible();
    await expect(page.locator('.workspace-sidebar .project-trigger')).toContainText(workspace.projects[0].name);
  } finally {
    releaseSave();
    await page.unrouteAll({behavior: 'wait'});
    await context.close();
  }
});

test('pending, saving, failed and retried saves never move the planner layout', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  let releaseSave!: () => void;
  const blocked = new Promise<void>(resolve => {releaseSave = resolve;});
  let sawSave!: () => void;
  const saving = new Promise<void>(resolve => {sawSave = resolve;});
  try {
    await prepare(context); await page.goto('/app'); await ready(page); await acknowledgeCookies(page);
    const original = await page.locator('.planner-root').boundingBox();
    expect(original).not.toBeNull();
    await page.evaluate(() => {
      const samples = new Map<string, number>();
      const sample = () => {
        const state = document.querySelector('.save-bar [role=status]')?.textContent || '';
        const planner = document.querySelector('.planner-root');
        if (planner) samples.set(state, planner.getBoundingClientRect().top);
      };
      const observer = new MutationObserver(sample);
      observer.observe(document.querySelector('.workspace-shell')!, {childList: true, subtree: true, characterData: true});
      sample();
      (window as unknown as {orbitSavePositions: Map<string, number>}).orbitSavePositions = samples;
    });
    await page.route('**/api/workspace', async route => {
      if (route.request().method() !== 'PUT') {await route.continue(); return;}
      sawSave(); await blocked;
      await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Navigation test save outage'})});
    });
    await addFeature(page, 'Keep the timeline still');
    await saving;
    await expect(page.locator('.save-bar [role=status]')).toHaveText('Saving…');
    await expect(page.locator('.save-bar')).toHaveCSS('height', '0px');
    expect((await page.locator('.planner-root').boundingBox())!.y).toBe(original!.y);
    releaseSave();
    await expect(page.locator('.workspace-save-notice')).toBeVisible();
    await expect(page.locator('.workspace-save-notice')).toHaveCSS('position', 'fixed');
    await expect(page.locator('.save-error')).toHaveText('Navigation test save outage');
    expect((await page.locator('.planner-root').boundingBox())!.y).toBe(original!.y);
    await page.unroute('**/api/workspace');
    await page.getByRole('button', {name: 'Retry saving', exact: true}).click();
    await ready(page);
    await expect(page.locator('.workspace-save-notice')).toHaveCount(0);
    const positions = await page.evaluate(() => [...(window as unknown as {orbitSavePositions: Map<string, number>}).orbitSavePositions]);
    expect(positions.map(([state]) => state)).toEqual(expect.arrayContaining(['Saved to cloud', 'Unsaved changes', 'Saving…', 'Not saved']));
    for (const [, top] of positions) expect(top).toBe(original!.y);
    const stored = await (await context.request.get('/api/workspace')).json();
    expect(stored.workspace.projects[0].data.features.some((feature: {title: string}) => feature.title === 'Keep the timeline still')).toBe(true);
  } finally {
    releaseSave();
    await page.unrouteAll({behavior: 'wait'});
    await context.close();
  }
});

test('the signed-in guide and profile fit small screens and keep workspace navigation available', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 375, height: 900}}), page = await context.newPage();
  try {
    const {email} = await prepare(context);
    for (const width of [375, 320]) {
      await page.setViewportSize({width, height: 900});
      await page.goto('/how-it-works?project=project-shared-id');
      await expect(page.getByRole('heading', {name: 'How Orbit works', exact: true})).toBeVisible();
      if (width === 375) await acknowledgeCookies(page);
      await expect(page.locator('.workspace-sidebar')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path: `test-results/workspace-guide-${width}.png`});
      await page.getByRole('button', {name: 'Show project navigation', exact: true}).click();
      await expect(page.locator('.workspace-sidebar')).toBeVisible();
      await page.locator('.workspace-profile').click();
      await expect(page.getByLabel('Email address', {exact: true})).toHaveValue(email);
      await expect(page.locator('.workspace-sidebar')).toBeHidden();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await page.screenshot({path: `test-results/workspace-profile-${width}.png`});
      await page.getByRole('button', {name: 'Show project navigation', exact: true}).click();
      await expect(page.locator('.workspace-sidebar')).toBeVisible();
      await page.getByRole('button', {name: 'Hide project navigation', exact: true}).click();
      await expect(page.locator('.workspace-sidebar')).toBeHidden();
      await expect(page.getByLabel('Email address', {exact: true})).toBeVisible();
    }
  } finally {await context.close();}
});
