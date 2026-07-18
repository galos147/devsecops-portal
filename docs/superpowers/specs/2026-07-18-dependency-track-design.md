# Dependency-Track Integration — Design

Date: 2026-07-18
Status: Approved, ready for implementation planning

## Context

The portal currently syncs JFrog Xray (image vulnerability scanning), SonarQube
(code quality), GitLab (pipeline status), and has a stubbed Prisma Cloud
integration. This session explored adding a scanner for local, fully-testable
development — Trivy was considered first, but Trivy is a CLI that produces a
report file, not a server with an API, so it can't be synced from the way
every other integration in this app works.

[Dependency-Track](https://dependencytrack.org) (OWASP, Apache 2.0,
self-hostable via Docker) is a real platform: it ingests CycloneDX/SPDX SBOMs,
continuously matches components against vulnerability feeds (NVD, OSS Index,
GitHub Advisories), and exposes a REST API with API-key auth — the same shape
as JFrog/SonarQube/GitLab already integrate against. Trivy's role becomes SBOM
*generation* only (`trivy fs/repo --format cyclonedx`); Dependency-Track owns
storage, continuous re-checking, and the API the portal reads from.

## Decisions made during brainstorming

1. **What a Dependency-Track "project" corresponds to**: a separate,
   independent list of software projects — **not** tied to JFrog-synced
   images. A DT project can be a library or non-containerized service that
   never becomes an image. This mirrors the `Service` entity's existing
   "explicit, never name-guessed" philosophy, except here the projects come
   from Dependency-Track itself (auto-created on first SBOM upload), not
   from portal-side user registration.
2. **SBOM generation and upload**: happens entirely in GitLab CI — a Trivy
   step in the target repo's `.gitlab-ci.yml` generates the SBOM and curls it
   directly to Dependency-Track's own `/api/v1/bom` upload endpoint (DT's own
   documented CI/CD pattern). The portal backend does zero scanning; it only
   ever reads from Dependency-Track's API afterward — preserves the
   read-only-by-design principle already established for every other
   integration.
3. **UI placement**: folded into the existing `/vulnerabilities` page rather
   than a new dedicated page. `VulnGroupOut` already aggregates by CVE across
   `image_id` values without depending on image identity, so extending it to
   also aggregate `dt_project_id`-based rows is a natural, additive change,
   not a new information architecture.

## Architecture

```
GitLab CI job (Trivy, in target repo)
        │  generates SBOM, uploads via /api/v1/bom
        ▼
Dependency-Track apiserver (new local container)
        │  REST API (GET /api/v1/project, GET /api/v1/finding/project/{uuid})
        ▼
Portal backend — dependency_track.py sync() — background SyncJob, same
heartbeat/phase pattern as every other integration
        │
        ▼
Postgres (dependency_track_projects, vulnerabilities)
        │
        ▼
/vulnerabilities page + CVE detail page (existing, extended)
```

Dependency-Track runs as a new container joined to `devsecops-portal_default`
(same pattern as `devsecops-sonarqube`), with its own bundled database — not
sharing the portal's Postgres, to keep the two systems decoupled. Before
starting it, check headroom with `docker stats --no-stream` per this repo's
existing "prefer lightweight local infra" convention; it's a JVM app, heavier
than Trivy alone but far lighter than the abandoned full GitLab CE attempt.

## Data model changes

- `backend/app/models/vulnerability.py`: `image_id` becomes
  `nullable=True` (currently `nullable=False`). This is a relaxation, not a
  breaking change — every existing row already has `image_id` set, since only
  JFrog writes to this table today.
- New model/table `dependency_track_projects`
  (`backend/app/models/dependency_track_project.py`):
  - `id` — String PK, Dependency-Track's own project UUID
  - `name`, `version` — String
  - `last_synced_at` — DateTime
  - `is_seed` — Boolean, not null, default False (kept for consistency with
    the app-wide demo-badge convention, even though real DT projects are
    created automatically by SBOM upload, not portal-side registration —
    `seed.py` can add 1–2 fixture rows the same way it does for other tables)
- New nullable column `vulnerabilities.dt_project_id` — FK to
  `dependency_track_projects.id`, indexed.
- Convention (app-level, not a DB constraint — same style as `Service`'s
  non-FK link columns): exactly one of `image_id` / `dt_project_id` is set
  per row; `source_tool` disambiguates which.
- Both new-table and new-column changes follow the documented no-Alembic
  pattern (`docs/DATABASE.md`): the new table is added to `init_db()`'s
  import list for `create_all()`; the two altered/added columns on the
  existing `vulnerabilities` table need a manual
  `ALTER TABLE vulnerabilities ADD COLUMN ...` / `ALTER COLUMN image_id DROP NOT NULL`
  run once against the live container, in addition to updating the model.

### Severity mapping

Dependency-Track findings carry severity as CRITICAL/HIGH/MEDIUM/LOW/INFO/
UNASSIGNED. The app's `Severity` enum only has critical/high/medium/low.
Mapping: CRITICAL→critical, HIGH→high, MEDIUM→medium, LOW/INFO/UNASSIGNED→low.
This is a documented, deliberate collapse (not a silent guess) — INFO/
UNASSIGNED findings are rare in practice and "low" is the safe conservative
bucket rather than inventing a 5th severity tier app-wide.

## Backend sync (`backend/app/integrations/dependency_track.py`, new)

Follows the existing integration-module recipe (`docs/BACKEND.md`):

1. `GET {DT_URL}/api/v1/project` (paginated) → upsert into
   `dependency_track_projects` (id=uuid, name, version, last_synced_at=now).
