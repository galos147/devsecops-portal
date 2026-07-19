# Integrations — what was built and how it works

> **This is the historical decision log** — a chronological, narrative
> record of *why* each integration was built the way it was, in the order
> it happened. For "what exists right now," see
> [`docs/ARCHITECTURE.md`](ARCHITECTURE.md) and its linked deep dives
> (`BACKEND.md`/`FRONTEND.md`/`DATABASE.md`) instead — this file stays as
> the record of the reasoning and dead ends behind the current design.

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
    # SONAR_PUBLIC_URL is for exactly this: the URL a browser can reach, which
    # may differ from cfg["url"] (backend calls SonarQube over the Docker
    # network as "http://sonarqube:9000"; a browser needs localhost).
    if settings.sonar_public_url:
        return settings.sonar_public_url.rstrip("/")
    return cfg["url"].rstrip("/")
```

**Bug fixed later:** the first version of this only applied `SONAR_PUBLIC_URL`
when `cfg["source"] != "database"` (i.e. only for the old `.env`-fallback
path — see section 8, that fallback no longer exists at all). Once a
connection is saved through Settings, `source` is always `"database"`, so
the override was silently never applied and the generated link used the
internal `sonarqube:9000` hostname — unclickable from a real browser. Fixed
to always prefer `SONAR_PUBLIC_URL` when set, regardless of source.

On the frontend, each project card's metric tiles (Bugs / Vulns / Code Smells /
Hotspots) are clickable, linking straight into Sonar's issue list pre-filtered
by type — e.g. clicking "22" under Bugs opens
`.../project/issues?id=devsecops-portal&resolved=false&types=BUG`. This
replaced the old behavior where the "Open in SonarQube ↗" link only existed
for the 8 fake seeded projects, via a hardcoded `PROJECT_META` map (fake
languages/line-counts/`sonar.corp` URLs) keyed by the same project-key
strings the seed data used — since removed entirely (see section 8) because
it could silently overlay fake metadata onto a real project sharing a key.

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

**Config resolution** (`backend/app/integrations/config_resolver.py`) —
originally a saved DB row took precedence, falling back to the `.env`-based
`Settings` object when nothing was saved yet (`source: "env"`). **That
fallback was removed entirely — see section 8.** `resolve()` now only ever
returns `source: "database"` or `source: "none"`:

```python
def resolve(db: Session, tool: str) -> dict:
    row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == tool).first()
    if row and row.url and row.secret:
        return {..., "source": "database"}
    return {..., "source": "none"}
```

`jfrog.py`, `sonarqube.py`, and `gitlab.py`'s `sync()` (and the rule-info
endpoint) all route through this instead of reading `settings.*` directly.

**Test Connection** — each integration module got a real
`test_connection(url, username, secret)`:

- JFrog: `GET {url}/artifactory/api/system/ping`
- SonarQube: reuses the `projects/search` call `sync()` already makes
- Prisma: `POST {url}/login` with `{username: access_key, password: secret_key}` (first real code in this file — `sync()` itself is still a stub)
- GitLab: `GET {url}/api/v4/user` with a `PRIVATE-TOKEN` header (`sync()` is now real too — see section 7)

Every call is wrapped in `try/except httpx.HTTPError` so a bad URL returns a
clean `{"ok": false, "message": "..."}` instead of a 500.

**API** (extended further in section 8 with the add/remove flow):

```
GET    /api/integrations                 → all 4 tools, secret masked (secret_set: bool only)
PUT    /api/integrations/{tool}          → save url/username/secret/extra (blank secret = keep existing)
DELETE /api/integrations/{tool}          → unregister (clears saved connection only)
DELETE /api/integrations/{tool}/data     → purge that tool's synced data rows (separate from unregister)
POST   /api/integrations/{tool}/test     → live-test, optionally with unsaved form values
```

**UI** (`frontend/app/settings/page.tsx`, since substantially redesigned —
see section 8) — replaced the old read-only "configured via `JFROG_URL`,
`JFROG_API_KEY`..." display with a real form per tool: URL / Username /
Secret inputs (secret is write-only — shows a masked placeholder, only sent
on save if actually changed), Test Connection with an inline
testing/success/failure state, and Save. The existing Sync Now /
last-sync-status section is unchanged underneath.

**Files:** `backend/app/models/integration_config.py`,
`backend/app/integrations/config_resolver.py`,
`backend/app/routers/integrations.py`, `backend/app/integrations/{jfrog,sonarqube,prisma,gitlab}.py`,
`frontend/app/settings/page.tsx`

---

## 7. Real GitLab integration

Same goal as section 1 (real data, not a stub) but for GitLab: a real repo,
a real CI pipeline that validates against SonarQube, and `gitlab.py`'s
`sync()` implemented for real.

**GitLab.com instead of self-hosted GitLab CE.** Self-hosting was tried
first (same standalone-container pattern as SonarQube) but abandoned:
GitLab CE's memory usage climbed past 10GB and never leveled off, pushing
the host down to ~2.6GB free — a real stability risk, not just slow. Used
GitLab.com instead (zero local resource cost for the server), which raises
a real problem: GitLab.com's own shared runners run on GitLab's
infrastructure and have no route to a `sonarqube:9000` running on this
machine's Docker network. Solved by running only the lightweight
**GitLab Runner** component locally, registered against the GitLab.com
project, rather than the full GitLab server:

```bash
docker run -d --name devsecops-gitlab-runner \
  --network devsecops-portal_default \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -v gitlab-runner-config:/etc/gitlab-runner \
  gitlab/gitlab-runner:latest

