# Planning Poker

Planning Poker uses the existing project and the ordinary Orbit work items. A logical story is a group sharing `storyId` within one epic; a legacy item without it remains a singleton. A poker card is a discussion result, never an automatic conversion to work days.

## Architecture

The sidebar saves pending planner edits before opening `/poker/new?project=<id>`. This opens room creation directly. Room links are `/poker/<256-bit random invitation>`; guests enter only a name and optional spectator choice. Guest identity uses a separate random, HttpOnly, room-scoped cookie, checked against its SHA-256 hash in the database. Names are display values, not identities.

The new SQL migration `20261029000200_planning_poker.sql` adds room, participant, round, vote, reusable deck and publication receipt tables. All have RLS and deny direct anonymous/authenticated table access. A narrowly projected security-definer RPC permits invitation-scoped play; management and publication additionally require the actual authenticated workspace owner. No service-role key is needed by application code. Existing workspace grants stay private.

Clients refresh room state regularly from the shared server, with each participant selecting their own issue. Votes are keyed by actual round and participant. Unrevealed values are omitted from other participants' responses, including facilitator responses. Results include only revealed rounds; free voting is a distinct `free` issue. Heartbeats distinguish active participants, and stale/disconnected participants and spectators do not indefinitely block auto-reveal. A browser refresh reuses the same cookie and participant. The transport reconnects by fetching authoritative state rather than replaying local state.

The additive `20261030000100_poker_story_metadata.sql` migration adds a room-state wrapper around the existing authorized voting RPC. After joining, participants and spectators also see the selected project's name and each story work item's role name, assignee display name and existing work-day estimate. These are explicitly shared room fields. An invitation before joining exposes none of those additional fields. The wrapper matches actual work-item identities within the room's workspace, project and epic; other personnel fields, calendars and unrelated projects remain private. It does not change hidden-vote projection or grant direct access to planner tables.

Planning publication validates a fresh workspace snapshot on the server, using the existing story builder and full workspace schema. Its SQL transaction checks owner, project, workspace revision and publication operation UUID. The ordinary normalized workspace save and publication receipt commit together. A repeated operation returns its original receipt without creating duplicates. Omitted roles are retained; existing work item IDs, dates, status, dependencies and completed effort remain intact. Changing protected ongoing/history fields requires explicit confirmation; completed estimates cannot be rewritten.

Rooms reference the workspace and project identifier, without a foreign key to the temporary project rows replaced by the existing snapshot-save RPC. Ordinary planner saves therefore preserve rooms and history. Every request verifies that the project still exists. Deleted projects' rooms fail closed.

The Gantt Chart still uses `engine.js`; no separate scheduling algorithm exists in Poker. A saved story links to its existing project, expands its epic and highlights its row. Other planner tabs check revision on focus and periodically. Newer server revisions show the existing conflict/reload workflow, preserving queued unsaved work.

## Publication and recovery

This module requires the additive SQL migration before publishing the application release. The product task explicitly requires approval before production migration execution. The release must remain on its implementation branch until the concrete migration and test evidence are reviewed and approved.

Before applying the migration, inspect migration tracking/checksums and existing `orbit_*` objects. Apply only this new migration and its checksum marker, in a transaction; never replay old migrations or reset the database. The migration adds a separate poker domain and does not rewrite existing user plans. Retain the current production deployment identifier and use the provider's existing backup/recovery facilities. A Vercel rollback restores the previous application; leave additive poker tables in place to preserve session/history data. Do not drop them as part of an application rollback.

After migration approval and deployment, verify with a dedicated newly generated test account, separate real guest browser contexts, actual hidden-vote API responses, revision conflicts and standard Gantt persistence. Remove only the generated test account and its cascading test workspace/poker data. Report production success only after those checks pass.

## Scope

This release has no dashboard, sprint/unit/project selectors in room creation, async/spectator toggles, playful interactions or parallel task model. Project selection remains the existing Orbit project context. Custom decks belong to the authenticated owner and can be reused. Guests see explicitly shared project/epic/story labels, story roles, assignee display names, estimates and room play; the owner's other planning resources, personnel details, calendars and unrelated projects stay private.

The referenced `orbit_planning_poker_story_estimates_gantt.html` was not included in the supplied files; the interface follows the existing Orbit visual system and the written interaction requirements.
