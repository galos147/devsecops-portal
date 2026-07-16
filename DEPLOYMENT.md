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

Copy the template and fill in your real credentials:

```bash
cp k8s/secrets.yaml.template k8s/secrets.yaml
```

Edit `k8s/secrets.yaml` and fill in:

```yaml
stringData:
  DATABASE_URL: "postgresql://devsecops:YOURPASSWORD@postgres-svc:5432/devsecops"
  POSTGRES_PASSWORD: "YOURPASSWORD"

  # JFrog Xray
  JFROG_URL: "https://yourorg.jfrog.io"
  JFROG_USERNAME: "your-service-account"
  JFROG_PASSWORD: "your-api-key-or-password"

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
```

> **Important:** `k8s/secrets.yaml` is in `.gitignore` — it will never be committed.

Apply the secret:

```bash
oc apply -f k8s/secrets.yaml
```

---

## Step 5 — Apply all Kubernetes/OpenShift manifests

```bash
oc apply -f k8s/namespace.yaml
oc apply -f k8s/configmap.yaml
oc apply -f k8s/postgres-statefulset.yaml
oc apply -f k8s/services.yaml
oc apply -f k8s/backend-deployment.yaml
oc apply -f k8s/frontend-deployment.yaml
oc apply -f k8s/route.yaml
```

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

## Step 6 — Seed the database

```bash
oc exec deploy/backend -n devsecops -- python seed.py
```

This loads realistic fake data so the portal is usable immediately while real syncs run.

---

## Step 7 — Get the portal URL

```bash
oc get routes -n devsecops
```

Open the `devsecops-frontend` route URL in your browser.

---

## Step 8 — Trigger real data sync

Once credentials are set, trigger syncs from the portal UI (Settings → Sync Now) or via API:

```bash
BACKEND=$(oc get route devsecops-api -n devsecops -o jsonpath='{.spec.host}')

# Sync JFrog Xray
curl -X POST https://$BACKEND/api/sync/jfrog

# Sync SonarQube
curl -X POST https://$BACKEND/api/sync/sonarqube

# Sync GitLab (if configured)
curl -X POST https://$BACKEND/api/sync/gitlab
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
| Route not accessible | Run `oc get routes` and check TLS termination |

---

## Running health checks

```bash
# From inside the cluster or via port-forward
oc port-forward svc/backend-svc 8000:8000 -n devsecops &
python scripts/check_backend.py
python scripts/check_frontend.py
```
