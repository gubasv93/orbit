# Changelog

## 2026-10-27

- Reorder epics and work items with a row grip; move work items between epics without altering dates, estimates or dependency IDs. Include keyboard/mobile move controls and persisted backup order.
- Retire team/iteration allocation percentages from forecasts and remove Team capacity controls. Estimates cover all work; recurring meetings and working calendars determine elapsed duration.
- Split whole-bar totals into development, recurring meetings, weekends, public holidays, days off, sick leave and unused availability.
- Default dependency arrows to manual placement. Add project-specific General settings for auto-shift, calendar/working gaps, push/follow behavior and timing warnings; preserve visible starts when disabling automatic movement.

- Render one total color breakdown across each entire roadmap bar at every scale, replacing repeated daily stripes.
- Show compact, role-based estimates and role-matched assignees, including multiple roles on one platform.
- Show effort alongside calendar duration with one contiguous color section per time category.
- Create, display, select, and remove finish-to-start dependencies directly on the roadmap, with cycle prevention and keyboard/tap support.
- Edit graph-synchronized start/end dates, choose automatic forecasts or manual windows, and flag capacity shortfalls or child forecasts outside an epic window without changing estimates.
- Estimate a user story by team while creating an epic or adding to an existing epic, with separate platform-matched assignees and exact work-day estimates.
- Create one consecutive Gantt row per selected team in a single save; leave dependency chaining optional so execution order stays manual.
- Add live estimate totals, required estimates only for selected teams, custom workstreams, and a responsive team-entry form.
- Distinguish repeated story titles by platform in dependency selection and the epic work breakdown; preserve fractional estimates in the work-item inspector.

## 2026-10-24

- Add Google registration and login buttons with server-side PKCE, same-origin checks, shared login rate limiting, and secure cookies.
- Handle disabled providers, cancelled consent, expired/replayed codes, missing proof keys, and failed exchanges without leaving users on an unusable provider error page.
- Document Google Cloud and Supabase provider setup; preserve email/password login and the existing workspace ownership model.

## 0.1.0 — 2026-10-23

- Clarify weekly versus monthly meeting setup, default weekly intervals to one, and preview upcoming occurrence dates.
- Fix attendee checkbox sizing, add searchable selection counts, and keep meeting dialog actions visible on mobile.
- Add feature creation directly in the roadmap table and automatic epic effort totals with persistent manual overrides.
- Temporarily disable email confirmation with owner approval to unblock public sign-up without SMTP; distinguish confirmation-email quota failures from excessive authentication attempts.
- Migrate Orbit to Next.js, Supabase Auth, and transactional PostgreSQL persistence.
- Preserve the interactive Gantt, capacity, team, meeting, time-off, dependency, and milestone workflows.
- Extract and regression-test the scheduler independently of rendering and persistence.
- Add empty private workspaces, two-step project onboarding, and reusable project setup.
- Add owner-scoped schema, RLS, normalized relationships, atomic saves, and revision conflicts.
- Return business revision conflicts as HTTP 409 without retryable serialization semantics; verify against the selected hosted Supabase project.
- Add versioned workspace backups, safe import, save-error recovery, and secure server sessions.
- Add browser journeys against disposable real authentication and PostgreSQL services.
- Adopt owner-approved public registration and Supabase's 72-byte password maximum.
- Defer SMTP and forgot/reset-password by owner instruction.
