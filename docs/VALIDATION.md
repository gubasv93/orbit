# Validation record

Current accounted-time color fix (2026-10-28): task and epic colors normalize to the sum of positive accounted categories and end at exactly 100%, so manual slack and gaps between children do not leave an unlabeled transparent tail. Estimates, date windows, allocations, category-day totals and meeting hours remain unchanged. An epic date window outside its active children omits the empty mix and displays a labeled neutral pattern. No unused-work category is reintroduced.

Three added unit cases cover automatic epic gaps, multiple colors inside a longer manual window, unchanged breakdown data and the zero-total state. A browser journey verifies filled task/epic mixes at every scale, unchanged cloud data and manual dates, actual effort in the inspector, mobile rendering and a labeled zero-total state. Existing date dragging, resizing, epic movement and dependency journeys remain included.

Earlier whole-epic movement update (2026-10-28): four new unit cases cover an atomic common date offset across manual windows, half-day ends, completed dates and hidden/collapsed children; unchanged estimates, references, order and fixed targets; rejection of invalid/boundary-crossing edits without partial mutation; and automatic calendar reforecasting. Two browser journeys exercise group previews and dependency paths, release-only persistence, Escape/pointercancel rollback, filters/collapse, keyboard/mobile movement, save/reload and automatic date mode. Existing resize, task-drag, dependency and row-order journeys remain included.

Earlier UI, resizing and recurring-meeting update (2026-10-28): the 91-test unit/auth/PostgreSQL/RLS suite and all 32 production-build browser journeys passed locally with no failures or skipped cases. Seven new unit cases cover bounded half-day manual windows, retained estimates and child dates, backup precision, exact daily meeting availability and the reported six-day estimate with daily/weekly/fortnightly events. That deterministic fixture counts 390 actual meeting minutes, reserves one meeting day for the whole bar, and spans nine calendar days, rather than reserving half a day for each short daily. Actual project dates and attendees determine each user's forecast.

Three additional browser journeys verify task/epic edge resizing, half-day ends, keyboard adjustment, Escape cancellation, date-mode restoration, persistence and mobile interaction; direct meeting access/edit/pause/reload with actual hours; and long labels/forms at 320, 375, 768, 1100 and 1440 pixels. Layout checks include header boundaries, attendee alignment, dialog overflow, narrow sidebar controls and chart height within its viewport. Full regression caught and fixed resize handles intercepting dependency targets at coarse zoom, plus an unconstrained inner canvas that prevented long-roadmap scrolling. Dependency linking, row auto-scroll and all prior product journeys now pass together. Screenshots are retained under ignored test-results/.

Earlier chart update (2026-10-28): 12 additional unit cases cover true half-day task/epic spans, quarter-day meeting reservation, aggregate rounding after meeting overlap removal, full-day reservations, fractional finishes around weekends, blank manual windows, compatible legacy inputs, exact-role inline assignment and calendar reforecasting, buffered windows at every scale/viewport, screen-position preservation and calendar bounds. Existing prototype comparison now isolates unchanged no-meeting calendar behavior; meetings have dedicated rounding assertions.

Four added browser journeys exercise bidirectional scrolling across every scale, past tasks, Today and focus retention, actual half-width bars, 0.25-day input rejection/0.5-day creation, rounded meeting shares with exact stored minutes, no unused-work display, inline assignees/reload/unassignment/role rejection, compact desktop geometry, and mobile navigation/layout. Earlier product/setup/story/dependency regression journeys remain included. For long bars, date-drag assertions use their visible portion beyond the sticky metadata column.


Earlier roadmap update (2026-10-27, before half-day planning): the local suite covers manual-by-default dependency settings, push/follow scheduling, calendar/working gaps, warning visibility, legacy start pinning, retired percentage allocations, row ordering and reparenting, persistent array positions, and unchanged task data. The six-effort-day case now spans eight calendar days (75% development, 25% weekends), regardless of archived 50% allocation. Another case partitions eleven calendar days into 6d development, .875d recurring meetings, 2d weekends, 1d days off, 1d sick leave and .125d unused availability. Observed holidays are tested separately. Each category has one contiguous color section at every zoom. Parent calendar mixes remain distinct from summed effort.

