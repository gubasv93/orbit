import type {Page} from '@playwright/test';

// A fixture's explicit agreement follows the current published document pair.
export const signupLegalFields = {acceptTerms: true, termsVersion: '2026-11-01', privacyVersion: '2026-11-01'} as const;
export async function acceptSignupTerms(page: Page) {
  await page.getByRole('checkbox', {name: /Terms of Use/}).check();
}
