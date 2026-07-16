# DevSecOps Portal — Feature Guide

A unified portal that pulls security and code quality data from **JFrog Xray**, **SonarQube**, **Prisma Cloud**, and **GitLab** into one place. Your team can search images, track vulnerabilities, review code issues, check pipeline security, and see what packages need upgrading — without switching between tools.

---

## Pages

### Dashboard (`/`)

**What it shows:** Security posture at a glance.

- **KPI cards** — Total images scanned, open critical CVEs, high code issues, failing pipelines, and last sync time
- **Severity chart** — Horizontal bars showing open vulnerability counts by severity (critical / high / medium / low) across all images
- **Tool health** — Green/red status per tool (JFrog, SonarQube, Prisma, GitLab) with last sync time
- **Top vulnerable images** — Images ranked by critical CVE count, clickable to the image detail
- **Recent pipeline failures** — Latest failed GitLab pipelines with total security finding counts

**Data source:** Aggregated from all tools after sync.

---

### Image Inventory (`/images`)

**What it shows:** All container images found across JFrog Xray and Prisma Cloud registries.

- Search by image name, tag, or digest
- Filter by registry, source tool (JFrog / Prisma), or minimum severity
- Table shows critical / high / medium / low CVE counts per image, last scanned time, and source

**Click a row** → opens the Image Detail page.

**Data source:** JFrog Xray (`/artifactory/api/docker/...`) and Prisma Cloud image API.

---

### Image Detail (`/images/:id`)

**What it shows:** Full security profile for one container image. Four tabs:

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
- **Data source:** Prisma Cloud compliance scan

#### Layers tab
- Per-layer breakdown: package count and size (JFrog images only)
- Prisma-sourced images show an explanatory message (Prisma does not expose layer data)

---

### Package Inventory (`/packages`)

**What it shows:** All packages found across **all** images in one aggregated view — focused on what needs upgrading.

- **Current version** vs. **Fix version** side by side
- Severity badge on packages with known CVEs
- `Clean` badge on packages with no known vulnerabilities
- Click the image count (e.g. "3 images ▼") to expand and see exactly which images contain that package
- Filters: search by name, filter by type (deb / jar / pip / etc.), severity, or "has fix available"
- Default sort: Critical → High → Medium → Low → Clean

**Use this page to:** quickly find all packages that need an upgrade and which images are affected, without having to check each image individually.

**Data source:** JFrog Xray and Prisma Cloud component lists, joined with vulnerability data to compute severity and fix version per package.

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

### Pipeline Security (`/pipelines`)

**What it shows:** GitLab CI pipeline runs with their security scan results.

- Filter by project or pipeline status (passed / failed / running)
- Table: project, branch, status badge, SAST finding count, dependency scan count, secret detection count, start time
- Click a row to **expand** and see individual findings per category (SAST / Dependency Scan / Secret Detection)

**Data source:** GitLab REST API — pipelines + job artifact reports (SAST JSON, dependency scanning JSON, secret detection JSON).

---

### Global Search (`/search`)

**What it shows:** Results across all tools for any query.

- Type a query in the top search bar and press Enter
- Results grouped by: Images, CVEs, Code Issues, Pipelines
- Each result has a source tool badge (JFrog / SonarQube / Prisma / GitLab)
- Click any result to navigate to its detail page

**Searches across:** image names, CVE IDs, package names, code file paths, pipeline project names.

---

### Settings (`/settings`)

**What it shows:** Tool connection status and manual sync controls.

- Status card per tool (JFrog, SonarQube, Prisma, GitLab):
  - Green dot = last sync succeeded / Red dot = last sync failed
  - Last sync time and records synced
  - Error message if last sync failed (e.g. wrong credentials)
  - Which environment variables configure that tool (read-only display)
- **Sync Now** button — triggers an immediate data pull from that tool

**To connect a real tool:** update the corresponding environment variables in `k8s/secrets.yaml` (see `DEPLOYMENT.md`) and restart the backend pod. Then click Sync Now.

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

Data is pulled from tools via scheduled sync (every 30 minutes by default) or on demand from the Settings page.

| Tool | What gets synced |
|------|-----------------|
| JFrog Xray | Container images, vulnerabilities (CVEs), packages, fix suggestions |
| SonarQube | Projects, quality gate status, code issues |
| Prisma Cloud | Container images, vulnerabilities, compliance checks, packages |
| GitLab | Pipeline runs, SAST findings, dependency scan results, secret detection |

Sync status is shown in the Tool Health strip on the Dashboard and in detail on the Settings page.

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
