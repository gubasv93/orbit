import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';
import {signupLegalFields} from './legal-fixtures';
import type {Workspace} from '../../src/lib/schema';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');

function withoutTeam({roles = false, parent = true} = {}): Workspace {
  const workspace = fullWorkspace(), data = workspace.projects[0].data;
  workspace.preferences = {...workspace.preferences, sidebarHidden: false, scale: 'day'};
  data.settings.autoShiftDependencies = false;
  data.people = []; data.tasks = []; data.meetings = []; data.leave = []; data.milestones = [];
  data.iterations.forEach(iteration => {iteration.overrides = {};});
  if (!roles) data.roles = [];
  if (!parent) data.features = [];
  return workspace;
}

async function prepare(context: BrowserContext, workspace: Workspace) {
  const password = 'Orbit9' + randomUUID();
  const address = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
  const response = await context.request.post('/api/auth/signup', {
    headers: {Origin: origin, 'X-Forwarded-For': address},
    data: {...signupLegalFields, firstName: 'Casey', lastName: 'Planner', email: `orbit-empty-team-${randomUUID()}@example.com`, password, confirm: password},
  });
  expect(response.status(), await response.text()).toBe(200);
  const current = await snapshot(context);
  const saved = await context.request.put('/api/workspace', {headers: {Origin: origin}, data: {workspace, revision: current.revision}});
  expect(saved.status(), await saved.text()).toBe(200);
  await context.addInitScript(() => {try {localStorage.setItem('orbit-cookie-notice', 'essential-v1');} catch {/* Opaque popup documents do not expose storage. */}});
}

