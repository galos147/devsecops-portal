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
you see on first load):

```bash
docker compose exec backend python seed.py
```

No `.env` file is required to start — every env var in `docker-compose.yml`
has a safe empty default.

## Connect a real tool

No config files to edit, no restarts required. Open **Settings**
(`/settings`) and, per tool, fill in the URL and credentials, click
**Test Connection**, then **Save**. Currently:

- **JFrog Xray** and **SonarQube** — fully wired: Save + Sync Now pulls real
  images/CVEs or projects/issues into the dashboard.
- **Prisma Cloud** and **GitLab** — connection testing works; data sync is
  still a stub (see `docs/integrations.md`).

For standing up a local SonarQube instance to test against (including a small
deliberately-flawed sample project to scan), see `docs/integrations.md`.

## Stack

- **Backend** — FastAPI + SQLAlchemy + PostgreSQL (`backend/requirements.txt`)
- **Frontend** — Next.js 14 + TypeScript (`frontend/package.json`)
- **Runtime** — `docker-compose.yml` (`db` + `backend` + `frontend`, hot-reload in dev)

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
