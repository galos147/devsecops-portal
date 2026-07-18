"""
SonarQube integration.

Flow:
  1. List all projects via the SonarQube Web API (api/projects/search)
  2. For each project, fetch its quality gate status and core measures
  3. Fetch open issues (bugs, vulnerabilities, code smells) for the project
  4. Upsert code_projects and code_issues into the DB
  5. If the project has a real DevOps Platform binding (api/alm_settings/get_binding
     — set up via SonarQube's own GitLab ALM integration, not guessed by name),
     auto-correlate a Service to the matching GitLab project
"""

import bleach
import uuid
from datetime import datetime
from typing import Optional
from urllib.parse import urlparse

from sqlalchemy.orm import Session

import httpx

from app.config import settings
from app.integrations import config_resolver
from app.models.code_project import CodeProject
from app.models.code_issue import CodeIssue
from app.models.service import Service

MEASURE_KEYS = "bugs,vulnerabilities,code_smells,coverage,security_hotspots"
ISSUE_STATUSES = "OPEN,CONFIRMED,REOPENED"
PAGE_SIZE = 500


def _api(base_url: str, path: str) -> str:
    return f"{base_url.rstrip('/')}/api/{path}"


def _public_base(cfg: dict) -> str:
    # SONAR_PUBLIC_URL is for exactly this: the URL a browser can reach, which
    # may differ from cfg["url"] (e.g. the backend calls SonarQube over the
    # Docker network as "http://sonarqube:9000", but a browser needs localhost).
    if settings.sonar_public_url:
        return settings.sonar_public_url.rstrip("/")
    return cfg["url"].rstrip("/")


def _dashboard_url(cfg: dict, project_key: str) -> str:
    return f"{_public_base(cfg)}/dashboard?id={project_key}"


# SonarQube rule descriptions legitimately contain links, code blocks, and lists (e.g. a
# hardcoded-secret rule's noncompliant/compliant code examples) — stripping all tags to plain
# text destroys that. Sanitize instead of strip, so the Fix panel can render real (safe) HTML.
_ALLOWED_TAGS = [
    "a", "b", "blockquote", "br", "code", "em", "h1", "h2", "h3", "h4", "h5", "h6",
    "i", "li", "ol", "p", "pre", "strong", "table", "tbody", "td", "th", "thead", "tr", "ul",
]
_ALLOWED_ATTRIBUTES = {"a": ["href", "title"]}
_ALLOWED_PROTOCOLS = ["http", "https", "mailto"]


def _sanitize_html(content: str) -> str:
    return bleach.clean(content, tags=_ALLOWED_TAGS, attributes=_ALLOWED_ATTRIBUTES, protocols=_ALLOWED_PROTOCOLS, strip=True)


def _pipeline_project_from_binding(binding: dict) -> Optional[str]:
    if binding.get("alm") != "gitlab":
        return None
    url = binding.get("repositoryUrl")
    if not url:
        return None
    path = urlparse(url).path.strip("/")
    return path or None


async def _correlate_service(client: httpx.AsyncClient, base_url: str, project_key: str, project_name: str, db: Session) -> bool:
    """
    Reads the project's real DevOps Platform binding (set up in SonarQube's own
    admin settings, pointing at an actual GitLab repository) and auto-creates or
    fills in a Service for it. Never overwrites a field the user (or a prior
    discovery) already set — only fills in what's currently empty.
    """
    resp = await client.get(_api(base_url, "alm_settings/get_binding"), params={"project": project_key})
    if resp.status_code != 200:
        return False

    pipeline_project = _pipeline_project_from_binding(resp.json())
    if not pipeline_project:
        return False

    existing = db.query(Service).filter(
        (Service.code_project_key == project_key) | (Service.pipeline_project == pipeline_project)
    ).first()

    if existing:
        changed = False
        if not existing.code_project_key:
            existing.code_project_key = project_key
            changed = True
        if not existing.pipeline_project:
            existing.pipeline_project = pipeline_project
            changed = True
        if changed:
            db.commit()
        return changed

    db.add(Service(
        id=f"svc-{uuid.uuid4().hex[:12]}", name=project_name,
        code_project_key=project_key, pipeline_project=pipeline_project,
        is_seed=False, created_at=datetime.utcnow(),
    ))
    db.commit()
    return True


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not secret:
        return {"ok": False, "message": "URL and token are required"}
    try:
        async with httpx.AsyncClient(auth=(secret, ""), timeout=10) as client:
            resp = await client.get(_api(url, "projects/search"), params={"ps": 1})
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200:
        total = resp.json().get("paging", {}).get("total", 0)
        return {"ok": True, "message": f"Connected — {total} project(s) visible"}
    return {"ok": False, "message": f"SonarQube responded with {resp.status_code}"}


