// Preserves email delivery and verification settings. SMTP/password recovery are deferred.
const token = process.env.SUPABASE_ACCESS_TOKEN, appUrl = process.env.APP_URL;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN must be supplied securely.');
if (!appUrl) throw new Error('APP_URL must be the exact production origin.');
const origin = new URL(appUrl).origin;
if (!origin.startsWith('https://') && origin !== 'http://localhost:3000') throw new Error('Production authentication requires HTTPS.');
const endpoint = 'https://api.supabase.com/v1/projects/vvvptboxmyibdfzfqxzz/config/auth';
async function api(method, body) {
  const response = await fetch(endpoint, { method, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  if (!response.ok) throw new Error(`Auth configuration failed (HTTP ${response.status}); response suppressed.`);
  return response.json();
}
const existing = await api('GET');
const redirects = new Set(String(existing.uri_allow_list || '').split(',').map(value => value.trim()).filter(Boolean));
redirects.add('http://localhost:3000/auth/callback'); redirects.add(`${origin}/auth/callback`);
await api('PATCH', { site_url: origin, uri_allow_list: [...redirects].join(','), disable_signup: false, external_email_enabled: true,
  password_min_length: 8, password_required_characters: 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789' });
const after = await api('GET');
if (after.site_url !== origin || after.password_min_length < 8 || after.disable_signup || after.password_required_characters !== 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ:0123456789' || after.mailer_autoconfirm !== existing.mailer_autoconfirm) throw new Error('Auth settings could not be verified.');
console.log('Configured public email/password registration, the password policy, and exact redirect URLs. Existing email verification and sender settings preserved.');
