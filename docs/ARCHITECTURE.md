# Architecture

- `src/app`: public landing, authentication screens, protected application, and server API routes.
- `src/planner/planner.js`: preserved interactive DOM planner mounted inside a React lifecycle boundary, with scoped listeners and cleanup. Forms and keyboard behavior retain the prototype's interactions. User text is escaped and rendered HTML is sanitized.
- `src/planner/engine.js`: pure scheduling calculations extracted from the original prototype. It has no React, browser storage, or Supabase dependency; typed interfaces are in `engine.d.ts`.
- `src/planner/features.ts` and `meetings.ts`: pure epic-effort summaries and recurrence descriptions shared by the UI and regression tests. Weekly form intervals normalize to the existing `weekly`/`interval` storage model; monthly ordinals stay separate.
- `src/planner/stories.ts`: shared workstream discovery and validated batch creation of per-team work items. New-epic first-story setup and existing-epic story entry use the same implementation. One story name fans out to ordinary tasks with independent platform, assignee, effort, and ID; there is no extra parent row or third hierarchy level. A batch is validated before any workspace mutation and saved with the normal atomic snapshot. No schema migration or backup format change is needed.
- `src/lib/schema.ts`: shared validation, date/effort bounds, capacity totals, relationships, and dependency-cycle checks.
- `src/lib/autosave.ts`: serialized writes, coalescing, failure retention, retry, and explicit conflict resolution.
- `supabase/migrations`: version-controlled additive PostgreSQL schema and ownership functions.

## Security and persistence

Supabase owns authentication identities and password hashing. Next.js uses the supported Supabase SSR session mechanism with HttpOnly, SameSite=Lax cookies (Secure in production). Browser code never receives a service-role key or a management token. Private routes validate the user on the server; mutations require the configured same origin. Authentication uses provider rate limits plus short-lived hashed-IP buckets in a private database schema. Logs contain operation/error codes, not passwords or planner contents.

Google registration and login share `/api/auth/google` and the existing `/auth/callback` code exchange. The POST endpoint enforces same-origin and the login attempt limit, checks provider availability, then generates a Google OAuth URL using the real Supabase SSR PKCE client. The verifier and session stay in HttpOnly cookies. The callback accepts no custom destination and redirects successful exchanges to `/app`; provider cancellation and exchange failures return fixed notices to `/login`. Google client credentials are held only by Supabase. Workspace ownership depends on the resulting Supabase user ID, regardless of identity provider.

Each user owns one workspace; memberships are schema-ready for future development but invitations are not implemented. Planner team members are planning resources, separate from authenticated users.

Domain entities are stored separately: projects, features, roles, people, iterations, recurring meetings, work items, time off, holidays, milestones, project settings, capacity settings, dependencies, meeting attendees, and milestone links. Extensible non-relational attributes use JSONB; entity identities and references are relational. Composite foreign keys scope every reference to its workspace and project. Identical legacy IDs in two users' backups do not collide.

All private tables have RLS. Authenticated users receive read access only through their memberships; anonymous reads and all direct table writes are revoked. Mutation RPCs derive the workspace from `auth.uid()` rather than accepting a client-supplied owner/workspace ID. Their `SECURITY DEFINER` functions use an empty search path and explicitly check identity/ownership. Functions are not executable by anonymous users, except the rate limiter, whose private buckets cannot be read.

For this single-owner editing model, a complete validated workspace is saved atomically into normalized rows. A row lock and expected revision protect concurrent tabs/devices. Failed constraints roll back the entire transaction. Full snapshots favor reliability and preserving the prototype's model; large workspaces or future collaboration should introduce finer-grained operations instead of lifting the tested limits without measurement. The UI does not auto-merge conflicting edits.

Browser storage is not the data source. Refresh/login from another browser reads the same database. A failed initial load shows a retry screen and never falls back to demo content. The scheduler's output is derived; visual filters do not modify forecasts or reorder work.

Epic effort defaults to the sum of all child estimates. The optional validated `effortOverride` feature attribute stores a manual estimate, including zero. Removing it restores automatic totals. It is preserved in the existing JSONB feature document and portable backups, so this extension requires no database migration. Manual totals do not duplicate resource allocations or replace work-item-based forecast dates.

Per-team story rows preserve their entered estimates, including fractional work days, and share the selected earliest start. Their visual order follows the team list; dependency chaining is opt-in. The scheduler does not infer Backend → Frontend → QA dependencies or reorder work based on capacity. Each row is editable independently through the existing work-item inspector. Dependency labels and the epic work breakdown include platform names so repeated story titles remain distinguishable.