The browser regression suite covers compact role selection, exact-role assignees, manual/automatic date windows, shortfalls, horizontal bar movement, graph creation/removal and cycle rejection, project-specific dependency settings, preserved positions after disabling auto-shift, mobile General settings, vertical row reordering, moves between epics, keyboard/mobile Move item controls, cancellation and save/reload. It also verifies that Team capacity controls are gone while recurring meetings remain editable. Existing authentication, ownership, backup/import, save recovery, setup, attendee selection and per-role story journeys remain included. Hosted release evidence is recorded separately below.

Google OAuth update (2026-10-24): the suite adds 12 route tests using the actual Supabase SSR client and PKCE cookie/exchange implementation against a substituted provider HTTP boundary. They cover fixed redirect destinations, account choice, secure proof-key/session cookies, matching/missing/changed proof keys, replay rejection, cancellation, provider errors/outages, cross-origin denial, restricted registration, and shared login throttling. Three browser journeys cover both entry buttons, inline failures with usable email login, mobile layout, callback notices, and real server-cookie persistence before navigation to Supabase. The disposable backend enables Google with deliberately invalid local-only placeholders; the browser captures the authorization navigation without making Google requests. This is application-flow validation; real Google consent and identity linking require the owner's OAuth client configuration and a Google account, and must not be reported as verified until exercised.

Validated through 2026-10-27 in the Codex Linux cloud workspace using Node.js 24.19.0 and system Chromium. Local suites and live release checks are distinguished below.

| Check | Observed result |
| --- | --- |
| TypeScript check | Passed |
| Next.js production build | Passed |
| Unit, auth-route, and PostgreSQL/RLS suite | 98 tests passed, 0 failed, 0 skipped |
| Production-build browser journeys with real local backend | 35 journeys covering the preserved product, setup, Google entry, role-based stories, full-time forecasts, absences, manual dates, dependency preferences, and row ordering |
| Full dependency audit, including development dependencies | 0 vulnerabilities reported |
| GitHub CI | Required for each pushed source commit; results are recorded in GitHub Actions |
| Live HTTPS release and authenticated journeys | Release-specific checks are required after Ready and canonical-alias verification. Public email delivery remains deferred |

The earlier October 28 chart release (150288638360221be81ac19d4218b86596106c3b) reached Ready at the canonical site after network access was restored. Its four live chart journeys passed and the exact temporary account/workspace cleanup was verified. The new source follows the same CI, Ready/source/alias, public-signup verification and exact-account cleanup procedure; a local pass alone is not a publication claim. Current deployment evidence is retained under ignored .vercel/ files rather than embedding management credentials in source.

## What was exercised

The unit suite compares scheduling output against the complete supplied prototype sample and verifies full-availability effort, weekend/leave/holiday behavior, all recurrence families, overlapping meeting aggregation, iteration capacity, dependency holds/resumption, parent forecasts, and overbooking without task reordering. Validation tests cover relationships, dependency cycles, CSS-like values, invalid dates, password rules, and multibyte password limits. Autosave tests verify serialization, returned revisions, latest-edit retry, and conflict retention.

PGlite runs the actual PostgreSQL migration, roles, grants, RLS, and RPCs. It verifies empty/idempotent bootstrap, full domain roundtrips, duplicate project IDs across separate users, cross-user reads and direct writes on all private tables, anonymous denial, stale-write rejection, transactional rollback, and auth-attempt limits.

The browser suite runs the optimized Next.js build with real GoTrue 2.197.0, PostgREST 16.5, and PostgreSQL 16 in disposable Docker containers. Local-only email auto-confirmation avoids any SMTP simulation or dependency. Browser tests cover:

- Empty-account registration with a 72-byte password, secure cookie attributes, and no browser-local business/auth storage.
- First project, standard/custom team roles, recurring meetings, generated work items, refresh, and persisted data.
- Logout, failed/correct login, a second browser, a second user, and identical project IDs without cross-account changes.
- Work-item effort/status, recurring meetings, time off, milestones, all five timeline scales, AND-combined filters, and sidebar controls.
- Task and milestone dragging with unchanged task order.
- Repeated project setup copy without duplication, attendee-ID remapping, full export/import equality, and invalid-import retention.
- HTML-like imported text without script execution.
- Injected save failure, unsaved backup export, retry, and stale-tab conflicts.
- Responsive landing/auth screens, protected data routes, cross-origin mutation rejection, and POST-only password submission when JavaScript is unavailable.

The UI screenshot was visually checked against the reference design. Local browser artifacts are generated under ignored `test-results/`.

