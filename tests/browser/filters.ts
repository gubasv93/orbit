import type { Page } from '@playwright/test';

export async function setRoadmapFilter(page: Page, kind: 'people' | 'platforms', names: string[]) {
  const trigger = page.getByRole('button', { name: kind === 'people' ? 'Filter by team member' : 'Filter by platform', exact: true });
  if (await trigger.getAttribute('aria-expanded') !== 'true') await trigger.click();
  const menu = page.locator('.roadmap-filter-popover');
  await menu.getByRole('button', { name: 'Clear selection', exact: true }).click();
  for (const name of names) await menu.getByRole('checkbox', { name, exact: true }).check();
  await menu.getByRole('button', { name: 'Done', exact: true }).click();
}
