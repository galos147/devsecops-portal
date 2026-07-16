from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.image import Image
from app.models.vulnerability import Vulnerability
from app.models.code_issue import CodeIssue
from app.models.pipeline_run import PipelineRun

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def global_search(q: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    pattern = f"%{q}%"

    images = db.query(Image).filter(
        Image.name.ilike(pattern) | Image.tag.ilike(pattern) | Image.digest.ilike(pattern)
    ).limit(10).all()

    vulns = db.query(Vulnerability).filter(
        Vulnerability.cve_id.ilike(pattern) |
        Vulnerability.description.ilike(pattern) |
        Vulnerability.package_name.ilike(pattern)
    ).limit(10).all()

    issues = db.query(CodeIssue).filter(
        CodeIssue.message.ilike(pattern) | CodeIssue.file_path.ilike(pattern)
    ).limit(10).all()

    pipelines = db.query(PipelineRun).filter(
        PipelineRun.project.ilike(pattern) | PipelineRun.ref.ilike(pattern)
    ).limit(10).all()

    seen_cves = set()
    unique_vulns = []
    for v in vulns:
        if v.cve_id not in seen_cves:
            seen_cves.add(v.cve_id)
            unique_vulns.append({"cve_id": v.cve_id, "severity": v.severity, "description": v.description})

    return {
        "images": [{"id": i.id, "name": i.name, "tag": i.tag, "source": i.source} for i in images],
        "cves": unique_vulns,
        "code_issues": [{"id": i.id, "file_path": i.file_path, "message": i.message, "project_key": i.project_key} for i in issues],
        "pipelines": [{"id": p.id, "project": p.project, "ref": p.ref, "status": p.status} for p in pipelines],
    }