The setup/effort regression suite distinguishes weekly Thursdays, fortnightly Thursdays, monthly second Thursdays, and Sundays; checks actual preview dates and per-attendee meeting capacity; and exercises search, selection retention, checkbox sizing, mobile dialog actions, saved recurrence edits, and legacy weekly records with an unused interval of two. Epic tests cover total effort across all children, completed work, changes to child estimates, manual overrides (including zero), clearing an override, filtering, creation inside the table, mobile visibility, database persistence, and backup validation. Existing saved meeting cadences are not silently converted.

## Hosted Supabase verification

The selected project `vvvptboxmyibdfzfqxzz` (gubasv93's Project, eu-west-1) was healthy. Both versioned migrations were applied through the authenticated management API. All 18 private tables have RLS enabled, no anonymous SELECT grants, and no direct authenticated write grants.

At the initial release, temporary, explicitly confirmed test accounts exercised real hosted Auth login, empty workspace bootstrap, browser onboarding, a feature save/reload, HttpOnly sessions, logout, full normalized domain roundtrips, identical project IDs across users, cross-user denial on all 18 private tables, direct-write denial, stale-write rejection, and invalid-reference rollback. Test accounts and their workspaces were removed. Administrator confirmation applied only to these test accounts. Global confirmation was initially required; the owner subsequently approved disabling it temporarily to unblock registration.

The hosted stale-write check exposed a transport timeout for SQLSTATE `40001`. An additive migration changes business revision conflicts to `PT409`; the hosted API then returned HTTP 409 promptly and retained the saved snapshot. Unit and local real-backend tests cover the updated migration.

Public registration is enabled and passwords require 8 characters, a letter, and a digit, with the native 72-byte maximum. Initial public test registration was rejected with `email_address_invalid`; a later attempt returned HTTP 429 / `over_email_send_rate_limit`. The same quota blocked the owner's registration. The hosted auth configuration confirmed a two-emails-per-hour project-wide sender limit, confirmation required, and no custom SMTP. With explicit owner approval, `mailer_autoconfirm` was set to true while preserving sign-up, password, sender, site, and redirect settings. Public sign-up no longer requires an email. SMTP and forgot/reset-password remain deferred.

After that configuration change, real public registration through the live browser created a session and empty workspace with Secure HttpOnly cookies. Onboarding, save/reload, logout, and subsequent password login passed. Retrying public sign-up for a deliberately unconfirmed test account also returned an immediate session. These accounts were registered through the normal application endpoint; no administrator confirmation was used. All temporary accounts and their workspaces were removed. Type checking, the 23-test unit/database suite, and the production build passed for the clearer error-message change.

## Earlier deployment evidence (historical)

Source is pushed to the owner-approved public `gubasv93/orbit` repository. [GitHub CI](https://github.com/gubasv93/orbit/actions/runs/39956953944) passed all stages on deployed commit `076a2e6fe9737b9725cc757c705de305217b7f5f`. Later documentation updates do not change the deployed application payload.

Vercel project `orbit` exists in `gubasv93s-projects` on the existing Hobby plan, with Node.js 24 and encrypted production variables. Deployment `dpl_H4SCa4oLE48u74ytiVqCvyXQn1Sp` reached Ready at **https://orbit-sigma-nine-72.vercel.app**. Live checks verified the landing page, health, CSP/HSTS/nosniff headers, anonymous API denial, real login/logout, custom team and meetings, feature creation, save/reload equality, timeline scales/filters, Secure HttpOnly cookies, a second user's empty workspace, protected-page redirect, account isolation, conflicts, and rollback. All temporary test accounts and their workspaces were removed.

Chromium did not trust the environment's HTTPS inspection CA. Automatic approval review rejected a persistent trust-store change because it would broaden future browsing trust. Live browser requests instead used temporary Playwright routing through its Node TLS client with the existing environment CA and proxy; certificate validation remained enabled. Normal HTTPS requests independently verified the public site and protected endpoints. Browser-native certificate-store validation remains an environment limitation.

Git linking and automatic deployments are blocked until the owner authorizes Vercel's GitHub app. GitHub also denies this integration permission to write repository secrets, so an Actions deployment credential was not installed. Future manual deployments are documented in `DEPLOYMENT.md`. No paid subscription changes were made; Hobby's commercial-use restrictions still apply.
