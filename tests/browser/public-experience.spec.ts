import { test, expect, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
const cookieNotice = (page: Page) => page.getByRole('region', { name: 'Cookies and browser storage', exact: true });
const cookieDetails = (page: Page) => page.getByRole('dialog', { name: 'Cookies, kept simple', exact: true });

async function noHorizontalOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

test('landing explains the product, switches illustrative previews, and fits small screens in both themes', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Roadmaps that adapt to reality.', exact: true })).toBeVisible();
  await cookieNotice(page).getByRole('button', { name: 'Got it', exact: true }).click();
  const previewTabs = page.getByRole('tablist', { name: 'Product preview', exact: true });
  const roadmap = previewTabs.getByRole('tab', { name: 'Roadmap', exact: true });
  const poker = previewTabs.getByRole('tab', { name: 'Planning Poker', exact: true });
  await expect(roadmap).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Roadmap', exact: true })).toBeVisible();
  await roadmap.press('ArrowRight');
  await expect(poker).toBeFocused();
  await expect(poker).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Planning Poker', exact: true })).toBeVisible();
  await expect(page.getByRole('tabpanel', { name: 'Roadmap', exact: true })).toBeHidden();
  await poker.press('Home');
  await expect(roadmap).toBeFocused();
  await expect(roadmap).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tabpanel', { name: 'Roadmap', exact: true })).toBeVisible();
  for (const id of ['why-orbit', 'how-it-works', 'faq']) {
    const section = page.locator(`#${id}`);
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('heading').first()).toBeVisible();
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'test-results/public-landing-light-1440.png', fullPage: true });
  await page.getByRole('button', { name: 'Switch to dark theme', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.screenshot({ path: 'test-results/public-landing-dark-1440.png', fullPage: true });
  for (const width of [375, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await noHorizontalOverflow(page);
    await poker.click();
    await expect(page.getByRole('tabpanel', { name: 'Planning Poker', exact: true })).toBeVisible();
    await noHorizontalOverflow(page);
    await roadmap.click();
    await page.screenshot({ path: `test-results/public-landing-dark-${width}.png`, fullPage: true });
  }
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await page.screenshot({ path: 'test-results/public-landing-light-320.png', fullPage: true });
  await noHorizontalOverflow(page);
  await page.getByRole('link', { name: 'Get started', exact: true }).click();
  await expect(page).toHaveURL(/\/signup$/);
  expect(errors).toEqual([]);
});

test('essential cookie notice persists acknowledgment and lets visitors reopen details without tracking', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.setViewportSize({ width: 375, height: 900 });
  await page.goto('/');
  const notice = cookieNotice(page);
  await expect(notice.getByRole('heading', { name: 'Just the essentials.', exact: true })).toBeVisible();
  await noHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/public-cookie-notice-375.png', fullPage: false });
  const openDetails = notice.getByRole('button', { name: 'Cookie details', exact: true });
  await openDetails.click();
  await expect(cookieDetails(page)).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(cookieDetails(page)).toBeHidden();
  await expect(openDetails).toBeFocused();
  await notice.getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(notice).toBeHidden();
  await page.reload();
  await expect(notice).toBeHidden();
  await page.goto('/login');
  await expect(notice).toBeHidden();
  await page.goto('/cookies');
  await expect(page.getByRole('heading', { name: 'Cookies & browser storage', exact: true })).toBeVisible();
  const settings = page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings', exact: true });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  await expect(cookieDetails(page)).toBeVisible();
  await page.screenshot({ path: 'test-results/public-cookie-details-375.png', fullPage: false });
  await cookieDetails(page).getByRole('button', { name: 'Close cookie details', exact: true }).click();
  await expect(cookieDetails(page)).toBeHidden();
  await expect(settings).toBeFocused();
  expect((await context.cookies()).some(cookie => /analytics|_ga|_gid|marketing|facebook|fbp/i.test(cookie.name))).toBe(false);
  expect(errors).toEqual([]);
});

test('cookie notice stays dismissible when browser storage is unavailable', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new DOMException('Blocked by browser preference', 'SecurityError'); };
    Storage.prototype.setItem = () => { throw new DOMException('Blocked by browser preference', 'SecurityError'); };
  });
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto('/');
  await cookieNotice(page).getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(cookieNotice(page)).toBeHidden();
  await noHorizontalOverflow(page);
  const settings = page.getByRole('contentinfo').getByRole('button', { name: 'Cookie settings', exact: true });
  await settings.scrollIntoViewIfNeeded();
  await settings.click();
  await expect(cookieDetails(page)).toBeVisible();
  await cookieDetails(page).getByRole('button', { name: 'Got it', exact: true }).click();
  await expect(cookieDetails(page)).toBeHidden();
  await expect(cookieNotice(page)).toBeHidden();
  expect(errors).toEqual([]);
});

test('unknown routes return a real 404 with a useful route home', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  const response = await page.goto('/this-roadmap-page-does-not-exist');
  expect(response?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'This page is off the roadmap.', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Open roadmap', exact: true })).toHaveAttribute('href', '/app');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: 'test-results/public-not-found-320.png', fullPage: true });
  await page.getByRole('link', { name: 'Back to home', exact: true }).click();
  await expect(page).toHaveURL('/');
  await expect(page.getByRole('heading', { name: 'Roadmaps that adapt to reality.', exact: true })).toBeVisible();
});

test('workspace loading is announced until the real initial request completes', async ({ browser }) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  let releaseRequest!: () => void;
  const holdRequest = new Promise<void>(resolve => { releaseRequest = resolve; });
  let requestSeen!: () => void;
  const held = new Promise<void>(resolve => { requestSeen = resolve; });
  try {
    const fixtureAddress = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
    const password = 'Orbit9' + randomUUID();
    const signup = await context.request.post('/api/auth/signup', {
      headers: { Origin: origin, 'X-Forwarded-For': fixtureAddress },
      data: { email: `orbit-loading-${randomUUID()}@example.com`, password, confirm: password },
    });
    expect(signup.status(), await signup.text()).toBe(200);
    await page.route('**/api/workspace', async route => {
      if (route.request().method() === 'GET') {
        requestSeen();
        await holdRequest;
      }
      await route.continue();
    });
    await page.goto('/app');
    await held;
    const status = page.getByRole('status', { name: 'Loading your workspace', exact: true });
    await expect(status).toBeVisible();
    await expect(status).toHaveAttribute('aria-busy', 'true');
    await page.screenshot({ path: 'test-results/public-workspace-loading-1440.png', fullPage: true });
    releaseRequest();
    await expect(page.getByRole('heading', { name: "Let's create your first project.", exact: true })).toBeVisible();
    await expect(status).toBeHidden();
  } finally {
    releaseRequest();
    await page.unrouteAll({ behavior: 'wait' });
    await context.close();
  }
});
