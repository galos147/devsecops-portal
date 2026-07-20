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
     GET /api/v1/finding/project/{uuid} (with suppressed=true, so suppressed
     findings are included instead of silently excluded) — upsert into
     vulnerabilities with dt_project_id set, image_id left null.
  4. True reconciliation, not just an upsert: per project, after a
     successful findings fetch, any non-seed Vulnerability row still
     attached to that dt_project_id but absent from the response (component
     removed by a newer BOM, CVE withdrawn, etc.) is deleted. After the
     project loop, any non-seed DependencyTrackProject no longer present in
     Dependency-Track's project list is deleted too (cascading to its
     vulnerabilities). A project whose findings call fails or is skipped
     (no lastBomImport yet) is left untouched — reconciliation only acts on
     data confirmed current. Seed rows (is_seed=True) are never touched by
     any of this, deletion included.
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
    # Deliberately excludes component version: including it would strand a stale row
    # every time the component is upgraded (old version's row would never be revisited
    # to be reconciled away). Tradeoff: the same library present at two versions in one
    # project collapses onto a single row instead of two.
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
    failed_projects: list[str] = []

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

            # suppressed=true: Dependency-Track's finding endpoint EXCLUDES suppressed
            # findings by default, which would make analysis.isSuppressed always false and
            # strand suppressed-in-DT rows as "open" here forever. With it set, the response
            # contains both, distinguished by analysis.isSuppressed.
            findings_resp = await client.get(
                _api(base_url, f"finding/project/{proj_uuid}"), params={"suppressed": "true"}
            )
            if findings_resp.status_code != 200:
                failed_projects.append(proj.get("name", proj_uuid))
                set_phase("projects", processed=i + 1)
                continue  # leave this project's existing vulnerabilities untouched

            upserted_ids: set[str] = set()
            for finding in findings_resp.json():
                component = finding.get("component", {})
                vuln = finding.get("vulnerability", {})
                analysis = finding.get("analysis", {})

                cve_id = vuln.get("vulnId")
                component_name = component.get("name", "")
                if not cve_id:
                    continue

                vuln_id = _vuln_id(proj_uuid, cve_id, component_name)
                upserted_ids.add(vuln_id)
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

            # Reconciliation: a finding that vanished from DT's response (component removed
            # by a newer BOM, CVE withdrawn) shouldn't linger here as permanently "open" —
            # only safe to do because this project's findings call just succeeded above.
            stale_query = db.query(Vulnerability).filter(
                Vulnerability.dt_project_id == proj_uuid,
                Vulnerability.is_seed == False,  # noqa: E712
            )
            if upserted_ids:
                stale_query = stale_query.filter(~Vulnerability.id.in_(upserted_ids))
            stale_query.delete(synchronize_session=False)
            db.commit()

            set_phase("projects", processed=i + 1)

        # Reconciliation: a Dependency-Track project deleted upstream (in DT) shouldn't stay
        # in the portal forever. Only run because the project list above was fetched in full.
        current_uuids = {p["uuid"] for p in projects}
        gone_query = db.query(DependencyTrackProject).filter(
            DependencyTrackProject.is_seed == False,  # noqa: E712
        )
        if current_uuids:
            gone_query = gone_query.filter(~DependencyTrackProject.id.in_(current_uuids))
        gone_projects = gone_query.all()
        for gone in gone_projects:
            db.query(Vulnerability).filter(
                Vulnerability.dt_project_id == gone.id,
                Vulnerability.is_seed == False,  # noqa: E712
            ).delete(synchronize_session=False)
            db.delete(gone)
        db.commit()

    result: dict = {"records": records}
    if failed_projects:
        result["note"] = f"Findings fetch failed for: {', '.join(failed_projects)}"
    return result
