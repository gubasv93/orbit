# Orbit Roadmap Planner — Codex Implementation Specification

**Version:** 1.0  
**Target:** Google Chrome on macOS  
**Product type:** Single-user, local-first HTML application  
**Status:** Implementation brief / acceptance contract  
**Starting point:** Existing Orbit prototype. **Improve it in place; do not rebuild the product from scratch.**

## 1. Mission

Turn the existing clickable Orbit Roadmap Planner prototype into a dependable personal planning tool that I can run by **double-clicking a local HTML file on my Mac and opening it in Google Chrome**.

The experience must be:

- **Offline:** use the entire app without internet access.
- **Zero runtime setup:** no hosting, backend, domain, localhost server, terminal commands, Docker, database installation, login, or cloud account needed to *use* the finished app.
- **Single user:** no collaboration, synchronization, permissions, authentication, or accounts.
- **Persistent:** changes survive closing/reopening Chrome and restarting the Mac, subject to clearly explained browser-storage limitations.
- **Portable:** the user can export all data to a local backup file and restore it in a new browser/profile/computer.
- **Safe:** updates, migration, import, and errors must never silently erase data.
- **Familiar:** preserve the existing interface and planning logic; prioritize reliability over visual redesign.

**Important distinction:** This is a local HTML app, **not** a Tauri/Electron application, a hosted website, a PWA requiring an HTTP server, or an online SaaS product.

## 2. Inputs and existing project

Work from the included project:

```text
roadmap_planner/
  index.html        # HTML entry point
  styles.css        # current UI
  app.js            # business logic, state and rendering
  README.md         # existing feature documentation
  test_logic.py
  test_ui.py
  test_timeline_controls.py
```

There is also a previously generated `orbit_roadmap_prototype.html`, a standalone page with embedded assets. Use the **source files in `roadmap_planner/` as the canonical editable source**. Avoid divergent copies of app logic.

Current persistence is mainly `localStorage` (`orbit-projects-v1`, older `orbit-roadmap-v1`, plus `orbit-view-preferences-v2`). Current **Export JSON exports only the active project's `data`**, not the whole workspace. Both points need to be addressed.

First, inspect the source and run any existing tests. Write a short list of the components you intend to change before editing. Do not discard code simply because it is prototype-style.

## 3. Scope and priorities

### P0 — required for this delivery

1. A self-contained, double-clickable, **offline HTML release** for Chrome/macOS.
2. Robust local persistence with visible save/error status and safe migration from existing saved projects.
3. Export and import of the **entire workspace**, not just one project; preserve the existing single-project export if useful.
4. A friendly **Settings → Data & backups** section with clear actions and explanations.
5. Retain current UX, Gantt calculations, multi-project functionality, and editing workflows.
6. Automated and manual validation, including **real Chrome opened via `file://`**.
7. Documentation for a nontechnical Mac user to run, back up, restore, and update the app.

### P1 — only after P0 works

1. Optional **Connect local backup file** / **Save to file** using the File System Access API **only if it actually works in target Chrome via `file://`**, detected at runtime. A permission grant must occur on explicit user interaction. Never depend on it for core operation.
2. Small quality improvements to errors, corrupt data recovery, and outdated backup handling.

### Explicit non-goals

- Online sync, accounts, invites, multi-user access, remote API calls.
- Tauri, Electron, native installer, bundled desktop runtime.
- A required Python/Node/localhost runtime for the end user.
- Integration with Jira, GitHub, Google Calendar, or other services.
- Broad UI redesign, new analytics dashboards, AI scheduling, automatic prioritization.
- Replacing existing planning logic with a new algorithm without a test-backed reason.

## 4. End-user workflow

