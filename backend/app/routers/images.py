from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import Optional
from app.database import get_db
from app.models.image import Image
from app.models.vulnerability import Vulnerability
from app.schemas.image import ImageOut, ImageDetailOut, VulnCount, VulnOut

router = APIRouter(prefix="/api/images", tags=["images"])


def _vuln_counts(db: Session, image_id: str) -> VulnCount:
    rows = db.query(Vulnerability.severity, func.count(Vulnerability.id)).filter(
        Vulnerability.image_id == image_id,
        Vulnerability.status == "open",
    ).group_by(Vulnerability.severity).all()
    counts = {r[0]: r[1] for r in rows}
    return VulnCount(
        critical=counts.get("critical", 0),
        high=counts.get("high", 0),
        medium=counts.get("medium", 0),
        low=counts.get("low", 0),
    )


@router.get("", response_model=list[ImageOut])
def list_images(
    q: Optional[str] = Query(None),
    registry: Optional[str] = Query(None),
    source: Optional[str] = Query(None),
    min_severity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(Image)
    if q:
        query = query.filter(
            Image.name.ilike(f"%{q}%") | Image.tag.ilike(f"%{q}%") | Image.digest.ilike(f"%{q}%")
        )
    if registry and registry != "all":
        query = query.filter(Image.registry == registry)
    if source and source != "all":
        query = query.filter(Image.source == source)

    images = query.all()

    results = []
    for img in images:
        counts = _vuln_counts(db, img.id)
        if min_severity == "critical" and counts.critical == 0:
            continue
        if min_severity == "high" and counts.critical + counts.high == 0:
            continue
        if min_severity == "medium" and counts.critical + counts.high + counts.medium == 0:
            continue
        results.append(ImageOut(
            id=img.id, name=img.name, tag=img.tag, registry=img.registry,
            digest=img.digest, size_mb=img.size_mb, last_scanned_at=img.last_scanned_at,
            source=img.source, counts=counts,
        ))
    return results


@router.get("/{image_id}", response_model=ImageDetailOut)
def get_image(image_id: str, db: Session = Depends(get_db)):
    img = db.query(Image).filter(Image.id == image_id).first()
    if not img:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Image not found")

    vulns = db.query(Vulnerability).filter(Vulnerability.image_id == image_id).all()
    counts = _vuln_counts(db, image_id)

    return ImageDetailOut(
        id=img.id, name=img.name, tag=img.tag, registry=img.registry,
        digest=img.digest, size_mb=img.size_mb, last_scanned_at=img.last_scanned_at,
        source=img.source, counts=counts,
        vulnerabilities=[VulnOut.model_validate(v) for v in vulns],
    )
