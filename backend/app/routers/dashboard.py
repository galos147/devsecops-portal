from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models.image import Image
from app.models.vulnerability import Vulnerability, Severity
from app.models.code_issue import CodeIssue
from app.models.pipeline_run import PipelineRun
from app.models.sync_job import SyncJob
from app.schemas.dashboard import DashboardStats, SeverityCount, ToolHealth, TopVulnImage, RecentFailure

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])

TOOL_LABELS = {
    "jfrog": "JFrog Xray",
    "sonarqube": "SonarQube",
    "prisma": "Prisma Cloud",
    "gitlab": "GitLab",
}


@router.get("/stats", response_model=DashboardStats)
def get_stats(db: Session = Depends(get_db)):
    total_images = db.query(func.count(Image.id)).scalar()

    critical_cves = db.query(func.count(Vulnerability.id)).filter(
        Vulnerability.severity == Severity.critical,
        Vulnerability.status == "open",
    ).scalar()

    high_code_issues = db.query(func.count(CodeIssue.id)).filter(
        CodeIssue.severity.in_(["blocker", "critical"]),
        CodeIssue.status == "OPEN",
    ).scalar()

    failing_pipelines = db.query(func.count(PipelineRun.id)).filter(
        PipelineRun.status == "failed"
    ).scalar()

    sev_counts = {}
    for sev in ["critical", "high", "medium", "low"]:
        sev_counts[sev] = db.query(func.count(Vulnerability.id)).filter(
            Vulnerability.severity == sev,
            Vulnerability.status == "open",
        ).scalar()

    last_sync_row = db.query(SyncJob).order_by(SyncJob.finished_at.desc()).first()
    last_sync = last_sync_row.finished_at.isoformat() if last_sync_row and last_sync_row.finished_at else None

    tool_health = []
    for tool in ["jfrog", "sonarqube", "prisma", "gitlab"]:
        row = db.query(SyncJob).filter(SyncJob.tool == tool).order_by(SyncJob.finished_at.desc()).first()
        tool_health.append(ToolHealth(
            tool=tool,
            label=TOOL_LABELS[tool],
            status=row.status if row else "unknown",
            last_sync=row.finished_at.isoformat() if row and row.finished_at else None,
            records_synced=row.records_synced or 0 if row else 0,
        ))

    images = db.query(Image).all()
    image_vuln_counts = {}
    for v in db.query(Vulnerability).filter(Vulnerability.status == "open").all():
        c = image_vuln_counts.setdefault(v.image_id, {"critical": 0, "high": 0, "medium": 0, "low": 0})
        c[v.severity] = c.get(v.severity, 0) + 1

    image_map = {img.id: img for img in images}
    top_images = sorted(
        image_vuln_counts.items(),
        key=lambda x: (x[1]["critical"], x[1]["high"]),
        reverse=True,
    )[:10]
    top_vuln_images = [
        TopVulnImage(
            id=img_id,
            name=image_map[img_id].name,
            tag=image_map[img_id].tag,
            registry=image_map[img_id].registry,
            critical=counts["critical"],
            high=counts["high"],
        )
        for img_id, counts in top_images
        if img_id in image_map
    ]

    failures = db.query(PipelineRun).filter(PipelineRun.status == "failed").order_by(PipelineRun.started_at.desc()).limit(5).all()
    recent_failures = [
        RecentFailure(
            id=p.id,
            project=p.project,
            ref=p.ref or "",
            started_at=p.started_at.isoformat() if p.started_at else None,
            total_findings=p.sast + p.dep_scan + p.secret_detection,
        )
        for p in failures
    ]

    return DashboardStats(
        total_images=total_images,
        critical_cves=critical_cves,
        high_code_issues=high_code_issues,
        failing_pipelines=failing_pipelines,
        last_sync=last_sync,
        severity_counts=SeverityCount(**sev_counts),
        tool_health=tool_health,
        top_vuln_images=top_vuln_images,
        recent_failures=recent_failures,
    )