docker exec devsecops-gitlab-runner gitlab-runner register \
  --non-interactive --url "https://gitlab.com" --token "<runner-auth-token>" \
  --executor "docker" --docker-image "alpine:latest" \
  --docker-network-mode "devsecops-portal_default"
```

`--docker-network-mode devsecops-portal_default` is the key line — it puts
every job container the runner spins up on the same Docker network as
`devsecops-sonarqube`, so `sonar-scanner` can resolve `sonarqube:9000` by
its network alias exactly like the backend does. The repo is real
(`sample-projects/webhook-relay` pushed to `galos-group/webhook-relay` on
GitLab.com), the pipeline job is real, it just executes on hardware that
happens to be this machine instead of GitLab's cloud runners.

**`.gitlab-ci.yml`** (also present in `sample-projects/webhook-relay/` in
this repo, so the setup is reproducible):

```yaml
stages: [validate]

sonar-validate:
  stage: validate
  image: sonarsource/sonar-scanner-cli:latest
  variables:
    SONAR_HOST_URL: "http://sonarqube:9000"
    GIT_DEPTH: "0"
  script:
    - sonar-scanner
  tags:
    - local
```

`tags: [local]` matters — without it, GitLab.com would try to schedule the
job on a shared runner, which would just hang (no route to `sonarqube`).
The `local` tag on the registered runner is what makes only *this* job land
on it. `SONAR_TOKEN` is a masked project CI/CD variable (`api/v4/projects/:id/variables`),
reusing the existing `squ_...` SonarQube user token.

**`gitlab.py`'s `sync()`** now follows the same shape as `jfrog.py`/`sonarqube.py`:
`GET api/v4/projects?membership=true` → per project `GET
api/v4/projects/:id/pipelines` → per pipeline, fetch detail for
`started_at`/`finished_at` → upsert `PipelineRun` by a `gl-{project_id}-{pipeline_id}`
id. GitLab's `success`/`pending`/`created`/etc. statuses are mapped down to
this app's `passed`/`failed`/`running` vocabulary (`STATUS_MAP`).
`sast`/`dep_scan`/`secret_detection` stay `0` and `findings` stays `[]` —
this pipeline only runs a SonarQube validation job, no GitLab SAST/Secret
Detection/Dependency Scanning report artifacts exist to parse, so leaving
these at `0` is accurate, not a placeholder (see the "Not done" list for
what adding those would take).

**Honest caveat — GitLab.com identity verification.** New accounts/groups
on GitLab.com are blocked from running *any* CI pipeline (even against a
self-registered runner) until identity verification is completed —
confirmed via `POST /api/v4/projects/:id/pipeline` returning `400 {"base":
["Identity verification is required in order to run CI jobs"]}`. No API
workaround; requires the account owner to complete verification (phone/card)
at `https://gitlab.com/-/identity_verification` once, in the browser.

**Files:** `backend/app/integrations/gitlab.py`,
`sample-projects/webhook-relay/.gitlab-ci.yml`

---

## 8. Settings page: modular add/remove flow, and data-honesty fixes

Two related pieces of work, both prompted by hands-on use of the Settings
page surfacing real UX and data-integrity problems.

### 8a. Modular Settings + Add/Remove Integration flow

The original Settings page always rendered all 4 tool cards, whether
configured or not. Rebuilt around a **config + hook + component** split
(the pattern to follow for any future page-level refactor — see the
`portal-conventions` skill):

- `frontend/lib/integrations/config.ts` — static per-tool metadata (labels,
  field names, `HAS_USERNAME_FIELD`, `EXTRA_FIELD`, per-tool `ACCENT`
  colors for the monogram badges, `DESCRIPTIONS`)
- `frontend/lib/integrations/useIntegrations.ts` — owns all state/data
  fetching/actions (`updateForm`, `testConnection`, `save`, `unregister`,
  `deleteData`, `triggerSync`)
- `frontend/components/settings/{IntegrationCard,IntegrationFields,AddIntegrationCard,AddIntegrationPanel}.tsx`
  — presentational, driven entirely by the config/hook above

**New flow:** only *connected* tools (`source: "database"`) show as cards.
An **"+ Add Integration"** tile appears whenever any tool isn't configured
— clicking it opens a slide-over (same visual pattern as `FixPanel.tsx`:
dim backdrop + fixed right panel) that lists unconfigured tools, then
switches to the connection form once one's picked.

**Unregister vs. Delete synced data — deliberately separate actions.**
`DELETE /api/integrations/{tool}` only ever removes the saved credentials;
it never touched `images`/`vulnerabilities`/`code_projects`/etc. Testing
this surfaced real confusion (data stayed visible everywhere after
"disconnecting," with no warning) — see 8b for the data-visibility half of
the fix, and note below for the **connection persistence** half. A second,
separately-confirmed action, `DELETE /api/integrations/{tool}/data`, purges
the actual synced rows per tool (images+vulns+packages for jfrog/prisma,
code_projects+code_issues for sonarqube, pipeline_runs for gitlab) — so
data loss is always an explicit, distinct choice, never a side effect of
disconnecting.

**Update: "Delete synced data" now only deletes seed/demo rows.** Originally
this endpoint deleted *all* rows for a tool unconditionally. That became a
real problem once real integrations existed alongside seed data in the same
tables (a real sync adds real rows next to the seed rows, it doesn't replace
them) — the button's name promised to clear demo clutter but would have
silently destroyed real synced data (a real SonarQube project, real GitLab
pipelines) along with it. Fixed by filtering every branch on `is_seed == True`,
so it only ever removes rows `seed.py` created. Renamed in the UI to
"Delete demo data" to match what it actually does now.

