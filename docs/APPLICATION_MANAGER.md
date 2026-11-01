# Application manager

`/applicationmanager` has one dedicated administrator, independent from ordinary
Orbit accounts. A server-held Supabase service key is available only to guarded
server routes. Ordinary account cookies, names and metadata cannot grant access.

Setup uses a randomly generated 256-bit invitation in the URL fragment. Only its
SHA-256 hash is stored. Successful setup consumes the invitation atomically and
permanently closes registration; the setup page then returns 404. Migration and
deployment scripts never reset a consumed invitation or create an administrator.
The owner chooses the administrator email and password themselves.

Passwords use salted scrypt (`N=32768, r=8, p=3`). Sessions are opaque random tokens
in Secure HttpOnly SameSite=Strict cookies, stored as hashes, with a 12-hour maximum
and 30-minute idle timeout. Authenticator TOTP secrets use AES-256-GCM under a
separate server key. Verification prevents code replay. Password/MFA changes
rotate the session and invalidate other sessions; destructive management actions
require authentication within five minutes. Login and verification are throttled
in shared durable storage. The administrator can change their password and enable
or disable authenticator-based 2FA under Security.

User email changes use Supabase Auth's administrative update with
`email_confirm: true`, as requested. User/project deletion requires typing the
target email/name. Project writes retain the ordinary workspace revision check;
conflicts require refresh. Intent and outcome audit records are private. An audit
outage before a change blocks it; a completion-log outage does not misreport an
already committed provider action as failed.

## Metric definitions

The dashboard offers overall and individual-user inventory, observed creations,
account creation/deletion dates, project deletion counts and lifetimes, Poker
participation/duration/frequency, and aggregate landing page views.

- **Features** are epics. **Stories** group role work items by project, epic and
  `storyId`; legacy standalone work items count once. Adding roles to an existing
  story retains its analytics identity.
- People and roles count project-local records. A copied person in two projects
  is two team memberships. Platforms count distinct normalized labels per user and globally; copied team
  members remain project memberships, rather than globally unique humans.
- A Poker game is a room; voting rounds are separate. Participation is distinct
  joined seats, including the facilitator and spectators, rather than concurrent
  attendance. Multiple tabs sharing a seat do not increase the count.
- Game duration measures known started/closed intervals, excluding manual closed
  periods. Lazy disconnections use the actual lease/departure deadline instead of
  the later inspection time. Existing historic game durations are unavailable.
- Project lifetimes created after tracking began use server timestamps. Older
  project dates are explicitly approximate and excluded from exact averages.
  Restoring a deleted project starts a separate lifetime.
- Deletions are recorded independently of cascading business-table removal.
  Account and project history before tracking began cannot be reconstructed.
  Existing records form a baseline; observed creation counts include that baseline.
- Planner browsing time, activity sessions and return frequency are not collected.
  The former optional activity endpoint rejects new events and opt-ins, removes
  old cookies, and continues to support withdrawal cleanup. The privacy cutover
  removes previously optional activity records and disables their database writer.
- Landing measurements are UTC-day page-view totals, recorded server-side for
  document loads. There is no browser identifier, account link, session duration,
  fingerprint or stored IP/user-agent in the counter. Known bots, prefetches,
  HEAD/RSC requests and preview deployments are excluded. Reloads can add views;
  this is not a count of unique people. Cached browser restores may not add a view.

No optional analytics is collected inside the application manager. Current entity
counts and operational Poker facts do not require an analytics browser identifier.
The manager API removes the retired engagement fields from its response, including
per-user planner metrics. The historical storage schema is retained for migration
compatibility but does not accept or expose new optional activity measurements.

New accounts accept Terms of Use and acknowledge the Privacy Policy at signup.
This agreement is separate from analytics consent. The database records the fixed
document versions and server timestamp, scoped to the authenticated account.
Existing accounts created before the privacy cutover are not forced to register
again. Google-created accounts without a recorded agreement review `/accept-terms`
before using the planner. Deleting an account removes its acceptance record.

## Release

Configure server-only `SUPABASE_SERVICE_ROLE_KEY` and a stable random 32-byte
base64 `APPLICATION_MANAGER_ENCRYPTION_KEY` in the production environment. Keep
that key stable across deployments; it encrypts authenticator secrets.

`node --use-env-proxy scripts/apply-application-manager-migrations.mjs` performs a
read-only preflight. With `--apply`, it applies only the two reviewed manager
migrations, records exact checksums and verifies that privileged RPCs are denied
to anonymous and ordinary authenticated roles. It does not replay old migrations
or seed a bootstrap secret. Create the first invitation separately, only if no
bootstrap row and no manager identity exist. Never upsert/reset that singleton.

For the minimal-data cutover, use
`node --use-env-proxy scripts/apply-minimal-analytics-migration.mjs` for a read-only
preflight, then `--apply` after verifying the source. It applies only
`20261101000100`, checks existing migration checksums and verifies the counter and
legal RPC privileges. Operational accounts, projects, Poker and lifecycle facts
remain intact. The cutover purges only optional activity sessions and their old
rate-limit keys. Publish the matching application after applying the migration.

The disposable local backend seeds a **localhost-only test invitation** and
generates separate temporary service-role/encryption keys. No local credentials
are production defaults. Production smoke must never claim the owner's invitation.
