import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';
import {setRoadmapFilter} from './filters';
import {feedbackFormUrl} from '../../src/lib/feedback';
import {workspaceNavItems} from '../../src/lib/workspace-navigation';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
async function signedIn(context: BrowserContext) {
  const password = 'Orbit9' + randomUUID(), email = `orbit-workspace-${randomUUID()}@example.com`;
  const fixtureAddress = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
  const response = await context.request.post('/api/auth/signup', {
    headers: {Origin: origin, 'X-Forwarded-For': fixtureAddress},
    data: {firstName: 'Ada', lastName: 'Lovelace', email, password, confirm: password},
  });
  expect(response.status(), await response.text()).toBe(200);
  return {email, password};
}
async function seed(context: BrowserContext, workspace = fullWorkspace()) {
  const initial = await (await context.request.get('/api/workspace')).json();
  const response = await context.request.put('/api/workspace', {headers: {Origin: origin}, data: {revision: initial.revision, workspace}});
  expect(response.status(), await response.text()).toBe(200);
  return workspace;
}
async function ready(page: Page) {
  await expect(page.locator('.gantt-canvas')).toBeVisible();
  await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
}
async function showSidebar(page: Page) {
  const trigger = page.getByRole('button', {name: 'Show sidebar', exact: true});
  if (await trigger.isVisible()) await trigger.click();
  await expect(page.locator('.workspace-sidebar')).toBeVisible();
}
async function feedbackAboveProfile(page: Page) {
  const footer = page.locator('.workspace-sidebar-footer');
  const feedback = footer.getByRole('link', {name: 'Share feedback', exact: true});
  const profile = footer.locator('.workspace-profile');
  await expect(feedback).toHaveAttribute('href', feedbackFormUrl);
  await expect(profile).toHaveAttribute('href', '/profile');
  const a = (await feedback.boundingBox())!, b = (await profile.boundingBox())!;
  expect(a.y + a.height).toBeLessThanOrEqual(b.y);
  await expect(page.getByRole('link', {name: 'Share feedback', exact: true})).toHaveCount(1);
}

test('the landing footer links to feedback and How it works opens the structured guide', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('header').getByRole('link', {name: 'Share feedback', exact: true})).toHaveCount(0);
  await expect(page.locator('footer').getByRole('link', {name: 'Share feedback', exact: true})).toHaveAttribute('href', feedbackFormUrl);
  await page.getByRole('navigation', {name: 'Explore Orbit'}).getByRole('link', {name: 'How it works', exact: true}).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole('heading', {name: 'How Orbit works', exact: true})).toBeVisible();
  await expect(page.getByRole('navigation', {name: 'On this page'}).getByRole('link')).toHaveCount(6);
  await expect(page.locator('#selection')).toContainText('Command');
  await expect(page.locator('#selection')).toContainText('Ctrl');
  await expect(page.locator('#timeline-colors .orbit-guide-legend > div')).toHaveCount(6);
  for (const width of [1440, 375, 320]) {
    await page.setViewportSize({width, height: 900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});

test('signup collects names and Profile saves the name and changes the password with current-password verification', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  test.setTimeout(90000);
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto('/signup');
    await expect(page.getByLabel('First name', {exact: true})).toHaveAttribute('required', '');
    await expect(page.getByLabel('Last name', {exact: true})).toHaveAttribute('autocomplete', 'family-name');
    const account = await signedIn(context);
    await page.goto('/app');
    // The account footer is also available before creating a first project.
    await page.getByRole('link', {name: 'Profile', exact: true}).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByLabel('First name', {exact: true})).toHaveValue('Ada');
    await expect(page.getByLabel('Last name', {exact: true})).toHaveValue('Lovelace');
    await expect(page.getByLabel('Email address', {exact: true})).toHaveValue(account.email);
    await expect(page.getByLabel('Email address', {exact: true})).toHaveAttribute('readonly', '');
    await page.getByLabel('First name', {exact: true}).fill('Grace');
    await page.getByLabel('Last name', {exact: true}).fill('Hopper');
    await page.getByRole('button', {name: 'Save name', exact: true}).click();
    await expect(page.getByRole('status')).toHaveText('Name updated.');
    await page.reload();
    await expect(page.getByLabel('First name', {exact: true})).toHaveValue('Grace');
    const changed = 'Orbit8' + randomUUID();
    await page.getByLabel('Current password', {exact: true}).fill('Wrong9password');
    await page.getByLabel('New password', {exact: true}).fill(changed);
    await page.getByLabel('Confirm new password', {exact: true}).fill(changed);
    await page.getByRole('button', {name: 'Change password', exact: true}).click();
    await expect(page.locator('.profile-main').getByRole('alert')).toHaveText('Current password is incorrect.');
    await page.getByLabel('Current password', {exact: true}).fill(account.password);
    await page.getByRole('button', {name: 'Change password', exact: true}).click();
    await expect(page.getByRole('status')).toHaveText('Password updated.');
    await context.request.post('/api/auth/logout', {headers: {Origin: origin}});
    const old = await context.request.post('/api/auth/login', {headers: {Origin: origin}, data: {email: account.email, password: account.password}});
    expect(old.status()).toBe(401);
    const current = await context.request.post('/api/auth/login', {headers: {Origin: origin}, data: {email: account.email, password: changed}});
    expect(current.status(), await current.text()).toBe(200);
    expect((await (await context.request.get('/api/profile')).json()).profile.displayName).toBe('Grace Hopper');
    for (const width of [375, 320]) {
      await page.setViewportSize({width, height: 900});await page.reload();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  } finally {await context.close();}
});