**The `.env`-fallback (`source: "env"`) was removed entirely**, backend and
frontend. It existed so a tool pre-configured via `.env` would show as
connected without needing to be re-entered in Settings — but it meant
**Unregister never actually fully disconnected** a tool that also had real
`.env` values: `config_resolver.resolve()` would just fall through to
`ENV_DEFAULTS` and keep reporting `source: "env"`. Confirmed by testing:
saved SonarQube via UI → Unregister → still showed "Connected · via .env"
immediately after. Fix was to delete the fallback path outright
(`config_resolver.py` now only ever returns `"database"` or `"none"`,
`ENV_DEFAULTS`/`Settings` import removed) rather than build a
"force-disabled" override flag — simpler, and matches how the rest of the
app already treats Settings as the single source of truth. `.env` values
for tool credentials (`SONAR_URL`, `JFROG_URL`, etc. in `backend/app/config.py`)
still exist and are still read by `Settings`, but nothing consults them for
connection status anymore — they're effectively dead unless something new
is built to read `Settings` directly again.

**Card redesign** (`IntegrationCard.tsx`) — the original card put a
destructive "Delete synced data" link directly in the header, next to the
connection-status badge, with no visual distinction from routine status
text. Restructured into: monogram + name + a proper status pill in the
header (no actions), grouped fields, a condensed one-line sync-status strip
("Synced 3h ago · 2 records"), and a separated **"Danger zone"** footer
(muted red-tinted top border) holding Unregister/Delete synced data — same
actions, same confirm dialogs, just visually demoted to match their actual
risk level. `sonarqube`/`gitlab` also stopped showing a confusing
"Username (unused)" field — hidden via `HAS_USERNAME_FIELD` instead of
displayed disabled.

**Files:** `frontend/lib/integrations/{config,useIntegrations}.ts`,
`frontend/components/settings/*.tsx`, `frontend/lib/tokens.ts`
(`connectionPillStyle`), `backend/app/routers/integrations.py`
(`DELETE /{tool}/data`), `backend/app/integrations/config_resolver.py`

### 8b. Demo data vs. real data — `is_seed`

Testing the Settings changes above surfaced a bigger issue: `/code-quality`
showed data before SonarQube was ever connected. Root cause: `backend/seed.py`
inserts fake rows into `images`, `vulnerabilities`, `code_projects`,
`code_issues`, `pipeline_runs` (plus fabricated `sync_jobs` history)
completely independent of any integration config, and every read endpoint
queried those tables unconditionally — no code path anywhere checked
`IntegrationConfig`/connection state before serving data.

