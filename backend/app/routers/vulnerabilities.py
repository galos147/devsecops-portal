from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from app.database import get_db
from app.models.vulnerability import Vulnerability
from app.models.image import Image
from app.models.fix_suggestion import FixSuggestion
from app.schemas.vulnerability import VulnGroupOut, CveDetailOut, AffectedImageOut

router = APIRouter(prefix="/api/vulnerabilities", tags=["vulnerabilities"])


@router.get("", response_model=list[VulnGroupOut])
def list_vulnerabilities(
    q: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Vulnerability)
    if q:
        query = query.filter(
            Vulnerability.cve_id.ilike(f"%{q}%") |
            Vulnerability.package_name.ilike(f"%{q}%") |
            Vulnerability.description.ilike(f"%{q}%")
        )
    if severity and severity != "all":
        query = query.filter(Vulnerability.severity == severity)
    if status and status != "all":
        query = query.filter(Vulnerability.status == status)
    if source and source != "all":
        query = query.filter(Vulnerability.source_tool == source)

    vulns = query.all()

    groups: dict[str, dict] = {}
    for v in vulns:
        if v.cve_id not in groups:
            groups[v.cve_id] = {
                "cve_id": v.cve_id,
                "severity": v.severity,
                "cvss_score": v.cvss_score,
                "description": v.description,
                "fixed_version": v.fixed_version,
                "status": v.status,
                "source_tool": v.source_tool,
                "count": 0,
                "is_seed": True,
            }
        groups[v.cve_id]["count"] += 1
        groups[v.cve_id]["is_seed"] = groups[v.cve_id]["is_seed"] and v.is_seed

    return [
        VulnGroupOut(
            cve_id=g["cve_id"],
            severity=g["severity"],
            cvss_score=g["cvss_score"],
            description=g["description"],
            affected_images=g["count"],
            fixed_version=g["fixed_version"],
            status=g["status"],
            source_tool=g["source_tool"],
            is_seed=g["is_seed"],
        )
        for g in groups.values()
    ]


@router.get("/{cve_id}", response_model=CveDetailOut)
def get_cve_detail(cve_id: str, db: Session = Depends(get_db)):
    vulns = db.query(Vulnerability).filter(Vulnerability.cve_id == cve_id).all()
    if not vulns:
        raise HTTPException(status_code=404, detail="CVE not found")

    fix = db.query(FixSuggestion).filter(FixSuggestion.cve_id == cve_id).first()
    v0 = vulns[0]

    affected = []
    for v in vulns:
        img = db.query(Image).filter(Image.id == v.image_id).first()
        if img:
            affected.append(AffectedImageOut(
                id=img.id, name=img.name, tag=img.tag,
                installed_version=v.installed_version,
                fixed_version=v.fixed_version,
                status=v.status,
            ))

    return CveDetailOut(
        cve_id=cve_id,
        severity=v0.severity,
        cvss_score=v0.cvss_score,
        description=v0.description,
        published=fix.published if fix else None,
        cvss_vector=fix.cvss_vector if fix else None,
        advisory_url=fix.advisory_url if fix else None,
        suggestion=fix.suggestion_text if fix else None,
        copy_cmd=fix.copy_cmd if fix else None,
        affected_images=affected,
    )
