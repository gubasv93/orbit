import { test, expect } from '@playwright/test';
test('landing and auth are responsive, accessible, and contain no mock recovery', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/'); await expect(page.getByRole('heading', { name: 'Roadmaps that adapt to reality.' })).toBeVisible();
  await page.getByRole('link', { name: 'Get started' }).click(); await expect(page).toHaveURL(/\/signup$/);
  await page.getByLabel('Email address').fill('person@example.com');
  await page.getByLabel('Password', { exact: true }).fill('onlyletters'); await page.getByLabel('Confirm password').fill('different');
  await page.getByRole('button', { name: 'Create account' }).click(); await expect(page.getByRole('alert')).toContainText(['Include a number', 'Passwords do not match']);
  await page.goto('/login'); await expect(page.getByText('Forgot password')).toHaveCount(0);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole('heading', { name: 'Welcome back' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.goto('/'); expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});
test('private routes and cross-origin mutations fail closed', async ({ page, request }) => {
  await page.goto('/app'); await expect(page).toHaveURL(/\/login/);
  const read = await request.get('/api/workspace'); expect(read.status()).toBe(401);
  const mutation = await request.put('/api/workspace', { headers: { Origin: 'https://attacker.example' }, data: { workspace: {} } }); expect(mutation.status()).toBe(403);
  const login = await request.post('/api/auth/login', { headers: { Origin: 'https://attacker.example' }, data: { email: 'a@example.com', password: 'pw123456' } }); expect(login.status()).toBe(403);
});

test('auth form never sends passwords in URLs when JavaScript is unavailable', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false });
  const page = await context.newPage(); await page.goto('/login');
  await expect(page.locator('form')).toHaveAttribute('method', 'post');
  await page.getByLabel('Email address').fill('test@example.com'); await page.getByLabel('Password', { exact: true }).fill('LocalTest123');
  await page.getByRole('button', { name: 'Log in', exact: true }).click();
  expect(new URL(page.url()).search).toBe(''); await context.close();
});
