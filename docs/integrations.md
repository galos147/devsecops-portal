# Integrations — what was built and how it works

This documents the work that took the portal's tool integrations from seeded fake
data to a real, working SonarQube integration plus a generic credential-management
system for all four supported tools (JFrog, SonarQube, Prisma, GitLab).

Written in the order it was built — later sections depend on earlier ones.

---

## 1. Real SonarQube integration

Before this, `backend/app/integrations/sonarqube.py` was a 3-line stub, and even
if it hadn't been, `POST /api/sync/{tool}` only ever actually invoked the sync
function for `tool == "jfrog"` — every other tool silently returned
`{"records": 0}` regardless of what its `sync()` did:

```python
# backend/app/routers/sync.py — before
result = asyncio.run(fn(db)) if tool == "jfrog" else {"records": 0}
# after
result = asyncio.run(fn(db))
```

`sonarqube.py`'s `sync()` was then implemented for real, following the same
shape as the already-working `jfrog.py`:

1. `GET api/projects/search` — list all projects
2. Per project: `GET api/qualitygates/project_status` (pass/fail), `GET api/measures/component`
   (bugs, vulnerabilities, code_smells, coverage, security_hotspots)
3. Per project: paginated `GET api/issues/search` (statuses `OPEN,CONFIRMED,REOPENED`)
4. Upsert into `CodeProject` / `CodeIssue` by `project_key` / issue `key`

To have something real to talk to, SonarQube Community Edition runs as a
standalone Docker container (not in `docker-compose.yml` — deliberately kept
separate so it's easy to tear down):

```bash
docker run -d --name devsecops-sonarqube \
  --network devsecops-portal_default --network-alias sonarqube \
  -p 9000:9000 -e SONAR_ES_BOOTSTRAP_CHECKS_DISABLE=true \
  sonarqube:community
```

UI at `http://localhost:9000` (default login `admin`/`admin`, forces a password
change). The network alias `sonarqube` is what lets the backend container reach
it at `http://sonarqube:9000` without touching `docker-compose.yml`.

**Files:** `backend/app/integrations/sonarqube.py`, `backend/app/routers/sync.py`

---

## 2. Real data to scan

Two things get scanned so the portal has genuine (not seeded) data:

**The portal's own code** — `sonar-project.properties` at the repo root:

```properties
sonar.projectKey=devsecops-portal
sonar.sources=backend,frontend
sonar.exclusions=**/node_modules/**,**/.next/**,**/__pycache__/**,**/*.pyc
sonar.python.version=3.12
sonar.typescript.tsconfigPath=frontend/tsconfig.json
```

**`sample-projects/webhook-relay/`** — a small, deliberately-flawed Python app
built specifically to exercise a spread of real Sonar rule types (not to be run
or deployed — it exists purely to be scanned):

| File | Planted issue | Real Sonar rule |
|---|---|---|
| `app.py` | SQL injection via f-string query | (not flagged in this ruleset) |
| `app.py` | Hardcoded API key | `python:S6418` |
| `app.py` | `requests.get(..., verify=False)` | `python:S4830` |
| `auth.py` | MD5 password hashing | `python:S4790` |
| `auth.py` | `eval()` on config input | (not flagged) |
| `utils.py` | 49-deep cognitive complexity | `python:S3776` |
| `utils.py` | Unused local variable | `python:S1481` |
| `worker.py` | `pickle.loads()` on external bytes | (not flagged) |

Not every planted pattern gets flagged — see the [Security Hotspots](#5-security-hotspots)
section for why.

Run against either project with the official scanner image, no local install needed:

```bash
docker run --rm --network devsecops-portal_default \
  -e SONAR_HOST_URL=http://sonarqube:9000 -e SONAR_TOKEN=<user-token> \
  -v "<repo-path>:/usr/src" \
  sonarsource/sonar-scanner-cli
```

(mount the whole repo for `devsecops-portal`, or just
`sample-projects/webhook-relay` for that one.) SonarQube processes the report
asynchronously — poll `GET /api/ce/task?id=<task-id>` (the scanner prints the
task id) until `status: SUCCESS` before syncing.

The 8 fake `CodeProject`/`CodeIssue` rows from `backend/seed.py` were then
deleted from the live DB (`DELETE FROM code_issues/code_projects WHERE
project_key NOT IN ('devsecops-portal','webhook-relay')`) so `/code-quality`
shows only real data. Note this was a live data delete, not a code change —
`seed.py` itself still contains the fake rows, so a fresh `docker compose down
-v && up` followed by `python seed.py` would reintroduce them.

**Files:** `sonar-project.properties`, `sample-projects/webhook-relay/*`

---

## 3. SonarQube dashboard links

`CodeProject` gained a `sonar_url` column, populated during sync as
`{public_base}/dashboard?id={project_key}`. Two separate URLs are needed
because of the Docker network split:

- `SONAR_URL` — how the **backend container** reaches Sonar (`http://sonarqube:9000`, the network alias)
- `SONAR_PUBLIC_URL` — how the **browser** reaches Sonar (`http://localhost:9000`, the published port)

```python
# backend/app/integrations/sonarqube.py
def _public_base(cfg: dict) -> str:
    if cfg["source"] == "database":
        return cfg["url"].rstrip("/")
    return (settings.sonar_public_url or settings.sonar_url).rstrip("/")
```

On the frontend, each project card's metric tiles (Bugs / Vulns / Code Smells /
Hotspots) are clickable, linking straight into Sonar's issue list pre-filtered
by type — e.g. clicking "22" under Bugs opens
`.../project/issues?id=devsecops-portal&resolved=false&types=BUG`. This
replaced the old behavior where the "Open in SonarQube ↗" link only existed for
the 8 fake seeded projects (via a hardcoded `PROJECT_META` map with fake
`sonar.corp` URLs) — real projects now get a real link derived from `sonar_url`,
with the fake map still used as a fallback so the demo projects keep working.

**Files:** `backend/app/models/code_project.py`, `frontend/app/code-quality/page.tsx`

---

## 4. Real rule descriptions in the Fix panel

Clicking "Fix" on a code-quality issue used to show a client-side template
string (`Review the ${rule_id} rule...`) — no real content. `GET
/api/rules/{rule_id}` now proxies SonarQube's own `api/rules/show`:

- Combines the `root_cause`/`introduction` + `how_to_fix` description sections
- Strips HTML to plain text (`re.sub(r"<[^>]+>", " ", ...)` + `html.unescape`)
- Caps at 700 characters (some rules, e.g. `python:S4830`, have a separate
  `how_to_fix` block per ecosystem — stdlib/httpx/requests/aiohttp/openssl —
  and concatenating all of them produces an unreadable wall of text for a
  420px side panel)
- Returns a `rule_url` pointing at `{base}/coding_rules?open={rule_id}&rule_key={rule_id}`

The panel opens instantly with what's already known (title/severity/message/
file:line), then fills in the real description and a **"View Rule ↗"** link
once the fetch resolves — same instant-then-enrich pattern the CVE Fix panel
already used. If SonarQube is unreachable, the endpoint returns a clean `404`
(not a `500` — an early version let an unhandled `httpx` connection error
through) and the panel just stays on the generic fallback text.

