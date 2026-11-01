import {acceptSignupTerms, signupLegalFields} from './legal-fixtures';
import { test, expect } from '@playwright/test';

test('Google sign-in is available on both auth screens and failures leave email login usable', async ({ page }) => {
  const requests: { method: string; body: string | null }[] = [];
  await page.route('**/api/auth/google', async route => {
    requests.push({ method: route.request().method(), body: route.request().postData() });
    await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'Google sign-in is being set up. Please use email and password for now.' }) });
  });
  for (const path of ['/signup', '/login']) {
    await page.goto(path);
    // Service agreement applies to Google signup too; the password form stays optional.
    if (path === '/signup') {
      await expect(page.getByRole('checkbox', {name: /Terms of Use/})).not.toBeChecked();
      await page.getByRole('button', {name: 'Continue with Google'}).click();
      expect(requests).toEqual([]);
      await expect(page.locator('.auth-card').getByRole('alert')).toContainText('Terms of Use');
      await acceptSignupTerms(page);
    } else await expect(page.getByRole('checkbox', {name: /Terms of Use/})).toHaveCount(0);
    await page.getByRole('button', { name: 'Continue with Google' }).click();
    await expect(page.locator('.auth-card').getByRole('alert')).toContainText('Please use email and password');
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeEnabled();
    await expect(page.getByRole('button', { name: path === '/signup' ? 'Create account' : 'Log in', exact: true })).toBeEnabled();
    await expect(page.getByLabel('Email address')).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
  expect(requests).toEqual([{method: 'POST', body: JSON.stringify({mode: 'signup', ...signupLegalFields})}, {method: 'POST', body: null}]);
});

test('cancelled, missing, and failed Google callbacks return to a usable login screen', async ({ page }) => {
  await page.goto('/auth/callback?error=access_denied&error_description=private-provider-detail&next=https://attacker.example');
  await expect(page).toHaveURL(/\/login\?oauth=cancelled$/);
  await expect(page.getByRole('status')).toContainText('Google sign-in was cancelled');
  await expect(page.getByText('private-provider-detail')).toHaveCount(0);
  await page.getByRole('button', { name: 'Continue with Google' }).focus();
  await page.goto('/auth/callback?error=server_error');
  await expect(page.getByRole('status')).toContainText('Google sign-in could not be completed');
  await page.goto('/auth/callback');
  await expect(page).toHaveURL(/\/login\?auth=failed$/);
  await expect(page.getByRole('status')).toContainText('Please start signing in again');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
});

test('Google entry persists a real server PKCE cookie before navigating to Supabase', async ({ page, context }) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend, with its local Google provider placeholder.');
  let authorization: URL | undefined;
  await page.route('**/auth/v1/authorize?**', async route => {
    authorization = new URL(route.request().url());
    // Stop at the real authorization URL. This test makes no Google requests
    // and does not claim to verify Google consent or Google-issued identities.
    await route.fulfill({ contentType: 'text/html', body: '<title>Authorization navigation captured</title>' });
  });
  await page.goto('/login');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page).toHaveTitle('Authorization navigation captured');
  expect(authorization?.pathname).toBe('/auth/v1/authorize');
  expect(authorization?.searchParams.get('provider')).toBe('google');
  expect(authorization?.searchParams.get('redirect_to')).toBe(`${new URL(process.env.E2E_BASE_URL || 'http://localhost:3000').origin}/auth/callback`);
  expect(authorization?.searchParams.get('code_challenge_method')).toBe('s256');
  expect(authorization?.searchParams.get('code_challenge')?.length).toBeGreaterThanOrEqual(43);
  expect(authorization?.searchParams.has('skip_http_redirect')).toBe(false);
  const proofKeys = (await context.cookies()).filter(cookie => cookie.name.includes('code-verifier'));
  expect(proofKeys.length).toBeGreaterThan(0);
  for (const cookie of proofKeys) expect(cookie).toMatchObject({ httpOnly: true, secure: true, sameSite: 'Lax', path: '/' });
});


test('Google signup carries explicit service agreement in an essential server receipt', async ({page, context}) => {
  test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable server with local Google authorization placeholder.');
  await page.route('**/auth/v1/authorize?**', async route => {
    await route.fulfill({contentType: 'text/html', body: '<title>Signup authorization captured</title>'});
  });
  await page.goto('/signup');
  await acceptSignupTerms(page);
  await page.getByRole('button', {name: 'Continue with Google', exact: true}).click();
  await expect(page).toHaveTitle('Signup authorization captured');
  const receipt = (await context.cookies()).find(cookie => cookie.name === 'orbit_legal_receipt');
  expect(receipt).toMatchObject({httpOnly: true, secure: true, sameSite: 'Lax', path: '/auth/callback'});
  expect(receipt!.expires - Date.now()/1000).toBeGreaterThan(1700);
  expect(receipt!.expires - Date.now()/1000).toBeLessThanOrEqual(1800);
  // The receipt stays server-only and is consumed even on a cancelled callback.
  await page.goto('/auth/callback?error=access_denied');
  await expect(page).toHaveURL(/\/login\?oauth=cancelled$/);
  expect((await context.cookies()).some(cookie => cookie.name === 'orbit_legal_receipt')).toBe(false);
  expect(await page.evaluate(() => JSON.stringify({local: {...localStorage}, session: {...sessionStorage}}))).not.toContain(receipt!.value);
});