1. Download/unzip the Orbit distribution to a permanent folder, e.g. `~/Documents/Orbit/`.
2. Double-click `Orbit.html` (or `index.html` if you choose that as the single stable shipped filename).
3. Chrome opens the full app **even with Wi-Fi turned off**.
4. Create/switch projects; edit tasks, teams, meetings, leave and milestones as usual.
5. See a clear saved/unsaved/error indicator. Save operations occur without pressing a Save button for every edit.
6. Go to **Settings → Data & backups → Export full backup**, and download one JSON containing **all projects and settings**.
7. Go to **Import full backup** on the same or another Mac/Chrome profile, validate the file, confirm replacement, and restore everything.
8. Update Orbit by replacing the app file(s) in the **same stable location**, reopening Chrome and continuing work. Even if browser storage becomes unavailable because of path/profile/origin changes, a full backup must allow recovery.

Do not promise that `Orbit.html` *contains* the user's data. Explicitly distinguish application files, browser-local autosave, and user-controlled backup files.

## 5. Preserve all existing product behaviors (regression contract)

Do **not** remove or break these capabilities:

### 5.1 Roadmap / Gantt

- Multi-project workspace and project switching.
- Strategic **feature** row with a forecast derived from child tasks.
- Expand/collapse feature into tactical work items / stories.
- Task platform/workstream, assignee, effort, remaining effort, planned start, dependencies and status.
- Statuses: `Planned`, `In Progress`, `On Hold` (no automatic restart date), `Done`.
- On Hold blocks dependent work, and releases future capacity as currently designed; resumption is manual.
- Dependency chains, automatic downstream rescheduling, blocked and deadline-risk indicators.
- Overbooking warnings for parallel tasks assigned to one person; **do not** automatically reorder the user's tasks.
- Drag/adjust on the timeline and task inspector editing.
- Manual milestones as thin vertical overlay lines; double-click time axis to create; edit or drag date; Today marker.
- Filters by **person AND/OR platform** (logical AND when both are selected) and clear filters.
- View scales: **Days / Weeks / Months / Quarters / Years** with correct header, period alignment and task geometry.
- Hide/show sidebar; compact roadmap without KPI tiles that consume timeline space.
- Display filters do **not** change the underlying feature forecast.

### 5.2 Team, planning capacity and time off

- Team settings: add/edit/remove people (first name, last name, role).
- Create/reuse roles; role-to-platform/workstream mapping; platform selector and assignee options follow team configuration.
- Pure task effort is developer work, including unit tests and code review, **not** meetings/operations.
- Per-person and iteration overrides for feature development, bugs, ongoing work and operations (% allocations totaling 100%).
- Capacity estimates reflect availability and reserved time.
- Non-working weekends, configurable holidays, personal vacations, sick days and days off.
- Ukrainian holiday dates are configurable; **do not assume every official holiday is a mandatory day off**, particularly under martial-law rules.

### 5.3 Recurring meetings

- User-defined recurring meetings, duration, start time, optional end date and specific/all-team attendees.
- Every working day, weekly weekday, every N weeks, Nth/last weekday of a month.
- Meetings subtract the actual scheduled time from daily availability, and dependent task dates update.
- Overlapping meetings are not double-deducted; keep the existing meeting aggregation rules.
- Do not double-count meeting time already excluded explicitly by recurring-meeting calculations.

### 5.4 Onboarding and reusable setup

- **New project** with exactly two skippable steps: (1) team, (2) recurring meetings; no mandatory third feature step.
- A typed new role creates a reusable role/platform when appropriate.
- Copy team/roles/capacity and/or recurring meetings from another project, either before or during onboarding.
- Do not duplicate people/events on repeated copy, and correctly remap attendee IDs.
- Do not copy roadmap tasks/features/milestones unless this is explicitly added later.
- Data belonging to different projects remains isolated.

## 6. Persistence and data integrity

### 6.1 Primary storage

