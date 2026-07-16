from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.pipeline_run import PipelineRun
from app.schemas.pipeline import PipelineOut

router = APIRouter(prefix="/api/pipelines", tags=["pipelines"])


@router.get("", response_model=list[PipelineOut])
def list_pipelines(
    project: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(PipelineRun)
    if project and project != "all":
        query = query.filter(PipelineRun.project == project)
    if status and status != "all":
        query = query.filter(PipelineRun.status == status)
    return query.order_by(PipelineRun.started_at.desc()).all()
