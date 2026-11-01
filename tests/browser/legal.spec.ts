import {test, expect} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {acceptSignupTerms, signupLegalFields} from './legal-fixtures';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
const uniqueAddress = () => '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');

test('signup agreement is unchecked, links readable documents without losing the form, and covers no analytics consent', async ({page}) => {
  const submitted: Record<string, unknown>[] = [];
  await page.route('**/api/auth/signup', async route => {
    submitted.push(route.request().postDataJSON());
    await route.fulfill({status: 503, contentType: 'application/json', body: JSON.stringify({error: 'Fixture signup unavailable.'})});
  });
  await page.goto('/signup');
  await page.getByRole('region', {name: 'Cookies and browser storage', exact: true}).getByRole('button', {name: 'Got it', exact: true}).click();
  const agreement = page.getByRole('checkbox', {name: /Terms of Use/});
  await expect(agreement).not.toBeChecked(); await expect(agreement).toHaveAttribute('required', '');
  await expect(page.getByRole('checkbox')).toHaveCount(1);
  await page.getByLabel('First name', {exact: true}).fill('Grace');
  await page.getByLabel('Last name', {exact: true}).fill('Hopper');
  await page.getByLabel('Email address', {exact: true}).fill('preserve-form@example.com');
  await page.getByLabel('Password', {exact: true}).fill('OrbitLegal2026');
  await page.getByLabel('Confirm password', {exact: true}).fill('OrbitLegal2026');
  await page.getByRole('button', {name: 'Create account', exact: true}).click();
  expect(submitted).toEqual([]);
  for (const [name, path] of [['Terms of Use', '/terms'], ['Privacy Policy', '/privacy']]) {
    const link = page.locator('.legal-agreement').getByRole('link', {name, exact: true});
    await expect(link).toHaveAttribute('href', path);
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const opened = page.context().waitForEvent('page'); await link.click(); const policyPage = await opened;
    await expect(policyPage.getByRole('heading', {name, exact: true, level: 1})).toBeVisible();
    for (const width of [375, 320]) {
      await policyPage.setViewportSize({width, height: 900});
      expect(await policyPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await policyPage.close();
  }
  await expect(page.getByLabel('First name', {exact: true})).toHaveValue('Grace');
  await expect(page.getByLabel('Email address', {exact: true})).toHaveValue('preserve-form@example.com');
  await expect(page.getByLabel('Password', {exact: true})).toHaveValue('OrbitLegal2026');
  await expect(agreement).not.toBeChecked();
  await acceptSignupTerms(page);
  await page.getByRole('button', {name: 'Create account', exact: true}).click();
  await expect(page.locator('.auth-card').getByRole('alert')).toContainText('Fixture signup unavailable.');
  expect(submitted).toHaveLength(1); expect(submitted[0]).toMatchObject(signupLegalFields);
  expect(submitted[0]).not.toHaveProperty('analytics');
  for (const width of [375, 320]) {
    await page.setViewportSize({width, height: 900});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect(agreement).toBeVisible();
  }
});

test('registration API rejects missing or stale service agreements before creating an account', async ({request}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
  const password = 'OrbitLegal9' + randomUUID();
  const base = {firstName: 'Legal', lastName: 'Fixture', email: `orbit-legal-${randomUUID()}@example.com`, password, confirm: password};
  for (const agreement of [{}, {...signupLegalFields, acceptTerms: false}, {...signupLegalFields, termsVersion: '2020-01-01'}, {...signupLegalFields, privacyVersion: '2020-01-01'}]) {
    const rejected = await request.post('/api/auth/signup', {headers: {Origin: origin, 'X-Forwarded-For': uniqueAddress()}, data: {...base, ...agreement}});
    expect(rejected.status()).toBe(400);
  }
  const created = await request.post('/api/auth/signup', {headers: {Origin: origin, 'X-Forwarded-For': uniqueAddress()}, data: {...base, ...signupLegalFields}});
  expect(created.status()).toBe(200);
  expect((await created.json()).confirmationRequired).toBe(false);
  const workspace = await request.get('/api/workspace'); expect(workspace.status()).toBe(200);
  expect((await workspace.json()).workspace.projects).toEqual([]);
});

test('a new account created outside signup must accept current documents before workspace access', async ({browser}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1' || !/^http:\/\/localhost:3000\/?$/.test(origin), 'Uses only the disposable localhost GoTrue fixture; never an external project.');
  const context = await browser.newContext({viewport: {width: 375, height: 900}}), page = await context.newPage();
  try {
    const email = `orbit-legal-direct-${randomUUID()}@example.com`, password = 'OrbitLegal9' + randomUUID();
    // The local auth container has no API gateway key requirement. This real
    // Auth identity deliberately has no application agreement record.
    const direct = await context.request.post('http://localhost:54321/auth/v1/signup', {
      data: {email, password, data: {first_name: 'Direct', last_name: 'Fixture'}},
    });
    expect(direct.status()).toBe(200);
    const signedIn = await context.request.post('/api/auth/login', {headers: {Origin: origin, 'X-Forwarded-For': uniqueAddress()}, data: {email, password}});
    expect(signedIn.status()).toBe(200);
    const blocked = await context.request.get('/api/workspace');
    expect(blocked.status()).toBe(403);
    expect((await blocked.json()).code).toBe('legal_acceptance_required');
    await page.goto('/app'); await expect(page).toHaveURL(/\/accept-terms$/);
    await expect(page.getByRole('heading', {name: 'Before you start planning', exact: true})).toBeVisible();
    await expect(page.getByText(email, {exact: true})).toBeVisible();
    const checkbox = page.getByRole('checkbox', {name: /Terms of Use/}); await expect(checkbox).not.toBeChecked();
    const forged = await context.request.post('/api/legal', {headers: {Origin: origin}, data: {...signupLegalFields, userId: randomUUID(), acceptedAt: '2000-01-01T00:00:00Z'}});
    expect(forged.status()).toBe(400);
    expect((await context.request.get('/api/workspace')).status()).toBe(403);
    await page.getByRole('region', {name: 'Cookies and browser storage', exact: true}).getByRole('button', {name: 'Got it', exact: true}).click();
    await acceptSignupTerms(page);
    await page.getByRole('button', {name: 'Accept and continue', exact: true}).click();
    await expect(page).toHaveURL(/\/app$/);
    expect((await context.request.get('/api/workspace')).status()).toBe(200);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