test('General settings groups appearance and dependency controls and both workspaces share navigation and profile placement', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    await signedIn(context);const workspace = await seed(context);
    await page.goto('/app');await ready(page);await showSidebar(page);await feedbackAboveProfile(page);
    await expect(page.locator('.workspace-profile')).toContainText('Ada Lovelace');
    await expect(page.locator('.save-bar')).toHaveCSS('height', '0px');
    await expect(page.locator('.save-bar .appearance-toggle')).toHaveCount(0);
    const labels = await page.locator('.workspace-main-nav .nav-item').allTextContents();
    const plannerWidth = (await page.locator('.workspace-sidebar').boundingBox())!.width;
    await page.getByRole('button', {name: 'General settings', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await expect(dialog.getByRole('heading', {name: 'General settings', exact: true})).toBeVisible();
    await expect(dialog).not.toContainText('Scheduling behavior');
    await expect(dialog.locator('.dependency-advanced')).not.toHaveAttribute('open', '');
    await expect(dialog.getByRole('checkbox', {name: 'Auto-shift dependent work items', exact: true})).toBeVisible();
    await dialog.getByRole('button', {name: 'Dark theme', exact: true}).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await dialog.getByText('Advanced options', {exact: true}).click();
    await expect(dialog.getByLabel('Gap unit', {exact: true})).toBeVisible();
    for (const width of [375, 320]) {
      await page.setViewportSize({width, height: 900});
      expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
      await page.screenshot({path: `test-results/workspace-general-settings-${width}.png`, fullPage: true});
    }
    await page.keyboard.press('Escape');await page.setViewportSize({width: 1440, height: 1000});
    const created = await context.request.post('/api/poker', {headers: {Origin: origin}, data: {action: 'create', projectId: workspace.activeId, name: 'Workspace navigation', deck: ['1','2','3','?'], settings: {autoReveal: false, showAverage: true, countdown: false}}});
    expect(created.status(), await created.text()).toBe(200);const {token} = await created.json();
    await page.goto('/poker/' + token);await expect(page.locator('.poker-table')).toBeVisible();
    await feedbackAboveProfile(page);
    expect((await page.locator('.workspace-sidebar').boundingBox())!.width).toBe(plannerWidth);
    expect(await page.locator('.workspace-main-nav .nav-item').allTextContents()).toEqual(workspaceNavItems.map(item => item.label));
    expect(labels.map(label => label.trim().replace(/\d+$/, ''))).toEqual(workspaceNavItems.map(item => item.label));
    await expect(page.locator('.poker-player').filter({hasText: 'Ada Lovelace (you)'})).toBeVisible();
    await expect(page.locator('.workspace-sidebar .appearance-toggle')).toHaveCount(0);
    await expect(page.getByText('Recent rooms', {exact: true})).toHaveCount(0);
    await page.locator('.workspace-sidebar').getByRole('link', {name: 'General settings', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'General settings', exact: true})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  } finally {await context.close();}
});

test('roles combine with people filters and holiday names and Today stay inside the calendar layer', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    await signedIn(context);const workspace = fullWorkspace(), data = workspace.projects[0].data;
    workspace.preferences = {...workspace.preferences, scale: 'day'};data.tasks[0].roleId = 'r1';data.tasks[2].roleId = 'rfront';
    const today = new Date().toISOString().slice(0,10);data.settings.observeHolidays = true;data.holidays.push({date: today, name: 'Orbit team holiday'});
    await seed(context, workspace);await page.goto('/app');await ready(page);
    await setRoadmapFilter(page, 'roles', ['Frontend Developer']);
    await expect(page.locator('[data-row-task=t1]')).toHaveCount(0);await expect(page.locator('[data-row-task=t3]')).toBeVisible();
    await setRoadmapFilter(page, 'roles', ['Backend Developer', 'Frontend Developer']);
    await expect(page.locator('[data-row-task=t1]')).toBeVisible();await expect(page.locator('[data-row-task=t3]')).toBeVisible();
    await setRoadmapFilter(page, 'people', ['Alex Dev']);
    await expect(page.locator('[data-row-task=t1]')).toBeVisible();await expect(page.locator('[data-row-task=t3]')).toHaveCount(0);
    await page.getByRole('button', {name: 'Clear filters', exact: true}).click();
    await page.getByRole('button', {name: 'Today', exact: true}).click();
    const holiday = page.locator(`.day-cell[data-date="${today}"]`);
    await expect(holiday).toHaveAttribute('title', /Orbit team holiday/);
    await holiday.hover();
    const tag = page.locator('.today-tag'), scroller = page.locator('#ganttScroller');
    const tagBounds = (await tag.boundingBox())!, corner = (await page.locator('.gantt-corner').boundingBox())!;
    // Place the label over the sticky feature column, then inspect the painted
    // element at that point. A high-z-index Today label previously covered it.
    await scroller.evaluate((element, amount) => {element.scrollLeft += amount;}, tagBounds.x + tagBounds.width/2 - (corner.x + corner.width - 30));
    await expect.poll(async () => page.evaluate(() => {
      const label = document.querySelector('.today-tag')!, corner = document.querySelector('.gantt-corner')!;
      const labelRect = label.getBoundingClientRect(), cornerRect = corner.getBoundingClientRect();
      const x = Math.min(cornerRect.right - 10, Math.max(cornerRect.left + 10, labelRect.left + labelRect.width/2));
      const y = labelRect.top + labelRect.height/2;
      return !!document.elementFromPoint(x, y)?.closest('.gantt-corner');
    })).toBe(true);
    await page.getByRole('button', {name: 'Today', exact: true}).click();await expect(tag).toBeInViewport();
  } finally {await context.close();}
});
