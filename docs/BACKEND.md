# Backend Deep Dive

FastAPI + SQLAlchemy 2.0 + Postgres, under `backend/app/`. See
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for how this fits into the whole
system, and [`docs/DATABASE.md`](DATABASE.md) for the schema.

## App structure

| File | Owns |
|---|---|
| `app/main.py` | FastAPI app instance, CORS, router registration **and per-router auth gating**, the startup hook, the sync-job reaper loop, the bare `/health` route |
| `app/config.py` | `Settings` (pydantic-settings) — every env var the app reads, all with safe defaults |
| `app/database.py` | SQLAlchemy engine (explicit connection-pool settings — see below), `SessionLocal`, `get_db()` dependency, `init_db()` |
| `app/auth.py` | Session-cookie auth core — hashing, session creation/lookup, the `get_current_user`/`require_admin` dependencies |

Directory layout, one file per concern:

```
app/
  models/       one SQLAlchemy model class per table
  schemas/      Pydantic request/response shapes, grouped by feature not by model 1:1
  routers/      one APIRouter per feature area
  integrations/ one module per external tool, plus config_resolver.py
```

## Router inventory

| Router | Prefix | Auth | Owns |
|---|---|---|---|
| `auth.py` | `/api/auth` | **public** (login must stay reachable) | login, logout, `/me` |
| `dashboard.py` | `/api/dashboard` | any logged-in user | KPI/summary aggregation across all synced data |
| `images.py` | `/api/images` | any logged-in user | image list/detail/packages, the on-demand per-image JFrog sync |
| `vulnerabilities.py` | `/api/vulnerabilities` | any logged-in user | CVE list/detail grouped across images and Dependency-Track software projects |
| `code_quality.py` | `/api` (`/projects`, `/code-issues`, `/rules/*`) | any logged-in user | SonarQube projects/issues, rule info (sanitized HTML) |
| `pipelines.py` | `/api/pipelines` | any logged-in user | GitLab pipeline list |
| `search.py` | `/api/search` | any logged-in user | fan-out search across images/CVEs/issues/pipelines |
| `fix_suggestions.py` | `/api/fix-suggestions` | any logged-in user | CVE remediation text |
| `sync.py` | `/api/sync` | any logged-in user | triggers a tool's background sync, reports job status/progress |
| `integrations.py` | `/api/integrations` | **admin only** | tool connection config (URL/credentials), test/sync-now, unregister/delete-data |
| `services.py` | `/api/services` | any logged-in user | the cross-tool `Service` entity (list/detail/CRUD) |
| `users.py` | `/api/users` | **admin only** | user account CRUD |

Gating is applied entirely in `main.py`, at each `app.include_router(...)`
call — `dependencies=[Depends(get_current_user)]` or `require_admin` — not
inside the router files themselves. Adding a new router means adding one
line to `main.py`, nothing else. `GET /health` is the one route registered
directly on `app`, deliberately outside any router, so it's never
accidentally gated (k8s liveness/readiness probes depend on it staying
public).

## The integration pattern

Every external tool follows the same shape — this is the recipe for adding
a fifth one:

1. **`app/integrations/<tool>.py`** exposes `test_connection(url, username,
   secret) -> dict` and `async def sync(db, job=None) -> dict`. `job` is an
   optional `SyncJob` row the function updates as it progresses (see
   below) — every tool's `sync()` accepts it even if it doesn't use it
   (`sonarqube.py`/`gitlab.py`/`prisma.py` mostly ignore it; `jfrog.py`
   uses it for real progress reporting since its sync can run for a long
   time at scale).
2. **`app/integrations/config_resolver.py`** resolves a tool's effective
   connection config from the `integration_configs` table — `source` is
   always `"database"` or `"none"`, **never** an env-var fallback. (An
   earlier version supported `.env`-sourced config as a third state; it
   was removed because it made "Unregister" in Settings not actually
   disconnect a tool that also had `.env` values set — see
   `docs/integrations.md` for the full story.)
3. **`app/routers/integrations.py`** exposes the generic
   connect/test/sync-now/unregister/delete-data flow for every tool by
   name — a new tool needs no new router code here, just an entry in that
   router's tool registry and a Settings UI config entry
   (`frontend/lib/integrations/config.ts`).
