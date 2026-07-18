import asyncio
from datetime import datetime, timedelta
from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import or_
from app.database import init_db, SessionLocal
from app.models.sync_job import SyncJob
from app.auth import get_current_user, require_admin
from app.routers import dashboard, images, vulnerabilities, code_quality, pipelines, search, fix_suggestions, sync, integrations, services, auth, users

app = FastAPI(title="DevSecOps Portal API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://frontend:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# A running sync is only considered orphaned once its heartbeat (ticked every ~15s,
# see routers/sync.py) has gone stale this long — several missed ticks' worth of
# buffer. Deliberately NOT "any process restart = every running job is dead": with
# multiple replicas (k8s/OpenShift), a routine restart of one pod must not kill a
# sync that's genuinely still running, heartbeat and all, on a different pod.
STALE_JOB_THRESHOLD_SECONDS = 90
REAP_INTERVAL_SECONDS = 60

_reaper_task: asyncio.Task | None = None


def _reap_stale_jobs() -> None:
    db = SessionLocal()
    try:
        cutoff = datetime.utcnow() - timedelta(seconds=STALE_JOB_THRESHOLD_SECONDS)
        stale_jobs = db.query(SyncJob).filter(
            SyncJob.status == "running",
            or_(SyncJob.last_heartbeat_at.is_(None), SyncJob.last_heartbeat_at < cutoff),
        ).all()
        for job in stale_jobs:
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.error_message = "Interrupted: no heartbeat received — the owning process likely died or restarted"
        if stale_jobs:
            db.commit()
    finally:
        db.close()


async def _reaper_loop() -> None:
    # Runs continuously, not just at startup — a pod that never restarts still needs
    # to notice when a *different* pod's sync died without a graceful failure.
    while True:
        await asyncio.sleep(REAP_INTERVAL_SECONDS)
        try:
            _reap_stale_jobs()
        except Exception:
            pass


@app.on_event("startup")
async def on_startup():
    init_db()
    _reap_stale_jobs()
    global _reaper_task
    _reaper_task = asyncio.create_task(_reaper_loop())


app.include_router(auth.router)  # public — login must stay reachable
app.include_router(dashboard.router, dependencies=[Depends(get_current_user)])
app.include_router(images.router, dependencies=[Depends(get_current_user)])
app.include_router(vulnerabilities.router, dependencies=[Depends(get_current_user)])
app.include_router(code_quality.router, dependencies=[Depends(get_current_user)])
app.include_router(pipelines.router, dependencies=[Depends(get_current_user)])
app.include_router(search.router, dependencies=[Depends(get_current_user)])
app.include_router(fix_suggestions.router, dependencies=[Depends(get_current_user)])
app.include_router(sync.router, dependencies=[Depends(get_current_user)])
app.include_router(integrations.router, dependencies=[Depends(require_admin)])
app.include_router(services.router, dependencies=[Depends(get_current_user)])
app.include_router(users.router, dependencies=[Depends(require_admin)])


@app.get("/health")
def health():
    return {"status": "ok"}
