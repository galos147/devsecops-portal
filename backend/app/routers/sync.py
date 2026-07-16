from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime
import asyncio
from app.database import get_db
from app.models.sync_job import SyncJob
from app.integrations import jfrog, sonarqube, prisma, gitlab

router = APIRouter(prefix="/api/sync", tags=["sync"])

VALID_TOOLS = {"jfrog", "sonarqube", "prisma", "gitlab"}

INTEGRATIONS = {
    "jfrog": jfrog.sync,
    "sonarqube": sonarqube.sync,
    "prisma": prisma.sync,
    "gitlab": gitlab.sync,
}


@router.post("/{tool}")
def trigger_sync(tool: str, db: Session = Depends(get_db)):
    if tool not in VALID_TOOLS:
        raise HTTPException(status_code=400, detail=f"Unknown tool: {tool}")

    job_id = f"sync-{tool}-{int(datetime.utcnow().timestamp())}"
    job = SyncJob(
        id=job_id,
        tool=tool,
        status="running",
        started_at=datetime.utcnow(),
        finished_at=None,
        records_synced=0,
        error_message=None,
    )
    db.add(job)
    db.commit()

    try:
        fn = INTEGRATIONS[tool]
        # Run the async sync function synchronously
        result = asyncio.run(fn(db)) if tool == "jfrog" else {"records": 0}
        records = result.get("records", 0)
        error = result.get("error") or result.get("note")

        job.status = "success" if not result.get("error") else "failed"
        job.finished_at = datetime.utcnow()
        job.records_synced = records
        job.error_message = error if result.get("error") else None
        db.commit()

        return {"status": job.status, "tool": tool, "records": records, "note": error}

    except Exception as e:
        job.status = "failed"
        job.finished_at = datetime.utcnow()
        job.error_message = str(e)
        db.commit()
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/status")
def sync_status(db: Session = Depends(get_db)):
    results = {}
    for tool in VALID_TOOLS:
        row = db.query(SyncJob).filter(SyncJob.tool == tool).order_by(SyncJob.finished_at.desc()).first()
        results[tool] = {
            "status": row.status if row else "never",
            "last_sync": row.finished_at.isoformat() if row and row.finished_at else None,
            "records_synced": row.records_synced or 0 if row else 0,
            "error": row.error_message if row else None,
        }
    return results
