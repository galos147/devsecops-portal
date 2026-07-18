# DevSecOps Portal — Feature Guide

A unified portal that pulls security and code quality data from **JFrog Xray**, **SonarQube**, **Prisma Cloud**, and **GitLab** into one place. Your team can search images, track vulnerabilities, review code issues, check pipeline security, and see what packages need upgrading — without switching between tools.

**Login is required.** Every page requires a signed-in account — see
[Users & Access](#managing-users) below. For the deeper
architecture behind any of this, see `docs/ARCHITECTURE.md`,
`docs/BACKEND.md`, `docs/FRONTEND.md`, and `docs/DATABASE.md`.

---

## Pages

### Dashboard (`/`)

**What it shows:** Security posture at a glance.

- **KPI cards** — Total images scanned, open critical CVEs, high code issues, failing pipelines, and last sync time
- **Severity chart** — Horizontal bars showing open vulnerability counts by severity (critical / high / medium / low) across all images
- **Tool health** — Green/red status per tool (JFrog, SonarQube, Prisma, GitLab) with last sync time; a tool that isn't currently connected shows grey/"Not connected" regardless of past sync history
- **Top vulnerable images** — Images ranked by critical CVE count, clickable to the image detail
- **Recent pipeline failures** — Latest failed GitLab pipelines with total security finding counts

**Data source:** Aggregated from all tools after sync.

---

### Services (`/services`)

**What it shows:** A unified, per-service view tying together SonarQube
code quality, GitLab pipeline history, and a registry image + its
vulnerabilities — the cross-tool view the rest of this app doesn't
otherwise provide (everywhere else organizes by data type, not by service).

- List page: every defined service with a quality-gate pill, last-pipeline-status
  pill, and top-vulnerability-severity pill — "Not linked" where a service
  doesn't have that piece connected.
- **+ Add Service**: name it, then optionally pick a SonarQube project, a
  GitLab project, and/or an image from dropdowns of what's already synced.
  Each link is independently optional.
- Detail page: three tabs (Code Quality / Pipelines / Image & Vulnerabilities),
  each showing a graceful "not linked" message instead of an empty table
  when that piece isn't connected. The Pipelines tab reuses the same
  pipeline detail panel as the Pipelines page (see below); the Image tab
  reuses the same Fix Suggestion flow as Image Detail.

**Important: links are never guessed by matching names.** A service's three
links are set only by explicit user choice, or by a verified real signal —
specifically, if SonarQube's own "DevOps Platform Integration" has a
project genuinely bound to a GitLab repo, a sync will auto-fill/auto-create
the matching service link (never overwriting a link you already set
yourself). Two SonarQube/GitLab/image entries that merely *share a similar
name* are never assumed to be the same real service — see `docs/DATABASE.md`
for why (an earlier feature that did exactly that was removed).

---

### Images (`/images`)

Two tabs on one page — `/packages` is **not** a separate page, it's a
client-side redirect back here (the tab it used to describe lives in this
page's second tab).

#### Image Inventory tab
**What it shows:** All container images found across JFrog Xray and Prisma Cloud registries.

- Search by image name, tag, or digest
- Filter by registry, source tool (JFrog / Prisma), or minimum severity
- Table shows critical / high / medium / low CVE counts per image, last scanned time, and source

**Click a row** → opens the Image Detail page.

#### Package Inventory tab
**What it shows:** All packages found across **all** images in one aggregated view — focused on what needs upgrading.

- **Current version** vs. **Fix version** side by side
- Severity badge on packages with known CVEs
- `Clean` badge on packages with no known vulnerabilities
- Click the image count (e.g. "3 images ▼") to expand and see exactly which images contain that package
- Filters: search by name, filter by type (deb / jar / pip / etc.), severity, or "has fix available"
- Default sort: Critical → High → Medium → Low → Clean

**Data source:** JFrog Xray (`/artifactory/api/docker/...`) and Prisma Cloud image API, joined with vulnerability data to compute severity and fix version per package.

---

### Image Detail (`/images/:id`)

**What it shows:** Full security profile for one container image. Four tabs.

For **JFrog-sourced** images, an **"Update"** button next to the source
label re-syncs just this one image on demand (calls Xray's
`summary/artifact` API directly — fast enough not to need a full
whole-tool background sync).

#### Vulnerabilities tab
- Every CVE found in the image: CVE ID, affected package, installed version, fixed version, severity, status
- Click a CVE ID → goes to the CVE detail page
- Click **Fix** → opens the Fix Suggestion panel (right-side slide-over) with remediation steps and a copyable upgrade command

#### Packages tab
- All software packages found inside the image: name, version, package type (deb / jar / pip / apk / rpm / npm / go), license, source tool
- Packages with a known CVE show a severity badge (e.g. `CRITICAL`)
- Clean packages show a green `Clean` badge
- Search box filters by package name
- Sorted by severity — most dangerous packages first

#### Compliance tab
- Container compliance checks (CIS Docker Benchmark, root user, secrets in env, registry allowlist, read-only rootfs, pinned versions)
- Pass / Fail per check
- **Not real data yet** — this tab is currently a hardcoded demo fixture in
  the frontend, regardless of whether Prisma Cloud is actually connected.
  Wiring it to a real source is tracked in `docs/integrations.md`'s
  "Not done / stubbed" list.

#### Layers tab
- Per-layer breakdown: package count and size (JFrog images only)
- Prisma-sourced images show an explanatory message (Prisma does not expose layer data)

---

### Vulnerability Explorer (`/vulnerabilities`)

**What it shows:** All CVEs found across all images, grouped by unique CVE ID.

- Search by CVE ID, package name, or keyword
- Filter by severity, status (open / fixed / suppressed), or source tool
- Sortable by severity or CVSS score (click column headers)
- Table: CVE ID, severity, CVSS score, description, number of affected images, fixed version, status

**Click a row** → CVE Detail page.

**Data source:** JFrog Xray and Prisma Cloud scan results.

---

### CVE Detail (`/vulnerabilities/:cveId`)

**What it shows:** Everything about one specific CVE.

- Full description, CVSS score, CVSS vector, published date, NVD advisory link
- **Affected images** table — which images have this CVE, at which package version, and what the fix version is
- **Fix Suggestion** card — remediation text, upgrade command (copyable), advisory link

**Click an image row** → goes to that image's detail page.

---

### Code Quality (`/code-quality`)

**What it shows:** SonarQube findings across all projects. Two tabs:

#### Projects tab
- All SonarQube projects with quality gate status (Pass / Fail)
- Bug count, vulnerability count, code smell count, test coverage % (with progress bar)

#### Issues tab
- All individual code issues: file path, message, line number, severity, effort to fix
- Filter by project, issue type (Bug / Vulnerability / Code Smell), or severity
- Click **Fix** → opens Fix Suggestion panel with SonarQube rule guidance

**Data source:** SonarQube Web API (`/api/projects/search`, `/api/issues/search`, `/api/qualitygates/project_status`).

---

### Pipelines (`/pipelines`)

**What it shows:** GitLab CI pipeline runs with their security scan results.

- Filter by project or pipeline status (passed / failed / running)
- Table: project, branch, status badge, SAST finding count, dependency scan count, secret detection count, start time
- **Click a row** → opens a detail slide-over (not an inline expand): status,
  counts, scan findings if any, an **"Open in GitLab ↗"** link (real pipeline
  URL), and — for failed pipelines — a **"Why it failed"** section listing
  each failed job's stage/name/failure reason, styled like a trimmed CI log.
  If no job-level failure data was captured, it says so honestly rather
  than showing an empty table.

**Data source:** GitLab REST API — projects + pipelines
(`api/v4/projects`, `api/v4/projects/:id/pipelines`, plus a per-job fetch
for failed pipelines only). SAST/dependency-scan/secret-detection *counts*
are always 0 for now — no job artifact report parsing yet (would need
GitLab's built-in security scanning templates in the pipeline; see
`docs/integrations.md`) — but real failure *reasons* (separate from those
counts) are captured for genuinely failed jobs.

---

### Global Search (`/search`)

**What it shows:** Results across all tools for any query.

- Type a query in the top search bar and press Enter
- Results grouped by: Images, CVEs, Code Issues, Pipelines
- Each result has a source tool badge (JFrog / SonarQube / Prisma / GitLab)
- Click any result to navigate to its detail page

**Searches across:** image names, CVE IDs, package names, code file paths, pipeline project names.

---

### Settings — Integrations (`/settings`)

**What it shows:** Tool connections, managed entirely through the UI — no
config files, no restarts. This tab is **admin-only** (see
[Users & Access](#managing-users) below).

- Only *connected* tools show as a card (colored monogram + name + a
  **Connected** status pill). A **+ Add Integration** tile appears whenever
  a tool isn't configured yet — click it to pick a tool, fill in URL /
  credentials, **Test Connection**, then **Save**. JFrog's "Repository"
  field accepts a **comma-separated list** — a real Artifactory is usually
  split across several repos.
- Each connected card: the connection fields, a condensed sync-status line
  ("Synced 3h ago · 2 records") with **Sync Now** — syncing now runs as a
  background job and shows live progress (e.g. "report_fetch · 1200/5000")
  rather than blocking the page — and a separate, visually distinct
  **Danger Zone** with two independent actions:
  - **Unregister** — clears the saved connection only. Previously-synced
    data is *not* touched and keeps showing up elsewhere in the app.
  - **Delete demo data** — purges only that tool's **seed/demo** rows
    (the ones with a Demo badge). Real synced data is never touched by
    this button, even if you've since disconnected the tool.

**Data source:** `docs/integrations.md` covers how the connection system,
each tool's real sync, and the add/remove flow were built; `docs/BACKEND.md`
covers the background-job/progress mechanics.

### Managing Users (`/settings/users`)

**What it shows:** Accounts that can sign in to this portal. Admin-only.

- Two roles: **Admin** (this tab + Integrations) and **Member** (everything
  else — browsing, Fix suggestions, triggering syncs).
- **+ Add User** — username, password, role.
- Per-user actions: Make Admin/Make Member, Deactivate (immediately revokes
  that user's active session) /Reactivate, Delete.
- You can't delete or demote **the last remaining admin**, and you can't
  delete your own account while logged in as it.

A default `admin` account is created automatically the first time the
database is seeded (`docker compose exec backend python seed.py`) if no
users exist yet — see the Quick Start section of `README.md` for the
credential and why it must be changed immediately.

---

## Demo data vs. real data

The portal ships with realistic seeded demo data (`backend/seed.py`) so
it's usable out of the box before connecting anything. Any row or card
sourced from that seed data — not a real sync — shows a small muted
**Demo** badge (images, vulnerabilities, code projects/issues, pipeline
runs, and the dashboard's top-lists). Once a tool is connected and synced,
its real rows appear alongside the demo ones with no badge.

---

## Fix Suggestion Panel

Available on: Image Detail (Vulnerabilities tab), CVE Detail, Code Quality (Issues tab).

- Opens as a right-side slide-over (420px wide)
- Shows: finding title, severity badge, full description, CVSS line, affected package/location
- **Remediation** section — what to do and why
- **Copy button** — copies the upgrade command to clipboard (shows "Copied!" for 1.5s)
- **Advisory link** — opens the NVD or tool-specific advisory in a new tab
- Close with × or by clicking the backdrop

---

## Data Sync

**There is no automatic/scheduled sync.** Data is pulled from a tool only
when someone clicks **Sync Now** on its Settings card (or something calls
`POST /api/sync/{tool}` directly) — this is a known gap, tracked in
`docs/integrations.md`. Every sync now runs as a **background job** (it
returns immediately and reports live progress) rather than blocking the
request — see `docs/BACKEND.md`.

| Tool | What gets synced |
|------|-----------------|
| JFrog Xray | Container images (paginated inventory walk, across however many repos are configured) + vulnerabilities/packages/fix suggestions via Xray's Reports API (bulk, incremental by scan date — not a per-artifact loop). A dedicated **Update** button on Image Detail re-syncs one specific image on demand. |
| SonarQube | Projects, quality gate status, code issues, security hotspots, sanitized rule descriptions (real links/code examples preserved, not stripped to plain text). Also auto-discovers a project's real GitLab binding (if SonarQube's own DevOps Platform Integration is set up) to fill in a matching Service. |
| GitLab | Projects and pipeline runs (status, branch, timestamps, real pipeline URL). For failed pipelines, also fetches real per-job failure reasons. No SAST/dependency-scan/secret-detection report *count* parsing yet — see `docs/integrations.md`. |
| Prisma Cloud | *(sync not yet implemented — connection testing only)* |

Sync status is shown in the Tool Health strip on the Dashboard and in
detail on the Settings page — both reflect whether the tool is currently
*connected*, not just its last historical sync result, so a disconnected
tool won't show a misleadingly "healthy" status.

---

## Status Badges

| Badge | Meaning |
|-------|---------|
| `CRITICAL` (red) | CVSS 9.0–10.0 — fix immediately |
| `HIGH` (orange) | CVSS 7.0–8.9 — fix this sprint |
| `MEDIUM` (yellow) | CVSS 4.0–6.9 — fix in backlog |
| `LOW` (green-grey) | CVSS 0.1–3.9 — monitor |
| `Clean` (green) | No known vulnerabilities |
| `Pass` (green) | Compliance check passed |
| `Fail` (red) | Compliance check failed |