**Fix — a real `is_seed: bool` column** added to those 5 tables (no
Alembic in this project — applied via one-time `ALTER TABLE ... ADD COLUMN`
against the live DB, `Base.metadata.create_all()` never alters existing
tables). `seed.py` sets it `True` on everything it inserts; real sync code
never sets it, so it defaults `False`. Surfaced through every relevant
schema/API response and shown as a small muted **"Demo"** badge
(`components/DemoBadge.tsx`, `lib/tokens.ts`'s `demoBadgeStyle`) next to
any row/card where it's true, across `code-quality`, `images`,
`vulnerabilities`, `pipelines`, and the dashboard's top-lists.

**Two related honesty fixes, same root cause (nothing checked connection
state before showing data/status):**
- `POST /api/sync/{tool}` used to record a `SyncJob` row with
  `status: "success", records_synced: 0` even when the tool was never
  configured — indistinguishable from "synced, nothing new." Now checks
  `config_resolver` first and returns `{"status": "not_configured", ...}`
  without writing a misleading job row at all.
- `tool_health` (dashboard) and `/api/sync/status` derived status purely
  from the *last historical* `SyncJob` row, so a tool could show a stale
  green "success" indefinitely after being unregistered. Both now also
  check `config_resolver` and expose a `connected: bool`; the frontend
  (`ToolHealthCard.tsx`) forces a "Not connected" grey state whenever
  `connected` is false, regardless of how good the last historical sync
  looked.

Also removed while in here: the `PROJECT_META` hardcoded metadata overlay
on `/code-quality` (see section 3) — a second, independent source of
fake-looking data, unrelated to seeding but discovered at the same time.

**Deliberately deferred** (flagged, not fixed): no periodic sync scheduler
exists at all (`SYNC_INTERVAL_MINUTES` is dead config — see "Not done"
below), and a tool's Settings "Connected" pill doesn't yet reflect a
*failed* sync (e.g. an expired token) — both documented in "Not done /
stubbed" rather than built, to keep this change scoped to demo-data
honesty rather than sync-engine correctness.

**Files:** `backend/app/models/{image,vulnerability,code_project,code_issue,pipeline_run}.py`,
`backend/seed.py`, `backend/app/schemas/{image,vulnerability,code_quality,pipeline,dashboard}.py`,
`backend/app/routers/{sync,dashboard}.py`, `frontend/components/DemoBadge.tsx`,
`frontend/lib/tokens.ts`, `frontend/app/{code-quality,images,vulnerabilities,pipelines,page}.tsx`

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
- **Git Bash mangles absolute Unix paths in `docker` command arguments on
  Windows** — `docker run -v /var/run/docker.sock:/var/run/docker.sock ...`
  or `docker exec <container> cat /var/log/...` silently gets the path
  rewritten to something like `C:/Program Files/Git/var/run/docker.sock`
  before it ever reaches Docker, causing confusing "Access is denied" or
  "No such file" errors that look like a container-side problem but aren't.
  Prefix the command with `MSYS_NO_PATHCONV=1` whenever a `docker`
  invocation has an absolute path in it.
- **Git Bash's bundled `curl` has a stale/incomplete CA bundle** for at
  least some real-world TLS chains (hit this against `gitlab.com`'s
  Cloudflare-fronted cert — `curl: (60) SSL certificate problem: unable to
  get local issuer certificate`, even though the token/request were fine).
  Don't reach for `-k`/`--insecure` to work around it, especially when a
  request carries a real credential — use PowerShell's `Invoke-RestMethod`/
  `Invoke-WebRequest` instead, which uses the Windows system certificate
  store and doesn't have this problem.
- **A GitLab.com pipeline that fails instantly with zero jobs created**
  (`status: "failed"`, `GET .../jobs` returns `[]`, but `ci/lint` says the
  config is valid) — before assuming a config bug, trigger a fresh pipeline
  via `POST /api/v4/projects/:id/pipeline` and read the actual error body;
  new accounts/groups get `{"message":{"base":["Identity verification is
  required in order to run CI jobs"]}}`, which only shows up this way, not
  in the pipeline object itself. Fix is manual, in-browser, one-time (see
  section 7).

## 9. Services: unified cross-tool view + real GitLab↔SonarQube auto-discovery

A `Service` entity (`backend/app/models/service.py`) links a SonarQube project,
a GitLab pipeline project, and a registry image together by **explicit
key-matching, never name-guessing** — `image_name`/`code_project_key`/
`pipeline_project` are each independently nullable, and nothing joins tables
by assuming two same-named rows are the same real thing (see section 8b's
data-honesty rationale — the same concern applies here: two *actually*
unrelated real projects could coincidentally share a name). `/services`
(list) and `/services/[id]` (tabbed detail: Code Quality / Pipelines / Image
& Vulnerabilities) are the UI; `PipelineDetailPanel` and `FixPanel` are
reused as-is on the detail page rather than building duplicate UI.

**Auto-discovery, added after manual linking proved tedious.** Manually
picking a service's three links from dropdowns works but the user
(reasonably) didn't want to do it by hand when a *real* link already exists
somewhere. Two candidate sources were evaluated:

- **Reading `sonar-project.properties` from the GitLab repo** — works with
  zero setup (the file already declares `sonar.projectKey`), but is a step
  removed from SonarQube's own understanding of the relationship.
- **SonarQube's native DevOps Platform (ALM) integration** — chosen instead.
  `api/alm_settings/get_binding?project=<key>` returns the project's *real*
  bound GitLab repository once configured, which is a stronger signal since
  SonarQube itself vouches for the link, not just a file convention.

Setting this up for an **already-existing** SonarQube project (like this
repo's `webhook-relay`, originally created by a bare `sonar-scanner` run) hit
a real API gap: SonarQube 26.7's `api/alm_integrations/import_gitlab_project`
only *creates a new, freshly-bound* project — there's no public endpoint to
retrofit a binding onto one that already exists. Worked around by:
1. `api/alm_settings/create_gitlab` — register the GitLab connection instance-wide.
2. `api/alm_integrations/set_pat` — set the personal access token for the alm setting (required separately from `create_gitlab`'s own token, discovered via trial — `search_gitlab_repos` fails with "No personal access token found" without it).
3. `api/projects/delete` the existing project, then `api/alm_integrations/import_gitlab_project` to recreate it bound — this assigns an ugly auto-generated key (`galos-group_webhook-relay_<uuid>`), which loses the clean `webhook-relay` key the repo's own `sonar-project.properties` expects.
4. `api/projects/update_key` back to `webhook-relay` — confirmed the binding survives a rekey.

This means the existing project's SonarQube analysis history was reset (quality
gate shows `NONE` until the CI pipeline runs `sonar-scanner` again) — a known,
accepted one-time cost of switching an existing project onto ALM binding this way.

**App-side hookup** (`backend/app/integrations/sonarqube.py`): after each
project upsert during `sync()`, `_correlate_service()` calls `get_binding`
for that project; if it's a real `alm: "gitlab"` binding, derives
`pipeline_project` from `repositoryUrl`'s path and either fills in whichever
of `code_project_key`/`pipeline_project` is still empty on a matching
existing `Service`, or creates a new one — **never overwrites an
already-set field**, so a user's manual edits (or a prior discovery) are
never clobbered. A 404 from `get_binding` (no binding configured) is the
common, expected case for every project that hasn't gone through this setup
— not an error.

## 10. JFrog Xray: scaling to ~2M artifacts + per-image on-demand sync

The original JFrog sync was a naive nested loop — list every image, list every
tag per image, fetch a manifest per tag, call Xray's per-artifact
`summary/artifact` once per tag — with zero pagination anywhere and a full
re-walk every time, synchronously inside the request. Fine for a handful of
demo images, unworkable for a real deployment's scale.

**DB**: added the one index that mattered most —
`vulnerabilities.image_id` (the FK every image-detail/vuln-count query
filters on) had none. Added a composite `(image_id, status)` index alongside
it, plus `images.digest`/`registry`/`source` (exact-match) and `pg_trgm` GIN
indexes on `images.name`/`tag` (needed since `ilike '%x%'` can't use a plain
btree index). Added `IntegrationConfig.last_synced_at` (a per-tool sync
watermark) and `SyncJob.phase`/`total_items`/`processed_items` (progress
tracking). Added explicit connection-pool settings to `database.py`
(`pool_size=10, max_overflow=20, pool_pre_ping=True, pool_recycle=1800`) —
`pool_pre_ping` matters specifically because sync now spans minutes with idle
gaps between batches, where a silently-dropped connection would otherwise
surface as an opaque error mid-sync.

**Backend** (`backend/app/integrations/jfrog.py`, rewritten): inventory
(image/tag listing) now uses Artifactory's real `n`/`last` pagination params,
with bounded-concurrency (`asyncio.Semaphore(15)`) manifest fetches instead
of one at a time. Vulnerability data now comes from Xray's **Reports API**
(`POST /xray/api/v1/reports/vulnerabilities` → poll → paginated content) —
the actual bulk/async export mechanism, scoped per-repository — instead of
one `summary/artifact` call per tag. Incremental sync via the report's
`filters.scan_date.start` = last watermark (5-minute overlap buffer for clock
skew), so repeat syncs only pull what changed. All DB writes are now batched
`INSERT ... ON CONFLICT DO UPDATE` (500-1000 rows/statement) instead of
per-row query-then-insert-then-commit.

**Update: Reports API row field names are now confirmed, not guessed** — and
the confirmation surfaced real mistakes in the original assumptions. Source:
`defectdojo/django-defectdojo`'s `jfrog_xray_unified` parser test fixture
(`unittests/scans/jfrog_xray_unified/Vulnerabilities-Report-XRAY_Unified.json`,
a real captured Xray Unified report response), cross-checked against
DefectDojo's own parser (`dojo/tools/jfrog_xray_unified/parser.py`) for how
each field is actually used in production. What was wrong before:
- **There is no `sha256`/digest field on a report row at all.** The artifact
  is identified by `path` (e.g. `"docker-reg/test-artifact/1.0.5/"` =
  repo/name/tag) — matching by digest, the original assumption, could never
  have worked. Fixed to parse `path` directly into the same deterministic
  `_img_id(repo, name, tag)` computed during the inventory walk, with a
  cheap existence check (`_existing_image_ids`) against real synced images
  rather than fabricating a match — this also means no DB digest lookup is
  needed at all for this path.
- **`cves` is an array, not a single top-level `cve` field** — one Xray
  issue (row) can carry multiple CVEs. Fixed to loop over all of them
  (mirroring how `_parse_artifact_summary` already handles the `summary/artifact`
  API's equivalent structure), producing one `Vulnerability` row per CVE
  rather than picking just one per issue.
- Advisory links come from `references` (a list), not a `cve_link` field.
  Per-CVE CVSS lives in `cves[].cvss_v3_score`/`cvss_v2_score`, with the
  row-level `cvss3_max_score` as a fallback.
- Verified end-to-end against the real fixture: 7 report rows → 21
  vulnerability rows (one row alone carries 15 CVEs), 7 package rows, 15 fix
  suggestions — matches hand-counting the fixture exactly.

`vulnerable_component`'s format (`"scheme://[epoch:]name:version"`) and
`package_type`/`fixed_versions`/`severity`/`summary` field names were already
correct in the original guess.

`summary/artifact` (already batch-capable) is kept as-is for the **per-image
on-demand sync** (`POST /api/images/{id}/sync`, "Update" button on the image
detail page) — fast enough for one artifact that it doesn't need the
background-job machinery below.

**Background execution** (`backend/app/routers/sync.py`): `POST /api/sync/{tool}`
no longer blocks the request for the sync's duration — it creates the
`SyncJob` row, launches an `asyncio.create_task` (kept in a module-level
`set()` so it isn't garbage-collected mid-run), and returns immediately.
Chose this over a real task queue (Celery/Redis/arq) to match this app's
established "prefer lightweight infra" precedent (see section 7's
GitLab-runner-vs-full-GitLab-CE choice) — accepted trade-off: a sync in
progress is lost if its owning process dies. `GET /api/sync/status`'s
ordering changed from `finished_at.desc()` to `started_at.desc()` —
`finished_at` is `NULL` for a running job, and Postgres's default `DESC`
null-ordering is `NULLS FIRST`, so the old query only "worked" by that
implicit accident; now that running and finished jobs genuinely coexist,
`started_at` (always set) is the reliable ordering. Overlapping syncs for
the same tool return `409`.

**Heartbeat-based orphan recovery, not "any restart = every running job is
dead."** The first version of this (session-initial) simply marked every
`"running"` `SyncJob` as `"failed"` on backend startup. That's fine for a
single instance, but the real deployment target is `k8s/backend-deployment.yaml`
(2 replicas) — with that blanket rule, a routine restart of *one* pod (rolling
update, liveness probe, node drain — nothing to do with the sync itself)
would incorrectly kill a sync genuinely still running and progressing on a
*different*, healthy pod. Fixed by adding `SyncJob.last_heartbeat_at`: the
running task ticks it every ~15s from its own DB session (never share a
Session across concurrent coroutines — even under cooperative asyncio,
SQLAlchemy Sessions aren't safe for that), set immediately at job creation to
close the race before the first tick. `main.py` now reaps a `"running"` job
only if its heartbeat has gone stale (90s — several missed ticks' worth of
buffer), both once at startup *and* on a continuous 60s loop (`_reaper_loop`)
— the loop matters because a pod that never restarts still needs to notice
when a *different* pod's sync actually died.

**Multi-repo support.** The JFrog "Repository" Settings field is now a
comma-separated list (`_parse_repos()`), not a single repo — real Artifactory
deployments at this scale are typically spread across several repos, and the
original single-repo design wouldn't have reached the others at all. The
Artifactory catalog/tags walk still has to loop per-repo (no bulk
cross-repo listing API exists), but the Xray Reports API's `resources`
scope accepts an array, so vulnerability data for *all* configured repos
comes back in one report rather than N separate ones. Caught a real bug
along the way: `_img_id(name, tag)` didn't include the repo, so the same
image name:tag in two different repos (e.g. `app:1.0` in both
`docker-staging` and `docker-prod`) would've collided onto the same row.
Fixed to `_img_id(repo, name, tag)` — free to fix now since no real JFrog
data had synced into this environment yet; would have needed a data
migration otherwise. `Image.registry` is now stored as `"{host}/{repo}"` so
`sync_one_image` (the per-image on-demand path) can tell which repo a
specific already-synced image came from.

**Verified live**: the index migrations applied cleanly (confirmed via `\d`);
job lifecycle (`running`→`success`/`failed` with `phase`/`processed_items`
advancing); the `409` overlap guard (two genuinely concurrent `POST`
requests, one `200` one `409`); upsert idempotency (re-ran GitLab/SonarQube
syncs, confirmed no duplicate rows); **the actual multi-replica scenario** —
inserted one fresh-heartbeat and one stale-heartbeat `"running"` job,
restarted the backend, confirmed the fresh one survived untouched and only
the stale one got reaped; confirmed the periodic (non-restart) reaper loop
independently catches a stale job too; confirmed `_img_id` no longer
collides across repos and `_parse_repos` splits/trims/defaults correctly.
**Not verified**: true 2,000,000-artifact throughput, real Reports API
timing/field-names at that scale, or the per-image sync endpoint against a
live Xray tenant — none of that is reachable from this local dev
environment.

## 11. Local login + two-role RBAC (Admin / Member)

The portal went from **zero authentication** (anyone who could reach it had full access,
including tool credentials in Settings) to local accounts with two roles: Admin (manages
tool connections/credentials and user accounts) and Member (everything else — browsing,
Fix suggestions, triggering syncs).

**Session mechanism: DB-backed session token in an httpOnly cookie, not JWT.** Chosen
because (a) `next.config.mjs` already proxies `/api/*` to the backend, so the browser
only ever sees one origin — cookies flow with zero CORS complexity; (b) the real k8s
deployment runs 2 backend replicas with only Postgres, no Redis — a `sessions` table
fits this app's established "Postgres is the source of truth, keep infra lightweight"
pattern (same reasoning as the JFrog sync's DB-heartbeat over adding a broker); (c)
logout/revocation is a trivial row delete, unlike JWT's inherent non-revocability.

**Gating mechanism**: one line changed per `app.include_router(...)` call in
`backend/app/main.py` (`dependencies=[Depends(get_current_user)]`, or `require_admin`
for `integrations.router`/the new `users.router`) — zero changes inside any of the 9
pre-existing router files. `GET /health` stays a bare unauthenticated route (k8s
probes depend on it); `auth.router` is registered with no router-level dependency at
all, since that would make `/login` itself unreachable.

**Bootstrap trade-off, stated plainly**: since Settings/user-management is now itself
gated, `backend/seed.py`'s `bootstrap_admin()` creates a default account
(`admin` / `ChangeMe123!`) only if zero users exist, logged loudly to console. This is
a hardcoded, visible default credential — acceptable for a small-team internal tool with
no email infrastructure to deliver a real invite any other way, but **must be changed on
first login**. Matches this app's existing posture of documenting trade-offs rather than
hiding them (see the plaintext-credentials-in-Postgres note below).

**No TLS exists anywhere** (checked `k8s/ingress.yaml` — no `tls:` section) — the
cookie's `secure` flag is environment-configurable (`COOKIE_SECURE`, defaults `false`
to match today's plain-HTTP reality) rather than hardcoded, so it's a one-variable flip
once TLS lands in front of the ingress, not a code change. Session cookies over plain
HTTP can be sniffed on the wire in the meantime — a known, pre-existing gap this
feature doesn't newly introduce but also doesn't fix.

**Verified live**: full login → session-cookie → protected-route flow; a Member role
correctly gets `403` on `/api/integrations` and `200` everywhere else including
triggering a sync; logout actually deletes the server-side `sessions` row (replaying
the old cookie value afterward correctly returns `401`, proving it's not just a
client-side cookie clear); the last-remaining-admin guard and the self-delete guard,
tested as two **independent** scenarios (a multi-admin dance to isolate the last-admin
arithmetic from the self-delete check, since demoting/deleting yourself would otherwise
always trip the self-guard first regardless of admin count).

## 12. Dependency-Track: SBOM-based dependency vulnerability tracking

A fifth tool integration, and a different shape from the first four: JFrog Xray
scans **container images** the portal already knows about (section 10);
[Dependency-Track](https://dependencytrack.org/) scans **open-source
dependencies** via a Software Bill of Materials (SBOM), which the portal
never generates itself. The portal only ever reads Dependency-Track's REST
API after the fact — the same read-only shape every other integration in
this app uses.

**Architecture.** GitLab CI (not the portal) runs Trivy to produce a
CycloneDX SBOM and uploads it directly to Dependency-Track's own
`POST /api/v1/bom`, with `autoCreate=true` so Dependency-Track creates the
project on first upload. Dependency-Track then runs its own vulnerability
analysis against that SBOM in the background. `backend/app/integrations/dependency_track.py`'s
`sync()` never touches an SBOM or a scanner — it does two things, once per
sync:

1. `GET /api/v1/project` (paginated, `pageSize=100`) — list every project
   Dependency-Track knows about, upsert into a new `DependencyTrackProject`
   table.
2. For each project with `lastBomImport` set (i.e. an SBOM has actually been
   imported), `GET /api/v1/finding/project/{uuid}` — upsert into
   `vulnerabilities`.

Full re-sync of findings per project on every run, no incremental watermark
— finding lists here are small, unlike JFrog's ~2M-artifact scale (section
10), so the extra machinery isn't justified yet.

**Data-model split: `dt_project_id` vs `image_id`.** Rather than a parallel
table, Dependency-Track findings live in the *same* `vulnerabilities` table
JFrog Xray already writes to. `Vulnerability` gained a nullable
`dt_project_id` (FK to the new `dependency_track_projects` table) alongside
the existing nullable `image_id` (FK to `images`) — the two are mutually
exclusive per row, never both set: a JFrog finding has `image_id` and
`dt_project_id=NULL`; a Dependency-Track finding has `dt_project_id` and
`image_id=NULL`. `image_id` was made nullable specifically to allow this
(previously `NOT NULL`, since every vulnerability used to belong to an
image). The frontend's affected-count cell and CVE-detail "Affected
Projects" table (built in Task 6/7) both key off which of the two is set,
so one CVE can show combined "N images, M projects" counts without a UNION
query — `VulnGroupOut.affected_projects` and the new `AffectedProjectOut`
schema (`id`, `name`, `version`, `installed_version`, `fixed_version`,
`status`) sit alongside the pre-existing `affected_images`/`AffectedImageOut`.

**Confirmed API field names** — captured from a real local Dependency-Track
4.14.2 instance *before* the parser was written (same discipline the JFrog
Reports API correction in section 10 argues for), so unlike that section,
**no field-name corrections were needed** — every field the plan assumed
matched the real response exactly:

```json
// GET /api/v1/project
{"uuid": "...", "name": "test-project", "version": "1.0.0", "lastBomImport": 1784394010064}

// GET /api/v1/finding/project/{uuid}
{
  "component": {"name": "log4j-core", "version": "2.14.1", "purl": "...", "cpe": "..."},
  "vulnerability": {
    "vulnId": "CVE-2021-44228", "source": "NVD",
    "severity": "CRITICAL", "cvssV3BaseScore": 10.0, "cvssV2BaseScore": 9.3,
    "description": "..."
  },
  "analysis": {"isSuppressed": false}
}
```

`vulnerability.severity` is an uppercase string (`CRITICAL`/`HIGH`/`MEDIUM`/
`LOW`/`INFO`/`UNASSIGNED`) mapped down via `_SEVERITY_MAP`; `INFO` and
`UNASSIGNED` both fold to `low` since this app's `Severity` enum only has
four levels. CVSS prefers `cvssV3BaseScore`, falling back to
`cvssV2BaseScore`. `lastBomImport` is `null` until a project's first SBOM
upload — that's the signal `sync()` uses to skip the findings call for
projects that exist but have nothing scanned yet.

**Real CI bugs found and fixed (`sample-projects/webhook-relay/.gitlab-ci.yml`,
also mirrored to the GitLab.com copy of the repo):**

```yaml
sbom-scan:
  stage: test
  image:
    name: aquasec/trivy:0.58.0   # pinned — see below
    entrypoint: [""]
  script:
    - trivy fs --format cyclonedx -o sbom.json .
    - apk add --no-cache curl
    - >
      curl --fail-with-body -X POST "$DEPENDENCY_TRACK_URL/api/v1/bom"
      -H "X-Api-Key: $DEPENDENCY_TRACK_API_KEY"
      -F "autoCreate=true" -F "projectName=webhook-relay"
      -F "projectVersion=$CI_COMMIT_SHORT_SHA" -F "bom=@sbom.json"
  tags: [local]
  allow_failure: true
```

1. **CycloneDX version mismatch.** `aquasec/trivy:latest` emits CycloneDX
   1.7; Dependency-Track 4.14 rejects it outright with
   `400 "Unrecognized specVersion 1.7"`. Fixed by pinning
   `aquasec/trivy:0.58.0`, which emits 1.6 — verified accepted by a local
   rehearsal upload before pushing. Bumping the image tag later without
   re-checking DT's supported spec versions will silently reintroduce this.
2. **Empty SBOM.** `webhook-relay` had no dependency manifest at all, so
   `trivy fs` found zero components to enumerate — an empty BOM isn't a
   sync bug, it's Trivy having nothing to scan. Fixed by adding
   `sample-projects/webhook-relay/requirements.txt` with deliberately old
   pins (`requests==2.25.1`, `urllib3==1.26.4`) purely so there's something
   real for Trivy to find.

Two deviations from the original plan, both necessary once real GitLab CI was
in the loop: `tags: [local]` (GitLab.com's shared runners have no route to
the local Dependency-Track container — same constraint as the SonarQube job
in section 7) and `curl --fail-with-body` (so a rejected upload fails the
job visibly in the log instead of a silent 400 that `allow_failure: true`
would otherwise paper over as "succeeded").

**Honest caveat: PURL vs. CPE matching.** Predicted during the Task 2
rehearsal and confirmed for real in the first live CI run:
`webhook-relay`'s `requirements.txt`-derived components carry a `purl` but
no `cpe` — Trivy's CycloneDX output is primarily PURL-based. Dependency-Track's
built-in **Internal Analyzer** matches almost exclusively via CPE, so a
PURL-only component produces **zero findings**, even against a fully
mirrored NVD database. This is not a sync bug and there's nothing in
`dependency_track.py` to fix — the portal correctly reports what
Dependency-Track itself found, which is nothing, because it wasn't asked to
match the way Trivy's output is shaped. The real fix is enabling
**OSS Index** (Sonatype's free PURL-based analyzer), which needs a free
external account and API token — deliberately not set up for this
environment, matching this repo's existing pattern of documenting a gap
rather than half-implementing an external signup flow (compare the GitLab.com
identity-verification caveat in section 7).

By contrast, `test-project`'s SBOM was hand-built with an explicit `cpe`
field (`cpe:2.3:a:apache:log4j:2.14.1:*:*:*:*:*:*:*`) specifically to prove
the Internal Analyzer path end-to-end, and after a full NVD re-mirror (see
below) it shows **10 real findings**: CVE-2021-44228 and CVE-2021-45046
(critical), CVE-2021-44832 and CVE-2021-45105 (medium), CVE-2025-68161
(medium), and five 2026-era log4j CVEs (CVE-2026-34477/34479/34480/34481/
49844, all medium). A final sync pulled all 10 into the portal's own DB,
and the portal API's CVE list matches Dependency-Track's ID-by-ID.

**Known behavior: one Dependency-Track project per commit.** The CI job
uploads with `autoCreate=true` and `projectVersion=$CI_COMMIT_SHORT_SHA`, so
every pushed commit that runs the pipeline creates a **new** Dependency-Track
project (`webhook-relay` v=`<sha>`) rather than overwriting one project in
place — this mirrors Dependency-Track's own data model, where a project's
identity is `name` + `version` together. The portal's `sync()` picks up each
one as its own `DependencyTrackProject` row with its own `dt_project_id`, so
the portal's project/finding list grows by one row set per pipeline run
unless old Dependency-Track projects are pruned manually. Accepted as-is for
this integration — no dedup-by-name or "latest version only" logic was
added, since collapsing them would need a policy decision (keep newest?
keep all for audit history?) outside this task's scope.

**Operational: recovering from a corrupted H2 database / stale NVD mirror.**
A host reset corrupted Dependency-Track's embedded H2 database — it came
back with factory-reset credentials and an empty portfolio. The subtler part:
the NVD mirror **data files** on the Docker volume survived the corruption,
so on restart Dependency-Track's boot-time mirror check saw recent files
already on disk and considered itself current, skipping the older years
entirely — leaving the vulnerability database missing everything before
2026 (e.g. `CVE-2021-44228` returned `404` from
`GET /api/v1/vulnerability/source/NVD/vuln/{id}`, even after re-uploading
the SBOM). The fix is not "wait for a rescan" — the mirror only pulls what
it thinks is missing:

```bash
docker exec devsecops-dependency-track rm -rf /data/.dependency-track/nist
docker restart devsecops-dependency-track
# then wait ~15 minutes for the full year-by-year re-mirror to complete
# (watch docker logs devsecops-dependency-track for mirroring progress)
```

Deleting the NVD cache directory forces a genuine full re-mirror instead of
an incremental "what changed since last time" pull. Once it completes,
existing projects need to be told to re-run analysis against the now-complete
vulnerability data — it doesn't happen automatically for BOMs already
imported:

```bash
curl -X POST "$DT_URL/api/v1/finding/project/{uuid}/analyze" -H "X-Api-Key: ..."
```

This is what took `test-project` from 2 findings (2026-era CVEs only, from
the still-rebuilding mirror) to the real, complete 10.

**Files:** `backend/app/models/dependency_track_project.py`,
`backend/app/models/vulnerability.py` (`image_id` made nullable,
`dt_project_id` added), `backend/app/integrations/dependency_track.py`,
`backend/app/schemas/vulnerability.py` (`AffectedProjectOut`),
`backend/app/routers/{sync,vulnerabilities,integrations}.py`,
`frontend/lib/api.ts`, `frontend/lib/integrations/config.ts`,
`frontend/app/vulnerabilities/*`, `backend/seed.py`,
`sample-projects/webhook-relay/{.gitlab-ci.yml,requirements.txt}`.

## Not done / stubbed

- Prisma Cloud `sync()` is still a 3-line stub — only `test_connection()` is
  real. Wiring up its actual data sync (image/vulnerability scan results) is
  a separate task. (GitLab's `sync()` is now real — see
  [section 7](#7-real-gitlab-integration).)
- No write-back of Security Hotspot review status to SonarQube (read-only
  sync only, by explicit choice — see [section 5](#5-security-hotspots)).
- Saved credentials are plaintext in Postgres, masked only in API responses
  (never echoed back over `GET`) — no encryption at rest. Matches the app's
  existing posture (`.env`/`docker-compose.yml` also hold plaintext secrets)
  but would need a `cryptography`-based approach for anything beyond a local
  demo.
- **No sync scheduler.** `SYNC_INTERVAL_MINUTES` (`backend/app/config.py`,
  `docker-compose.yml`) is dead config — nothing ever reads it. Sync only
  happens when a user clicks **Sync Now**, or something calls `POST
  /api/sync/{tool}` directly; there's no APScheduler/cron/webhook listener.
  So new upstream data (new SonarQube analysis, a rotated image, etc.)
  doesn't show up until someone manually triggers a sync.
- **Expired/revoked credentials aren't surfaced as a connection problem.**
  `source: "database"` (`config_resolver.resolve`) means "credentials are
  saved," not "credentials still work." If a token expires, Test Connection
  and Sync Now already fail gracefully (SonarQube returns 401, handled — not
  a crash: `test_connection` returns `{"ok": false, "message": "SonarQube
  responded with 401"}`, `sync()` returns `{"error": "Project search failed:
  401"}` and the sync job is marked `failed`), but the Settings **"Connected"
  pill stays green** regardless, since it's derived from whether a row
  exists, not from the last call's outcome. Dashboard `tool_health.status`
  does reflect the failure, but nothing feeds that back into the pill itself.
  Fix would be: have `IntegrationCard` also factor in the latest
  `SyncStatus.status`/`error` (already fetched) so the pill can show
  something like "Connection error" instead of a stale "Connected."
