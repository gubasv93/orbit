import {test, expect, type BrowserContext, type Page} from '@playwright/test';
import {randomUUID} from 'node:crypto';
import {signupLegalFields} from './legal-fixtures';
import {fullWorkspace} from '../fixtures';
import type {Workspace} from '../../src/lib/schema';

const origin = process.env.E2E_BASE_URL || 'http://localhost:3000';
test.skip(process.env.ORBIT_E2E_AUTH !== '1', 'Requires the disposable real-auth backend.');

async function account(context: BrowserContext) {
  await context.addInitScript(() => {try {localStorage.setItem('orbit-cookie-notice', 'essential-v1');} catch {}});
  const password = 'Orbit9' + randomUUID();
  const address = '2001:db8:' + randomUUID().replaceAll('-', '').match(/.{1,4}/g)!.slice(0, 6).join(':');
  const response = await context.request.post('/api/auth/signup', {
    headers: {Origin: origin, 'X-Forwarded-For': address},
    data: {...signupLegalFields, firstName: 'Calendar', lastName: 'Planner', email: `orbit-time-off-${randomUUID()}@example.com`, password, confirm: password},
  });
  expect(response.status(), await response.text()).toBe(200);
}
async function snapshot(context: BrowserContext): Promise<{workspace: Workspace; revision: number}> {
  const response = await context.request.get('/api/workspace');
  expect(response.status(), await response.text()).toBe(200);return response.json();
}
async function replace(context: BrowserContext, workspace: Workspace) {
  const current = await snapshot(context);
  const response = await context.request.put('/api/workspace', {headers: {Origin: origin}, data: {workspace, revision: current.revision}});
  expect(response.status(), await response.text()).toBe(200);
}
async function saved(page: Page) {await expect(page.locator('.save-bar [role=status]')).toHaveText('Saved to cloud');}
async function newProject(page: Page, name: string) {
  await page.goto('/app');
  await page.getByRole('button', {name: 'Create project', exact: true}).click();
  await page.getByLabel('Project name', {exact: true}).fill(name);
  await page.locator('#modalForm button[type=submit]').click();
  await expect(page.getByRole('heading', {name: 'Add your team', exact: true})).toBeVisible();
}
const footer = (page: Page) => page.locator('.setup-footer');
function addDays(date: string, amount: number) {return new Date(Date.parse(date + 'T00:00:00Z') + amount * 86400000).toISOString().slice(0, 10);}
function nextMonday() {
  const date = new Date();date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() + ((1 - date.getUTCDay() + 7) % 7 || 7));
  return date.toISOString().slice(0, 10);
}
async function addTimeOff(page: Page, type: 'vacation' | 'dayoff' | 'sick', from: string, to: string, note: string) {
  await page.getByRole('button', {name: 'Add time off', exact: true}).click();
  const dialog = page.getByRole('dialog', {name: 'Add time off', exact: true});
  await dialog.getByLabel('Type', {exact: true}).selectOption(type);
  await dialog.getByLabel('From', {exact: true}).fill(from);
  await dialog.getByLabel('To (inclusive)', {exact: true}).fill(to);
  await dialog.getByLabel('Note', {exact: true}).fill(note);
  await dialog.getByRole('button', {name: 'Add time off', exact: true}).click();await saved(page);
  await expect(page.getByRole('heading', {name: 'Add planned time off', exact: true})).toBeVisible();
}