async function snapshot(context: BrowserContext) {
  const response = await context.request.get('/api/workspace');
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function saved(page: Page) {await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function ready(page: Page) {await expect(page.locator('.gantt-canvas')).toBeVisible(); await saved(page);}

test('an empty roadmap explains the hierarchy and accepts unassigned estimates without people or roles', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    const workspace = withoutTeam({parent: false}); await prepare(context, workspace);
    await page.goto('/app'); await ready(page);
    const empty = page.locator('.empty-message');
    await expect(empty.getByRole('heading', {name: 'Start with your first work item', exact: true})).toBeVisible();
    await empty.getByRole('button', {name: 'Create work item', exact: true}).click();
    const dialog = page.getByRole('dialog');
    await page.getByLabel('Work item name', {exact: true}).fill('Explore a new service');
    await page.getByLabel('First sub-item (optional)', {exact: true}).fill('Sketch the first approach');
    const estimate = page.getByLabel('Sub-item estimate (days)', {exact: true});
    await expect(estimate).toHaveAttribute('step', '0.5'); await estimate.fill('0.5');
    await page.setViewportSize({width: 375, height: 900});
    await expect(page.getByLabel('Work item name', {exact: true})).toHaveValue('Explore a new service');
    await expect(page.getByLabel('First sub-item (optional)', {exact: true})).toHaveValue('Sketch the first approach');
    await expect(estimate).toHaveValue('0.5');
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.setViewportSize({width: 1440, height: 1000});
    await expect(estimate).toHaveValue('0.5');
    await dialog.getByRole('button', {name: 'Add team member', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Team members', exact: false})).toBeVisible();
    expect((await snapshot(context)).workspace.projects[0].data.features).toHaveLength(0);
    await page.getByRole('button', {name: 'Return to item', exact: true}).click();
    await expect(page.getByLabel('Work item name', {exact: true})).toHaveValue('Explore a new service');
    await expect(page.getByLabel('First sub-item (optional)', {exact: true})).toHaveValue('Sketch the first approach');
    await expect(estimate).toHaveValue('0.5');
    await dialog.getByRole('button', {name: 'Create work item', exact: true}).click(); await saved(page);
    let current = await snapshot(context), data = current.workspace.projects[0].data;
    expect(data.features).toHaveLength(1); expect(data.tasks).toHaveLength(1);
    const parent = data.features[0], child = data.tasks[0];
    expect(child).toMatchObject({title: 'Sketch the first approach', effort: 0.5, assignee: '', platform: '', featureId: parent.id});
    expect(child.roleId).toBeUndefined(); expect(data.people).toEqual([]); expect(data.roles).toEqual([]);
    await expect(page.locator(`.task-bar[data-task="${child.id}"]`)).toBeVisible();
    await page.locator(`.work-name[data-action=drawer-feature][data-id="${parent.id}"]`).click();
    await expect(page.locator('.drawer').getByRole('button', {name: 'Add team member', exact: true})).toBeVisible();
    await page.keyboard.press('Escape');
    await page.locator(`.work-name[data-action=drawer-task][data-id="${child.id}"]`).click();
    await page.getByLabel('Estimate (days)', {exact: true}).fill('1.5');
    await page.getByLabel('Estimate (days)', {exact: true}).press('Tab'); await saved(page);
    await page.locator('.drawer').getByRole('button', {name: 'Add team member', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Team members', exact: false})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Return to item', exact: true})).toBeVisible();
    expect((await snapshot(context)).workspace.activeId).toBe(workspace.activeId);
    await page.getByRole('button', {name: 'Return to item', exact: true}).click();
    await expect(page.getByRole('heading', {name: child.title, exact: true})).toBeVisible();
    await expect(page.getByLabel('Estimate (days)', {exact: true})).toHaveValue('1.5');
    await page.setViewportSize({width: 375, height: 900});
    expect(await page.locator('.drawer').evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await page.screenshot({path: 'test-results/empty-team-sub-item-375.png', fullPage: true});
    await page.keyboard.press('Escape'); await page.reload(); await ready(page);
    current = await snapshot(context); data = current.workspace.projects[0].data;
    expect(data.tasks[0]).toMatchObject({id: child.id, effort: 1.5, assignee: '', platform: ''});
    expect(current.workspace.projects).toHaveLength(1);
  } finally {await context.close();}
});

test('roles without teammates still permit standalone estimates and team setup restores the unsaved sub-item draft', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    const workspace = withoutTeam({roles: true}); await prepare(context, workspace);
    await page.goto('/app'); await ready(page);
    await page.getByRole('button', {name: 'Add sub-item to Accounts', exact: true}).click();
    await page.getByLabel('Sub-item name', {exact: true}).fill('Plan before assigning');
    await page.getByLabel('Estimate (days)', {exact: true}).fill('0.5');
    await page.getByRole('checkbox', {name: 'Include Backend Developer', exact: true}).check();
    await expect(page.getByLabel('Backend Developer estimate (days)', {exact: true})).toHaveValue('0.5');
    await page.getByLabel('Backend Developer estimate (days)', {exact: true}).fill('1.5');
    await page.getByRole('checkbox', {name: 'Include Backend Developer', exact: true}).uncheck();
    await expect(page.getByLabel('Estimate (days)', {exact: true})).toHaveValue('1.5');
    await page.getByLabel('Estimate (days)', {exact: true}).fill('0.5');
    await page.getByRole('dialog').getByRole('button', {name: 'Add sub-item', exact: true}).click(); await saved(page);
    let data = (await snapshot(context)).workspace.projects[0].data;
    expect(data.tasks).toHaveLength(1); expect(data.tasks[0]).toMatchObject({effort: 0.5, assignee: '', platform: ''});
    expect(data.tasks[0].roleId).toBeUndefined();

    await page.getByRole('button', {name: 'Add sub-item to Accounts', exact: true}).click();
    await page.getByLabel('Sub-item name', {exact: true}).fill('Keep this draft while adding a teammate');
    await page.getByLabel('Estimate (days)', {exact: true}).fill('0.5');
    await page.getByRole('dialog').getByRole('button', {name: 'Add team member', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Team members', exact: false})).toBeVisible();
    expect((await snapshot(context)).workspace.projects[0].data.tasks).toHaveLength(1);
    await page.locator('.team-layout').getByRole('button', {name: 'Add member', exact: true}).click();
    await page.getByLabel('First name', {exact: true}).fill('Riley');
    await page.getByLabel('Last name', {exact: true}).fill('Builder');
    await page.getByLabel('Role', {exact: true}).selectOption('r1');
    await page.getByRole('dialog').getByRole('button', {name: 'Add member', exact: true}).click(); await saved(page);
    await page.getByRole('button', {name: 'Return to item', exact: true}).click();
    await expect(page.getByLabel('Sub-item name', {exact: true})).toHaveValue('Keep this draft while adding a teammate');
    await expect(page.getByRole('checkbox', {name: 'Include Backend Developer', exact: true})).not.toBeChecked();
    await expect(page.getByLabel('Estimate (days)', {exact: true})).toHaveValue('0.5');
    await page.getByRole('checkbox', {name: 'Include Backend Developer', exact: true}).check();
    await expect(page.getByLabel('Backend Developer estimate (days)', {exact: true})).toHaveValue('0.5');
    await expect(page.getByRole('dialog').getByRole('button', {name: 'Add team member', exact: true})).toHaveCount(0);
    const member = (await snapshot(context)).workspace.projects[0].data.people[0];
    await page.getByLabel('Backend Developer assignee', {exact: true}).selectOption(member.id);
    await page.getByRole('dialog').getByRole('button', {name: 'Add sub-item', exact: true}).click(); await saved(page);
    data = (await snapshot(context)).workspace.projects[0].data;
    expect(data.tasks).toHaveLength(2); expect(data.people).toHaveLength(1);
    expect(data.tasks[1]).toMatchObject({title: 'Keep this draft while adding a teammate', effort: 0.5, assignee: member.id, roleId: 'r1'});
    expect((await snapshot(context)).workspace.activeId).toBe(workspace.activeId);
  } finally {await context.close();}
});

test('Poker keeps an unassigned estimate and the live room open while team settings opens in another tab', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    const workspace = withoutTeam(); await prepare(context, workspace);
    const created = await context.request.post('/api/poker', {headers: {Origin: origin}, data: {action: 'create', projectId: workspace.activeId, name: 'No team estimation', deck: ['1', '2', '?'], settings: {autoReveal: false, showAverage: true, countdown: false}}});
    expect(created.status(), await created.text()).toBe(200); const {token} = await created.json();
    await page.goto('/poker/' + token); await expect(page.locator('.poker-table')).toBeVisible();
    await page.getByRole('button', {name: '+ Add sub-item', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Add sub-item', exact: true});
    await dialog.getByLabel('Sub-item name', {exact: true}).fill('Estimate before team setup');
    await dialog.getByLabel('Estimate (days)', {exact: true}).fill('0.5');
    const setup = dialog.getByRole('link', {name: /Add team member/});
    await expect(setup).toHaveAttribute('target', '_blank');
    const target = new URL((await setup.getAttribute('href'))!, origin);
    expect(target.pathname).toBe('/app'); expect(target.searchParams.get('project')).toBe(workspace.activeId); expect(target.searchParams.get('page')).toBe('team');
    const opened = page.waitForEvent('popup'); await setup.click(); const team = await opened;
    await expect(team.getByRole('heading', {name: 'Team members', exact: false})).toBeVisible();
    await expect(dialog.getByLabel('Sub-item name', {exact: true})).toHaveValue('Estimate before team setup');
    await expect(dialog.getByLabel('Estimate (days)', {exact: true})).toHaveValue('0.5');
    const state = await (await context.request.get('/api/poker/' + token + '?issue=free')).json();
    expect(state.room.closed).toBe(false); expect(state.self.owner).toBe(true);
    await team.close(); await page.bringToFront();
    await dialog.getByRole('button', {name: 'Save sub-item', exact: true}).click();
    await expect(page.getByText('Sub-item saved to Orbit', {exact: true})).toBeVisible();
    const data = (await snapshot(context)).workspace.projects[0].data;
    expect(data.tasks).toHaveLength(1); expect(data.tasks[0]).toMatchObject({title: 'Estimate before team setup', effort: 0.5, assignee: '', platform: ''});
    expect(data.tasks[0].roleId).toBeUndefined(); expect(data.people).toEqual([]);
  } finally {await context.close();}
});


test('Poker edits an unassigned legacy platform estimate without requiring a role or teammate', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    const workspace = withoutTeam(), data = workspace.projects[0].data;
    data.tasks = [{id: 'legacy-no-role', featureId: 'f1', title: 'Legacy platform sub-item', platform: 'Backend', assignee: '', effort: 0.5, start: '2026-11-02', status: 'planned', dependsOn: [], manualEnd: '2026-11-05'}];
    await prepare(context, workspace);
    const created = await context.request.post('/api/poker', {headers: {Origin: origin}, data: {action: 'create', projectId: workspace.activeId, name: 'Legacy estimate editing', deck: ['1', '2', '?'], settings: {autoReveal: false, showAverage: true, countdown: false}}});
    expect(created.status(), await created.text()).toBe(200); const {token} = await created.json();
    await page.goto('/poker/' + token); await expect(page.locator('.poker-table')).toBeVisible();
    const parent = page.locator('.poker-epic-trigger').filter({hasText: 'Accounts'});
    await expect(parent).toHaveAttribute('aria-expanded', 'false'); await parent.click();
    await page.getByRole('button', {name: 'Select sub-item Legacy platform sub-item', exact: true}).click();
    await page.getByRole('button', {name: 'Edit sub-item estimate', exact: true}).click();
    const dialog = page.getByRole('dialog', {name: 'Edit sub-item', exact: true});
    await expect(dialog.getByLabel('Estimate (days)', {exact: true})).toHaveValue('0.5');
    await expect(dialog.getByRole('link', {name: /Add team member/})).toBeVisible();
    await dialog.getByLabel('Estimate (days)', {exact: true}).fill('1.5');
    await dialog.getByRole('button', {name: 'Save sub-item', exact: true}).click();
    await expect(page.getByText('Sub-item saved to Orbit', {exact: true})).toBeVisible();
    const saved = (await snapshot(context)).workspace.projects[0].data;
    expect(saved.tasks).toHaveLength(1);
    expect(saved.tasks[0]).toMatchObject({...data.tasks[0], effort: 1.5});
    expect(saved.tasks[0].roleId).toBeUndefined(); expect(saved.people).toEqual([]); expect(saved.roles).toEqual([]);
  } finally {await context.close();}
});
