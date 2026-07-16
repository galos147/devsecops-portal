# DevSecOps Portal — Design Document

## Overview

A unified portal that aggregates security and code quality data from JFrog Xray, SonarQube, Prisma Cloud (Palo Alto), and GitLab into one searchable interface. The team gets one place to find images, browse vulnerabilities, review code issues, check pipeline results, and see fix suggestions — without switching between tools.

---

## Architecture: 3-Pod Deployment on Kubernetes

```
┌──────────────────────────────────────────────────────────────┐
│  Kubernetes Cluster                                          │
│                                                              │
│  Ingress (nginx)                                             │
│     /      → frontend-svc                                    │
│     /api/* → backend-svc                                     │
│                                                              │
│  ┌────────────────┐  ┌────────────────┐  ┌───────────────┐  │
│  │  Deployment    │  │  Deployment    │  │  StatefulSet  │  │
│  │  frontend      │  │  backend       │  │  postgres     │  │
│  │  (React/Next)  │◄─│  (FastAPI)     │◄─│  (PostgreSQL) │  │
│  │  Service:3000  │  │  Service:8000  │  │  Service:5432 │  │
│  └────────────────┘  └──────┬─────────┘  └───────────────┘  │
│                             │                PVC (storage)   │
│         ┌───────────────────┼──────────────┐                 │
│         ▼                   ▼              ▼          ▼      │
│     JFrog Xray          SonarQube      Prisma      GitLab    │
│       REST API            Web API       Cloud        API     │
└──────────────────────────────────────────────────────────────┘
```

### Kubernetes Manifests Needed

| Resource | Purpose |
|----------|---------|
| `Deployment/frontend` | React/Next.js pod, replicas: 2 |
| `Deployment/backend` | FastAPI pod, replicas: 2 |
| `StatefulSet/postgres` | PostgreSQL with persistent volume |
| `PersistentVolumeClaim` | DB storage |
| `Service/frontend-svc` | ClusterIP :3000 |
| `Service/backend-svc` | ClusterIP :8000 |
| `Service/postgres-svc` | ClusterIP :5432 (headless for StatefulSet) |
| `Ingress` | Exposes frontend + `/api/*` routes externally |
| `Secret/devsecops-secrets` | Tool API keys + DB password |
| `ConfigMap/devsecops-config` | Non-sensitive env vars (URLs, sync interval) |
| `CronJob/sync-job` | Optional: alternative to APScheduler for tool syncs |

---

## Database Schema (PostgreSQL)

### `images`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| name | text | image name |
| tag | text | |
| registry | text | registry hostname |
| digest | text | sha256 |
| size_mb | float | |
| pushed_at | timestamptz | |
| last_scanned_at | timestamptz | |
| source | enum | `jfrog` \| `prisma` |

### `vulnerabilities`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| image_id | uuid FK → images | |
| cve_id | text | e.g. CVE-2023-1234 |
| severity | enum | `critical` \| `high` \| `medium` \| `low` |
| package_name | text | |
| installed_version | text | |
| fixed_version | text | null if no fix |
| description | text | |
| cvss_score | float | |
| source_tool | text | `jfrog` \| `prisma` |
| status | enum | `open` \| `fixed` \| `suppressed` |

### `code_issues`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| project_key | text | SonarQube project key |
| project_name | text | |
| rule_id | text | SonarQube rule |
| type | enum | `BUG` \| `VULNERABILITY` \| `CODE_SMELL` |
| severity | enum | `blocker` \| `critical` \| `major` \| `minor` \| `info` |
| message | text | |
| file_path | text | |
| line_number | int | |
| status | text | `OPEN` \| `RESOLVED` \| `CLOSED` |
| source_tool | text | `sonarqube` |

### `pipeline_runs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| gitlab_project_id | text | |
| pipeline_id | text | |
| ref | text | branch or tag |
| status | text | `passed` \| `failed` \| `running` |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| sast_findings | jsonb | raw GitLab SAST report |
| dependency_scan_findings | jsonb | |
| secret_detection_findings | jsonb | |

### `fix_suggestions`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| finding_type | enum | `vulnerability` \| `code_issue` |
| finding_id | uuid | FK to vulnerabilities or code_issues |
| suggestion_text | text | |
| source | enum | `tool` \| `ai` |
| created_at | timestamptz | |

### `sync_jobs`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| tool | enum | `jfrog` \| `sonarqube` \| `prisma` \| `gitlab` |
| status | enum | `running` \| `success` \| `failed` |
| started_at | timestamptz | |
| finished_at | timestamptz | |
| records_synced | int | |
| error_message | text | null on success |

