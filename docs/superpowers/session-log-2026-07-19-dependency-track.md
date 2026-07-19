# Session log — 2026-07-19 — Dependency-Track integration, Tasks 6–12

Continuation of the Dependency-Track integration
(spec: `specs/2026-07-18-dependency-track-design.md`,
plan: `plans/2026-07-18-dependency-track.md`). Tasks 1–5 (data model,
live DT container, backend schemas, integration module, router wiring)
were completed and reviewed on 2026-07-18. This session resumed after a
PC reset.

## Environment recovery after the reset

All containers were down. Restarted: portal stack (backend, frontend,
db), `devsecops-sonarqube`, `devsecops-dependency-track`,
`devsecops-gitlab-runner`. Left stopped on purpose: `devsecops-gitlab`
(abandoned self-hosted attempt), RabbitMQ, Artifactory, minikube.

**The reset corrupted Dependency-Track's embedded H2 database.** It came
back with factory defaults: `admin`/`admin` (force-password-change
state), zero projects, the old API key dead, and only partial NVD data.
Recovery performed:

- Admin password re-set to the same value as before (recorded in
  `.superpowers/sdd/task-2-report.md`, not in any committed file).
- New API key minted for the Administrators team (old one invalidated;
  the durable copy of the current key is in `task-2-report.md`).
- `test-project` re-created by re-uploading the CPE-bearing Log4Shell
  SBOM (new uuid `44484aaf-1576-4085-b67f-8c910994d809`).
- DT restarted once more at the end of the session to force the NVD
  mirror to re-run, because the fresh database only contained 2026-era
  CVEs (CVE-2021-44228 and CVE-2023-32681 both returned 404 from
  `GET /api/v1/vulnerability/source/NVD/vuln/{id}`).

## Task 6 — Frontend types and Settings config (commit `272568d`)

`frontend/lib/api.ts`: `VulnGroupOut.affected_projects`,
`AffectedProjectOut` interface, `CveDetailOut.affected_projects`.
`frontend/lib/integrations/config.ts`: `dependency_track` added to
`TOOLS` and every per-tool record (label "Dependency-Track", API-key
auth, no username field, teal accent). Settings page needed zero
component changes — it is fully generic over `TOOLS`. Review: clean.

## Task 7 — Vulnerabilities UI (commit `de7453a`)

Vulnerabilities list: "Dependency-Track" source-filter option; the
affected-count cell now renders "N images, M projects" with correct
pluralization for any combination. CVE detail: new "Affected Projects"
table (project, installed, fixed, status), rendered only when non-empty,
rows deliberately not clickable (no project detail page by design).
`FEATURES.md` updated. Frontend Docker image rebuilt (mandatory for
changes to show at localhost:3000). Review: clean, one Minor carried to
final review — the list's column header still reads "Affected Images"
even when a row shows only projects.

## Task 8 — Seed fixtures (commit `615573d`)

`backend/seed.py`: one demo `DependencyTrackProject`
(`dtp-1`/webhook-relay) + one demo Log4Shell vulnerability row
(`image_id=None`, `dt_project_id="dtp-1"`, `is_seed=True`) + one demo
sync-job row. Database truncated and reseeded (users/sessions/
integration_configs untouched). Verified via psql and authenticated API
calls. Review: clean.

## Task 9 — Real connection + first real sync (operational)

Registered `http://devsecops-dependency-track:8080` + the new API key in
Settings via the API; Test Connection green; ran the first real sync.
Result: 3 records (test-project + its 2 findings — 2026-era CVEs only,
since the NVD mirror was still rebuilding). Verified in psql: real
`test-project` (is_seed=f) alongside seeded `webhook-relay` (is_seed=t),
and the portal API returns all three CVE groups with correct
`affected_projects` counts and seed flags.

## Task 10 — Real GitLab CI Trivy SBOM upload (commit `254d38b`)

CI/CD variables `DEPENDENCY_TRACK_URL` and `DEPENDENCY_TRACK_API_KEY`
(masked) created on `galos-group/webhook-relay` via the GitLab API using
the portal's stored token. `sbom-scan` job added to `.gitlab-ci.yml`
(both the GitLab.com copy and the reference copy in
`sample-projects/webhook-relay/`).