**Files:** `backend/app/integrations/sonarqube.py` (`fetch_rule_info`),
`backend/app/routers/code_quality.py`, `frontend/components/FixPanel.tsx`

---

## 5. Security Hotspots

Comparing against [DefectDojo](https://github.com/defectdojo/django-defectdojo)'s
`dojo/tools/api_sonarqube/api_client.py` surfaced a real gap: SonarQube tracks
**Security Hotspots** — security-sensitive code patterns needing human judgment
(e.g. `subprocess` with `shell=True`) — as a separate data type from regular
issues, via `api/hotspots/search`, not `api/issues/search`.

Synced the same way as issues, skipping already-`REVIEWED` ones:

```python
severity = (hotspot.get("vulnerabilityProbability") or "").lower() or None  # HIGH/MEDIUM/LOW
rule_id = hotspot.get("ruleKey")  # a normal Sonar rule key — /api/rules/{rule_id} works for free
```

Stored as `CodeIssue` rows with `type="SECURITY_HOTSPOT"`, `id` prefixed
`hotspot:` so it can never collide with a regular issue key. `CodeProject`
also gained a `hotspots` count from the `security_hotspots` measure, shown as
a 4th metric tile linking to `{base}/security_hotspots?id={project_key}`.

**Honest caveat:** this SonarQube Community Edition build ships **zero**
Security Hotspot rules for Python, JS/TS, or Java — confirmed via `GET
api/rules/search?types=SECURITY_HOTSPOT` returning only 2 rules total, both
VB.NET/C# regex-timeout rules. A `subprocess.run(cmd, shell=True)` line was
added to `worker.py` specifically to test this and triggered nothing, so it
was removed again. The sync code is correct against the real, documented API
and will populate real data against any Sonar edition/language combo that
does classify findings as hotspots — it just can't demonstrate non-empty
data in this environment.

Scope was deliberately **read-only** — no write-back of review status to
Sonar (DefectDojo also supports `hotspots/change_status` to push triage
decisions back; that's a bigger, separate feature involving a mutating call
to an external system).

**Files:** `backend/app/integrations/sonarqube.py` (`_sync_hotspots`),
`backend/app/models/code_project.py`, `frontend/app/code-quality/page.tsx`

---

## 6. Generic Integrations / Settings page

Every previous step still required manually editing `.env` and running
`docker compose up -d backend` to pick up new credentials. This replaces that
with a UI-driven config system, generalized across all 4 tools:

**Data model** — one generic shape for every tool, `IntegrationConfig`:
`tool`, `url`, `username`, `secret`, `extra` (JFrog's repo name; unused by the
other 3). Same 3 form fields for every tool regardless of its real auth model:

| Tool | URL | Username field holds | Secret field holds |
|---|---|---|---|
| JFrog | Artifactory URL | username | password / API key |
| SonarQube | Sonar URL | *(blank)* | token — API already accepts `(token, "")` as Basic Auth |
| Prisma Cloud | Prisma URL | access key | secret key |
| GitLab | GitLab URL | *(blank)* | personal access token |

**Config resolution** (`backend/app/integrations/config_resolver.py`) — a
saved DB row takes precedence; falls back to the existing `.env`-based
`Settings` object when nothing's saved yet, so nothing that already worked
via `.env` broke:

```python
def resolve(db: Session, tool: str) -> dict:
    row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == tool).first()
    if row and row.url and row.secret:
        return {..., "source": "database"}
    env = ENV_DEFAULTS[tool]()
    if env["url"] and env["secret"]:
        return {**env, "source": "env"}
    return {..., "source": "none"}
```

`jfrog.py` and `sonarqube.py`'s `sync()` (and the rule-info endpoint) all
route through this instead of reading `settings.*` directly.

**Test Connection** — each integration module got a real
`test_connection(url, username, secret)`:

- JFrog: `GET {url}/artifactory/api/system/ping`
- SonarQube: reuses the `projects/search` call `sync()` already makes
- Prisma: `POST {url}/login` with `{username: access_key, password: secret_key}` (first real code in this file — `sync()` itself is still a stub)
- GitLab: `GET {url}/api/v4/user` with a `PRIVATE-TOKEN` header (same — `sync()` still stubbed)

Every call is wrapped in `try/except httpx.HTTPError` so a bad URL returns a
clean `{"ok": false, "message": "..."}` instead of a 500.

**API:**

```
GET  /api/integrations              → all 4 tools, secret masked (secret_set: bool only)
PUT  /api/integrations/{tool}       → save url/username/secret/extra (blank secret = keep existing)
POST /api/integrations/{tool}/test  → live-test, optionally with unsaved form values
```

**UI** (`frontend/app/settings/page.tsx`) — replaced the old read-only
"configured via `JFROG_URL`, `JFROG_API_KEY`..." display with a real form per
tool: URL / Username / Secret inputs (secret is write-only — shows a masked
placeholder, only sent on save if actually changed), Test Connection with an
inline testing/success/failure state, Save, and a source badge (**From
.env** / **Saved** / **Not configured**) so it's always clear what's actually
active. The existing Sync Now / last-sync-status section is unchanged
underneath.

**Files:** `backend/app/models/integration_config.py`,
`backend/app/integrations/config_resolver.py`,
`backend/app/routers/integrations.py`, `backend/app/integrations/{jfrog,sonarqube,prisma,gitlab}.py`,
`frontend/app/settings/page.tsx`

---

## Operating notes / gotchas

- **Frontend file-watch is unreliable over the Windows Docker bind mount.**
  Editing a `frontend/` file does not reliably trigger Next.js's dev-server
  recompile — the source changes on disk (verified via mtime inside the
  container), but the served JS bundle can silently stay stale. Always run
  `docker compose restart frontend` after any frontend edit and verify by
  grepping the served bundle
  (`curl .../_next/static/chunks/app/<route>/page.js`) for the new code
  before assuming it's live. The backend's `uvicorn --reload` does not have
  this problem.
- **DB schema changes were applied by hand.** There's no Alembic in this
  project — `Base.metadata.create_all()` only creates missing tables, it
  never alters existing ones. New columns (`code_projects.sonar_url`,
  `code_projects.hotspots`) were added via
  `docker exec devsecops-portal-db-1 psql -U devsecops -d devsecops -c "ALTER TABLE ..."`.
  A brand-new table (`integration_configs`) didn't need this — `create_all()`
  picked it up on the next backend restart.
- **SonarQube token types matter.** Tokens prefixed `sqa_` are Project
  Analysis Tokens — scanner-only, return `403 Insufficient privileges` on
  Web API calls like `projects/search`. Tokens prefixed `squ_` are User
  Tokens — what the sync/test-connection code actually needs. Generate one
  under **My Account → Security → Generate Tokens → type: User Token**.
- **The `devsecops-sonarqube` container is standalone**, not part of
  `docker-compose.yml`. `docker stop devsecops-sonarqube && docker rm
  devsecops-sonarqube` tears it down cleanly; re-run the `docker run` command
  in [section 1](#1-real-sonarqube-integration) to bring it back (data does
  not persist across removal — no volume was mounted).

## Not done / stubbed

- Prisma Cloud and GitLab `sync()` are still 3-line stubs — only
  `test_connection()` is real for those two. Wiring up their actual data
  sync (image/vulnerability scan results for Prisma, pipeline data for
  GitLab) is a separate task.
- No write-back of Security Hotspot review status to SonarQube (read-only
  sync only, by explicit choice — see [section 5](#5-security-hotspots)).
- Saved credentials are plaintext in Postgres, masked only in API responses
  (never echoed back over `GET`) — no encryption at rest. Matches the app's
  existing posture (`.env`/`docker-compose.yml` also hold plaintext secrets)
  but would need a `cryptography`-based approach for anything beyond a local
  demo.
