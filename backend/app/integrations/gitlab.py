"""
GitLab integration.

Flow:
  1. List projects the token's user is a member of (api/v4/projects?membership=true)
  2. Per project: list recent pipelines (api/v4/projects/:id/pipelines)
  3. Per pipeline: fetch detail for started_at/finished_at/web_url (api/v4/projects/:id/pipelines/:pipeline_id)
  4. For pipelines that failed and don't already have failed_jobs captured: fetch job list
     (api/v4/projects/:id/pipelines/:pipeline_id/jobs) and record each failed job's stage/name/failure_reason
  5. Upsert into pipeline_runs

No SAST/dependency-scanning/secret-detection report artifacts are parsed —
those only exist for pipelines that actually run GitLab's built-in security
scanning jobs, which this integration doesn't require. sast/dep_scan/
secret_detection stay 0 and findings stays empty, which accurately reflects
what's available rather than fabricating placeholder data.
"""

import httpx
from datetime import datetime
from sqlalchemy.orm import Session

from app.integrations import config_resolver
from app.models.pipeline_run import PipelineRun

PAGE_SIZE = 20

STATUS_MAP = {
    "success": "passed",
    "failed": "failed",
    "running": "running",
    "pending": "running",
    "created": "running",
    "preparing": "running",
    "waiting_for_resource": "running",
    "scheduled": "running",
}


def _api(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/api/v4/{path}"


def _parse_dt(value: str | None) -> datetime | None:
    if not value:
        return None
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


async def _fetch_failed_jobs(client: httpx.AsyncClient, base_url: str, project_id: int, pipeline_id: int) -> list[dict]:
    resp = await client.get(_api(base_url, f"projects/{project_id}/pipelines/{pipeline_id}/jobs"), params={"per_page": PAGE_SIZE})
    if resp.status_code != 200:
        return []
    return [
        {"stage": j.get("stage"), "name": j.get("name"), "failure_reason": j.get("failure_reason")}
        for j in resp.json()
        if j.get("status") == "failed"
    ]


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not secret:
        return {"ok": False, "message": "URL and token are required"}
    try:
        async with httpx.AsyncClient(timeout=10, headers={"PRIVATE-TOKEN": secret}) as client:
            resp = await client.get(_api(url, "user"))
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200:
        who = resp.json().get("username", "unknown")
        return {"ok": True, "message": f"Connected as {who}"}
    return {"ok": False, "message": f"GitLab responded with {resp.status_code}"}


async def sync(db: Session, job=None) -> dict:
    cfg = config_resolver.resolve(db, "gitlab")
    if cfg["source"] == "none":
        return {"records": 0, "note": "GitLab not configured"}

    base_url = cfg["url"]
    records = 0

    async with httpx.AsyncClient(timeout=30, headers={"PRIVATE-TOKEN": cfg["secret"]}) as client:
        projects_resp = await client.get(_api(base_url, "projects"), params={"membership": "true", "per_page": PAGE_SIZE})
        if projects_resp.status_code != 200:
            return {"records": 0, "error": f"Project list failed: {projects_resp.status_code}"}

        for project in projects_resp.json():
            project_id = project["id"]
            project_name = project.get("path_with_namespace", project.get("name", str(project_id)))

            pipelines_resp = await client.get(
                _api(base_url, f"projects/{project_id}/pipelines"),
                params={"per_page": PAGE_SIZE, "order_by": "id", "sort": "desc"},
            )
            if pipelines_resp.status_code != 200:
                continue

            for pl in pipelines_resp.json():
                pipeline_id = pl["id"]

                detail_resp = await client.get(_api(base_url, f"projects/{project_id}/pipelines/{pipeline_id}"))
                detail = detail_resp.json() if detail_resp.status_code == 200 else pl

                run_id = f"gl-{project_id}-{pipeline_id}"
                status = STATUS_MAP.get(detail.get("status", ""), detail.get("status", "unknown"))
                started_at = _parse_dt(detail.get("started_at") or detail.get("created_at"))
                finished_at = _parse_dt(detail.get("finished_at"))
                web_url = detail.get("web_url")

                existing = db.query(PipelineRun).filter(PipelineRun.id == run_id).first()

                failed_jobs = None
                if status == "failed" and (not existing or not existing.failed_jobs):
                    failed_jobs = await _fetch_failed_jobs(client, base_url, project_id, pipeline_id)

                if not existing:
                    db.add(PipelineRun(
                        id=run_id,
                        gitlab_project_id=str(project_id),
                        project=project_name,
                        ref=detail.get("ref"),
                        status=status,
                        started_at=started_at,
                        finished_at=finished_at,
                        sast=0,
                        dep_scan=0,
                        secret_detection=0,
                        findings=[],
                        web_url=web_url,
                        failed_jobs=failed_jobs or [],
                    ))
                else:
                    existing.status = status
                    existing.started_at = started_at
                    existing.finished_at = finished_at
                    existing.web_url = web_url
                    if failed_jobs is not None:
                        existing.failed_jobs = failed_jobs

                db.commit()
                records += 1

    return {"records": records}
