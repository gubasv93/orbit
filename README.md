# Orbit Roadmap Planner

Roadmaps that adapt to reality: features and work items, dependencies, full-work estimates, recurring meetings, time off, and milestones.

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

## Roadmap controls

- Scroll horizontally to earlier or later dates at every scale. The calendar slides a bounded window, retaining focus and the same screen dates. **Today** returns to the current date; Earlier/Later remain available. Scrolling never changes task dates.
- New estimates use **0.5-day steps**, with a minimum of 0.5 days. Automatic bars end at the actual half-day boundary. Recurring meeting intervals are merged per person/day and deducted using exact minutes. The combined meeting time across the entire work item is rounded up once for the bar; 0.25 day reserves 0.5. A 30-minute daily never reserves half a day every day. Details show actual hours separately. Existing finer estimates load without being rewritten and are rounded up only for scheduling.
- The assignee avatar in each work-item row opens a direct selector containing matching people and Unassigned. Exact-role filtering applies where a role is set; legacy items use platform matching. Reassignment saves normally and recalculates that person's calendar.
- The chart uses compact rows, one main toolbar, an inline legend, and visible mobile date navigation. Unused availability is removed. Deliberately longer manual windows retain blank space without labelling it as work.

- Drag either edge of a task or epic bar to set its manual date window. Start handles snap to dates and end handles to half days. Arrow keys resize a focused handle; Escape or pointer cancellation discards the preview. Estimates and child dates are preserved; short windows show a warning. Choose **Automatic forecast** in item details to restore effort-based dates.
- Drag the dotted row grip to reorder epics with their children, reorder work items, or move a work item to another epic. Click the grip for a keyboard/mobile **Move item** menu. These actions preserve dates, estimates, assignees and dependencies.
- Estimates include all delivery work. Team allocation percentages are retired; old values stay in backups but do not reduce forecasts. Recurring meetings, weekends, enabled public holidays, days off and sick leave extend the calendar duration. Each bar has one total color section per category, with a numeric breakdown in item details.
- **General settings** (header gear) controls dependency behavior for each project. Arrows default to manual placement. Enable **Auto-shift dependent work items** to choose a calendar/working-day gap and either push overlapping starts or follow predecessor finishes. Timing warnings can be hidden separately. Turning auto-shift off retains the displayed dependent starts.
- Open **Meetings** directly from the header or **Recurring meetings** in the sidebar; editing remains available in General settings and project setup. Time off and holidays remain in the sidebar.

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

To estimate one user story across teams, enter **First user story (optional)** while creating a feature, then choose the involved teams under **Teams & estimates**. For example, create **Disable Rules**, enter **Add a specific rule**, and select Backend Developer (3 days), Frontend Developer (2 days), and QA Engineer (2 days), with a separate assignee for each. Saving creates three consecutive work-item rows under that epic with 7 work days of total effort. If the story name is blank, the feature name is used. Teams and estimates are explicit; unchecked teams create no work.

For an existing epic, use its **+** button on the roadmap (**Add user story**) or **Add user story** in its inspector. **Teams & estimates lists your project's roles**, such as Backend Developer and Backend Reviewer, separately even when they share a platform. Only members of the selected role are offered; Unassigned is also available. Unselected roles occupy a compact single row; selecting one reveals its assignee and estimate. The generated rows start independently by default. **Link selected teams as dependencies in the order shown** is an optional shortcut. The inspector's **Add task** action remains available for a single work item.

Roadmap bars distinguish **effort from calendar duration**. For example, 6 work days at 50% feature allocation span 16 calendar days when starting on a Monday. Each color appears once across the whole bar, proportional to the total development, bug fixes, ongoing work, other ops, meetings, non-working days, or unused availability. All timeline scales show this same total breakdown; the colored sections represent shares of the complete span. Hover a bar or open its details for the numeric breakdown. Epic bars average the mix across active child work items, while epic effort still sums person-days separately.

Connect work items directly on the map: drag the circle at a predecessor's right edge to a dependent work item, or click the source circle and then a target circle. Links are finish-to-start, persist in the existing dependency list, and reject cycles. Select an arrow and use **Remove selected dependency** or Delete to remove it. Hidden rows hide their arrows without deleting links. The dependency checkboxes in the inspector remain available.

Work-item and epic details show **Start date** and **End date** from the graph. Editing the end switches to a **Manual date window**; switching **Date mode** back to **Automatic forecast** restores calculation. Moving a work-item bar shifts both manual dates together. Effort is never changed to fit a window: if capacity is insufficient, the item shows the unscheduled effort. Dependencies may shift a dependent manual window together. An epic's manual window controls its parent bar; child forecasts stay intact and an explicit warning identifies children outside that window. Baseline deadlines remain separate targets.

For an event every Thursday, choose **Repeat → Weekly**, **Repeat every (weeks) → 1**, and **Day of week → Thursday**. Use 2 weeks for every other Thursday, or Monthly for an ordinal such as the second Thursday of each month. The preview shows the saved cadence and upcoming dates. Existing meetings keep their saved cadence until edited.

Meetings include the entire team by default. Clear **Entire team** to select specific attendees; larger teams have a search field, and the selected count remains visible while searching. The meeting cannot be saved with no specific attendees selected.

Every material planner edit is queued to the server and saved in one database transaction. The status bar distinguishes unsaved, saving, saved, failed, and conflicting writes. If a save fails, keep the tab open and retry or export a backup. A stale tab cannot silently overwrite a newer revision.

**Export workspace** includes every project and view preferences. **Import workspace** validates a versioned JSON backup and asks before replacement. Project-only JSON import/export remains in Settings. Imports do not execute HTML. A backup contains planning data, not accounts, passwords, or sessions; store it privately. Importing a full backup replaces the currently signed-in user's workspace only.

See [deployment and recovery](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [validation](docs/VALIDATION.md). Historical source briefs and prototypes are retained under `docs/reference` for comparison, not served as the application. Their offline/mock-auth instructions are superseded by the hosted implementation and the owner's decisions above.
