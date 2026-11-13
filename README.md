# Orbit Roadmap Planner

Roadmaps that adapt to reality: work items and sub-items, dependencies, full-work estimates, recurring meetings, time off, and milestones.

Live verification release: **https://orbit-sigma-nine-72.vercel.app**. Registration uses immediate sessions while email confirmation is temporarily disabled by owner approval. Automatic Git deployment remains pending; see the delivery scope below.

Orbit is a Next.js App Router application backed by Supabase Auth and PostgreSQL, intended for Vercel. The supplied interactive planner is preserved; its scheduling engine has been extracted from rendering and persistence. No account is seeded with sample data.

The source repository `gubasv93/orbit` is public with owner approval.

## Current delivery scope

- Email/password registration with first and last name, login, secure server-managed sessions, and logout. Profile supports name and password changes.
- Google registration/login via Supabase OAuth with server-side PKCE. Enable the Google provider with your own web OAuth client using the [setup guide](docs/DEPLOYMENT.md#google-registration-and-login).
- Passwords require at least 8 characters, a letter and a number, and at most 72 UTF-8 bytes, matching Supabase's native limit (owner approved).
- Public registration approved by the owner; email confirmation is temporarily disabled so registration works without SMTP. Email addresses are unverified during this period.
- SMTP configuration and all forgot/reset-password functionality are intentionally deferred by the owner.
- No invitations, billing, or collaborative editing.
- Project onboarding has three optional steps: team, recurring meetings and time off. Saved absences use the same calendar rules as Time off & holidays; unfinished setup resumes at its saved step.
- The selected hosted Supabase project has Orbit's migration and password policy applied. Hosted persistence and account isolation were exercised with temporary test accounts.
- Vercel project `orbit` is deployed on the owner's existing Hobby plan. Live login, onboarding, persistence, and account isolation passed with temporary confirmed test accounts. Git integration requires the owner to authorize Vercel's GitHub app. Hobby's commercial-use restrictions must be resolved before commercial launch.

## Roadmap controls

**Work items** are the parent rows. **Sub-items** hold the work inside them, with optional roles, assignees and estimates. The stored data format is unchanged.

- Scroll horizontally to earlier or later dates at every scale. The calendar slides a bounded window, retaining focus and the same screen dates. **Today** returns to the current date; Earlier/Later remain available. Scrolling never changes sub-item dates.
- New estimates use **0.5-day steps**, with a minimum of 0.5 days. Automatic bars end at the actual half-day boundary. Recurring meeting intervals are merged per person/day and deducted using exact minutes. The combined meeting time across the entire sub-item is rounded up once for the bar; 0.25 day reserves 0.5. A 30-minute daily never reserves half a day every day. Details show actual hours separately. Existing finer estimates load without being rewritten and are rounded up only for scheduling.
- The assignee avatar in each sub-item row opens a direct selector containing matching people and Unassigned. Exact-role filtering applies where a role is set; legacy items use platform matching. Reassignment saves normally and recalculates that person's calendar.
- The chart uses compact rows, one main toolbar, an inline legend, and visible mobile date navigation. Unused availability is removed. Colors compare accounted time and fill the bar without adding effort for gaps; bar length still follows calendar dates. A work item window with no scheduled work has an explicit neutral state.

- Drag either edge of a sub-item or work item bar to set its manual date window. Start handles snap to dates and end handles to half days. Arrow keys resize a focused handle; Escape or pointer cancellation discards the preview. Resizing a sub-item recalculates its estimate from exact working time after recurring meetings and absences, rounded down once to 0.5 work days so it fits. Recorded completed effort is retained when remaining work is set. Windows with less than 0.5 work days are rejected. Resizing a work item preserves its child dates and estimates. Editing dates in the inspector keeps estimates; short windows show a warning. Choose **Automatic forecast** in item details to restore effort-based dates.
- Drag the middle of a work item bar to shift the entire work item and every child by the same calendar-day offset, including collapsed or filtered-out sub-items. Manual windows and recorded completion dates move together; estimates, half-day ends and dependency IDs are retained. Escape cancels the preview. A focused work item bar also supports Left/Right arrows (Shift for a week); Enter opens details. Baselines and milestones remain fixed targets, and automatic forecasts recalculate for the new calendars.
- Drag the dotted row grip to reorder work items with their children, reorder sub-items, or move a sub-item to another work item. Click the grip for a keyboard/mobile **Move item** menu. These actions preserve dates, estimates, assignees and dependencies.
- Estimates include all delivery work. Team allocation percentages are retired; old values stay in backups but do not reduce forecasts. Recurring meetings, weekends, listed holiday dates, days off and sick leave extend the calendar duration. Each bar has one total color section per category, with a numeric breakdown in item details. Sub-item and work item inspectors list every scheduling conflict and each recurring meeting that reserves time in the scheduled window. Overlapping meetings share reserved minutes; work item totals count each attendee/date once. The Dependencies section appears only for existing links, which can be removed there.
- **People and platform filters** support multiple selections. Matches use OR within each filter and AND between filters. No selection means all; the people filter also includes Unassigned. Clear selection resets one filter, and Clear filters resets both. These view filters never change dates, estimates, work item totals or ownership.
- Hover or focus an item to open a readable breakdown of its estimate, elapsed calendar span, exact meeting hours/minutes and separate non-working categories. Named capacity, dependency and manual-window conflicts are listed with dates; **Show more** expands long lists. Work item estimates use person-days, while their calendar span counts elapsed dates. Meetings and personal leave count each person/date once across overlapping child work. Completed history does not invent past meeting attendance.
- Bar captions show the **Name** first, plus **Role** when space permits. In **General settings → Information on bars**, select Name, Role, Estimate, Calendar effort and Assignee full name for each project. Extra fields hide before names truncate; all-off hides captions without changing scheduling. Caption fields use dark text on a compact light background while the time colors remain visible around them. Work item fields summarize their children. Estimate is the planned work in person-days; calendar effort is the elapsed bar span.
- **General settings** (sidebar) controls dependency behavior for each project. Arrows default to manual placement. Enable **Auto-shift dependent sub-items** to choose a calendar/working-day gap and either push overlapping starts or follow predecessor finishes. Timing warnings can be hidden separately. Turning auto-shift off retains the displayed dependent starts.
- Open **Recurring meetings** in the sidebar; editing remains available in General settings and project setup. Time off and holidays remain in the sidebar.

## Country holiday calendars

Time off & holidays supports a country calendar with optional state/province and local region. Applying it imports full-day public holidays for the current and following year, including movable dates and observed substitutes. Every listed holiday blocks scheduling and appears on the roadmap; the old `observeHolidays` field is retained only for backup compatibility, without a toggle. Manual entries win date collisions. Removing an imported date records an exception that survives refresh. Switching calendars replaces only generated dates; Manual holidays only keeps hand-written dates.

The active project refreshes a stale country calendar when opened, on focus, and within the first active minute of a new year. Saved historical years stay available. There is no background account-wide cron job: closed projects refresh when next opened. Dates are calculated using the pinned server-side `date-holidays` rules, not a live statutory feed; legal/rule changes require dependency updates. Unsupported or known-inaccurate calendars are disabled, including Ukraine in the current provider data. API failures preserve the saved calendar and expose a retry action. Holiday metadata is stored in existing JSONB without a database migration.

Holiday data is provided by [date-holidays](https://github.com/commenthol/date-holidays), whose data is licensed under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/) and library code under ISC. Imported date names are filtered, expanded and deduplicated; this attribution applies to the imported holiday data, not user-authored project content. See the provider source for calendar references. Country calendars describe public holidays; users can adapt their dates to their actual company policy.

## Application manager trends

Application manager includes daily operational charts in the product overview and each user’s details. The activity period selects 7, 30, 90 or 365 UTC days. Charts cover registrations/deletions, first-observed projects and resources, Poker rooms/participants/duration, deleted-project lifetimes, and global aggregate landing page views. Metric selectors, keyboard exploration and daily data tables are available on each chart.

These charts derive from existing retained records; they add no browser tracking. Dates before tracking started are unavailable rather than zero. Resource and project observations include the initial inventory baseline, and do not reconstruct historical current inventory or original creation dates. Poker statistics use room-creation-day cohorts; missing duration samples remain unavailable. Landing page views cannot be attributed to individual accounts. Apply `20261111000100_application_analytics_trends.sql` before deploying the corresponding application code; the guarded helper defaults to a read-only preflight.

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

**Planning Poker** in the project sidebar opens room creation immediately. Share the room URL for name-only guest participation, independent sub-item voting and spectators. Revealed cards stay separate from work-day estimates. Finalizing creates or updates the real project's role-specific sub-items, preserving identities and schedules. The additive database migration must be approved and applied before this module is released; see [implementation and release details](docs/PLANNING_POKER.md).

Hold **⌘ (Mac) or Ctrl (Windows/Linux)** and click a sub-item or work item row or bar to add it to or remove it from the selection. The selection toolbar and row checkboxes appear after selecting the first item. A regular click still opens item details; **⌘/Ctrl + Enter or Space** also toggles a focused bar. **Select visible sub-items** adds only expanded sub-items matching the current filters. An explicitly selected work item includes every child, including filtered and collapsed work. **Delete selected** opens a review of the exact targets; cancelling preserves the selection. Confirmation removes the selection in one save and cleans dependency and milestone references. Selection is temporary. **Escape** or **Clear** clears it, and removing the last selected item hides the selection toolbar. Switching projects also clears it.

Use **Add work item** in the roadmap's **WORK ITEMS** header to create a work item without leaving the table. Each work item shows the total effort of its sub-items, including work hidden by the current filters. In the work item inspector, **Effort estimate → Manual estimate** sets an override; **Sum of sub-items** restores automatic calculation. You can also enter an optional manual total while creating a work item. A work item without sub-items can use its own **Work item estimate (days)** and **Assignee**; its calendar forecast accounts for that person's meetings, holidays and time off. Change the assignee in the inspector or directly in the roadmap row. When a work item has sub-items, delivery dates follow those scheduled sub-items.

To estimate one sub-item across teams, enter **First sub-item (optional)** while creating a work item, then choose the involved teams under **Teams & estimates**. For example, create **Disable Rules**, enter **Add a specific rule**, and select Backend Developer (3 days), Frontend Developer (2 days), and QA Engineer (2 days), with a separate assignee for each. Saving creates three consecutive sub-item rows under that work item with 7 work days of total effort. If the sub-item name is blank, the work item name is used. Teams and estimates are explicit; unchecked teams create no work.

For a title-only sub-item, use the work item’s **+** button (**Add sub-item**), enter its name and press Enter. Teams and estimates are optional. Without a team, create an unassigned sub-item with a name and an optional estimate. You may also select roles while leaving assignees and estimates blank. Unestimated effort is stored as zero, excluded from capacity allocation, and shown as **Not estimated**; scheduled siblings remain visible while the full work item forecast is incomplete. Choose an assignee or estimate later in the inspector. A first sub-item can also be captured by name while creating a work item, and **Add sub-item** supports the same defaults. For a project with no members, **Add team member** opens **Team settings** in the same project from the create or edit form. Sub-items also support an optional **Description** when created and in their inspector. A multi-role sub-item starts with the same description on each generated row; each row can be edited independently.

Open a sub-item's inspector and use **Sub-item roles → Add roles** to add more role-specific work to the same sub-item. Existing roles are marked **Added**; their assignments, estimates and dates are preserved. Sub-item identifiers keep same-name sub-items separate. Older standalone sub-items receive a sub-item identifier only when extended. For a name-only item, the first selected role uses its existing row. Pausing a child keeps independent work and the work item's scheduled bar visible, with a dashed amber border and paused-item count. Dates describe scheduled work, not a complete delivery promise while paused or other unscheduled items remain.

For an existing work item, use its **+** button on the roadmap (**Add sub-item**) or **Add sub-item** in its inspector. **Teams & estimates lists your project's roles**, such as Backend Developer and Backend Reviewer, separately even when they share a platform. Only members of the selected role are offered; Unassigned is also available. Unselected roles occupy a compact single row; selecting one reveals its assignee and estimate. The generated rows start independently by default. **Link selected teams as dependencies in the order shown** is an optional shortcut. The inspector's **Add sub-item** action remains available for a single sub-item.

Roadmap bars distinguish **effort from calendar duration**. For example, six work days with no meetings span eight calendar days when starting on a Monday; retired allocation percentages do not stretch the forecast. Each color appears once across the whole bar, proportional to accounted development, recurring meetings, weekends, public holidays, days off or sick leave. All scales use the same composition. Colors fill the bar without a white unused-time tail; proportions compare only the listed time, while the bar's length follows its calendar dates. Hover a bar or open details for actual numeric totals. Work item bars average the mix across active child sub-items, while work item effort still sums person-days separately.

Connect sub-items directly on the map: drag the circle at a predecessor's right edge to a dependent sub-item, or click the source circle and then a target circle. Links are finish-to-start, persist in the existing dependency list, and reject cycles. Select an arrow and use **Remove selected dependency** or Delete to remove it. Hidden rows hide their arrows without deleting links. The dependency checkboxes in the inspector remain available.

Changing the status of a scheduled sub-item preserves its existing dates and estimate. Marking it **Done** records the displayed finish, including a half-day end, rather than the day the status was clicked. Pausing or reopening work retains its date window; paused work releases its assigned capacity. Dates remain editable in the inspector.

Sub-item and work item details show **Start date** and **End date** from the graph. Editing the end switches to a **Manual date window**; switching **Date mode** back to **Automatic forecast** restores calculation. Moving a sub-item bar shifts both manual dates together. Effort is never changed to fit a window: if capacity is insufficient, the item shows the unscheduled effort. Dependencies may shift a dependent manual window together. A work item's manual window controls its parent bar; child forecasts stay intact and an explicit warning identifies children outside that window. Baseline deadlines remain separate targets.

Milestones on the same calendar date share one **N milestones** marker. Open it to see every milestone's full name and deadline status, then choose **Open milestone** to edit an individual marker. Single milestones remain draggable; the group chooser also offers **Add milestone** for that date.

For an event every Thursday, choose **Repeat → Weekly**, **Repeat every (weeks) → 1**, and **Day of week → Thursday**. Use 2 weeks for every other Thursday, or Monthly for an ordinal such as the second Thursday of each month. The preview shows the saved cadence and upcoming dates. Existing meetings keep their saved cadence until edited.

**Add Scrum ceremonies** is available in Recurring meetings and the meetings step of project setup, including before anyone joins the team. It adds ordinary meetings that you can edit, pause or delete:

| Ceremony | Default schedule | Duration |
| --- | --- | --- |
| Daily | Every day at 10:00 | 30 minutes |
| Refinement | Tuesday and Thursday at 14:00 | 1 hour |
| Planning | Every two weeks on Monday at 11:00 | 1 hour |
| Demo | Every two weeks on Friday at 14:00 | 1 hour |
| Retro | Every two weeks on Friday at 16:00 | 1 hour |

Planning starts on the nearest Monday, including today when it is Monday. Demo and Retro use the second Friday of that same two-week cycle. Daily and Refinement start from today. These meetings include the entire team; non-working days do not reserve working capacity. Clicking the button again preserves existing meetings and your edits, while adding any deleted default ceremonies again.

Choose **Repeat → Custom…** to repeat every 1–99 days, weeks, months or years. Weekly rules support several weekdays; monthly rules support a date or weekday occurrence, including the last weekday of the month. Recurrence can continue indefinitely, end on an inclusive date, or stop after 1–1,000 occurrences. Each selected meeting date counts toward the occurrence limit. The preview shows the rule and upcoming dates before saving; impossible dates such as February 30 are skipped.

Meetings include the entire team by default. Clear **Entire team** to select specific attendees; larger teams have a search field, and the selected count remains visible while searching. The meeting cannot be saved with no specific attendees selected.

Every material planner edit is queued to the server and saved in one database transaction. The status bar distinguishes unsaved, saving, saved, failed, and conflicting writes. If a save fails, keep the tab open and retry or export a backup. A stale tab cannot silently overwrite a newer revision.

In **General settings → Workspace backup**, **Export workspace** includes every project and view preferences. **Import workspace** validates a versioned JSON backup and asks before replacement. Project-only JSON import/export remains in Settings. Imports do not execute HTML. A backup contains planning data, not accounts, passwords, or sessions; store it privately. Importing a full backup replaces the currently signed-in user's workspace only.

See [deployment and recovery](docs/DEPLOYMENT.md), [architecture](docs/ARCHITECTURE.md), and [validation](docs/VALIDATION.md). Historical source briefs and prototypes are retained under `docs/reference` for comparison, not served as the application. Their offline/mock-auth instructions are superseded by the hosted implementation and the owner's decisions above.
