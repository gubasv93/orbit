import { test, expect, type BrowserContext, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fullWorkspace } from '../fixtures';

test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real authentication backend.');
const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
let context: BrowserContext;
function workspace() {
  const value = fullWorkspace(), data = value.projects[0].data;
  data.roles.push({ id: 'rQA', name: 'QA Engineer', platform: 'QA' }, { id: 'rOps', name: 'DevOps Engineer', platform: 'DevOps' });
  for (const [id, name, platform, roleId] of [['uFront', 'Frank UI', 'Frontend', 'rfront'], ['uQA', 'Quinn QA', 'QA', 'rQA']]) {
    data.people.push({ ...data.people[0], id, name, firstName: name.split(' ')[0], lastName: name.split(' ')[1], platform, roleId, role: data.roles.find(role => role.id === roleId)!.name });
  }
  return value;
}
async function snapshot() { return (await context.request.get('/api/workspace')).json(); }
async function replace() {
  const current = await snapshot();
  expect((await context.request.put('/api/workspace', { headers: { Origin: origin }, data: { revision: current.revision, workspace: workspace() } })).status()).toBe(200);
}
async function saved(page: Page) { await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud'); }
function roleName(platform:string){return ({Backend:'Backend Developer',Frontend:'Frontend Developer',QA:'QA Engineer',DevOps:'DevOps Engineer'} as Record<string,string>)[platform]||platform;}
async function selectTeam(page: Page, platform: string, effort: string, assignee = '') {
  const role=roleName(platform);
  await page.getByRole('checkbox', { name: `Include ${role}`, exact: true }).check();
  await page.getByLabel(`${role} estimate (days)`).fill(effort);
  await page.getByLabel(`${roleName(platform)} assignee`, { exact: true }).selectOption(assignee);
}
test.describe.serial('user stories estimated by team', () => {
  test.beforeAll(async ({ browser }) => {
    context = await browser.newContext(); const page = await context.newPage(), password = 'Orbit9' + randomUUID();
    await page.goto('/signup'); await page.getByLabel('Email address').fill(`orbit-stories-${randomUUID()}@example.com`);
    await page.getByLabel('Password', { exact: true }).fill(password); await page.getByLabel('Confirm password').fill(password);
    await page.getByRole('button', { name: 'Create account' }).click(); await expect(page).toHaveURL(/\/app$/);
    await page.close();
  });
  test.afterAll(async () => { await context?.close(); });

  test('creates an epic and its first story as three estimated, assigned, independent Gantt rows', async () => {
    await replace(); const page = await context.newPage(); await page.goto('/app');
    await page.locator('.gantt-corner').getByRole('button', { name: 'Add feature' }).click();
    await page.getByLabel('Feature name').fill('Disable Rules');
    await page.getByLabel('First user story (optional)').fill('Add a specific rule');
    await page.getByLabel('Earliest start', { exact: true }).fill('2026-11-02');
    await page.getByLabel('Baseline target date').fill('2026-12-01');
    await expect(page.getByRole('checkbox', { name: 'Link selected teams', exact: false })).not.toBeChecked();
    await selectTeam(page, 'Backend', '3', 'u1'); await selectTeam(page, 'Frontend', '2', 'uFront'); await selectTeam(page, 'QA', '2', 'uQA');
    expect(await page.getByLabel('Backend Developer assignee', { exact: true }).locator('option').evaluateAll(options => options.map(option => (option as HTMLOptionElement).value))).toEqual(['', 'u1']);
    await expect(page.locator('[data-story-summary]')).toHaveText('3 work items · 7d total effort');
    await page.setViewportSize({ width: 375, height: 812 });
    const dialog = page.getByRole('dialog');
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
    for (const platform of ['Backend', 'Frontend', 'QA']) {
      const field = page.getByLabel(`${roleName(platform)} assignee`, { exact: true }), box = (await field.boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x + box.width).toBeLessThanOrEqual(375);
    }
    await page.getByLabel('QA Engineer estimate (days)').scrollIntoViewIfNeeded();
    await expect(page.getByRole('button', { name: 'Create feature', exact: true })).toBeInViewport();
    await page.screenshot({ path: 'test-results/story-teams-mobile.png', fullPage: true });
    await page.getByRole('button', { name: 'Create feature', exact: true }).click(); await saved(page);
    const first = await snapshot(), feature = first.workspace.projects[0].data.features.find((item: { title: string }) => item.title === 'Disable Rules');
    const tasks = first.workspace.projects[0].data.tasks.filter((item: { featureId: string }) => item.featureId === feature.id);
    expect(tasks.map((item: { title: string; platform: string; assignee: string; effort: number; dependsOn: string[] }) => [item.title, item.platform, item.assignee, item.effort, item.dependsOn])).toEqual([
      ['Add a specific rule', 'Backend', 'u1', 3, []], ['Add a specific rule', 'Frontend', 'uFront', 2, []], ['Add a specific rule', 'QA', 'uQA', 2, []],
    ]);
    expect(tasks.every((item: { start: string }) => item.start === '2026-11-02')).toBe(true);
    await expect(page.locator(`[data-feature-effort="${feature.id}"]`)).toHaveText('7d effort');
    await page.setViewportSize({ width: 1280, height: 900 });
    await expect(page.locator('.gantt-row:not(.feature)').filter({ hasText: 'Add a specific rule' })).toHaveCount(3);
    for (const task of tasks) await expect(page.locator(`.task-bar[data-task="${task.id}"]`)).toBeVisible();
    await page.screenshot({ path: 'test-results/story-team-gantt.png', fullPage: true });
    await page.reload(); await saved(page); expect((await snapshot()).workspace).toEqual(first.workspace);
    await page.close();
  });

  test('adds a story to an existing collapsed epic, preserves selected estimates, and permits manual dependencies', async () => {
    await replace(); const page = await context.newPage(); await page.goto('/app');
    await page.locator('[data-action=collapse][data-id=f1]').click(); await saved(page);
    await page.getByLabel('Filter by platform').selectOption('Frontend');
    await page.getByRole('button', { name: 'Add user story to Accounts', exact: true }).click();
    await page.getByLabel('User story name').fill('Add a specific rule');
    await page.getByLabel('Earliest start', { exact: true }).fill('2026-11-02');
    const add = page.getByRole('button', { name: 'Add user story', exact: true }); await expect(add).toBeDisabled();
    await selectTeam(page, 'Backend', '3', 'u1'); await selectTeam(page, 'Frontend', '2', 'uFront'); await selectTeam(page, 'QA', '2', 'uQA');
    await page.getByLabel('QA Engineer estimate (days)').fill('0'); await expect(add).toBeDisabled();
    await page.getByRole('checkbox', { name: 'Include QA Engineer', exact: true }).uncheck();
    await expect(page.getByLabel('QA Engineer estimate (days)')).toBeDisabled(); await expect(add).toBeEnabled();
    await page.getByRole('checkbox', { name: 'Include QA Engineer', exact: true }).check();
    await expect(page.getByLabel('QA Engineer estimate (days)')).toHaveValue('0'); await expect(add).toBeDisabled();
    await page.getByLabel('QA Engineer estimate (days)').fill('2'); await add.click(); await saved(page);
    await expect(page.getByLabel('Filter by platform')).toHaveValue('');
    let state = await snapshot(), data = state.workspace.projects[0].data;
    expect(data.features[0].collapsed).toBe(false);
    const tasks = data.tasks.filter((item: { title: string }) => item.title === 'Add a specific rule'); expect(tasks).toHaveLength(3);
    const backend = tasks.find((item: { platform: string }) => item.platform === 'Backend'), frontend = tasks.find((item: { platform: string }) => item.platform === 'Frontend');
    const order = data.tasks.map((item: { id: string }) => item.id);
    await page.locator(`.work-name[data-action=drawer-task][data-id="${frontend.id}"]`).click();
    await page.getByRole('checkbox', { name: 'Depend on Add a specific rule · Backend', exact: true }).check(); await saved(page);
    await page.keyboard.press('Escape'); await page.reload(); await saved(page);
    data = (await snapshot()).workspace.projects[0].data;
    expect(data.tasks.find((item: { id: string }) => item.id === frontend.id).dependsOn).toEqual([backend.id]);
    expect(data.tasks.map((item: { id: string }) => item.id)).toEqual(order);
    await page.close();
  });

  test('supports custom teams and opt-in chains, and rejects mismatched assignees before creating an epic', async () => {
    await replace(); const page = await context.newPage(); await page.goto('/app');
    await page.locator('.gantt-corner').getByRole('button', { name: 'Add feature' }).click();
    await page.getByLabel('Feature name').fill('Invalid assignment');
    await selectTeam(page, 'Backend', '3', 'u1');
    await page.getByLabel('Backend Developer assignee', { exact: true }).evaluate(select => { const option = document.createElement('option'); option.value = 'uFront'; option.text = 'Wrong platform'; select.append(option); });
    await page.getByLabel('Backend Developer assignee', { exact: true }).selectOption('uFront');
    await page.getByRole('button', { name: 'Create feature', exact: true }).click();
    await expect(page.locator('#toast-root')).toContainText('matching team member');
    expect((await snapshot()).workspace.projects[0].data.features).toHaveLength(1);
    await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    await page.getByRole('button', { name: 'Add user story to Accounts', exact: true }).click();
    await page.getByLabel('User story name').fill('Deploy the rule');
    await selectTeam(page, 'DevOps', '.5'); await selectTeam(page, 'QA', '1.5', 'uQA');
    await page.getByRole('checkbox', { name: 'Link selected teams', exact: false }).check();
    await expect(page.locator('[data-story-summary]')).toHaveText('2 work items · 2d total effort');
    await page.getByRole('button', { name: 'Add user story', exact: true }).click(); await saved(page);
    const data = (await snapshot()).workspace.projects[0].data, tasks = data.tasks.filter((item: { title: string }) => item.title === 'Deploy the rule');
    expect(tasks).toHaveLength(2); expect(tasks[0]).toMatchObject({ platform: 'DevOps', assignee: '', effort: .5, dependsOn: [] });
    expect(tasks[1]).toMatchObject({ platform: 'QA', assignee: 'uQA', effort: 1.5, dependsOn: [tasks[0].id] });
    await expect(page.locator('[data-feature-effort=f1]')).toHaveText('8d effort');
    await expect(page.locator('.gantt-row:not(.feature)').filter({ hasText: 'DevOps Engineer · 0.5d effort' })).toHaveCount(1);
    await page.locator(`.work-name[data-action=drawer-task][data-id="${tasks[0].id}"]`).click();
    await page.getByLabel('Pure effort (days)', { exact: true }).fill('.35'); await page.getByLabel('Pure effort (days)', { exact: true }).press('Tab'); await saved(page);
    expect((await snapshot()).workspace.projects[0].data.tasks.find((item: { id: string }) => item.id === tasks[0].id).effort).toBe(.5);
    await page.getByLabel('Pure effort (days)', { exact: true }).fill('1.5'); await page.getByLabel('Pure effort (days)', { exact: true }).press('Tab'); await saved(page);
    await expect(page.locator('[data-feature-effort=f1]')).toHaveText('9d effort');
    await page.close();
  });
});
