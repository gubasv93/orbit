# Orbit Roadmap Planner — Online Entry, Authentication & First-Project Experience

**Status:** implementation brief for Codex · 2026-10-23

## 1. Direction and overriding decisions

Orbit is transitioning from a local single-file Chrome prototype to a **hosted web application** for one initial real user, with a later path to a multi-user SaaS product.

This specification **overrides the offline-only, double-click `file://`, IndexedDB-as-primary-store, and no-backend requirements** from earlier handoff documents. Preserve the existing product functionality, visual design, user-facing capacity logic, and interactive Gantt. This update is about product entry, real authentication, user-owned persistence, and a safe path toward public usage.

- Target initial hosting: **ChatGPT Sites**, if the available runtime can securely implement all required server behavior. Verify the actual supported features first. If it cannot, use a supported external managed authentication/backend or propose a straightforward alternative deployment. Do **not** silently downgrade to browser-only mock auth for production.
- MVP audience: **one real owner**; structure must support independent users and workspaces later.
- No social authentication, invitations, billing, or collaboration in MVP.
- Product UI language: **English** (existing planner UI is in English); future localization optional.
- User entry flow: **public one-page landing → email/password sign-up or sign-in → empty private workspace → create first project → 2-step project onboarding → roadmap**.

## 2. Required routes and screens

### Public one-page landing (`/`)

- Header: Orbit logo, **Log in**, **Get started**.
- One clear hero, e.g. **“Roadmaps that adapt to reality.”**
- One supporting paragraph about timeline, team capacity, recurring meetings, leave, and dependencies.
- Primary CTA **Start planning** → `/signup`.
- Secondary CTA may preview **sample roadmap** using **public, read-only example data only**, never exposing an account's private projects.
- One lightweight visual screenshot/illustration of Gantt; simple responsive layout.
- Do not add pricing, testimonials, enterprise sales, feature catalogs, newsletter popups, social login, or unnecessary navigation.

### Sign up (`/signup`)

Fields:
- **Email address:** required, trim and normalize case, valid email format, max 254 chars.
- **Password:** required, 8–128 characters, containing at least one letter and one digit; spaces and common symbols allowed. Never require arbitrary complexity beyond this user-specified MVP rule.
- **Confirm password:** required, must match.

Behavior:
- Inline validation and accessible error messages.
- If successful, create authenticated account and **empty personal workspace**; establish a secure session and redirect to `/app`.
- No social login and no required team/project info during sign-up.
- No sample project preloaded into a real account.
- If email is already registered, show a clear error with **Log in** and **Forgot password?** links. Avoid leaking registered emails through unauthenticated APIs where practical.
- Email verification may be deferred initially so onboarding remains immediate; log it as a decision and add anti-abuse protections. Verification should be added before broader public rollout.

### Sign in (`/login`)

- Fields: email, password.
- **Log in**, link to **Forgot password?**, link to **Sign up**.
- Generic invalid-credentials message, no user enumeration; rate-limit attempts.
- Successful login returns to the authenticated application, or first-project empty state if no projects exist.
- Keep user signed in with secure server-managed session until logout/expiry.

### Forgot password (`/forgot-password`)

