import asyncio
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db, SessionLocal
from app.models.sync_job import SyncJob
from app.integrations import config_resolver, jfrog, sonarqube, prisma, gitlab, dependency_track

router = APIRouter(prefix="/api/sync", tags=["sync"])

VALID_TOOLS = {"jfrog", "sonarqube", "prisma", "gitlab", "dependency_track"}

INTEGRATIONS = {
    "jfrog": jfrog.sync,
    "sonarqube": sonarqube.sync,
    "prisma": prisma.sync,
    "gitlab": gitlab.sync,
    "dependency_track": dependency_track.sync,
}

# Strong references so background sync tasks aren't garbage-collected mid-run
# (asyncio.create_task() only holds a weak reference to its result).
_background_tasks: set[asyncio.Task] = set()


@router.post("/{tool}")
async def trigger_sync(tool: str, db: Session = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

    cfg = config_resolver.resolve(db, tool)
    if cfg["source"] == "none":
        return {
            "status": "not_configured", "tool": tool, "records": 0,
            "note": f"{tool} is not configured — add a connection in Settings first.",
        }

    if db.query(SyncJob).filter(SyncJob.tool == tool, SyncJob.status == "running").first():
        raise HTTPException(status_code=409, detail=f"A {tool} sync is already running")

    job_id = f"sync-{tool}-{int(datetime.utcnow().timestamp())}"
    job = SyncJob(
        id=job_id,
        tool=tool,
        status="running",
        started_at=datetime.utcnow(),
        finished_at=None,
        records_synced=0,
        error_message=None,
        phase="starting",
        total_items=None,
        processed_items=0,
        last_heartbeat_at=datetime.utcnow(),  # set immediately — closes the race where a reaper
                                               # runs between job creation and the first heartbeat tick
    )
    db.add(job)
    db.commit()

    task = asyncio.create_task(_run_sync_job(tool, job_id))
    _background_tasks.add(task)
    task.add_done_callback(_background_tasks.discard)

    return {"status": "started", "tool": tool, "job_id": job_id}


HEARTBEAT_INTERVAL_SECONDS = 15


async def _heartbeat_loop(job_id: str, stop: asyncio.Event) -> None:
    """
    Runs on its OWN DB session — never share a Session across concurrent
    coroutines/tasks, SQLAlchemy Sessions aren't safe for that even under
    cooperative asyncio. Ticks last_heartbeat_at so a multi-replica deployment's
    startup/periodic reaper (main.py) can tell "still alive" apart from "the
    owning process actually died" instead of treating every restart of ANY
    replica as proof this job's replica died.
    """
    hb_db = SessionLocal()
    try:
        while not stop.is_set():
            try:
                hb_db.query(SyncJob).filter(SyncJob.id == job_id).update({"last_heartbeat_at": datetime.utcnow()})
                hb_db.commit()
            except Exception:
                hb_db.rollback()
            try:
                await asyncio.wait_for(stop.wait(), timeout=HEARTBEAT_INTERVAL_SECONDS)
            except asyncio.TimeoutError:
                pass
    finally:
        hb_db.close()


async def _run_sync_job(tool: str, job_id: str) -> None:
    # Own session — the request-scoped `db` above is closed by the time this runs.
    db = SessionLocal()
    stop_heartbeat = asyncio.Event()
    heartbeat_task = asyncio.create_task(_heartbeat_loop(job_id, stop_heartbeat))
    try:
        job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
        result = await INTEGRATIONS[tool](db, job=job)

        db.refresh(job)
        job.status = "failed" if result.get("error") else "success"
        job.finished_at = datetime.utcnow()
        job.records_synced = result.get("records", 0)
        job.error_message = result.get("error") or (result.get("note") if result.get("error") else None)
        job.phase = "done"
        db.commit()
    except Exception as e:
        db.rollback()
        job = db.query(SyncJob).filter(SyncJob.id == job_id).first()
        if job:
            job.status = "failed"
            job.finished_at = datetime.utcnow()
            job.error_message = str(e)
            db.commit()
    finally:
        stop_heartbeat.set()
        await heartbeat_task
        db.close()


@router.get("/status")
def sync_status(db: Session = Depends(get_db)):
    results = {}
    for tool in VALID_TOOLS:
        row = db.query(SyncJob).filter(SyncJob.tool == tool).order_by(SyncJob.started_at.desc()).first()
        connected = config_resolver.resolve(db, tool)["source"] != "none"
        results[tool] = {
            "status": row.status if row else "never",
            "last_sync": row.finished_at.isoformat() if row and row.finished_at else None,
            "records_synced": (row.records_synced or 0) if row else 0,
            "error": row.error_message if row else None,
            "connected": connected,
            "phase": row.phase if row else None,
            "processed_items": row.processed_items if row else None,
            "total_items": row.total_items if row else None,
        }
    return results
