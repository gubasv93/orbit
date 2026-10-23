# Validation record

Validated on 2026-10-23 in the Codex Linux cloud workspace using Node.js 24.19.0 and system Chromium. This is current-instance validation, not a production-deployment claim.

| Check | Observed result |
| --- | --- |
| TypeScript check | Passed |
| Next.js production build | Passed |
| Unit and PostgreSQL/RLS suite | 23 tests passed, 0 failed, 0 skipped |
| Production-build browser journeys with real local backend | 10 tests passed, 0 failed, 0 skipped |
| Full dependency audit, including development dependencies | 0 vulnerabilities reported |

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

## Outstanding external validation

Hosted Supabase credentials and Vercel credentials have not been supplied. No migration, auth-policy update, or deployment has been applied to the selected hosted project. The Vercel project, live production URL, hosted email-confirmation behavior, production account isolation, and automatic Git deployment are unverified. SMTP and forgot/reset-password are intentionally out of scope by owner instruction.

GitHub read access is working. The repository was observed public and empty. Changing it to private was denied by the connected integration (HTTP 403). A private repository or explicit approval to push publicly is required before publishing the source. See the conversation for the latest completion state.

The migration-management and hosted-auth configuration scripts have syntax checks but have not been executed against hosted APIs. Their paths are not described as verified production setup.
