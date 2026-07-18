# Database Deep Dive

Postgres, accessed via SQLAlchemy 2.0. See [`docs/ARCHITECTURE.md`](ARCHITECTURE.md)
for how this fits into the whole system.

## No Alembic — how schema changes actually happen

There is no migration framework in this project. `backend/app/database.py`'s
`init_db()` calls `Base.metadata.create_all(bind=engine)` on every backend
startup, which **only creates tables that don't exist yet** — it never
alters an existing table. Consequences:

- **A brand-new table** just needs its model added to `init_db()`'s import
  list — `create_all()` handles it for free on next restart. (Every table
  added this session — `services`, `users`, `sessions` — worked this way.)
- **A new column on an existing table** needs a manual, one-off
  ```
  docker exec devsecops-portal-db-1 psql -U devsecops -d devsecops -c \
    "ALTER TABLE <table> ADD COLUMN IF NOT EXISTS <col> <type>;"
  ```
  run once against the live container, in addition to adding the column to
  the SQLAlchemy model (so fresh installs via `create_all()` also get it).
  Every column added to an existing table this session (`pipeline_runs.web_url`/
  `failed_jobs`, `integration_configs.last_synced_at`,
  `sync_jobs.phase`/`total_items`/`processed_items`/`last_heartbeat_at`,
  the JFrog-scale indexes) followed exactly this two-step pattern.

## Full schema reference

### `images`
| Column | Type | Notes |
|---|---|---|
| `id` | String PK | Deterministic hash (`jfrog:{repo}:{name}:{tag}` for JFrog — repo included specifically to avoid the same name:tag colliding across two different repos) |
| `name`, `tag`, `registry` | String, not null | `registry` is stored as `"{host}/{repo}"` for JFrog so a specific synced image's repo can be recovered later |
| `digest` | String, indexed | |
| `size_mb` | Float | |
| `pushed_at`, `last_scanned_at` | DateTime | |
| `source` | Enum (`jfrog`\|`prisma`), indexed | |
| `is_seed` | Boolean, not null | |

`name`/`tag` also have `pg_trgm` GIN indexes (raw SQL, not expressible via
SQLAlchemy's `index=True`) to support `ilike '%x%'` search at scale.

### `vulnerabilities`
| Column | Type | Notes |
|---|---|---|
| `id` | String PK | |
| `image_id` | FK → `images.id`, **indexed** | The single highest-value index added this session — every image-detail/vuln-count query filters on it, and it had no index at all originally |
| `cve_id` | String, indexed | |
| `severity` | Enum (critical\|high\|medium\|low) | |
| `package_name`, `installed_version`, `fixed_version`, `cvss_score`, `description`, `source_tool` | | |
| `status` | Enum (open\|fixed\|suppressed), default open | |
| `is_seed` | Boolean, not null | |

Composite index `(image_id, status)` also exists, matching the exact
`_vuln_counts()` query shape.

### `image_packages`
`id` PK, `image_id` (FK, indexed), `name`, `version`, `pkg_type`, `license`, `source_tool`.

### `code_projects`
`id` PK, `project_key` (unique), `name`, `quality_gate` ("passed"|"failed"),
`bugs`, `vulnerabilities`, `code_smells`, `coverage`, `hotspots`, `sonar_url`, `is_seed`.

### `code_issues`
`id` PK, `project_key` (indexed), `project_name`, `rule_id`, `type`
(BUG|VULNERABILITY|CODE_SMELL), `severity` (SonarQube's native 5-level
scale — blocker/critical/major/minor/info, stored as-is, never collapsed),
`message`, `file_path`, `line_number`, `status`, `effort`, `is_seed`.

### `pipeline_runs`
| Column | Type | Notes |
|---|---|---|
| `id` | String PK | `gl-{project_id}-{pipeline_id}` for real GitLab rows |
| `gitlab_project_id`, `project`, `ref`, `status` | | `status`: passed\|failed\|running |
| `started_at`, `finished_at` | | |
| `sast`, `dep_scan`, `secret_detection` | Integer | Always 0 for real GitLab syncs today — this app's pipelines don't run GitLab's built-in scanners |
| `findings` | JSON | Free-form `{cat, text}` list — seed-only in practice |
| `web_url` | String | Real GitLab pipeline URL, captured from data already fetched (free) |
| `failed_jobs` | JSON | `[{stage, name, failure_reason}]` — only fetched (one extra API call) for pipelines that failed and don't already have it captured |
| `is_seed` | Boolean | |

### `fix_suggestions`
`id` PK, `cve_id` (unique, indexed), `suggestion_text`, `copy_cmd`, `advisory_url`, `published`, `cvss_vector`.

### `sync_jobs`
`id` PK, `tool`, `status` (running|success|failed), `started_at`,
`finished_at`, `records_synced`, `error_message`, `phase` (free-text
progress label), `total_items`, `processed_items`, `last_heartbeat_at`
(indexed via the reaper's staleness query — see `docs/BACKEND.md`).

### `integration_configs`
`id` PK, `tool` (unique — one row per tool), `url`, `username`, `secret`
(plaintext — matches this app's existing posture, `.env`/`docker-compose.yml`
also hold plaintext secrets; masked in API responses, never echoed on
`GET`), `extra`, `updated_at`, `last_synced_at` (incremental-sync watermark).

### `services`
`id` PK, `name`, `image_name`, `code_project_key`, `pipeline_project`,
`is_seed`, `created_at`. The three link columns are **intentionally not
foreign keys** — they're value-matches against `images.name`/
`code_projects.project_key`/`pipeline_runs.project`, each independently
nullable. This is a deliberate design choice, not an oversight: an
earlier feature (`PROJECT_META`, since removed) *did* auto-correlate by
matching name strings and was removed because it risked silently
overlaying fake metadata onto a real project sharing a key with seed
data. A `Service` link is only ever set by explicit user choice (the Add
Service panel) or a verified real signal (SonarQube's own DevOps-platform
binding to a GitLab repo, read via `api/alm_settings/get_binding`) — never
by guessing two rows are "the same" because their names look similar.

### `users`
`id` PK, `username` (unique, indexed), `password_hash` (bcrypt),
`role` (String: "admin"|"member"), `is_active`, `created_at`.

### `sessions`
`id` PK — **the random session token itself is the primary key**, not a
separate token column. `user_id` (FK, indexed), `created_at`,
`expires_at` (indexed — the login/auth-check hot path). Modeled as
`UserSession` in Python specifically to avoid colliding with
`sqlalchemy.orm.Session`, which every router already imports as `Session`.

## The `is_seed` convention

`images`, `vulnerabilities`, `code_projects`, `code_issues`,
`pipeline_runs`, and `services` all carry `is_seed: bool`. `seed.py` sets
it `True` on every row it inserts; every real sync path leaves it at its
default `False`. The frontend renders a muted **Demo** badge wherever
`is_seed` is true. This is the only thing that distinguishes fixture data
from real synced data — they otherwise live in the exact same tables and
are queried identically. `users`/`sessions`/`sync_jobs`/`integration_configs`
don't carry it — they're operational tables, not synced-content tables,
so seed-vs-real isn't a meaningful distinction for them (the one exception,
the bootstrap admin account, is just a real account like any other, not
tagged as demo data).
