# Deployment and recovery

Selected repository: `gubasv93/orbit`. Selected Supabase project: `vvvptboxmyibdfzfqxzz`. Selected Vercel account/team slug: `gubasv93s-projects`. Use the existing Vercel subscription; do not create paid resources or upgrade plans without owner approval.

Live verification release: **https://orbit-sigma-nine-72.vercel.app**. The application is deployed. Email confirmation is temporarily disabled by explicit owner approval, so public registration does not depend on confirmation-email delivery. Automatic Git deployment remains outstanding.

## Secure integration access

Supply `SUPABASE_ACCESS_TOKEN` and `VERCEL_TOKEN` through secure environment settings, never chat, Git, or command-line literals. These management/deployment bindings are only needed for provisioning; never install them as application runtime variables or expose them to the browser.

```bash
npm run check:integrations
```

This reads account/project metadata only and suppresses credentials and response bodies. Vercel read access does not establish permission to create projects or deployments. A token scoped to the selected team with project/deployment management access is required. Create it through [Vercel account tokens](https://vercel.com/account/tokens) and supply it in secure `VERCEL_TOKEN` settings. In the Codex cloud environment, the scripts use Node's supported environment proxy route. Required API destinations are `api.supabase.com`, `api.vercel.com`, and `api.github.com`, plus the selected Supabase hostname and the exact eventual deployment hostname. Never disable TLS checks.

## Database

Planning Poker adds migration `20261029000200_planning_poker.sql`. Its production application requires the explicit approval requested in the product task. Prepare a read-only compatibility/checksum report with `node --use-env-proxy scripts/apply-poker-migration.mjs`. After approval, the same command with `--apply` applies only that additive migration and its checksum marker in a transaction and reloads the PostgREST schema cache. Do not publish the new UI before its RPCs exist. Application rollback can return to deployment `dpl_3Yk665UnxdXJ7AXBdv5kzLJ8YBQ2`; leave additive poker data intact. See [Planning Poker](PLANNING_POKER.md).

Inspect the selected hosted project before applying anything. The migration creates only new `orbit_*` objects and a private `orbit_private` schema. It does not replace existing applications, delete hosted user records, or change email-delivery settings.

```bash
node --use-env-proxy scripts/apply-migrations.mjs
```

The management API applies each versioned migration and its checksum marker in one transaction. Repeated execution checks the markers. If existing untracked Orbit tables or a changed checksum are found, it refuses to overwrite them. Migrations `20261023000100` and `20261023000200` were applied to the selected hosted project on 2026-10-23. The second migration returns business revision conflicts as `PT409`/HTTP 409; the original serialization SQLSTATE timed out through the hosted API. The hosted database's 18 private tables passed RLS and grants checks.

Do not edit an applied migration. Add a new versioned migration for future schema changes and test forward migration/recovery first. Never run `supabase db reset` against the hosted project.

## Vercel

Authenticate securely, inspect the selected team and its existing projects/plan, and create a new Orbit project only if the name does not belong to an existing deployment. Do not overwrite an existing deployment without owner confirmation. Connect `gubasv93/orbit` through Vercel's GitHub integration and set `main` as the production branch. A GitHub App authorization may require the owner's browser approval.

The owner's replacement token has management access. Project `orbit` (`prj_OEjKW1GPAn5AnBaQbQO75PvI8voj`) was created under `gubasv93s-projects` on its existing Hobby plan, with Node.js 24 and encrypted production runtime settings. Vercel requires the owner to [install its GitHub app](https://github.com/apps/vercel/installations/new) for `gubasv93/orbit` before Git linking and automatic deployments can be configured. The existing portfolio project is untouched. No paid upgrade was made.

Until Git linking is authorized, a reviewed manual update can use the direct deployment script:

```bash
npm run typecheck
npm test
npm run build
# Commit, push main, and check CI before deploying.
node --use-env-proxy scripts/deploy-vercel.mjs
```

The script requires a clean tree matching the pushed `main` commit, verifies the existing project owner, and uploads only committed application source and build declarations. It excludes all environment files and management scripts. It uses secure `VERCEL_TOKEN` settings, creates a production deployment, and records public deployment metadata under ignored `.vercel/`. An accepted deployment still needs Ready status and live verification.

Use the Next.js preset, `npm ci`, `npm run build`, Node.js 24, and the repository root. Store these in Vercel's runtime environment settings:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | `https://vvvptboxmyibdfzfqxzz.supabase.co` |
| `SUPABASE_PUBLISHABLE_KEY` | The project's publishable/anon key |
| `APP_URL` | The exact HTTPS production origin |
| `SIGNUP_MODE` | `public` (owner approved) |

Set preview variables separately. Preview builds must use their exact origin and explicitly permitted callback URL. Prefer a separate Supabase test project for previews; do not run tests that mutate real production data merely to validate a build.

Public registration, the password policy, the production site URL, and exact production/local callback URLs are configured on the selected hosted project. Email confirmation is temporarily disabled by explicit owner approval while SMTP is deferred. New accounts receive an immediate session; their email addresses are unverified. For a future canonical domain change, update the Vercel `APP_URL` variable, configure the exact redirects, and verify the password policy:

```bash
APP_URL=https://orbit-sigma-nine-72.vercel.app node --use-env-proxy scripts/configure-auth.mjs
```

The script preserves the current confirmation-email and sender configuration. SMTP and forgot/reset-password are intentionally deferred. Initially, confirmation was required with Supabase's built-in sender, whose project-wide quota is two emails per hour; this blocked public registration with `over_email_send_rate_limit`. The owner then approved setting `mailer_autoconfirm=true`. Email sending remains unconfigured and unverified. Before restoring confirmation, configure a production sender, verify delivery and callbacks, and obtain owner approval for the behavior change. Keep the application's per-IP and provider abuse limits enabled.

## Google registration and login

Both `/signup` and `/login` offer **Continue with Google**. They share one Supabase OAuth flow: a new identity gets the normal empty private workspace; returning identities use the same authenticated workspace RPC. Supabase handles verified-email identity linking; Orbit does not merge workspaces or link users based on browser-supplied email addresses.

Google credentials belong in Supabase's provider configuration, not the application repository, browser, or Vercel environment. No extra application variables or database migrations are needed. The provider was disabled and had no OAuth client configured when inspected on 2026-10-24; the application can be deployed before the owner completes these account-level settings.

1. Open [Google Auth Platform](https://console.cloud.google.com/auth/overview) in the Google Cloud project that should own Orbit's sign-in. Configure app branding/support contacts and an External audience for public registration.
2. Under **Clients**, create an OAuth client with application type **Web application**. Add this exact **Authorized redirect URI**: `https://vvvptboxmyibdfzfqxzz.supabase.co/auth/v1/callback`. This is Supabase's callback, not the Orbit `/auth/callback` route. The flow uses only the basic OpenID/email/profile scopes.
3. In [Supabase → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/vvvptboxmyibdfzfqxzz/auth/providers), enter the client ID and secret, enable Google, and save. Keep nonce checks enabled. Do not paste the secret into chat or commit it.
4. In Supabase's [URL Configuration](https://supabase.com/dashboard/project/vvvptboxmyibdfzfqxzz/auth/url-configuration), retain site URL `https://orbit-sigma-nine-72.vercel.app` and the exact permitted app callback URLs `https://orbit-sigma-nine-72.vercel.app/auth/callback` and `http://localhost:3000/auth/callback`. These are already configured. Use the canonical app origin when opening Orbit.
5. Google OAuth apps in Testing accept only listed test users. Add your test Google account for verification, then publish the audience for public sign-ups after Google's required app details are complete.
6. Check both entry screens with a new Google account, reload the empty workspace, create/save a project, log out, and sign in again to confirm the same workspace returns. Check a pre-existing email/password account separately to confirm the provider's linking behavior with that verified Google email.

The button posts to a same-origin, login-rate-limited server route. Supabase SSR stores its PKCE proof key in an HttpOnly cookie and issues a fixed callback URL. The callback exchanges the one-time code in the same browser, stores the normal server session, and always redirects to `/app`; client-supplied destinations are ignored. Cancelling Google returns to a clear login notice. Expired/missing codes, missing proof keys, and provider outages leave a usable login screen. If the provider is still disabled, Orbit shows an inline setup message and keeps email/password usable.

Google entry requires `SIGNUP_MODE=public`; it fails closed in restricted deployments because OAuth sign-in can also create identities. A future restricted OAuth launch needs provider-side registration controls. Google authentication does not require SMTP and does not change the owner's deferred email/password recovery settings.

## Release verification

A successful build is not a successful deployment. Verify the real HTTPS URL, landing and auth screens, registration/login/logout, protected requests, two-account RLS isolation, first-project setup, meetings/capacity, reload, a second browser, and database persistence. Check deployment status and Git auto-deployment. Run the hosted checks with designated test accounts and clean up only their own test data when authorized. Do not report a production URL until it actually exists and has been exercised.

For updates: commit reviewed source and migrations, run CI, deploy a preview, apply any additive migrations, then promote/deploy `main`. The existing production version should remain available while a new deployment is building. Roll back to a known good Vercel deployment if necessary; application rollback does not reverse database migrations.

## Backup and recovery

Export full workspace JSON periodically and before a schema upgrade or large import. Restore through authenticated Import workspace, inspect the project count, and confirm replacement. The normal API revision check still protects against stale overwrites. The export excludes auth accounts and credentials.

Confirm the selected Supabase plan's database backups and retention in its dashboard; point-in-time recovery and long-term backups may require a paid plan. Schedule encrypted PostgreSQL dumps with a separately secured administrative connection if required, and rehearse restores into a separate project. Restoring a full database affects every account and requires explicit owner approval.

Vercel Hobby has commercial-use restrictions; confirm the team's actual plan before commercial launch. Supabase/email quotas and project-pause policies also depend on the selected plan. This implementation does not change billing or purchase add-ons.