- Prefer **IndexedDB** for the workspace (structured state and future larger data), with a clear storage adapter separating persistence from UI/scheduler logic.
- **CRITICAL:** IndexedDB and `localStorage` behavior for `file://` origins can be browser- and path-dependent. **Test the target Chrome/macOS behavior** before claiming autosave works. Do not assume a stable origin across renaming/moving files or browser profile changes.
- Keep a documented fallback: if IndexedDB is denied, unavailable or fails, show a **persistent prominent warning**, allow a clearly labeled temporary in-memory session, and keep **Export backup** available. Do **not** display “Saved” when only in-memory state changed.
- Read existing `localStorage` state for migration, where accessible. `localStorage` access itself may throw a `SecurityError` — handle that without crashing.
- Keep UX preferences separate from business data as appropriate, but include useful preferences in the **full workspace backup**.
- Handle writes asynchronously without out-of-order overwrites: queue or serialize writes so older state cannot overwrite newer edits.
- Handle quota, transaction errors, browser shutdown and refresh reasonably. Do not silently swallow persistence errors.
- Give feedback through an unobtrusive `Saving…` → `Saved locally` status and a clear actionable failure state.
- Consider multiple Orbit tabs (same local app/profile): prevent silent stale-tab overwrites or clearly warn/reload when external updates are detected.

### 6.2 Stored data and versioning

Use a versioned envelope; conceptual shape (adapt actual field names to existing schema):

```json
{
  "format": "orbit-workspace-backup",
  "backupVersion": 1,
  "createdAt": "<ISO 8601 timestamp>",
  "appVersion": "<release version>",
  "workspace": {
    "version": 1,
    "activeId": "project-atlas",
    "projects": [
      {
        "id": "project-atlas",
        "name": "Project Atlas",
        "data": { "version": 4 }
      }
    ]
  },
  "preferences": {
    "scale": "week",
    "sidebarHidden": false
  }
}
```

This is an **illustration**, not a license to replace the existing data model with placeholders. A real export must contain every project's complete existing `data`: features, tasks, people, roles, meeting rules, capacity, iteration overrides, time off, milestones, holidays, settings, dates and all other supported fields.

- Preserve existing IDs and dependency references on export/import.
- Use migration functions as schemas evolve; refuse unsupported **future** backup versions without overwriting existing state.
- Validate relationships and required fields before importing. Do not execute anything from imported JSON. Sanitize any user-controlled text inserted into HTML.
- Avoid `seed()`/demo-reset replacing real user data on a load or parse failure.

### 6.3 Safe migration of existing users (mandatory)

When opening the new version with legacy local data:

1. Look for the new durable workspace store.
2. If absent, look for the current multi-project key `orbit-projects-v1`.
3. If absent, look for the older single-project key `orbit-roadmap-v1` and migrate it into a workspace.
4. Read `orbit-view-preferences-v2` where available.
5. Normalize/migrate **every** project as needed (including old `people`, `roles`, meetings).
6. Verify that new persistent data has been written successfully before considering the migration complete.
7. **Do not delete legacy keys as part of the first successful migration.** Keep them for recovery, or offer a manual cleanup only after backup.
8. If stored user data exists but is malformed/unreadable, **do not initialize and overwrite it with the demo**. Show a recovery/error view and offer backup import.
9. Run migrations idempotently (repeat runs must not duplicate projects, people or meetings).

Distinguish genuine fresh install from damaged/unavailable storage. Demo content should only appear on a verified clean first run, and should never be silently substituted for missing real user data.

## 7. Backup and restore UX

Add **Settings → Data & backups**. Make the following available:

| Control | Required behavior |
|---|---|
| `Export full backup` | Download a timestamped `.json` file containing every project, current selection and preferences; independent of cloud/browser sync. |
| `Import full backup` | Choose `.json` file; parse and validate; show a preview (projects, name, backup date/version); **confirm** before replacing current workspace; protect existing data with an export/restore checkpoint if practical. |
| `Export current project` | Optional but preferable: retain current single-project export as a separate clearly named action, compatible with old output. |
| `Import current project` | Optional if current functionality exists: do not confuse it with replacing the whole workspace. |
| `Storage status` | Indicate whether data is saved in IndexedDB, a fallback, or only in memory; show last successful write and any errors. |
| `Backup reminder` | Explain: Chrome profile cleanup, Incognito/private browsing, changing `file://` path, or moving to another Mac may make browser storage unavailable. Recommend periodic full backup. |

Import safety:

