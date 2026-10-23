# Orbit Roadmap Planner

Roadmaps that adapt to reality: features and work items, dependencies, real team capacity, recurring meetings, time off, and milestones.

Orbit is a Next.js App Router application backed by Supabase Auth and PostgreSQL, intended for Vercel. The supplied interactive planner is preserved; its scheduling engine has been extracted from rendering and persistence. No account is seeded with sample data.

## Current delivery scope

- Email/password registration, login, secure server-managed sessions, and logout.
- Passwords require at least 8 characters, a letter and a number, and at most 72 UTF-8 bytes, matching Supabase's native limit (owner approved).
- Public registration approved by the owner; Supabase's existing email-verification setting is preserved.
- SMTP configuration and all forgot/reset-password functionality are intentionally deferred by the owner.
- No social sign-in, invitations, billing, or collaborative editing.
- Hosted deployment requires authenticated Supabase and Vercel access. Local verification is distinct from production deployment; see `docs/VALIDATION.md` for observed results.

## Development

Use Node.js 24 and the existing checkout; cloud tasks are already isolated and do not need a Git worktree.

```bash
npm ci
cp .env.example .env.local
# Supply the project's publishable/anon key in .env.local or secure runtime settings.
npm run dev
```

Application configuration is server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL`, `SIGNUP_MODE`, and optionally `SIGNUP_ALLOWED_EMAILS`. The public/anon key is sufficient; the app never needs a service-role key. Keep all environment files out of Git. `APP_URL` must be the exact origin used to open the app. Configure preview environments with their own exact origin.

`SIGNUP_MODE=public` enables registration. Other values restrict registration to the comma-separated `SIGNUP_ALLOWED_EMAILS`. Supabase must also permit email sign-ups. Confirmation email delivery follows the provider's existing configuration; public registration is not considered verified until tested against the hosted project.

```bash
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Without a configured test backend, only public-screen/security browser tests run; authenticated journeys are explicitly skipped. To test the complete product locally against real GoTrue, PostgreSQL, and PostgREST:

```bash
npm run build
node scripts/local-backend.mjs
# In another shell:
ORBIT_E2E_AUTH=1 npm run test:e2e
```

Docker and Chromium are required. On a machine without system Chromium, run `npx playwright install --with-deps chromium`. The helper creates an isolated network, database, and local-only test credentials, enables local test email auto-confirmation, and starts the production build. Stop it with Ctrl-C to remove only its own containers and anonymous database volume. It does not touch the hosted Supabase project. Do not use its local settings in production. Rebuild only while the local app is stopped.

## Data and backups

Every material planner edit is queued to the server and saved in one database transaction. The status bar distinguishes unsaved, saving, saved, failed, and conflicting writes. If a save fails, keep the tab open and retry or export a backup. A stale tab cannot silently overwrite a newer revision.

**Export workspace** includes every project and view preferences. **Import workspace** validates a versioned JSON backup and asks before replacement. Project-only JSON import/export remains in Settings. Imports do not execute HTML. A backup contains planning data, not accounts, passwords, or sessions; store it privately. Importing a full backup replaces the currently signed-in user's workspace only.

See [deployment and recovery](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [validation](docs/VALIDATION.md). Historical source briefs and prototypes are retained under `docs/reference` for comparison, not served as the application. Their offline/mock-auth instructions are superseded by the hosted implementation and the owner's decisions above.
