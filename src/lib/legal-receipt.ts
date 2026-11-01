import {createHmac, randomBytes, timingSafeEqual} from 'node:crypto';
import {z} from 'zod';
import {PRIVACY_VERSION, TERMS_VERSION} from './legal';

export const legalReceiptCookie = 'orbit_legal_receipt';
const lifetimeSeconds = 1800;
export const legalReceiptCookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const,
  path: '/auth/callback', maxAge: lifetimeSeconds,
});
const receiptSchema = z.object({
  version: z.literal(1), terms: z.literal(TERMS_VERSION), privacy: z.literal(PRIVACY_VERSION),
  issuedAt: z.number().int().nonnegative(), expiresAt: z.number().int().nonnegative(),
  nonce: z.string().regex(/^[a-f0-9]{32}$/),
}).strict();
function signature(payload: string) {
  const secret = process.env.APPLICATION_MANAGER_ENCRYPTION_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret || secret.length < 32) throw new Error('Secure legal acceptance receipt is unavailable.');
  const key = createHmac('sha256', secret).update('orbit/legal-receipt/key/v1').digest();
  return createHmac('sha256', key).update('orbit-legal-signup-v1.').update(payload).digest();
}

/** Carries this browser's explicit signup agreement across the Google redirect. */
export function createLegalReceipt(now = Date.now()) {
  const issuedAt = Math.floor(now / 1000);
  const payload = Buffer.from(JSON.stringify({version: 1, terms: TERMS_VERSION, privacy: PRIVACY_VERSION, issuedAt, expiresAt: issuedAt + lifetimeSeconds, nonce: randomBytes(16).toString('hex')})).toString('base64url');
  return payload + '.' + signature(payload).toString('base64url');
}

export function verifyLegalReceipt(value: string | undefined, now = Date.now()) {
  if (!value || value.length > 1024 || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{43}$/.test(value)) return false;
  try {
    const [payload, supplied] = value.split('.');
    const actual = signature(payload), received = Buffer.from(supplied, 'base64url');
    if (received.length !== actual.length || !timingSafeEqual(actual, received)) return false;
    const parsed = receiptSchema.safeParse(JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')));
    if (!parsed.success) return false;
    const time = Math.floor(now / 1000), receipt = parsed.data;
    return receipt.issuedAt <= time + 30 && receipt.expiresAt === receipt.issuedAt + lifetimeSeconds && receipt.expiresAt > time;
  } catch { return false; }
}
