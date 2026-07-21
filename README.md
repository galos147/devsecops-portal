# DevSecOps Portal

A unified dashboard that pulls security and code-quality data from **JFrog Xray**,
**SonarQube**, **Prisma Cloud**, and **GitLab** into one place — search images,
track vulnerabilities, review code issues, and check pipeline results without
switching between tools.

Ships with realistic seeded demo data so it's fully usable out of the box, and
a live **SonarQube** integration you can point at a real instance in minutes.

## Quick start

```bash
git clone https://github.com/galos147/devsecops-portal.git
cd devsecops-portal
docker compose up -d
```

- Frontend: **http://localhost:3000**
- Backend API: **http://localhost:8000**
- Postgres: `localhost:5432` (user/pass/db: `devsecops`)

Load the demo data (fake images, CVEs, code issues, pipeline runs — everything
you see on first load) — **this step is now required, not optional**: the
portal requires a login, and this same script creates the first admin
account if none exists yet.

```bash
docker compose exec backend python seed.py
```

Log in with `admin` / `ChangeMe123!` (printed to the console when created)
and **change it immediately** via Settings → Users — this default credential
is a deliberate MVP trade-off for a small-team internal tool with no email
infrastructure to deliver a real invite any other way (see
`docs/integrations.md` §11).

No `.env` file is required to start — every env var in `docker-compose.yml`
has a safe empty default.

## Connect a real tool

No config files to edit, no restarts required. Open **Settings**
(`/settings`) — connected tools show as a card; click **+ Add Integration**
to pick an unconfigured tool, fill in the URL and credentials, **Test
Connection**, then **Save**. Currently:

- **JFrog Xray**, **SonarQube**, and **GitLab** — fully wired: Save + Sync
  Now pulls real images/CVEs, projects/issues, or pipeline runs into the
  dashboard.
- **Prisma Cloud** — connection testing works; data sync is still a stub
  (see `docs/integrations.md`).

Rows/cards from the bundled seed data are marked with a muted **Demo**
badge so it's always clear what's real vs. fixture data. Disconnecting a
tool (**Unregister**, in its card's Danger Zone) only clears the saved
connection — previously-synced data stays until separately removed via
**Delete synced data**.

For standing up a local SonarQube instance to test against (including a small
deliberately-flawed sample project to scan) and a real GitLab.com + local
CI runner setup, see `docs/integrations.md`.

## Stack

- **Backend** — FastAPI + SQLAlchemy + PostgreSQL (`backend/requirements.txt`)
- **Frontend** — Next.js 14 + TypeScript (`frontend/package.json`)
- **Runtime** — `docker-compose.yml` (`db` + `backend` + `frontend`, hot-reload in dev)

## Container images

`backend` and `frontend` are built and pushed to GitHub Container Registry on
every push to `main` (`.github/workflows/docker-publish.yml`) — pull them
directly instead of building locally:

| Image | Pull |
|---|---|
| Backend | `docker pull ghcr.io/galos147/devsecops-portal-backend:latest` |
| Frontend | `docker pull ghcr.io/galos147/devsecops-portal-frontend:latest` |
| Postgres (`db`) | `docker pull postgres:16-alpine` — public upstream image from Docker Hub, not built by this repo |

All tags (`latest`, per-commit SHA, per-branch) are listed at
https://github.com/galos147?tab=packages. GHCR packages default to
**private** — if a pull fails with an auth error, either run
`docker login ghcr.io` with a PAT that has `read:packages`, or make the
package public from its GitHub package settings.

## Project layout

```
backend/              FastAPI app — routers, models, schemas, tool integrations
frontend/             Next.js app — one page per feature area
sample-projects/      Deliberately-flawed sample app for testing the SonarQube integration
k8s/                  OpenShift/Kubernetes manifests for production deployment
docs/                 Deep-dive docs (see below)
sonar-project.properties   Scans this repo's own backend + frontend code
```

## Docs

| File | What it covers |
|---|---|
| `FEATURES.md` | Page-by-page tour of the portal |
| `docs/integrations.md` | How the SonarQube integration and the generic tool-config system work, and how to reproduce the local setup |
| `DEPLOYMENT.md` | OpenShift/Kubernetes deployment guide |
| `doc-design.md` | Architecture overview |
