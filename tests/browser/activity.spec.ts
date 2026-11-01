import {test, expect, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';
import {signupLegalFields} from './legal-fixtures';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
const notice = (page: Page) => page.getByRole('region', {name: 'Cookies and browser storage', exact: true});
type RetiredRequest = {action?: string; enabled?: boolean};
function activityRequests(page: Page) {
  const requests: RetiredRequest[] = [];
  page.on('request', request => {
    if (new URL(request.url()).pathname !== '/api/activity') return;
    try { requests.push(request.postDataJSON() || {action: 'unreadable-beacon'}); }
    catch { requests.push({action: 'unreadable-beacon'}); }
  });
  return requests;
}

test('landing uses essential storage without analytics choices or browser tracking requests', async ({browser}) => {
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.clock.install();
    const requests = activityRequests(page);
    await page.goto('/');
    await expect(notice(page).getByRole('button', {name: 'Enable analytics', exact: true})).toHaveCount(0);
    await notice(page).getByRole('button', {name: 'Cookie details', exact: true}).click();
    const details = page.getByRole('dialog', {name: 'Cookies, kept simple', exact: true});
    await expect(details.getByRole('checkbox')).toHaveCount(0);
    await expect(details).not.toContainText('Optional usage analytics');
    await details.getByRole('button', {name: 'Got it', exact: true}).click();
    await page.clock.runFor(61_000);
    expect(requests).toEqual([]);
    expect((await context.cookies()).filter(cookie => cookie.name.startsWith('orbit_analytics_'))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('orbit-analytics-preference'))).toBeNull();
    await page.reload(); await expect(notice(page)).toHaveCount(0);
    await page.clock.runFor(31_000);
    expect(requests).toEqual([]);
    await page.goto('/privacy');
    await expect(page.getByRole('heading', {name: 'Privacy Policy', exact: true})).toBeVisible();
    await page.clock.runFor(31_000);
    expect(requests).toEqual([]);
  } finally { await context.close(); }
});

test('legacy analytics preferences and identifiers are retired without collecting another session', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable server for retired activity requests.');
  const context = await browser.newContext(), page = await context.newPage();
  try {
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.setItem('orbit-cookie-notice', 'essential-v1');
      localStorage.setItem('orbit-analytics-preference', 'accepted-v1');
    });
    await context.addCookies([
      {name: 'orbit_analytics_consent', value: 'v1', url: origin, httpOnly: true, secure: true, sameSite: 'Strict'},
      {name: 'orbit_analytics_visitor', value: 'a'.repeat(64), url: origin, httpOnly: true, secure: true, sameSite: 'Strict'},
    ]);
    const requests = activityRequests(page);
    const cleanup = page.waitForResponse(response => new URL(response.url()).pathname === '/api/activity' && response.request().postDataJSON()?.action === 'consent');
    await page.reload(); expect((await cleanup).status()).toBe(200);
    await expect.poll(() => page.evaluate(() => localStorage.getItem('orbit-analytics-preference'))).toBeNull();
    expect((await context.cookies()).filter(cookie => cookie.name.startsWith('orbit_analytics_'))).toEqual([]);
    expect(requests).toEqual([{action: 'consent', enabled: false}]);
    await page.reload();
    expect(requests).toEqual([{action: 'consent', enabled: false}]);
    await expect(page.getByRole('button', {name: 'Enable analytics', exact: true})).toHaveCount(0);
  } finally { await context.close(); }
});

test('old tabs cannot re-enable analytics or submit landing and planner sessions', async ({request}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable server for retired activity requests.');
  for (const body of [
    {action: 'consent', enabled: true},
    ...['landing', 'planner'].map(surface => ({action: 'event', surface, sessionId: randomUUID(), sequence: 0, seconds: 60, end: false})),
  ]) {
    const response = await request.post('/api/activity', {headers: {Origin: origin}, data: body});
    expect(response.status()).toBe(410);
    expect(response.headers()['cache-control']).toContain('no-store');
    const cookies = response.headersArray().filter(header => header.name.toLowerCase() === 'set-cookie').map(header => header.value).join('\n');
    expect(cookies).toContain('orbit_analytics_consent=');
    expect(cookies).toContain('orbit_analytics_visitor=');
  }
});

test('signed-in planner usage and navigation never send optional activity or visitor identifiers', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  const context = await browser.newContext(), page = await context.newPage();
  try {
    const password = 'OrbitActivity9' + randomUUID(), email = `orbit-activity-${randomUUID()}@example.com`;
    const address = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
    const signup = await context.request.post('/api/auth/signup', {
      headers: {Origin: origin, 'X-Forwarded-For': address},
      data: {...signupLegalFields, firstName: 'Activity', lastName: 'Fixture', email, password, confirm: password},
    });
    expect(signup.status(), await signup.text()).toBe(200);
    const initial = await (await context.request.get('/api/workspace')).json(), workspace = fullWorkspace();
    workspace.preferences = {...workspace.preferences, sidebarHidden: false};
    const saved = await context.request.put('/api/workspace', {headers: {Origin: origin}, data: {revision: initial.revision, workspace}});
    expect(saved.status(), await saved.text()).toBe(200);
    await page.clock.install();
    const requests = activityRequests(page);
    await page.goto('/app'); await expect(page.locator('.gantt-canvas')).toBeVisible();
    await notice(page).getByRole('button', {name: 'Got it', exact: true}).click();
    await page.clock.runFor(61_000);
    await page.locator('.workspace-help').click();
    await expect(page.getByRole('heading', {name: 'How Orbit works', exact: true})).toBeVisible();
    await page.locator('.workspace-profile').click();
    await expect(page.getByLabel('Email address', {exact: true})).toHaveValue(email);
    await page.clock.runFor(31_000);
    expect(requests).toEqual([]);
    expect((await context.cookies()).filter(cookie => cookie.name.startsWith('orbit_analytics_'))).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem('orbit-analytics-preference'))).toBeNull();
  } finally { await context.close(); }
});