- `Cancel` leaves everything untouched.
- Bad JSON, wrong format, missing references, unsupported versions, or failed writes do not wipe the current workspace.
- After successful import, the UI immediately shows restored projects and correct schedule results.
- A full backup file must restore a **multi-project** workspace into a clean Chrome profile (including meetings and cross-project copy setup).
- `Export full backup` must still be usable when durable local persistence is unavailable.

Optional P1:

- If `showSaveFilePicker` / related File System Access APIs are truly available in Chrome `file://` on macOS, allow user to explicitly choose a backup file and optionally save later changes to that file, with clear permissions and status. Detect capability rather than relying on assumptions. File access always stays opt-in.
- When the API is unavailable or permission expires, fall back to `Export full backup` as a user-initiated download; never break the app.

## 8. Offline and packaging requirements

Deliver:

```text
orbit/
  src/
    index.html
    styles.css
    app.js
    ... any additional small local source modules/assets
  dist/
    Orbit.html             # preferred single-file, double-click launch artifact
  tests/
    ... tests (or retain and extend current tests)
  README.md                # plain-English user instructions
  CHANGELOG.md
```

Notes:

- The `dist/Orbit.html` single file is a preference: include/inline all CSS, JS, fonts and other essential assets so it can run from disk by itself. If some browser restriction makes this impossible, clearly explain it and still produce a no-server/offline alternative with a double-clickable `index.html` and local relative assets.
- No CDN URLs, Google Fonts, external scripts/styles, remote images, analytics pixels, tracking, or runtime `fetch` to a server.
- Avoid ES modules / CORS-sensitive file loading unless they have been specifically verified under `file://` in Chrome. A regular bundled `<script>` is acceptable.
- No Node/npm or other build tooling required to **run** Orbit. Dev/test/build tooling may be used by Codex during development.
- Make source of truth explicit: generated standalone HTML is a build artifact, not something to hand-edit separately.
- Ship a consistent visible app version and document what happens when replacing the HTML file.
- In a real Chrome offline test, verify the Network panel shows **no failed/attempted external requests** and all functionality remains available.

## 9. Data storage realism (do not overpromise)

Chrome data stores belong to the browser profile and origin/security context. A local HTML file does **not** have general unrestricted write access to any file in `~/Documents`.

Therefore:

- A browser-local autosave is convenient, but **not the user's only backup**.
- Do not claim the HTML file contains data or can silently rewrite an arbitrary JSON file.
- Do not claim a renamed/moved `file://` HTML file automatically accesses the previous origin's storage.
- If Chrome imposes limitations, explain them in product UI and README, and provide the tested manual backup/restore route; do not secretly require a local web server.
- Never use browser flags like `--allow-file-access-from-files` as a requirement for the end user.

## 10. Quality and nonfunctional requirements

- UI remains usable on a typical 13–16-inch Mac display, with roadmap occupying maximum width when sidebar is collapsed.
- Keep the existing English UI labels unless changing text clarifies storage/backup actions.
- No regressions in scheduling: all forecasts still account for dependencies, working days, vacations, capacity allocations and recurring meetings.
- No double deduction for overlapping recurring meetings; keep deterministic date calculations.
- Avoid catastrophic performance degradation on at least **10 projects / 50 team members total / 300 tasks total**. These are test fixture targets, not real-world product limits.
- Keep keyboard-accessible buttons, clear validation messages and destructive-action confirmations.
- Never leak user data via network. Export content remains on device, under user control.
- Log errors to console for diagnosis but do not expose confusing internal stack traces in the UI.

## 11. Acceptance tests (must pass)

Codex should automate what is feasible and document screenshots/manual outcomes for the rest.

### A. Launch and offline

- **A1**: From Finder, open the shipped HTML in current stable Chrome for macOS using a `file://` URL. No dev server is running.
- **A2**: Disable internet and reload; UI renders, demo/new project loads, all menus and editors work.
- **A3**: There are zero required external network resources.

### B. Save and persistence