async def fetch_rule_info(db: Session, rule_id: str) -> Optional[dict]:
    cfg = config_resolver.resolve(db, "sonarqube")
    if cfg["source"] == "none":
        return None

    async with httpx.AsyncClient(auth=(cfg["secret"], ""), timeout=15) as client:
        try:
            resp = await client.get(_api(cfg["url"], "rules/show"), params={"key": rule_id})
        except httpx.HTTPError:
            return None
        if resp.status_code != 200:
            return None

        rule = resp.json().get("rule", {})
        sections = rule.get("descriptionSections") or []

        problem_parts = [s["content"] for s in sections if s.get("key") in ("root_cause", "introduction")]
        fix_parts = [s["content"] for s in sections if s.get("key") == "how_to_fix"]
        parts = problem_parts + fix_parts

        # Modern SonarQube (confirmed on our own 26.7 instance) only ever returns
        # descriptionSections — htmlDesc/mdDesc are checked as a fallback for older versions
        # that don't have the section-based format at all.
        raw_html = " ".join(parts) if parts else (rule.get("htmlDesc") or rule.get("mdDesc"))
        description = _sanitize_html(raw_html) if raw_html else None
        # No character-truncation — the Fix panel that renders this already scrolls
        # (overflowY: auto), and truncating raw HTML by character count risks cutting
        # mid-tag and leaving broken markup.

        return {
            "rule_id": rule_id,
            "name": rule.get("name"),
            "type": rule.get("type"),
            "remediation_effort": rule.get("remFnBaseEffort"),
            "description": description,
            "rule_url": f"{_public_base(cfg)}/coding_rules?open={rule_id}&rule_key={rule_id}",
        }


