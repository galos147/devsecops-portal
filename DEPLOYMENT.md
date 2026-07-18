# DevSecOps Portal — Deployment Guide

This guide covers everything needed to deploy the portal on OpenShift with real JFrog Xray and SonarQube.

---

## Prerequisites

- OpenShift cluster access (`oc` CLI logged in)
- Docker or Podman (for building images)
- Access to your org's:
  - JFrog Artifactory + Xray URL + credentials
  - SonarQube URL + token
  - GitLab URL + access token (optional)
  - Prisma Cloud URL + keys (optional)

---

## Step 1 — Clone the repo

```bash
git clone <your-repo-url>
cd devsecops-portal
```

---

## Step 2 — Create the OpenShift project

```bash
oc new-project devsecops
```

---

## Step 3 — Build and push images

**Option A: OpenShift internal registry (recommended)**

```bash
# Log in to the internal registry
oc registry login

REGISTRY=$(oc registry info)
PROJECT=devsecops

# Build and push backend
docker build -t $REGISTRY/$PROJECT/devsecops-backend:latest ./backend
docker push $REGISTRY/$PROJECT/devsecops-backend:latest

# Build and push frontend
docker build -t $REGISTRY/$PROJECT/devsecops-frontend:latest ./frontend
docker push $REGISTRY/$PROJECT/devsecops-frontend:latest
```

**Option B: OpenShift BuildConfig (builds inside the cluster)**

```bash
oc new-build --binary --name=devsecops-backend -n devsecops
oc start-build devsecops-backend --from-dir=./backend --follow

oc new-build --binary --name=devsecops-frontend -n devsecops
oc start-build devsecops-frontend --from-dir=./frontend --follow
```

After building, update the image names in `k8s/backend-deployment.yaml` and `k8s/frontend-deployment.yaml` to match your registry path.

---

## Step 4 — Create Secrets