4. **`app/routers/sync.py`** is what actually *runs* a sync: `POST
   /api/sync/{tool}` creates a `SyncJob` row and launches the tool's
   `sync()` as a background `asyncio` task — it does **not** block the
   HTTP request for the sync's duration. A second heartbeat task ticks
   `SyncJob.last_heartbeat_at` every ~15s on its own DB session (never
   share a `Session` across concurrent coroutines/tasks — even under
   cooperative asyncio, SQLAlchemy sessions aren't safe for that). `GET
   /api/sync/status` reports each tool's latest job, ordered by
   `started_at` (not `finished_at`, which is `NULL` for a running job).
   Overlapping syncs for the same tool are rejected with `409`.
5. **`app/main.py`'s startup hook + `_reaper_loop`** reap jobs whose
   heartbeat has gone stale (90s of silence) — both once at startup and on
   a continuous 60s loop, since a pod that never restarts still needs to
   notice a *different* pod's sync dying without a graceful failure. This
   is heartbeat-staleness-based, deliberately **not** "mark every running
   job failed on any restart" — that blanket rule was tried first and
   rejected because with 2 backend replicas it would kill a sync
   genuinely still running on a healthy, different pod.

Currently: **JFrog Xray, SonarQube, GitLab are real**; **Prisma Cloud's
`sync()` is a 3-line stub** (only `test_connection()` is real).

### JFrog's sync, specifically (the one built for scale)

`jfrog.py` is worth calling out separately since it's the one integration
built to handle a real deployment (~2M artifacts), not just a demo-scale
sync:
- Artifactory inventory (image/tag listing) is **paginated** (`n`/`last`
  cursor params) and looped per-repo — the Settings "Repository" field is
  a comma-separated list, since a real Artifactory is usually split across
  several repos.
- Vulnerability data comes from Xray's **Reports API**
  (generate → poll → paginate), not a per-artifact call — the old
  per-tag `summary/artifact` loop was replaced because it doesn't scale.
  `summary/artifact` is still used, deliberately, for the **on-demand
  single-image "Update" button** (`POST /api/images/{id}/sync`) — fast
  enough for one artifact that it doesn't need the Reports/background
  machinery.
- Incremental sync via the Reports API's `scan_date` filter, watermarked
  by `IntegrationConfig.last_synced_at` (5-minute overlap buffer for clock
  skew).
- All DB writes are batched `INSERT ... ON CONFLICT DO UPDATE`
  (`sqlalchemy.dialects.postgresql.insert`), not per-row commits.
- Report rows identify an artifact by `path` (repo/name/tag), **not** a
  digest — this was confirmed against a real captured Xray report
  response (see `docs/integrations.md` for how), correcting an earlier,
  wrong assumption that report rows carried a `sha256` field.

## Auth & RBAC

Two roles: **admin** (manages tool connections/credentials and user
accounts) and **member** (everything else — browsing, Fix suggestions,
triggering syncs).

- **Session mechanism**: a DB-backed session token in an httpOnly cookie,
  not JWT — chosen because (a) the frontend proxies `/api/*` to this
  backend, so cookies flow same-origin with zero CORS complexity, and (b)
  the real deployment runs multiple backend replicas with only Postgres,
  no Redis — a `sessions` table is trivially correct across replicas and
  makes logout an actual row delete (unlike JWT's non-revocability).
- `hash_password`/`verify_password` — bcrypt.
- `create_session(db, user)` — `secrets.token_urlsafe(32)`, inserted into
  `sessions` with a 7-day fixed expiry (no sliding renewal).
- `get_current_user(request, db)` — reads the `session_token` cookie,
  looks up the session, checks expiry and `user.is_active`, raises `401`.
- `require_admin` — builds on `get_current_user`, raises `403` if
  `role != "admin"`.
- **Bootstrap**: since Settings/user-management is itself gated,
  `backend/seed.py`'s `bootstrap_admin()` creates a default `admin` /
  `ChangeMe123!` account only if zero users exist yet — a deliberate,
  visible MVP trade-off for a small-team internal tool with no email
  infrastructure to deliver a real invite any other way. **Must be
  changed on first login.**
- `users.py`'s update/delete routes guard against removing **the last
  remaining active admin** and against a user deleting their own account
  while logged in as it.
- `COOKIE_SECURE` (env, default `false`) controls the cookie's `secure`
  flag — flip to `true` once TLS exists in front of the ingress (it
  doesn't yet, see `docs/ARCHITECTURE.md`).
