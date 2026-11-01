import {z} from 'zod';
import {signupSchema} from './schema';

export const TERMS_VERSION = '2026-11-01';
export const PRIVACY_VERSION = '2026-11-01';

// Acceptance concerns the service terms and privacy notice, never analytics.
export const legalAcceptanceSchema = z.object({
  acceptTerms: z.literal(true, {error: 'Please agree to the Terms of Use and acknowledge the Privacy Policy.'}),
  termsVersion: z.literal(TERMS_VERSION, {error: 'Please review the current Terms of Use.'}),
  privacyVersion: z.literal(PRIVACY_VERSION, {error: 'Please review the current Privacy Policy.'}),
});
export const registrationRequestSchema = signupSchema.safeExtend(legalAcceptanceSchema.shape);
export const googleEntrySchema = z.union([
  z.object({mode: z.literal('signup'), ...legalAcceptanceSchema.shape}).strict(),
  z.object({mode: z.literal('login').optional()}).strict(),
]);

export const currentLegalAcceptance = {
  acceptTerms: true,
  termsVersion: TERMS_VERSION,
  privacyVersion: PRIVACY_VERSION,
} as const;
