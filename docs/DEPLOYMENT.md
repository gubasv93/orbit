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

## Release verification

A successful build is not a successful deployment. Verify the real HTTPS URL, landing and auth screens, registration/login/logout, protected requests, two-account RLS isolation, first-project setup, meetings/capacity, reload, a second browser, and database persistence. Check deployment status and Git auto-deployment. Run the hosted checks with designated test accounts and clean up only their own test data when authorized. Do not report a production URL until it actually exists and has been exercised.

For updates: commit reviewed source and migrations, run CI, deploy a preview, apply any additive migrations, then promote/deploy `main`. The existing production version should remain available while a new deployment is building. Roll back to a known good Vercel deployment if necessary; application rollback does not reverse database migrations.

## Backup and recovery

Export full workspace JSON periodically and before a schema upgrade or large import. Restore through authenticated Import workspace, inspect the project count, and confirm replacement. The normal API revision check still protects against stale overwrites. The export excludes auth accounts and credentials.

Confirm the selected Supabase plan's database backups and retention in its dashboard; point-in-time recovery and long-term backups may require a paid plan. Schedule encrypted PostgreSQL dumps with a separately secured administrative connection if required, and rehearse restores into a separate project. Restoring a full database affects every account and requires explicit owner approval.

Vercel Hobby has commercial-use restrictions; confirm the team's actual plan before commercial launch. Supabase/email quotas and project-pause policies also depend on the selected plan. This implementation does not change billing or purchase add-ons.