test('the third onboarding step keeps inclusive time off through edits, reload and back navigation, then affects the forecast', async ({browser}) => {
  test.setTimeout(90000);
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  const errors: string[] = [];page.on('pageerror', error => errors.push(error.message));
  try {
    await account(context);await newProject(page, 'Team working calendar');
    await page.getByLabel('First name', {exact: true}).fill('Maya');await page.getByLabel('Last name', {exact: true}).fill('Planner');
    await page.getByLabel('Role', {exact: true}).fill('Backend Developer');
    await page.getByRole('button', {name: 'Add team member', exact: true}).click();
    await footer(page).getByRole('button', {name: /Continue to meetings/}).click();
    await page.getByRole('button', {name: 'Add meeting', exact: true}).click();
    const meeting = page.getByRole('dialog');
    await meeting.getByLabel('Meeting name', {exact: true}).fill('Calendar stand-up');
    await meeting.getByLabel('Repeat', {exact: true}).selectOption('workdays');
    await meeting.getByLabel('Duration (minutes)', {exact: true}).fill('30');
    await meeting.getByRole('button', {name: 'Create meeting', exact: true}).click();await saved(page);
    await footer(page).getByRole('button', {name: /Continue to time off/}).click();await saved(page);
    await expect(page.getByRole('heading', {name: 'Add planned time off', exact: true})).toBeVisible();
    await expect(page.locator('.setup-step.is-active strong')).toHaveText('Time off');
    let current = await snapshot(context), project = current.workspace.projects[0];
    expect(project.onboardingStep).toBe(3);expect(project.data.people).toHaveLength(1);expect(project.data.meetings).toHaveLength(1);
    const monday = nextMonday(), person = project.data.people[0];
    await addTimeOff(page, 'vacation', monday, monday, 'Initial absence');
    let entry = (await snapshot(context)).workspace.projects[0].data.leave[0];
    expect(entry).toMatchObject({person: person.id, type: 'vacation', from: monday, to: monday, note: 'Initial absence'});
    await page.reload();await saved(page);
    await expect(page.getByRole('heading', {name: 'Add planned time off', exact: true})).toBeVisible();
    await page.locator(`[data-setup-leave="${entry.id}"]`).getByRole('button', {name: 'Edit time off for Maya Planner', exact: true}).click();
    const edit = page.getByRole('dialog', {name: 'Edit time off', exact: true});
    await expect(edit.getByLabel('Team member', {exact: true})).toHaveValue(person.id);
    await expect(edit.getByLabel('From', {exact: true})).toHaveValue(monday);
    await expect(edit.getByLabel('To (inclusive)', {exact: true})).toHaveValue(monday);
    await edit.getByLabel('Type', {exact: true}).selectOption('sick');await edit.getByLabel('Note', {exact: true}).fill('Recovering');
    await edit.getByRole('button', {name: 'Save time off', exact: true}).click();await saved(page);
    entry = (await snapshot(context)).workspace.projects[0].data.leave[0];
    expect(entry).toMatchObject({person: person.id, type: 'sick', from: monday, to: monday, note: 'Recovering'});
    await addTimeOff(page, 'dayoff', addDays(monday, 2), addDays(monday, 3), 'Personal leave');
    await addTimeOff(page, 'vacation', addDays(monday, 4), addDays(monday, 4), 'Remove this plan');
    current = await snapshot(context);const removed = current.workspace.projects[0].data.leave.find(leave => leave.note === 'Remove this plan')!;
    page.once('dialog', confirmation => confirmation.accept());
    await page.locator(`[data-setup-leave="${removed.id}"]`).getByRole('button', {name: 'Delete time off for Maya Planner', exact: true}).click();await saved(page);
    const expectedLeave = (await snapshot(context)).workspace.projects[0].data.leave;
    expect(expectedLeave).toHaveLength(2);expect(expectedLeave.find(leave => leave.type === 'dayoff')).toMatchObject({from: addDays(monday, 2), to: addDays(monday, 3)});
    await footer(page).getByRole('button', {name: 'Back to meetings', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Add recurring meetings', exact: true})).toBeVisible();
    await footer(page).getByRole('button', {name: 'Back to team', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Add your team', exact: true})).toBeVisible();
    await footer(page).getByRole('button', {name: /Continue to meetings/}).click();
    await footer(page).getByRole('button', {name: /Continue to time off/}).click();await saved(page);
    current = await snapshot(context);expect(current.workspace.projects[0].data.leave).toEqual(expectedLeave);expect(current.workspace.projects[0].onboardingStep).toBe(3);
    await page.getByRole('button', {name: 'Add time off', exact: true}).click();
    await page.getByRole('dialog').getByRole('button', {name: 'Back to setup', exact: true}).click();
    expect((await snapshot(context)).workspace.projects[0].data.leave).toEqual(expectedLeave);
    await footer(page).getByRole('button', {name: 'Finish setup', exact: true}).click();await saved(page);
    current = await snapshot(context);expect(current.workspace.projects[0].onboardingStep).toBe(0);
    current.workspace.projects[0].data.settings.observeHolidays = false;
    await replace(context, current.workspace);await page.reload();await saved(page);
    await page.getByRole('button', {name: 'Add work item', exact: true}).click();
    const work = page.getByRole('dialog');
    await work.getByLabel('Work item name', {exact: true}).fill('Respect planned absence');
    await work.getByLabel('First sub-item (optional)', {exact: true}).fill('Resume after sick leave');
    await work.getByLabel('Earliest start', {exact: true}).fill(monday);
    await work.getByRole('checkbox', {name: 'Include Backend Developer', exact: true}).check();
    await work.getByLabel('Backend Developer assignee', {exact: true}).selectOption(person.id);
    await work.getByLabel('Backend Developer estimate (days)', {exact: true}).fill('0.5');
    await work.getByRole('button', {name: 'Create work item', exact: true}).click();await saved(page);
    project = (await snapshot(context)).workspace.projects[0];const task = project.data.tasks[0];
    expect(task.start).toBe(monday);expect(task.assignee).toBe(person.id);
    await page.locator(`.work-name[data-action=drawer-task][data-id="${task.id}"]`).click();
    await expect(page.getByLabel('Start date', {exact: true})).toHaveValue(addDays(monday, 1));
    expect(project.data.leave).toEqual(expectedLeave);expect(errors).toEqual([]);
  } finally {await context.close();}
});

test('time off is optional without teammates and the third-step layout fits small screens', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 375, height: 900}}), page = await context.newPage();
  try {
    await account(context);await newProject(page, 'Plan before staffing');
    await footer(page).getByRole('button', {name: 'Skip for now', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Add recurring meetings', exact: true})).toBeVisible();
    await footer(page).getByRole('button', {name: 'Skip for now', exact: true}).click();await saved(page);
    await expect(page.getByRole('heading', {name: 'Add planned time off', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Add time off', exact: true})).toBeDisabled();
    for (const width of [375, 320]) {
      await page.setViewportSize({width, height: 900});
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const shortcut = (await page.getByRole('button', {name: /Finish setup & open roadmap/}).boundingBox())!;
      expect(shortcut.x).toBeGreaterThanOrEqual(0);expect(shortcut.x + shortcut.width).toBeLessThanOrEqual(width);
      await expect(footer(page).getByRole('button', {name: 'Finish setup', exact: true})).toBeVisible();
      await page.screenshot({path: `test-results/onboarding-time-off-${width}.png`, fullPage: true});
    }
    await page.getByRole('button', {name: 'Back to team', exact: true}).click();
    await expect(page.getByRole('heading', {name: 'Add your team', exact: true})).toBeVisible();
    await footer(page).getByRole('button', {name: 'Skip for now', exact: true}).click();
    await footer(page).getByRole('button', {name: 'Skip for now', exact: true}).click();
    await footer(page).getByRole('button', {name: 'Skip for now', exact: true}).click();await saved(page);
    await expect(page.locator('.gantt-canvas')).toBeVisible();
    let project = (await snapshot(context)).workspace.projects[0];expect(project.onboardingStep).toBe(0);expect(project.data.leave).toEqual([]);expect(project.data.people).toEqual([]);
    await page.reload();await saved(page);project = (await snapshot(context)).workspace.projects[0];
    expect(project.onboardingStep).toBe(0);await expect(page.locator('.setup-progress')).toHaveCount(0);
  } finally {await context.close();}
});

test('existing completed projects stay complete and an in-progress meetings setup resumes into time off', async ({browser}) => {
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}}), page = await context.newPage();
  try {
    await account(context);const workspace = fullWorkspace();workspace.preferences.sidebarHidden = false;
    await replace(context, workspace);await page.goto('/app');await saved(page);
    await expect(page.locator('.gantt-canvas')).toBeVisible();await expect(page.locator('.setup-progress')).toHaveCount(0);
    const previous = (await snapshot(context)).workspace;
    previous.projects[0].onboardingStep = 2;await replace(context, previous);await page.reload();await saved(page);
    await expect(page.getByRole('heading', {name: 'Add recurring meetings', exact: true})).toBeVisible();
    await footer(page).getByRole('button', {name: /Continue to time off/}).click();await saved(page);
    await expect(page.getByRole('heading', {name: 'Add planned time off', exact: true})).toBeVisible();
    expect((await snapshot(context)).workspace.projects[0].data.leave).toEqual(workspace.projects[0].data.leave);
    await page.reload();await saved(page);expect((await snapshot(context)).workspace.projects[0].onboardingStep).toBe(3);
    await page.getByRole('button', {name: /Finish setup & open roadmap/}).click();await saved(page);
    const completed = (await snapshot(context)).workspace.projects[0];expect(completed.onboardingStep).toBe(0);expect(completed.data).toEqual(workspace.projects[0].data);
    await expect(page.locator('.gantt-canvas')).toBeVisible();
  } finally {await context.close();}
});
