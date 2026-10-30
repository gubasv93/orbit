import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {fullWorkspace} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');
const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';

async function seed(context: BrowserContext) {
  const password = 'Orbit9' + randomUUID();
  const address = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
  const signup = await context.request.post('/api/auth/signup', {
    headers: {Origin: origin, 'X-Forwarded-For': address},
    data: {firstName: 'Project', lastName: 'Owner', email: `orbit-delete-project-${randomUUID()}@example.com`, password, confirm: password},
  });
  expect(signup.status(), await signup.text()).toBe(200);
  const initial = await snapshot(context), workspace = fullWorkspace();
  workspace.projects[0].name = 'Live source project';
  workspace.preferences.sidebarHidden = false;
  const saved = await context.request.put('/api/workspace', {headers: {Origin: origin}, data: {revision: initial.revision, workspace}});
  expect(saved.status(), await saved.text()).toBe(200);
  return workspace;
}
async function snapshot(context: BrowserContext): Promise<{workspace: Workspace; revision: number}> {
  const response = await context.request.get('/api/workspace');
  expect(response.status(), await response.text()).toBe(200);
  return response.json();
}
async function saved(page: Page) {
  await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');
}
async function settings(page: Page) {
  const show = page.getByRole('button', {name: 'Show sidebar', exact: true});
  if (await show.isVisible()) await show.click();
  await page.getByRole('button', {name: 'General settings', exact: true}).click();
  await expect(page.getByRole('dialog').getByRole('heading', {name: 'General settings', exact: true})).toBeVisible();
}
async function deleteDialog(page: Page) {
  await page.getByRole('dialog').getByRole('button', {name: 'Delete project', exact: true}).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', {name: 'Delete project', exact: true})).toBeVisible();
  return dialog;
}

test('deleting a project copied from another project requires confirmation and leaves the live source intact', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    const workspace = await seed(context), sourceId = workspace.activeId!;
    await page.goto('/app');await expect(page.locator('.gantt-canvas')).toBeVisible();await saved(page);
    await page.getByRole('button', {name: 'New project', exact: true}).click();
    await page.getByLabel('Project name', {exact: true}).fill('Copied roadmap');
    await page.getByLabel('Copy from', {exact: true}).selectOption(sourceId);
    await page.locator('#modalForm button[type=submit]').click();
    await page.getByRole('button', {name: /Continue to meetings/}).click();
    await page.getByRole('button', {name: 'Finish setup', exact: true}).click();await saved(page);
    const before = await snapshot(context), source = before.workspace.projects.find(project => project.id === sourceId)!;
    const copied = before.workspace.projects.find(project => project.id !== sourceId)!;
    expect(before.workspace.activeId).toBe(copied.id);
    expect(copied.data.people).toHaveLength(source.data.people.length);
    expect(copied.data.people[0].id).not.toBe(source.data.people[0].id);
    expect(copied.data.meetings).toHaveLength(source.data.meetings.length);
    expect(copied.data.meetings[0].copiedFromProjectId).toBe(source.id);
    expect(copied.data.meetings[0].attendees).toEqual([copied.data.people[0].id]);
    await settings(page);let dialog = await deleteDialog(page);
    await expect(dialog).toContainText(copied.name);
    await expect(dialog.getByRole('button', {name: 'Delete project', exact: true})).toBeDisabled();
    await dialog.getByLabel('Type project name', {exact: true}).fill(source.name);
    await expect(dialog.getByRole('button', {name: 'Delete project', exact: true})).toBeDisabled();
    await dialog.getByRole('button', {name: 'Cancel', exact: true}).click();
    await expect(page.getByRole('dialog').getByRole('heading', {name: 'General settings', exact: true})).toBeVisible();
    expect((await snapshot(context)).workspace).toEqual(before.workspace);
    await deleteDialog(page);await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog').getByRole('heading', {name: 'General settings', exact: true})).toBeVisible();
    expect((await snapshot(context)).workspace).toEqual(before.workspace);
    dialog = await deleteDialog(page);
    await dialog.getByLabel('Type project name', {exact: true}).fill(copied.name);
    await expect(dialog.getByRole('button', {name: 'Delete project', exact: true})).toBeEnabled();
    await dialog.getByRole('button', {name: 'Delete project', exact: true}).click();await saved(page);
    const after = await snapshot(context);
    expect(after.workspace.projects).toEqual([source]);expect(after.workspace.activeId).toBe(source.id);
    await expect(page.locator('.project-trigger')).toContainText(source.name);
    await page.reload();await saved(page);
    expect((await snapshot(context)).workspace.projects).toEqual([source]);
    await expect(page.locator('[data-row-task=t1]')).toBeVisible();
    await settings(page);await page.getByRole('dialog').getByRole('button', {name: 'Manage meetings', exact: true}).click();
    await expect(page.getByRole('dialog')).toContainText(source.data.meetings[0].title);
  } finally {await context.close();}
});

test('deleting the final populated project persists an empty workspace and supports creating a fresh project', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 375, height: 900}}), page = await context.newPage();
  try {
    const seeded = await seed(context), name = seeded.projects[0].name;
    await page.goto('/app');await expect(page.locator('.gantt-canvas')).toBeVisible();await saved(page);
    await settings(page);const dialog = await deleteDialog(page);
    expect(await dialog.evaluate(element => element.scrollWidth <= element.clientWidth)).toBe(true);
    await dialog.getByLabel('Type project name', {exact: true}).fill(name);
    await dialog.getByRole('button', {name: 'Delete project', exact: true}).click();
    await expect(page.getByRole('heading', {name: "Let's create your first project.", exact: true})).toBeVisible();await saved(page);
    expect((await snapshot(context)).workspace).toMatchObject({activeId: null, projects: []});
    await page.reload();await expect(page.getByRole('heading', {name: "Let's create your first project.", exact: true})).toBeVisible();
    expect((await snapshot(context)).workspace).toMatchObject({activeId: null, projects: []});
    await page.getByRole('button', {name: 'Create project', exact: true}).click();
    await page.getByLabel('Project name', {exact: true}).fill('Fresh project');
    await page.locator('#modalForm button[type=submit]').click();
    await expect(page.getByRole('button', {name: /Continue to meetings/})).toBeVisible();
    await saved(page);const fresh = (await snapshot(context)).workspace;
    expect(fresh.projects).toHaveLength(1);expect(fresh.projects[0].name).toBe('Fresh project');
    expect(fresh.projects[0].data.people).toEqual([]);expect(fresh.projects[0].data.tasks).toEqual([]);expect(fresh.projects[0].data.meetings).toEqual([]);
  } finally {await context.close();}
});