---

## Backend (FastAPI)

### Project Structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app, CORS, router registration
│   ├── config.py               # Settings loaded from env vars
│   ├── database.py             # SQLAlchemy engine + session factory
│   ├── models/                 # ORM models (one file per table)
│   ├── schemas/                # Pydantic request/response schemas
│   ├── routers/
│   │   ├── images.py
│   │   ├── vulnerabilities.py
│   │   ├── code_quality.py
│   │   ├── pipelines.py
│   │   ├── search.py
│   │   ├── fix_suggestions.py
│   │   └── sync.py
│   ├── integrations/
│   │   ├── jfrog.py            # JFrog Xray API client
│   │   ├── sonarqube.py        # SonarQube Web API client
│   │   ├── prisma.py           # Prisma Cloud API client
│   │   └── gitlab.py           # GitLab REST API client
│   └── scheduler.py            # APScheduler periodic sync (every 30 min)
├── alembic/                    # DB migrations
├── Dockerfile
└── requirements.txt
```

### API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/dashboard/stats` | KPI counts for dashboard |
| GET | `/api/images` | List images — filters: registry, severity, source, search |
| GET | `/api/images/{id}` | Image detail + vulnerabilities + compliance |
| GET | `/api/vulnerabilities` | List CVEs — filters: severity, status, tool, has_fix |
| GET | `/api/vulnerabilities/{cve_id}` | CVE detail + all affected images |
| GET | `/api/code-issues` | SonarQube issues — filters: project, type, severity |
| GET | `/api/projects` | SonarQube projects with quality gate status |
| GET | `/api/pipelines` | GitLab pipeline runs with security finding counts |
| GET | `/api/search` | Global search across all entities (`?q=...`) |
| GET | `/api/fix-suggestions/{finding_id}` | Fix suggestion for a vulnerability or code issue |
| POST | `/api/sync/{tool}` | Manually trigger sync for one tool |
| GET | `/api/sync/status` | Last sync time + status for each tool |

---

## Tool Integrations

### JFrog Xray
- **Auth:** `JFROG_URL`, `JFROG_API_KEY`
- **Endpoints:** `/xray/api/v1/summary/artifact`, `/xray/api/v2/vulnerabilities`
- **Pull flow:** artifact list → scan summaries → vulnerabilities per artifact

### SonarQube
- **Auth:** `SONAR_URL`, `SONAR_TOKEN`
- **Endpoints:** `/api/projects/search`, `/api/issues/search`, `/api/qualitygates/project_status`
- **Pull flow:** projects → issues per project → quality gate status per project

### Prisma Cloud (Palo Alto)
- **Auth:** `PRISMA_URL`, `PRISMA_ACCESS_KEY`, `PRISMA_SECRET_KEY`
- **Endpoints:** `/api/v1/images`, `/api/v1/images/{id}/vulnerabilities`
- **Pull flow:** image list → vulnerability details per image → compliance results

### GitLab
- **Auth:** `GITLAB_URL`, `GITLAB_TOKEN`
- **Endpoints:** `/api/v4/projects`, `/api/v4/projects/:id/pipelines`, job artifacts
- **Pull flow:** projects → pipelines → download SAST / dependency_scanning / secret_detection JSON artifacts

---

## Data Sync Strategy

- **Scheduled:** APScheduler runs every 30 minutes per tool (configurable via `SYNC_INTERVAL_MINUTES`)
- **Manual:** `POST /api/sync/{tool}` triggers an immediate sync
- **Incremental:** Each tool tracks `last_sync_at`; pull only records updated since then where the tool API supports it
- **Audit:** Every sync attempt is logged to `sync_jobs` with outcome and record count

---

## Design Reference

A high-fidelity interactive prototype is provided at:
```
C:\Users\galda\Downloads\design_doc_extracted\design_handoff_devsecops_portal\DevSecOps-Portal.dc.html
```
Open it directly in a browser to click through all 9 views with realistic mock data. **This is the source of truth for layout, states, colors, and copy.** The frontend implementation must match it pixel-for-pixel — recreate in React/Next.js; do not copy the prototype code directly.

---

## Design Tokens

### Colors (oklch, cool-neutral dark theme)