- User enters email and submits **Reset password**.
- Always show generic confirmation (“If an account exists, we'll send a link.”).
- Send an actual transactional email with a **single-use, cryptographically random, expiring reset token** (15–30 minutes recommended). Store only its hash server-side. Never put raw passwords in emails.
- Email delivery requires a real configured provider and a verified sender domain; no client-side fake send or hardcoded token.

### Reset password (`/reset-password?token=...`)

- Server validates token and expiry.
- Fields: new password, confirm new password; same password validation rules.
- Token invalid/expired: show error and **Request a new link**.
- On success, invalidate token and existing sessions if feasible, show **Password updated**, send user to Log in.

### Log out

- Available from account menu within Orbit; invalidate server session and return to the public landing/sign-in screen.

## 3. First-run user flow

A newly registered user has zero projects and is never shown the “Project Atlas” sample data.

1. Show friendly empty-state inside private `/app`: **“Let's create your first project.”**
2. **Create your first project** opens project-name form (required, 1–100 chars).
3. Continue the **existing two-step onboarding**:
   - **Step 1 — Add team**: enter first name, last name, free-text job role. New role automatically creates/matches an available platform/workstream. Add multiple people, optionally copy team/roles/capacity from another *user-owned* project; allow skip.
   - **Step 2 — Add recurring meetings**: choose name, start time, duration, recurrence (workdays, weekly, every N weeks, nth weekday of month), members or whole team, start/end date; optionally copy meetings from another *user-owned* project; allow skip.
4. Finish → existing full roadmap, with feature creation, work item assignment and platform selection.
5. Returning user → last active project and view; an account with no projects → first-project empty state.
6. For an account with multiple projects, retain switch and create-project behavior.

## 4. Preserve the entire existing Orbit planner

Do not regress Gantt, feature/task hierarchy, statuses (Planned/In Progress/On Hold/Done), dependencies, drag scheduling, parent feature dates, milestone lines, Days/Weeks/Months/Quarters/Years scales, filtering by person and platform, collapsible side navigation, team members and roles, dynamic platform selectors, per-person and iteration capacity, buffer allocation, overlapping recurring meeting deduction, vacations/leave, working days/holidays, project import of team and meetings, and existing settings. Maintain visual density and timeline layout.

## 5. Data ownership and scalable schema

Choose server-managed data models appropriate for the available managed database. At a minimum:

- `users`: id, email_normalized (unique), password_hash, created_at, updated_at, email_verified_at (nullable).
- `sessions` or a provider-supported secure session mechanism.
- `workspaces`: id, owner_user_id, name, created_at.
- `workspace_memberships` (optional now but schema-ready): workspace_id, user_id, role.
- `projects`: id, workspace_id, name, created_at, updated_at.
- Domain tables, or well-structured JSON documents with validated ownership: `features`, `tasks`, `roles`, `people`, `meetings`, `leave`, `iterations`, `milestones`, `holidays`, and `settings`.
- `password_reset_tokens`: id, user_id, token_hash, expires_at, consumed_at.

**Mandatory**: project IDs alone must never grant access; every private API checks the authenticated user's ownership/membership in the workspace. Test cross-user access denial for every read and write. A human team member listed in a roadmap is **not** an authenticated account automatically.

## 6. Real security requirements (non-negotiable for an online product)

- All passwords processed on the server and hashed with **Argon2id or another widely accepted password KDF** (e.g. bcrypt) using suitable parameters; no recoverable password storage.
- No passwords, hashes, reset tokens, secret keys, or private API credentials in localStorage, IndexedDB, HTML bundles, client state logs, or public code.
- Sessions use HttpOnly, Secure, SameSite cookies or equally secure provider-supported tokens; validate authorization server-side for all mutations.
- TLS/HTTPS, reasonable rate limits on sign-up/login/reset, CSRF protection where appropriate, secure error handling.
- Transactional email credentials in server-side secrets, not client bundle.
- Protect against enumeration and repeated reset abuse; no open redirect in reset links.
- Use schema validation and safe database queries; avoid introducing an unnecessary custom cryptography implementation.
- Before launch, test account isolation and security with **two distinct user accounts**.

## 7. Persistence and migration

- Hosted account data must persist across devices and browser sessions in a durable server-side database; **browser localStorage is not the source of truth**.
- Autosave every material edit with clear pending/saved/error states. Handle save failures and transient connectivity clearly; don't claim saved when it isn't.
- Existing current local prototype data may be preserved via **Import from JSON** or an explicit one-time migration route; do not silently merge demo seed into a registered user's account.
- Keep JSON backup export for owner-controlled portability.

## 8. UI/UX expectations

- Clean, bright, restrained visual style, Orbit purple palette, typography and rounded controls consistent with current planner.
- Responsive marketing and auth screens (mobile and desktop); core timeline remains optimized for desktop but must not break the layout.
- Keyboard navigation, readable labels, associated form labels, proper focus states, role="alert" for errors, show/hide password toggle optional.
- Minimal steps: registration should take roughly one minute; no compulsory profile questions.
- After sign-up or sign-in, a real authenticated route must be directly refreshable and deep-linkable.

## 9. Acceptance test matrix

1. Unauthenticated visitor can view landing but cannot reach private data/API via URL.
2. Sign-up with valid email, matching 8+ alphanumeric password creates a user with an empty workspace; no fake Project Atlas appears.
3. Invalid email, password too short, missing letter/number, mismatched confirmation, duplicate email are handled.
4. Sign out and log back in preserves projects, team, milestones, meetings and task data across devices.
5. `Forgot password` actually sends a reset email; token invalid/expired/reused behavior is secure.
6. Complete first-project onboarding: enter role free-text, verify platform appears when making a work item; recurring meetings affect capacity forecast.
7. Skip team + meetings and create first feature later.
8. Different accounts cannot access or modify each other's projects by ID or API calls.
9. Repeated logins/logouts, refreshes and navigation don't duplicate records.
10. All Gantt views, capacity logic, leave, milestones, dependency recomputation and editing still work.
11. Test real hosted preview and production URL **only after** backend auth and persistence are verified.

## 10. How Codex should execute

1. Inspect the supplied `orbit_online_entry_prototype.html`: it **only mocks auth screens**, with no real identity validation, emails, server storage or permissions. Do not publish this demo as real authentication.
2. Review this spec and the existing Orbit implementation spec; where they conflict, this document wins.
3. Check the selected deployment runtime (ChatGPT Sites if available) for server routes, durable DB, email/secrets, password hashing libraries, auth and external integration support. **Do not assume D1/password auth is supported without verifying.**
4. Explain any blockers and pick the simplest secure supported stack. Prefer managed auth/backend to writing a password system from scratch if it satisfies email/password and reset flows. No social providers.
5. Build the real hosted implementation, including an appropriate DB schema, migrations, services, tests, and minimal landing/auth routes.
6. Preserve the existing planner UX and business logic; replace the mock authentication and browser-only data with secure identity and server persistence.
7. Run integration, regression and end-to-end tests. Explain what was tested, what still requires email/domain setup, and what deployment action the user must explicitly authorize.

**Definition of Done:** A real user can register with email/password, sign out/in, reset their password via email, create their first project, configure team and recurring meetings, work with Orbit, refresh/login from a second browser, and see the same saved private data. No other user can access those projects.
