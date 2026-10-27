# Orbit Roadmap Planner

Roadmaps that adapt to reality: features and work items, dependencies, real team capacity, recurring meetings, time off, and milestones.

Live verification release: **https://orbit-sigma-nine-72.vercel.app**. Registration uses immediate sessions while email confirmation is temporarily disabled by owner approval. Automatic Git deployment remains pending; see the delivery scope below.

Orbit is a Next.js App Router application backed by Supabase Auth and PostgreSQL, intended for Vercel. The supplied interactive planner is preserved; its scheduling engine has been extracted from rendering and persistence. No account is seeded with sample data.

The source repository `gubasv93/orbit` is public with owner approval.

## Current delivery scope

- Email/password registration, login, secure server-managed sessions, and logout.
- Google registration/login via Supabase OAuth with server-side PKCE. Enable the Google provider with your own web OAuth client using the [setup guide](docs/DEPLOYMENT.md#google-registration-and-login).
- Passwords require at least 8 characters, a letter and a number, and at most 72 UTF-8 bytes, matching Supabase's native limit (owner approved).
- Public registration approved by the owner; email confirmation is temporarily disabled so registration works without SMTP. Email addresses are unverified during this period.
- SMTP configuration and all forgot/reset-password functionality are intentionally deferred by the owner.
- No invitations, billing, or collaborative editing.
- The selected hosted Supabase project has Orbit's migration and password policy applied. Hosted persistence and account isolation were exercised with temporary test accounts.
- Vercel project `orbit` is deployed on the owner's existing Hobby plan. Live login, onboarding, persistence, and account isolation passed with temporary confirmed test accounts. Git integration requires the owner to authorize Vercel's GitHub app. Hobby's commercial-use restrictions must be resolved before commercial launch.

## Development

Use Node.js 24 and the existing checkout; cloud tasks are already isolated and do not need a Git worktree.

```bash
npm ci
cp .env.example .env.local
# Supply the project's publishable/anon key in .env.local or secure runtime settings.
npm run dev
```

Application configuration is server-only: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `APP_URL`, `SIGNUP_MODE`, and optionally `SIGNUP_ALLOWED_EMAILS`. The public/anon key is sufficient; the app never needs a service-role key. Keep all environment files out of Git. `APP_URL` must be the exact origin used to open the app. Configure preview environments with their own exact origin.

`SIGNUP_MODE=public` enables registration. Other values restrict registration to the comma-separated `SIGNUP_ALLOWED_EMAILS`. Supabase must also permit email sign-ups. The owner approved temporarily disabling email confirmation after the built-in sender's two-emails-per-hour quota blocked registration. Re-enable confirmation only after configuring and verifying a production sender; the auth-configuration script preserves the current confirmation setting.

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

Use **Add feature** in the roadmap's **FEATURE / WORK ITEM** header to create an epic without leaving the table. Each epic shows the total effort of its work items, including work hidden by the current filters. In the epic inspector, **Effort estimate → Manual estimate** sets an override; **Sum of work items** restores automatic calculation. You can also enter an optional manual total while creating a feature. Estimates use work days; delivery dates still follow the scheduled work items.

To estimate one user story across teams, enter **First user story (optional)** while creating a feature, then choose the involved teams under **Teams & estimates**. For example, create **Disable Rules**, enter **Add a specific rule**, and select Backend (3 days), Frontend (2 days), and QA (2 days), with a separate assignee for each. Saving creates three consecutive work-item rows under that epic with 7 work days of total effort. If the story name is blank, the feature name is used. Teams and estimates are explicit; unchecked teams create no work.

For an existing epic, use its **+** button on the roadmap (**Add user story**) or **Add user story** in its inspector. Only matching platform members are offered for each team; Unassigned is also available. Custom workstreams from your project are supported. The generated rows start independently by default: drag their bars or edit dependencies to choose execution order. **Link selected teams as dependencies in the order shown** is an optional shortcut. Individual forecasts continue to use the assignee's capacity, meetings, and time off. The inspector's **Add task** action remains available for a single work item.

For an event every Thursday, choose **Repeat → Weekly**, **Repeat every (weeks) → 1**, and **Day of week → Thursday**. Use 2 weeks for every other Thursday, or Monthly for an ordinal such as the second Thursday of each month. The preview shows the saved cadence and upcoming dates. Existing meetings keep their saved cadence until edited.

Meetings include the entire team by default. Clear **Entire team** to select specific attendees; larger teams have a search field, and the selected count remains visible while searching. The meeting cannot be saved with no specific attendees selected.

Every material planner edit is queued to the server and saved in one database transaction. The status bar distinguishes unsaved, saving, saved, failed, and conflicting writes. If a save fails, keep the tab open and retry or export a backup. A stale tab cannot silently overwrite a newer revision.

**Export workspace** includes every project and view preferences. **Import workspace** validates a versioned JSON backup and asks before replacement. Project-only JSON import/export remains in Settings. Imports do not execute HTML. A backup contains planning data, not accounts, passwords, or sessions; store it privately. Importing a full backup replaces the currently signed-in user's workspace only.

See [deployment and recovery](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [validation](docs/VALIDATION.md). Historical source briefs and prototypes are retained under `docs/reference` for comparison, not served as the application. Their offline/mock-auth instructions are superseded by the hosted implementation and the owner's decisions above.