- **B1**: Create Project X, add a team member/role and recurring meeting, create a feature and tasks; reload the file. Data is still there.
- **B2**: Close all Chrome windows, reopen the same HTML path and verify data is there.
- **B3**: Edit effort/status/meeting duration; displayed end dates update and remain updated after reload.
- **B4**: Force storage failure/deny access: app displays warning, does not fake “Saved”, and still permits full backup export.
- **B5**: Reopen an existing project using legacy `orbit-projects-v1` and verify all data is migrated, not reset/duplicated.

### C. Full backup

- **C1**: Create two distinct projects with different members, roles, work items, meetings, leave and milestones. Export one **full workspace** JSON.
- **C2**: Import that file into an empty browser profile/environment and verify all projects, all records, original IDs, settings and selected project are restored.
- **C3**: Import malformed JSON / incompatible future schema; there is an error and current user data is unchanged.
- **C4**: Cancel destructive import; current data is unchanged.
- **C5**: Do a backup roundtrip (export → import → export) and verify semantic equality of the essential workspace data, ignoring expected timestamps/format metadata.
- **C6**: Verify that the **old single-project export is not mislabeled as a full-workspace backup**.

### D. Feature regression

- **D1**: Create feature + Backend/Frontend/QA tasks; assign members through role-based platform selector.
- **D2**: Add dependencies and modify pure effort; forecast moves correctly.
- **D3**: Mark upstream task On Hold; dependent tasks become blocked with no fabricated end date; resume manually.
- **D4**: Add vacation/day off and recurring meeting; available capacity reduces and forecast extends; remove them and it recalculates.
- **D5**: Copy team and meetings from Project A to B; no duplicates when repeated; attendee IDs map correctly; Project A unaffected.
- **D6**: Filter by person and platform; matching task rows change while feature forecast stays correct.
- **D7**: Switch Day/Week/Month/Quarter/Year view; tasks and milestones retain accurate date mapping.
- **D8**: Collapse sidebar; roadmap expands and state survives reload.
- **D9**: Create/move milestone from date header; it remains an overlay, not a work item.
- **D10**: Test Ukrainian non-working-day toggle separately from leave and weekends.

### E. Update resilience

- **E1**: With existing saved data, replace the HTML release at the **same path** and reload. Projects remain intact or are recoverable via supported migration.
- **E2**: Copy/rename/move the app to a different path; when local storage is not shared, the README/UI provides an honest backup/restore path rather than claiming automatic migration.
- **E3**: Show user-facing error on failed write and do not drop in unsaved seed/demo data.

## 12. Implementation approach requested of Codex

1. **Audit baseline**: inspect state schema, storage initialization, UI actions, tests, and packaging.
2. **Give a short implementation plan** (files changed, migrations, storage strategy, known `file://` risks).
3. **Implement P0 in small changes**, preserving the current code and appearance.
4. **Test on actual Chrome/macOS `file://`** if the environment supports it. If it does not, say so explicitly: run the closest feasible tests, list unverified cases, and include precise Mac manual steps. Do not claim the Mac test passed without running it.
5. **Produce final artifacts** in `dist/` plus source, a concise `README.md`, tests and a `CHANGELOG.md`.
6. **Report honestly**: implemented features, commands/tests run and their results, any failed/unverified acceptance criteria, and how to create and restore a backup.

**Definition of done:** a nontechnical user can unzip the result, double-click an HTML file in Chrome on a Mac, work offline, reopen their unchanged project later, export and import **all projects**, and reliably understand whether their latest edits have actually been saved.

---

### Suggested first Codex prompt

> Read `ORBIT_CODEX_IMPLEMENTATION_SPEC.md` and `AGENTS.md` completely. Inspect the existing `roadmap_planner/` source and tests. Start by auditing its current persistence, import/export and packaging behavior against the P0 requirements. Give me a concise plan, then implement P0 without rewriting the Gantt app. Keep the working Chrome `file://` double-click flow as a hard constraint. Test what you can, be explicit about cases not testable on this machine, and deliver a standalone offline HTML release, the source, tests and Mac-oriented run/backup instructions.