2. For each project where `lastBomImport` is set (skip projects with no SBOM
   uploaded yet — nothing to sync), `GET {DT_URL}/api/v1/finding/project/{uuid}`
   → for each finding: `component` (name, version, purl), `vulnerability`
   (vulnId=CVE, severity, cvssV3BaseScore/cvssV2BaseScore, description),
   `analysis.isSuppressed`.
3. Upsert `Vulnerability` rows:
   - `id = f"dt:{project_uuid}:{cve_id}:{component_name}"` — deterministic,
     same style as JFrog's `_img_id`, to make upsert idempotent across runs.
   - `dt_project_id` = project uuid, `image_id` = None
   - `cve_id`, `severity` (mapped per above), `package_name` = component name,
     `installed_version` = component version, `fixed_version` = None
     (Dependency-Track doesn't reliably expose this — left null rather than
     guessed)
   - `cvss_score` = cvssV3BaseScore, falling back to cvssV2BaseScore
   - `description` = vulnerability description
   - `source_tool = "dependency_track"`
   - `status` = `"suppressed"` if `analysis.isSuppressed` else `"open"`
   - `is_seed = False`
4. **v1 scope decision**: full re-sync of findings per project on every run,
   no incremental watermark. Finding lists per project are small; this avoids
   inventing a watermark scheme before there's a real scale problem to solve.
   Documented here as a deliberate simplification, not a gap to silently
   carry forward.
5. Wired through the existing generic integration plumbing:
   `config_resolver.py` gets a `dependency_track` entry (url + secret =
   API key); `routers/integrations.py` gets add/test-connection/delete
   handling for the new tool; `routers/sync.py` gets a
   `POST /api/sync/dependency-track` background-job entry using the same
   `SyncJob`/phase/heartbeat machinery every other tool already uses.

## Frontend changes

- **Settings**: a 5th `IntegrationCard`, via the existing
  `lib/integrations/config.ts` config-module pattern (URL + API key fields,
  same "Danger zone" delete-demo-data footer convention as the other four).
- **`/vulnerabilities`**: the `source` filter already reads `source_tool`
  generically (`routers/vulnerabilities.py`'s `source` query param) — add a
  `dependency_track` label/color in the frontend's source-tool display map.
  No new page, no new route.
- **CVE detail** (`schemas/vulnerability.py`):
  - New `AffectedProjectOut` schema: `id`, `name`, `version`,
    `installed_version`, `fixed_version`, `status` (parallel to
    `AffectedImageOut`, minus `tag`/`registry` which don't apply).
  - `CveDetailOut` gains `affected_projects: list[AffectedProjectOut] = []`.
  - `routers/vulnerabilities.py`'s `get_cve_detail`: for each vuln row, if
    `image_id` is set, resolve and append to `affected` (existing behavior,
    unchanged); if `dt_project_id` is set, resolve and append to a new
    `affected_projects` list.
  - `VulnGroupOut` gains `affected_projects: int = 0` alongside the existing
    `affected_images: int`, so the list view can show both counts without
    conflating "images" and "software projects."
  - Frontend CVE detail panel renders an "Affected Projects" section
    (same layout as "Affected Images") only when non-empty.

## Local dev deployment

- New container `dependency-track-apiserver` (official image), joined to
  `devsecops-portal_default`, own bundled database (not the portal's
  Postgres) — kept isolated on purpose, matching this session's established
  "prefer lightweight, decoupled local infra" convention. Check
  `docker stats --no-stream` headroom before starting.
- `sample-projects/webhook-relay/.gitlab-ci.yml` (the repo already used this
  session for real GitLab pipeline testing) gets a new stage: run
  `trivy fs --format cyclonedx -o sbom.json .`, then
  `curl -X POST {DT_URL}/api/v1/bom -H "X-Api-Key: ..." -H "Content-Type: multipart/form-data" -F "project={uuid or auto-create}" -F "bom=@sbom.json"`.
- The already-running `devsecops-gitlab-runner` container needs no new
  network wiring beyond what it already has — it's already joined to
  `devsecops-portal_default`, so it can reach the new
  `dependency-track-apiserver` container by its Compose service alias, the
  same way it already reaches `sonarqube:9000`.

## Testing / verification plan

No mocked data at any step:

1. Start the new container, confirm it comes up healthy, generate a real API
   key through Dependency-Track's own bootstrap flow, register it via
   Settings.
2. Add the Trivy+curl stage to `sample-projects/webhook-relay/.gitlab-ci.yml`,
   push, let the real GitLab CI pipeline run, confirm the SBOM and its real
   findings appear in Dependency-Track's own UI/API for that project.
3. Trigger the portal's Dependency-Track sync, confirm `dependency_track_projects`
   and `vulnerabilities` rows are created with `source_tool="dependency_track"`.
4. Confirm `/vulnerabilities` shows these entries (filterable by source),
   and that the counts match Dependency-Track's own reported numbers for
   that project exactly (same hand-verification discipline used for the
   JFrog Reports API fix earlier this session).
5. Confirm the CVE detail page's new "Affected Projects" section renders
   correctly for a CVE that has both an image-sourced and a
   Dependency-Track-sourced hit (if the fixture data allows testing that
   overlap), and correctly for one that only has one or the other.

## Explicitly out of scope for this design

- Incremental/watermark-based sync (see v1 scope decision above).
- Any change to JFrog, SonarQube, GitLab, or Prisma Cloud integrations —
  this design touches none of their code paths.
- A dedicated Dependency-Track page — deliberately folded into the existing
  Vulnerabilities page per the UI-placement decision above.
- Portal-side SBOM generation or repo cloning — stays entirely in GitLab CI.
