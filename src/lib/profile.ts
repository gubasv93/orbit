export type AccountProfile = {
  firstName: string;
  lastName: string;
  displayName: string;
  email: string;
};

type ProfileUser = {
  email?: string;
  user_metadata?: Record<string, unknown>;
  app_metadata?: Record<string, unknown>;
  identities?: {provider: string}[];
};

const clean = (value: unknown) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 201) : '';

/** Names are display data only; ownership continues to use the authenticated ID. */
export function accountProfile(user: ProfileUser): AccountProfile {
  const metadata = user.user_metadata || {};
  const legacy = clean(metadata.full_name) || clean(metadata.name);
  const parts = legacy.split(/\s+/).filter(Boolean);
  const firstName = (clean(metadata.first_name) || clean(metadata.given_name) || parts[0] || '').slice(0, 100);
  const lastName = (clean(metadata.last_name) || clean(metadata.family_name) || parts.slice(1).join(' ')).slice(0, 100);
  const email = clean(user.email);
  return { firstName, lastName, displayName: [firstName, lastName].filter(Boolean).join(' ') || email.split('@')[0] || 'Orbit user', email };
}

export function profilePasswordMode(user: ProfileUser): 'current-password' | 'google-reauth' {
  const providers = new Set([
    ...(user.identities || []).map(identity => identity.provider),
    ...(Array.isArray(user.app_metadata?.providers) ? user.app_metadata.providers.filter((value): value is string => typeof value === 'string') : []),
    ...(typeof user.app_metadata?.provider === 'string' ? [user.app_metadata.provider] : []),
  ]);
  return providers.has('google') && !providers.has('email') ? 'google-reauth' : 'current-password';
}

/** Called only with claims that Supabase Auth has cryptographically verified. */
export function recentGoogleAuthentication(claims: unknown, now = Date.now()): boolean {
  if (!claims || typeof claims !== 'object') return false;
  const methods = (claims as {amr?: unknown}).amr;
  if (!Array.isArray(methods)) return false;
  return methods.some(method => {
    if (!method || typeof method !== 'object' || method.method !== 'oauth' || typeof method.timestamp !== 'number') return false;
    const age = now / 1000 - method.timestamp;
    return Number.isFinite(age) && age >= -60 && age <= 5 * 60;
  });
}
