# Changelog

## 0.1.0 — 2026-10-23

- Migrate Orbit to Next.js, Supabase Auth, and transactional PostgreSQL persistence.
- Preserve the interactive Gantt, capacity, team, meeting, time-off, dependency, and milestone workflows.
- Extract and regression-test the scheduler independently of rendering and persistence.
- Add empty private workspaces, two-step project onboarding, and reusable project setup.
- Add owner-scoped schema, RLS, normalized relationships, atomic saves, and revision conflicts.
- Add versioned workspace backups, safe import, save-error recovery, and secure server sessions.
- Add browser journeys against disposable real authentication and PostgreSQL services.
- Adopt owner-approved public registration and Supabase's 72-byte password maximum.
- Defer SMTP and forgot/reset-password by owner instruction.
