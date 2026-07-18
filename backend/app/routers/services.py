from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import nullslast
import uuid
from datetime import datetime

from app.database import get_db
from app.models.service import Service
from app.models.code_project import CodeProject
from app.models.code_issue import CodeIssue
from app.models.pipeline_run import PipelineRun
from app.models.image import Image
from app.models.vulnerability import Vulnerability
from app.schemas.service import ServiceOut, ServiceDetailOut, ServiceCreate, ServiceUpdate
from app.schemas.code_quality import CodeProjectOut, CodeIssueOut
from app.schemas.pipeline import PipelineOut
from app.schemas.image import ImageDetailOut, VulnOut
from app.routers.images import _vuln_counts

router = APIRouter(prefix="/api/services", tags=["services"])

SEV_RANK = {"critical": 4, "high": 3, "medium": 2, "low": 1}


def _current_image(db: Session, image_name: str | None) -> Image | None:
    if not image_name:
        return None
    return (
        db.query(Image)
        .filter(Image.name == image_name)
        .order_by(nullslast(Image.pushed_at.desc()))
        .first()
    )


def _to_out(db: Session, svc: Service) -> ServiceOut:
    quality_gate = None
    if svc.code_project_key:
        cp = db.query(CodeProject).filter(CodeProject.project_key == svc.code_project_key).first()
        quality_gate = cp.quality_gate if cp else None

    last_pipeline_status = None
    if svc.pipeline_project:
        last = (
            db.query(PipelineRun)
            .filter(PipelineRun.project == svc.pipeline_project)
            .order_by(PipelineRun.started_at.desc())
            .first()
        )
        last_pipeline_status = last.status if last else None

    top_vuln_severity = None
    img = _current_image(db, svc.image_name)
    if img:
        open_vulns = db.query(Vulnerability).filter(
            Vulnerability.image_id == img.id, Vulnerability.status == "open"
        ).all()
        if open_vulns:
            top_vuln_severity = max(open_vulns, key=lambda v: SEV_RANK.get(v.severity, 0)).severity

    return ServiceOut(
        id=svc.id, name=svc.name, image_name=svc.image_name,
        code_project_key=svc.code_project_key, pipeline_project=svc.pipeline_project,
        is_seed=svc.is_seed, quality_gate=quality_gate,
        last_pipeline_status=last_pipeline_status, top_vuln_severity=top_vuln_severity,
    )


@router.get("", response_model=list[ServiceOut])
def list_services(db: Session = Depends(get_db)):
    return [_to_out(db, s) for s in db.query(Service).all()]


@router.post("", response_model=ServiceOut)
def create_service(body: ServiceCreate, db: Session = Depends(get_db)):
    svc = Service(
        id=f"svc-{uuid.uuid4().hex[:12]}", name=body.name,
        image_name=body.image_name, code_project_key=body.code_project_key,
        pipeline_project=body.pipeline_project, is_seed=False,
        created_at=datetime.utcnow(),
    )
    db.add(svc)
    db.commit()
    return _to_out(db, svc)


@router.get("/{service_id}", response_model=ServiceDetailOut)
def get_service(service_id: str, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")

    code_project = None
    code_issues: list[CodeIssueOut] = []
    if svc.code_project_key:
        cp = db.query(CodeProject).filter(CodeProject.project_key == svc.code_project_key).first()
        if cp:
            code_project = CodeProjectOut.model_validate(cp)
            issues = db.query(CodeIssue).filter(CodeIssue.project_key == svc.code_project_key).all()
            code_issues = [CodeIssueOut.model_validate(i) for i in issues]

    pipelines: list[PipelineOut] = []
    if svc.pipeline_project:
        runs = (
            db.query(PipelineRun)
            .filter(PipelineRun.project == svc.pipeline_project)
            .order_by(PipelineRun.started_at.desc())
            .all()
        )
        pipelines = [PipelineOut.model_validate(r) for r in runs]

    image_out = None
    img = _current_image(db, svc.image_name)
    if img:
        vulns = db.query(Vulnerability).filter(Vulnerability.image_id == img.id).all()
        counts = _vuln_counts(db, img.id)
        image_out = ImageDetailOut(
            id=img.id, name=img.name, tag=img.tag, registry=img.registry,
            digest=img.digest, size_mb=img.size_mb, last_scanned_at=img.last_scanned_at,
            source=img.source, counts=counts, is_seed=img.is_seed,
            vulnerabilities=[VulnOut.model_validate(v) for v in vulns],
        )

    return ServiceDetailOut(
        id=svc.id, name=svc.name, is_seed=svc.is_seed,
        image_name=svc.image_name, code_project_key=svc.code_project_key, pipeline_project=svc.pipeline_project,
        code_project=code_project, code_issues=code_issues,
        pipelines=pipelines, image=image_out,
    )


@router.put("/{service_id}", response_model=ServiceOut)
def update_service(service_id: str, body: ServiceUpdate, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if not svc:
        raise HTTPException(status_code=404, detail="Service not found")
    if body.name is not None:
        svc.name = body.name
    svc.image_name = body.image_name
    svc.code_project_key = body.code_project_key
    svc.pipeline_project = body.pipeline_project
    db.commit()
    return _to_out(db, svc)


@router.delete("/{service_id}")
def delete_service(service_id: str, db: Session = Depends(get_db)):
    svc = db.query(Service).filter(Service.id == service_id).first()
    if svc:
        db.delete(svc)
        db.commit()
    return {"id": service_id, "deleted": bool(svc)}
