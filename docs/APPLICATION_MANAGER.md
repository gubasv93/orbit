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
participation/duration/frequency, and planner/landing engagement.

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
- Planner and landing activity requires explicit optional first-party analytics
  consent. Existing “Got it” acknowledgments never enable analytics. Revocation
  stops measurements. Landing visitors are consenting browser identifiers, not
  verified unique people; fingerprints, URLs, page contents, IPs and user agents
  are not stored in activity facts.
- Active time excludes hidden, unfocused and idle tabs. Visit days use UTC.
  Long inactivity and day boundaries begin another activity session.

No optional analytics is collected inside the application manager. Current entity
counts and operational Poker facts do not require an analytics browser identifier.

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

The disposable local backend seeds a **localhost-only test invitation** and
generates separate temporary service-role/encryption keys. No local credentials
are production defaults. Production smoke must never claim the owner's invitation.