| Token | Value |
|-------|-------|
| Page background | `oklch(0.15 0.004 250)` |
| Sidebar background | `oklch(0.13 0.004 250)` |
| Card / table background | `oklch(0.19 0.006 250)` |
| Inset code block | `oklch(0.13–0.14 0.004 250)` |
| Border | `oklch(0.26–0.30 0.008 250)` |
| Row divider (lighter) | `oklch(0.23 0.008 250)` |
| Text primary | `oklch(0.93 0.004 250)` |
| Text secondary | `oklch(0.6–0.7 0.01 250)` |
| Text muted | `oklch(0.48–0.55 0.01 250)` |
| Accent (links, active nav, buttons) | `oklch(0.66 0.15 245)` |

#### Severity badges (bg / fg)
| Severity | Background | Foreground |
|----------|-----------|------------|
| Critical | `oklch(0.30 0.09 25)` | `oklch(0.80 0.17 25)` |
| High | `oklch(0.30 0.07 55)` | `oklch(0.80 0.15 55)` |
| Medium | `oklch(0.30 0.06 95)` | `oklch(0.82 0.13 95)` |
| Low | `oklch(0.28 0.03 150)` | `oklch(0.75 0.10 150)` |
| Pass / OK | `oklch(0.28 0.05 150)` | `oklch(0.72 0.12 150)` |
| Fail / Error | `oklch(0.30 0.08 25)` | `oklch(0.78 0.16 25)` |

### Typography
- **UI font:** Inter (400/500/600/700), fallback `-apple-system, "Segoe UI", sans-serif`
- **Monospace** (CVE IDs, digests, file paths, versions, commands): `ui-monospace, monospace`
- **Size scale:** 20–22px page titles · 14–15px section headers · 12.5–13px body/table cells · 11–12px meta/labels/badges

### Spacing & Shape
- Sidebar width: **232px** fixed
- Fix panel width: **420px** fixed, full height, slides in from right
- Card/table border-radius: **10px** · small badges/buttons: **5–7px**
- Card padding: **16–18px** · table row padding: **10–12px** vertical, **16px** horizontal
- Standard gaps: **8–16px**
- **No drop shadows** — hierarchy via background layering + 1px borders only

### Icons
None hand-drawn. Use a standard icon set (Lucide / Heroicons) consistent with the codebase if icons are needed.

---

## Interactions & Behavior