async def sync(db: Session, job=None) -> dict:
    cfg = config_resolver.resolve(db, "sonarqube")
    if cfg["source"] == "none":
        return {"records": 0, "note": "SonarQube not configured"}

    base_url = cfg["url"]
    records = 0

    async with httpx.AsyncClient(auth=(cfg["secret"], ""), timeout=30) as client:
        projects_resp = await client.get(_api(base_url, "projects/search"), params={"ps": PAGE_SIZE})
        if projects_resp.status_code != 200:
            return {"records": 0, "error": f"Project search failed: {projects_resp.status_code}"}

        components = projects_resp.json().get("components", [])

        for comp in components:
            project_key = comp["key"]
            project_name = comp.get("name", project_key)

            gate_resp = await client.get(
                _api(base_url, "qualitygates/project_status"), params={"projectKey": project_key}
            )
            gate_status = None
            if gate_resp.status_code == 200:
                raw_status = gate_resp.json().get("projectStatus", {}).get("status")
                gate_status = {"OK": "passed", "ERROR": "failed"}.get(raw_status, raw_status)

            measures_resp = await client.get(
                _api(base_url, "measures/component"),
                params={"component": project_key, "metricKeys": MEASURE_KEYS},
            )
            measures = {}
            if measures_resp.status_code == 200:
                for m in measures_resp.json().get("component", {}).get("measures", []):
                    measures[m["metric"]] = m.get("value")

            sonar_url = _dashboard_url(cfg, project_key)

            existing_project = db.query(CodeProject).filter(CodeProject.project_key == project_key).first()
            if not existing_project:
                db.add(CodeProject(
                    id=f"cp-{project_key}",
                    project_key=project_key,
                    name=project_name,
                    quality_gate=gate_status,
                    bugs=int(float(measures.get("bugs", 0) or 0)),
                    vulnerabilities=int(float(measures.get("vulnerabilities", 0) or 0)),
                    code_smells=int(float(measures.get("code_smells", 0) or 0)),
                    coverage=float(measures.get("coverage", 0) or 0),
                    hotspots=int(float(measures.get("security_hotspots", 0) or 0)),
                    sonar_url=sonar_url,
                ))
            else:
                existing_project.name = project_name
                existing_project.quality_gate = gate_status
                existing_project.bugs = int(float(measures.get("bugs", 0) or 0))
                existing_project.vulnerabilities = int(float(measures.get("vulnerabilities", 0) or 0))
                existing_project.code_smells = int(float(measures.get("code_smells", 0) or 0))
                existing_project.coverage = float(measures.get("coverage", 0) or 0)
                existing_project.hotspots = int(float(measures.get("security_hotspots", 0) or 0))
                existing_project.sonar_url = sonar_url

            db.commit()
            records += 1

            if await _correlate_service(client, base_url, project_key, project_name, db):
                records += 1

            page = 1
            while True:
                issues_resp = await client.get(
                    _api(base_url, "issues/search"),
                    params={
                        "componentKeys": project_key,
                        "statuses": ISSUE_STATUSES,
                        "ps": PAGE_SIZE,
                        "p": page,
                    },
                )
                if issues_resp.status_code != 200:
                    break

                data = issues_resp.json()
                issues = data.get("issues", [])

                for issue in issues:
                    issue_id = issue["key"]
                    component = issue.get("component", "")
                    file_path = component.split(":", 1)[1] if ":" in component else component
                    severity = (issue.get("severity") or "").lower() or None

                    existing_issue = db.query(CodeIssue).filter(CodeIssue.id == issue_id).first()
                    if not existing_issue:
                        db.add(CodeIssue(
                            id=issue_id,
                            project_key=project_key,
                            project_name=project_name,
                            rule_id=issue.get("rule"),
                            type=issue.get("type"),
                            severity=severity,
                            message=issue.get("message"),
                            file_path=file_path,
                            line_number=issue.get("line"),
                            status=issue.get("status"),
                            effort=issue.get("effort"),
                        ))
                        records += 1
                    else:
                        existing_issue.severity = severity
                        existing_issue.message = issue.get("message")
                        existing_issue.status = issue.get("status")
                        existing_issue.effort = issue.get("effort")

                db.commit()

                paging = data.get("paging", {"total": 0, "pageSize": PAGE_SIZE})
                if page * paging.get("pageSize", PAGE_SIZE) >= paging.get("total", 0):
                    break
                page += 1

            records += await _sync_hotspots(client, base_url, project_key, project_name, db)

    return {"records": records}


async def _sync_hotspots(client: httpx.AsyncClient, base_url: str, project_key: str, project_name: str, db: Session) -> int:
    added = 0
    page = 1
    while True:
        hotspots_resp = await client.get(
            _api(base_url, "hotspots/search"),
            params={"projectKey": project_key, "ps": PAGE_SIZE, "p": page},
        )
        if hotspots_resp.status_code != 200:
            break

        data = hotspots_resp.json()
        hotspots = data.get("hotspots", [])

        for hotspot in hotspots:
            if hotspot.get("status") != "TO_REVIEW":
                continue

            hotspot_id = f"hotspot:{hotspot['key']}"
            component = hotspot.get("component", "")
            file_path = component.split(":", 1)[1] if ":" in component else component
            severity = (hotspot.get("vulnerabilityProbability") or "").lower() or None

            existing = db.query(CodeIssue).filter(CodeIssue.id == hotspot_id).first()
            if not existing:
                db.add(CodeIssue(
                    id=hotspot_id,
                    project_key=project_key,
                    project_name=project_name,
                    rule_id=hotspot.get("ruleKey"),
                    type="SECURITY_HOTSPOT",
                    severity=severity,
                    message=hotspot.get("message"),
                    file_path=file_path,
                    line_number=hotspot.get("line"),
                    status=hotspot.get("status"),
                    effort=None,
                ))
                added += 1
            else:
                existing.severity = severity
                existing.message = hotspot.get("message")
                existing.status = hotspot.get("status")

        db.commit()

        paging = data.get("paging", {"total": 0, "pageSize": PAGE_SIZE})
        if page * paging.get("pageSize", PAGE_SIZE) >= paging.get("total", 0):
            break
        page += 1

    return added
