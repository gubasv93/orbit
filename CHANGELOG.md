# Changelog

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