- **Navigation:** persistent left sidebar (Dashboard, Images, Vulnerabilities, Code Quality, Pipelines, Search, Settings). Image Detail and CVE Detail are drill-down pages with a "← Back" link — no sidebar entry.
- **Fix Suggestion panel:** right-side slide-over (420px, full height) with dimmed backdrop. Opens from any "Fix" button. Closes on backdrop click or × icon. Shows: title, severity badge, description, CVSS/location line, remediation text, copyable command block, Copy button, advisory link.
- **Sorting:** Vulnerability Explorer's Severity and CVSS column headers toggle asc/desc with ▲/▼ caret.
- **Filtering:** all list pages filter client-side, live as filters change — no submit button. Filters + sort should be URL query params so views are shareable/bookmarkable.
- **Copy-to-clipboard:** button label swaps to "Copied!" for 1.5 seconds after click.
- **Loading/empty states:** Global Search has an empty-query state and a no-results state. Image Detail Layers tab shows an explanatory message for Prisma-sourced images (Prisma doesn't provide layer data).
- **Settings Sync Now:** shows "Syncing…" for 900ms then updates last-sync time and record count.

---

## Session State

No persistence beyond the session is required. State to track:

| State | Scope |
|-------|-------|
| current page / route | global |
| selected image id, selected CVE id | global |
| active tab per detail page | per page |
| open/closed state + target finding for Fix panel | global |
| filter values per list page (text + selects) | per page |
| sort key/direction | Vulnerability Explorer |
| expanded pipeline row id | Pipelines page |
| global search draft (top bar) vs. committed query (search page) | global |
| per-tool "syncing" flag + last-sync/records values | Settings |

---

## Frontend Pages

### Page Map

```
/                        → Dashboard
/images                  → Image Inventory
/images/:id              → Image Detail
/vulnerabilities         → Vulnerability Explorer
/vulnerabilities/:cveId  → CVE Detail
/code-quality            → Code Quality (SonarQube)
/pipelines               → Pipeline Security (GitLab)
/search                  → Global Search
/settings                → Tool connections + manual sync
```

---

### Page Specifications

#### Dashboard (`/`)
Security posture at a glance.

- **KPI cards:** Total Images | Critical CVEs | High Code Issues | Failing Pipelines | Last Sync
- **Severity chart:** Bar chart (critical / high / medium / low) aggregated across all tools
- **Top 10 vulnerable images:** Table sorted by critical CVE count
- **Recent pipeline failures:** Table with security finding counts
- **Tool health strip:** Green/red status per tool (JFrog, SonarQube, Prisma, GitLab)

---

#### Image Inventory (`/images`)
Browse and search all container images.

- Search bar: name, tag, digest
- Filters: Registry | Source (JFrog / Prisma) | Min Severity | Last Scanned date range
- Table: Image Name | Tag | Registry | Critical | High | Medium | Low | Last Scanned | Actions

---

#### Image Detail (`/images/:id`)
Full security profile for one image.

- Header: `name:tag`, registry, digest, size, last scanned timestamp
- Tabs:
  - **Vulnerabilities** — sortable table: CVE ID | Package | Installed | Fixed | Severity | Status | Fix button
  - **Compliance** (from Prisma) — compliance checks pass/fail list
  - **Layers** (from JFrog, if available) — per-layer package breakdown
- "View Fix" button on each CVE row opens the Fix Suggestion side panel

---

#### Vulnerability Explorer (`/vulnerabilities`)
Search and filter all CVEs across all images.

- Search: CVE ID, package name, keyword in description
- Filters: Severity | Status | Source Tool | Has Fix Available
- Table: CVE ID | Severity | CVSS | Description | Affected Images | Fixed Version | Status

---

#### CVE Detail (`/vulnerabilities/:cveId`)
Which images are affected by this CVE.

- CVE metadata: description, CVSS vector, published date
- Affected images table: Image | Tag | Installed Version | Fixed Version | Status
- Fix suggestion panel

---

#### Code Quality (`/code-quality`)
SonarQube findings.

- **Projects tab:** Project | Quality Gate | Bugs | Vulnerabilities | Code Smells | Coverage %
- **Issues tab:** Filterable by project, type, severity, file, status
  - Each row: File path | Line | Rule | Message | Severity | Effort to fix

---

#### Pipeline Security (`/pipelines`)
GitLab CI security results.

- Filters: Project | Branch | Status | Date range
- Table: Pipeline ID | Project | Branch | Status | SAST | Dep Scan | Secret Detection | Started At
- Expand row to see individual findings inline

---

#### Global Search (`/search`)
One search box, results across all tools.

- Results grouped by: Images | CVEs | Code Issues | Pipelines
- Each result has a source tool badge (JFrog / SonarQube / Prisma / GitLab)
- Click any result → navigates to its detail page

---

#### Fix Suggestions (side panel)
Remediation advice for a specific finding.

- CVE description + CVSS vector (for vulnerabilities)
- Affected package + upgrade version
- SonarQube "why this is an issue" + remediation guidance (for code issues)
- Link to NVD / tool advisory
- One-click copy: updated `docker pull` command or suggested code snippet

---

#### Settings (`/settings`)
Admin view for tool connections.

- Per-tool card: Last Sync | Records Synced | Error (if any) | "Sync Now" button
- Read-only display of which environment variables configure each tool

---

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:pass@db:5432/devsecops

# JFrog Xray
JFROG_URL=https://yourcompany.jfrog.io
JFROG_API_KEY=...

# SonarQube
SONAR_URL=https://sonar.yourcompany.com
SONAR_TOKEN=...

# Prisma Cloud
PRISMA_URL=https://api.prismacloud.io
PRISMA_ACCESS_KEY=...
PRISMA_SECRET_KEY=...

# GitLab
GITLAB_URL=https://gitlab.yourcompany.com
GITLAB_TOKEN=...

# Sync schedule
SYNC_INTERVAL_MINUTES=30
```

---

## Implementation Order

1. DB schema + Alembic migrations
2. FastAPI skeleton (routers, models, schemas, config)
3. Tool integration clients (one per tool, independently testable)
4. APScheduler sync jobs
5. Frontend (React/Next.js — one page at a time via skill)

---

## Verification Checklist

- [ ] `docker-compose up` starts all 3 pods without errors
- [ ] `GET /api/dashboard/stats` returns JSON with counts
- [ ] `POST /api/sync/sonarqube` runs and a row appears in `sync_jobs`
- [ ] Frontend at `localhost:3000` renders Dashboard KPI cards
- [ ] Global Search for a CVE ID returns results from multiple tools
- [ ] Image Detail page loads vulnerability table for a known image
- [ ] Fix suggestion panel opens when clicking "View Fix" on a CVE row
