# Architecture Overview

This is the entry point for understanding the DevSecOps Portal as it actually
exists today. For deep dives, see:

- [`docs/BACKEND.md`](BACKEND.md) — FastAPI app structure, the integration
  pattern, background sync jobs, auth/RBAC
- [`docs/FRONTEND.md`](FRONTEND.md) — Next.js structure, styling/state
  conventions, component inventory
- [`docs/DATABASE.md`](DATABASE.md) — full schema reference, data-honesty
  conventions, migration approach
- [`DEPLOYMENT.md`](../DEPLOYMENT.md) — how to actually stand this up on
  OpenShift/Kubernetes
- [`docs/integrations.md`](integrations.md) — the **historical decision
  log**: a chronological, narrative record of how and why each integration
  was built, in the order it happened. Read it for "why does this exist,"
  not "what exists now" — that's what the docs above are for.

## What this is and why

The DevSecOps Portal is a **unified, read-only sync dashboard** over four
security/quality tools — **JFrog Xray** (container image vulnerabilities),
**SonarQube** (code quality/security), **GitLab** (CI/CD pipelines), and
**Prisma Cloud** (cloud security posture, currently stubbed). Rather than an
engineer switching between four tools' UIs to answer "what's our security
posture right now," this portal syncs each tool's data into its own
Postgres database on demand and presents it as one dashboard, correlated by
data type (all images together, all CVEs together, all pipelines together)
rather than siloed per source tool.

It is deliberately **not** a full vulnerability-management/GRC platform
(compare: DefectDojo) — no finding-workflow, no deduplication engine, no
ticketing integration, no product/engagement/test hierarchy. It syncs,
displays, and lets you act (fix suggestions, re-sync). Anything heavier than
that is a considered decision, not an oversight — see "Cross-cutting
principles" below.

## System overview

```
 Browser
   │
   ▼
 Next.js frontend (Docker: "frontend", :3000)
   │  - middleware.ts gates every route except /login on a session cookie
   │  - proxies /api/* to the backend (next.config.mjs rewrites) — the
   │    browser only ever sees ONE origin, so cookies need no CORS dance
   ▼
 FastAPI backend (Docker: "backend", :8000)
   │  - every router requires a valid session except /health and /auth/login
   │  - integrations/*.py modules talk to the real external tools
   ▼                                              ┌─────────────────────┐
 Postgres ("db") ◄─────────────────────────────── │ JFrog / SonarQube /  │
   - all synced data                              │ GitLab / Prisma      │
   - sync watermarks + heartbeats                 │ (real external APIs) │
   - user sessions                                └─────────────────────┘
```

Nothing talks to the external tools except the backend's `integrations/`
modules, and nothing talks to Postgres except the backend — the frontend
only ever calls the backend's `/api/*`.

## Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Backend | FastAPI + SQLAlchemy 2.0 + Postgres | No Alembic — see `docs/DATABASE.md` |
| Backend HTTP client | `httpx` (async) | Used for every external tool call |
| Auth | Local accounts, bcrypt, DB-backed session cookie | No JWT — see `docs/BACKEND.md` §Auth |
| Frontend | Next.js 14 App Router + TypeScript | No Tailwind — inline styles + a token module |
| Frontend state | Plain React hooks | No react-query/Redux/Zustand |
| Local dev orchestration | `docker-compose.yml` | 3 services: db, backend, frontend |
| Production target | Kubernetes/OpenShift | 7 manifests under `k8s/`, see below |

## Cross-cutting principles

These recur throughout the codebase and were each the result of a specific
decision, not an accident — worth knowing before changing any of them:

1. **`is_seed` data honesty.** `backend/seed.py` inserts realistic fake demo
   data so the portal is usable before any real tool is connected. Every
   seedable table has an `is_seed` boolean; seed rows get a muted **Demo**
   badge in the UI. Real synced data is never retroactively marked seed,
   and seed data is never silently mixed into what look like real counts.
2. **Explicit linking, never name-guessing.** The `Service` entity
   (correlating a SonarQube project + GitLab project + image into one
   view) intentionally does **not** join by matching similar names —an
   earlier feature (`PROJECT_META`, since removed) did that and it risked
   silently overlaying fake metadata onto a real project that happened to
   share a key with seed data. Services are linked by explicit user choice
   or a verified real signal (SonarQube's own DevOps-platform binding),
   never by string similarity.
3. **Postgres is the single source of truth; keep infra lightweight.**
   No Redis, no message broker, no cache layer exists anywhere. Background
   sync jobs track progress and liveness (a heartbeat timestamp) directly
   in Postgres rather than in-memory or in a broker; user sessions are a
   Postgres table with an httpOnly cookie rather than a JWT. Both choices
   were made *because* the real deployment target is multi-replica k8s —
   a DB-backed design is trivially correct across replicas, an in-memory
   one isn't.
4. **Read-only by design.** Nothing in this app writes back to a source
   tool (no auto-resolving a SonarQube issue, no commenting on a GitLab
   pipeline). This is a deliberate scope boundary, not a missing feature.
5. **Honest gaps over fabricated data.** Where a real API doesn't provide
   something (e.g. GitLab's built-in SAST scanners aren't required by this
   app's pipelines, so those counts are always 0), the UI shows the true
   absence rather than inventing a plausible-looking number.

## Kubernetes / production deployment

The real, intended long-term deployment target is Kubernetes (or
OpenShift) — this has already shaped several backend decisions (see
principle 3 above), not just the deployment manifests.

**What exists** (`k8s/`, 7 manifests): `namespace.yaml`, `secrets.yaml`
(template with `CHANGE_ME` placeholders), `postgres-statefulset.yaml`,
`backend-deployment.yaml` (**2 replicas**), `frontend-deployment.yaml`,
`services.yaml`, `ingress.yaml` (a generic nginx `Ingress`, not an
OpenShift `Route`).

**What the 2-replica target already required getting right**:
- A sync job's progress/liveness lives in the `sync_jobs` table
  (`phase`, `processed_items`, `last_heartbeat_at`), not in-process memory —
  so a second replica can correctly tell "genuinely still running elsewhere"
  apart from "orphaned, its pod died" (see `docs/BACKEND.md`).
  A naive "mark everything running as failed on my own restart" approach
  was tried first and rejected specifically because it would falsely kill
  a healthy sync on a *different* replica.
- Login sessions live in a `sessions` table, checked by whichever backend
  replica happens to serve a request — no sticky sessions, no shared
  in-memory cache needed.

**What's still a real gap**:
- **No TLS anywhere yet** — `k8s/ingress.yaml` has no `tls:` section. The
  session cookie's `secure` flag is already environment-configurable
  (`COOKIE_SECURE`, defaults `false`) for exactly this reason — flip it to
  `true` the same day TLS termination is added in front of the ingress, not
  before (a `secure` cookie over plain HTTP is silently dropped by browsers).
- `DEPLOYMENT.md` was written before this session's work and has some
  drift — see that file's own notes for current status.