`k8s/secrets.yaml` already exists in the repo as a **template with
`CHANGE_ME`/blank placeholders** — edit it directly and fill in your real
values before applying (don't commit your real values back):

```yaml
stringData:
  DATABASE_URL: "postgresql://devsecops:YOURPASSWORD@postgres-svc:5432/devsecops"
  POSTGRES_PASSWORD: "YOURPASSWORD"

  # JFrog Xray
  JFROG_URL: "https://yourorg.jfrog.io"
  JFROG_API_KEY: "your-api-key-or-password"

  # SonarQube
  SONAR_URL: "https://sonar.yourorg.com"
  SONAR_TOKEN: "your-sonar-token"

  # GitLab (optional)
  GITLAB_URL: "https://gitlab.yourorg.com"
  GITLAB_TOKEN: "your-gitlab-token"

  # Prisma Cloud (optional — leave empty if not used)
  PRISMA_URL: ""
  PRISMA_ACCESS_KEY: ""
  PRISMA_SECRET_KEY: ""

  # Login sessions — see Step 6 for the login requirement itself.
  # Flip to "true" the same day TLS termination is added in front of the
  # ingress, not before — a `secure` cookie over plain HTTP is silently
  # dropped by browsers. See docs/ARCHITECTURE.md's Kubernetes section.
  COOKIE_SECURE: "false"
```

> **Important:** `k8s/secrets.yaml` is in `.gitignore` — it will never be
> committed, even after you fill in real values.

Apply the secret:

```bash
oc apply -f k8s/secrets.yaml
```

---

## Step 5 — Apply all Kubernetes/OpenShift manifests

There is no separate ConfigMap — every setting (secret or not) lives in
`k8s/secrets.yaml` from Step 4. The ingress manifest is a standard
Kubernetes `Ingress` (not an OpenShift `Route`) — `oc apply` accepts it
fine, OpenShift supports both:

```bash
oc apply -f k8s/namespace.yaml
oc apply -f k8s/postgres-statefulset.yaml
oc apply -f k8s/services.yaml
oc apply -f k8s/backend-deployment.yaml
oc apply -f k8s/frontend-deployment.yaml
oc apply -f k8s/ingress.yaml
```

`backend-deployment.yaml` runs **2 replicas** — this is deliberate (see
`docs/ARCHITECTURE.md`'s Kubernetes section for what that already required
getting right in the app itself: DB-backed sync-job heartbeats and DB-backed
login sessions, neither of which depend on which replica serves a request).

Check all pods are running:

```bash
oc get pods -n devsecops
```

All should show `Running`. If any show `CrashLoopBackOff`, check logs:

```bash
oc logs deploy/backend -n devsecops
oc logs deploy/frontend -n devsecops
```

---

## Step 6 — Seed the database (now required, not just for demo data)

```bash
oc exec deploy/backend -n devsecops -- python seed.py
```

This loads realistic fake data so the portal is usable immediately while
real syncs run. **This step is now load-bearing**: the portal requires a
login for every page, and this same script creates the first admin
account (`admin` / `ChangeMe123!`, printed to the pod's console output) if
none exists yet. Log in and change that password immediately via Settings
→ Users — it's a deliberate, visible MVP default for a small-team internal
tool, not something to leave as-is (see `docs/BACKEND.md`'s Auth & RBAC
section).

---

## Step 7 — Get the portal URL

`k8s/ingress.yaml` is a standard `Ingress`, not an OpenShift `Route` — its
host is hardcoded (`devsecops.internal`), not dynamically assigned, so
you'll need real DNS or a local hosts-file entry pointing at your
cluster's ingress controller:

```bash
oc get ingress -n devsecops
```

Open `http://devsecops.internal` (or whatever host you mapped) in your
browser and log in with the admin account from Step 6.

---

## Step 8 — Trigger real data sync

**Every API route now requires a logged-in session** (except `/health` and
`/api/auth/login`) — a bare unauthenticated `curl` will get `401`. The
simplest path is the portal UI itself: **Settings → Sync Now** on each
connected tool's card. If you need to script it, log in first and reuse
the session cookie:

```bash
BACKEND=devsecops.internal   # or wherever your ingress is mapped

curl -c cookies.txt -X POST https://$BACKEND/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"<your-changed-password>"}'

# Sync JFrog Xray — now a background job; returns immediately
curl -b cookies.txt -X POST https://$BACKEND/api/sync/jfrog

# Sync SonarQube
curl -b cookies.txt -X POST https://$BACKEND/api/sync/sonarqube

# Sync GitLab (if configured)
curl -b cookies.txt -X POST https://$BACKEND/api/sync/gitlab

# Check progress
curl -b cookies.txt https://$BACKEND/api/sync/status
```

Check sync results in the portal under **Settings**.

---

## Updating the portal

After making code changes:

```bash
# On your dev machine
git add .
git commit -m "your changes"
git push

# On the OpenShift machine
git pull

# Rebuild and push images (Step 3 again)
# Then restart deployments to pick up new images
oc rollout restart deployment/backend -n devsecops
oc rollout restart deployment/frontend -n devsecops
```

---

## Troubleshooting

| Problem | Fix |
|---------|-----|
| Pod won't start (SCC error) | Check Dockerfile has non-root USER — both are already set |
| Backend can't connect to DB | Check `DATABASE_URL` in secrets, ensure postgres pod is Running |
| Sync returns 0 records | Check tool credentials in secrets, check backend logs |
| Frontend shows blank page | Check `API_BACKEND_URL` env in frontend deployment |
| Everything returns `401` | Expected — every route needs a logged-in session now (Step 8). Only `/health` and `/api/auth/login` are public. |
| Ingress not accessible | Run `oc get ingress -n devsecops`, confirm the host resolves, check TLS termination (there isn't any yet by default — see `docs/ARCHITECTURE.md`) |

---

## Running health checks

```bash
# From inside the cluster or via port-forward
oc port-forward svc/backend-svc 8000:8000 -n devsecops &
python scripts/check_backend.py
python scripts/check_frontend.py
```

> **Known gap, found while writing this doc**: `scripts/check_backend.py`
> calls several now-gated endpoints (`/api/dashboard/stats`, `/api/images`,
> etc.) with no login step — since this session added required
> authentication to every route, this script will get `401` on all of them
> until it's updated to log in first (the same pattern shown in Step 8)
> and reuse the session cookie. Not fixed as part of this documentation
> pass — flagging it here so it doesn't look like a mysterious new failure.
