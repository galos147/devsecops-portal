# Session log — 2026-07-19 — Dependency-Track integration, Tasks 6–10

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

## State at end of session

- Tasks 1–10 complete and reviewed; ledger in
  `.superpowers/sdd/progress.md`.
- Spot-checks pass: images (12), code projects (8), pipelines (10), all
  portal pages load — existing integrations untouched.
- Waiting on DT's NVD mirror to reach 2021-era CVEs, then:
  **Task 11** (final end-to-end sync + verification) and **Task 12**
  (document the integration in `docs/integrations.md`), followed by the
  final whole-branch review.

## Credentials quick reference (values not committed)

- Portal: `admin` / the seeded default from `DEPLOYMENT.md` Step 6.
- Dependency-Track UI (http://localhost:8081): `admin` / the password in
  `task-2-report.md` (unchanged by the reset recovery).
- DT API key: current value in `task-2-report.md`; also stored in the
  portal's `integration_configs` table and as a masked GitLab CI
  variable.
