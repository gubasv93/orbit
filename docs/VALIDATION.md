# Validation record

Validated on 2026-10-23 in the Codex Linux cloud workspace using Node.js 24.19.0 and system Chromium. This is current-instance validation, not a production-deployment claim.

| Check | Observed result |
| --- | --- |
| TypeScript check | Passed |
| Next.js production build | Passed |
| Unit and PostgreSQL/RLS suite | 23 tests passed, 0 failed, 0 skipped |
| Production-build browser journeys with real local backend | 10 tests passed, 0 failed, 0 skipped |
| Full dependency audit, including development dependencies | 0 vulnerabilities reported |
| GitHub CI for deployed code `076a2e6` | Passed all stages |
| Live HTTPS release and authenticated journeys | Passed with temporary confirmed accounts; public email delivery unverified |

## What was exercised

The unit suite compares scheduling output against the complete supplied prototype sample and verifies calendar effort, weekend/leave/holiday behavior, all recurrence families, overlapping meeting aggregation, iteration capacity, dependency holds/resumption, parent forecasts, and overbooking without task reordering. Validation tests cover relationships, dependency cycles, CSS-like values, invalid dates, password rules, and multibyte password limits. Autosave tests verify serialization, returned revisions, latest-edit retry, and conflict retention.

PGlite runs the actual PostgreSQL migration, roles, grants, RLS, and RPCs. It verifies empty/idempotent bootstrap, full domain roundtrips, duplicate project IDs across separate users, cross-user reads and direct writes on all private tables, anonymous denial, stale-write rejection, transactional rollback, and auth-attempt limits.

The browser suite runs the optimized Next.js build with real GoTrue 2.197.0, PostgREST 16.5, and PostgreSQL 16 in disposable Docker containers. Local-only email auto-confirmation avoids any SMTP simulation or dependency. Browser tests cover:

- Empty-account registration with a 72-byte password, secure cookie attributes, and no browser-local business/auth storage.
- First project, standard/custom team roles, recurring meetings, generated work items, refresh, and persisted data.
- Logout, failed/correct login, a second browser, a second user, and identical project IDs without cross-account changes.
- Work-item effort/status, capacity, time off, milestones, all five timeline scales, AND-combined filters, and sidebar controls.
- Task and milestone dragging with unchanged task order.
- Repeated project setup copy without duplication, attendee-ID remapping, full export/import equality, and invalid-import retention.
- HTML-like imported text without script execution.
- Injected save failure, unsaved backup export, retry, and stale-tab conflicts.
- Responsive landing/auth screens, protected data routes, cross-origin mutation rejection, and POST-only password submission when JavaScript is unavailable.

The UI screenshot was visually checked against the reference design. Local browser artifacts are generated under ignored `test-results/`.

## Hosted Supabase verification

The selected project `vvvptboxmyibdfzfqxzz` (gubasv93's Project, eu-west-1) was healthy. Both versioned migrations were applied through the authenticated management API. All 18 private tables have RLS enabled, no anonymous SELECT grants, and no direct authenticated write grants.

Temporary, explicitly confirmed test accounts exercised real hosted Auth login, empty workspace bootstrap, browser onboarding, a feature save/reload, HttpOnly sessions, logout, full normalized domain roundtrips, identical project IDs across users, cross-user denial on all 18 private tables, direct-write denial, stale-write rejection, and invalid-reference rollback. Test accounts and their workspaces were removed. Administrator confirmation applied only to these test accounts; global email confirmation remains required.

The hosted stale-write check exposed a transport timeout for SQLSTATE `40001`. An additive migration changes business revision conflicts to `PT409`; the hosted API then returned HTTP 409 promptly and retained the saved snapshot. Unit and local real-backend tests cover the updated migration.

Public registration is enabled and passwords require 8 characters, a letter, and a digit, with the native 72-byte maximum. The existing confirmation and sender settings were preserved. A public test registration was rejected with `email_address_invalid`; a later attempt returned HTTP 429 / `over_email_send_rate_limit`. Confirmation delivery is unverified. SMTP and forgot/reset-password remain intentionally deferred by the owner. Public email onboarding must be verified before launch.

## Deployment status

Source is pushed to the owner-approved public `gubasv93/orbit` repository. [GitHub CI](https://github.com/gubasv93/orbit/actions/runs/39956953944) passed all stages on deployed commit `076a2e6fe9737b9725cc757c705de305217b7f5f`. Later documentation updates do not change the deployed application payload.

Vercel project `orbit` exists in `gubasv93s-projects` on the existing Hobby plan, with Node.js 24 and encrypted production variables. Deployment `dpl_H4SCa4oLE48u74ytiVqCvyXQn1Sp` reached Ready at **https://orbit-sigma-nine-72.vercel.app**. Live checks verified the landing page, health, CSP/HSTS/nosniff headers, anonymous API denial, real login/logout, custom team and meetings, feature creation, save/reload equality, timeline scales/filters, Secure HttpOnly cookies, a second user's empty workspace, protected-page redirect, account isolation, conflicts, and rollback. All temporary test accounts and their workspaces were removed.

Chromium did not trust the environment's HTTPS inspection CA. Automatic approval review rejected a persistent trust-store change because it would broaden future browsing trust. Live browser requests instead used temporary Playwright routing through its Node TLS client with the existing environment CA and proxy; certificate validation remained enabled. Normal HTTPS requests independently verified the public site and protected endpoints. Browser-native certificate-store validation remains an environment limitation.

Git linking and automatic deployments are blocked until the owner authorizes Vercel's GitHub app. GitHub also denies this integration permission to write repository secrets, so an Actions deployment credential was not installed. Future manual deployments are documented in `DEPLOYMENT.md`. No paid subscription changes were made; Hobby's commercial-use restrictions still apply.
