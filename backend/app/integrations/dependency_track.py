"""
Dependency-Track integration.

Flow:
  1. GitLab CI (not this module) runs Trivy to generate a CycloneDX SBOM and
     uploads it directly to Dependency-Track's own /api/v1/bom endpoint —
     see docs/integrations.md for the CI job. This module never scans
     anything; it only reads Dependency-Track's REST API afterward, the
     same read-only shape every other integration in this app uses.
  2. GET /api/v1/project — list every project Dependency-Track knows about
     (one is created automatically on first SBOM upload for it).
  3. For each project that has a BOM imported (lastBomImport is set),
     GET /api/v1/finding/project/{uuid} — upsert into vulnerabilities with
     dt_project_id set, image_id left null.
  4. Full re-sync of findings per project on every run — no incremental
     watermark. Finding lists are small; a watermark scheme is deliberately
     not built until there's a real scale problem to solve.
"""

import hashlib
from datetime import datetime

import httpx
from sqlalchemy.orm import Session

from app.integrations import config_resolver
from app.models.dependency_track_project import DependencyTrackProject
from app.models.vulnerability import Vulnerability
from app.models.sync_job import SyncJob

PAGE_SIZE = 100

_SEVERITY_MAP = {
    "CRITICAL": "critical",
    "HIGH": "high",
    "MEDIUM": "medium",
    "LOW": "low",
    "INFO": "low",
    "UNASSIGNED": "low",
}


def _api(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/api/v1/{path}"


def _vuln_id(project_uuid: str, cve_id: str, component_name: str) -> str:
    return "dt-" + hashlib.md5(f"{project_uuid}:{cve_id}:{component_name}".encode()).hexdigest()[:16]


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not secret:
        return {"ok": False, "message": "URL and API key are required"}
    try:
        async with httpx.AsyncClient(headers={"X-Api-Key": secret}, timeout=10) as client:
            resp = await client.get(_api(url, "project"), params={"pageSize": 1})
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200:
        return {"ok": True, "message": "Connected to Dependency-Track"}
    return {"ok": False, "message": f"Dependency-Track responded with {resp.status_code}"}


async def sync(db: Session, job: SyncJob | None = None) -> dict:
    cfg = config_resolver.resolve(db, "dependency_track")
    if cfg["source"] == "none":
        return {"records": 0, "note": "Dependency-Track not configured"}

    base_url = cfg["url"]
    records = 0

    def set_phase(phase: str, total: int | None = None, processed: int | None = None) -> None:
        if not job:
            return
        job.phase = phase
        if total is not None:
            job.total_items = total
        if processed is not None:
            job.processed_items = processed
        db.commit()

    async with httpx.AsyncClient(headers={"X-Api-Key": cfg["secret"]}, timeout=30) as client:
        set_phase("projects")
        page = 1
        projects: list[dict] = []
        while True:
            resp = await client.get(_api(base_url, "project"), params={"pageNumber": page, "pageSize": PAGE_SIZE})
            if resp.status_code != 200:
                return {"records": records, "error": f"Project list failed: {resp.status_code}"}
            batch = resp.json()
            if not batch:
                break
            projects.extend(batch)
            if len(batch) < PAGE_SIZE:
                break
            page += 1

        set_phase("projects", total=len(projects), processed=0)

        for i, proj in enumerate(projects):
            proj_uuid = proj["uuid"]
            existing = db.query(DependencyTrackProject).filter(DependencyTrackProject.id == proj_uuid).first()
            if not existing:
                db.add(DependencyTrackProject(
                    id=proj_uuid, name=proj.get("name", proj_uuid), version=proj.get("version"),
                    last_synced_at=datetime.utcnow(), is_seed=False,
                ))
            else:
                existing.name = proj.get("name", proj_uuid)
                existing.version = proj.get("version")
                existing.last_synced_at = datetime.utcnow()
            db.commit()
            records += 1

            if not proj.get("lastBomImport"):
                set_phase("projects", processed=i + 1)
                continue  # no SBOM uploaded yet — nothing to find

            findings_resp = await client.get(_api(base_url, f"finding/project/{proj_uuid}"))
            if findings_resp.status_code == 200:
                for finding in findings_resp.json():
                    component = finding.get("component", {})
                    vuln = finding.get("vulnerability", {})
                    analysis = finding.get("analysis", {})

                    cve_id = vuln.get("vulnId")
                    component_name = component.get("name", "")
                    if not cve_id:
                        continue

                    vuln_id = _vuln_id(proj_uuid, cve_id, component_name)
                    severity = _SEVERITY_MAP.get((vuln.get("severity") or "").upper(), "low")
                    cvss = vuln.get("cvssV3BaseScore") or vuln.get("cvssV2BaseScore")
                    status = "suppressed" if analysis.get("isSuppressed") else "open"

                    existing_vuln = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()
                    if not existing_vuln:
                        db.add(Vulnerability(
                            id=vuln_id, image_id=None, dt_project_id=proj_uuid, cve_id=cve_id,
                            severity=severity, package_name=component_name,
                            installed_version=component.get("version"), fixed_version=None,
                            cvss_score=cvss, description=vuln.get("description"),
                            source_tool="dependency_track", status=status, is_seed=False,
                        ))
                        records += 1
                    else:
                        existing_vuln.severity = severity
                        existing_vuln.cvss_score = cvss
                        existing_vuln.description = vuln.get("description")
                        existing_vuln.status = status
                        existing_vuln.installed_version = component.get("version")
                    db.commit()

            set_phase("projects", processed=i + 1)

    return {"records": records}