The first pipeline run exposed two real bugs, both fixed:

1. **CycloneDX version mismatch** — `aquasec/trivy:latest` emits
   CycloneDX 1.7; DT 4.14 rejects it with
   `400 "Unrecognized specVersion 1.7"`. Fix: pinned
   `aquasec/trivy:0.58.0`, which emits 1.6 (verified accepted by a local
   rehearsal upload before pushing).
2. **Empty SBOM** — webhook-relay had no dependency manifest, so Trivy
   found zero components. Fix: added `requirements.txt` with
   deliberately old pins (`requests==2.25.1`, `urllib3==1.26.4`).

Also deviations from the plan, both necessary: the job carries
`tags: [local]` (the plan omitted it — GitLab.com shared runners cannot
reach the local DT container), and curl uses `--fail-with-body` so a
rejected upload fails the job visibly instead of logging a 400 and
"succeeding" (`allow_failure: true` still keeps the pipeline green).

Second pipeline (commit `567018d3` in the GitLab repo): both jobs green,
and DT shows `webhook-relay v=567018d3` with a real `lastBomImport` —
the GitLab CI → Trivy → SBOM → Dependency-Track flow is proven end to
end. A rehearsal duplicate project was deleted from DT to keep it clean.

**Known caveat (predicted in Task 2, to be documented in Task 12):**
webhook-relay's findings count is 0 because Trivy's components carry
only PURLs and DT's built-in Internal Analyzer matches via CPE. Real
PURL-based matching needs OSS Index (free external account + API token,
not set up). This is not a sync bug.

## Task 11 — End-to-end verification (operational)

The post-reset NVD mirror turned out to be *incrementally* stale: the
feed files on the volume survived the H2 reset, so the boot-time mirror
considered itself current and skipped re-parsing old years — the fresh
database only ever received 2026-era CVEs. Forced a full re-mirror by
deleting `/data/.dependency-track/nist` inside the container and
restarting (~15 min), then triggered
`POST /api/v1/finding/project/{uuid}/analyze` on both projects.

Result: `test-project` shows **10 real findings** in DT — CVE-2021-44228
and CVE-2021-45046 (critical, Log4Shell family), CVE-2021-44832,
CVE-2021-45105, CVE-2025-68161, and five 2026 log4j CVEs (all medium).
The portal's final sync pulled exactly 10 records; the DB and API CVE
lists match DT's own findings ID-for-ID. `webhook-relay` correctly syncs
with 0 findings (the PURL/CPE caveat). Spot-checks on images /
code-quality / pipelines pages: all unchanged and loading.

Unplanned bonus test: the user clicked "Remove demo data" for
Dependency-Track (and SonarQube) in the Settings UI mid-session — the
Task 5 `DELETE /api/integrations/{tool}/data` branch deleted only the
`is_seed=true` demo rows and left every real synced row intact, exactly
as designed.

## Task 12 — Documentation (commit `f237333`)

`docs/integrations.md` gained section
`## 12. Dependency-Track: SBOM-based dependency vulnerability tracking`:
architecture, the `dt_project_id`/`image_id` data-model split, the
confirmed API field names (no corrections needed — the payoff of
capturing the real API in Task 2 before writing the parser), both real
CI bugs (CycloneDX 1.7 pin, empty-SBOM/`requirements.txt`), the PURL/CPE
analyzer caveat with the OSS Index alternative, per-commit project
versioning, and the H2-reset/NVD-mirror recovery runbook. Review clean,
including an explicit credential-leak scan (no key/password values in
the docs).

## State at end of session

- **All 12 tasks complete and reviewed**; ledger in
  `.superpowers/sdd/progress.md`. Remaining: final whole-branch review.
- The integration is live end to end: GitLab CI (Trivy) → SBOM →
  Dependency-Track → portal sync → `/vulnerabilities` page, all
  verified against real data.

## Credentials quick reference (values not committed)

- Portal: `admin` / the seeded default from `DEPLOYMENT.md` Step 6.
- Dependency-Track UI (http://localhost:8081): `admin` / the password in
  `task-2-report.md` (unchanged by the reset recovery).
- DT API key: current value in `task-2-report.md`; also stored in the
  portal's `integration_configs` table and as a masked GitLab CI
  variable.
