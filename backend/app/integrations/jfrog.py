"""
JFrog Artifactory + Xray integration.

Flow (bulk sync):
  1. Paginated Artifactory catalog/tags walk (api/docker/.../v2/_catalog + tags/list,
     using their real n/last cursor params) — image inventory only, batched upserts,
     looped per configured repo (see _parse_repos).
  2. Xray Vulnerabilities Report (api/v1/reports/vulnerabilities): generate scoped to all
     configured repos at once with filters.scan_date.start = last successful sync's
     watermark (omitted on first sync = full pull), poll until complete, then page through
     content (page_num/num_of_rows) and match rows back to already-upserted images by
     `path` (repo/name/tag), NOT a digest — report rows carry no sha256 at all.
  3. Batched upserts (INSERT ... ON CONFLICT DO UPDATE) throughout — no per-row commits.

Flow (on-demand, sync_one_image): unchanged from before — POST api/v1/summary/artifact
for a single image's digest/checksum, since that's already a fast, batch-capable,
per-artifact API; no need for the Reports machinery for one image.

Vulnerabilities Report row field mapping (_parse_report_row) is CONFIRMED against a real
captured response — defectdojo/django-defectdojo's jfrog_xray_unified parser test fixture
(Vulnerabilities-Report-XRAY_Unified.json) — not a guess. See docs/integrations.md for the
corrections that fixture surfaced versus the original (wrong) assumptions.
"""

import asyncio
import hashlib
import httpx
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.dialects.postgresql import insert as pg_insert

from app.config import settings
from app.integrations import config_resolver
from app.models.image import Image, ImageSource
from app.models.vulnerability import Vulnerability, Severity, VulnStatus
from app.models.fix_suggestion import FixSuggestion
from app.models.image_package import ImagePackage
from app.models.integration_config import IntegrationConfig
from app.models.sync_job import SyncJob

INVENTORY_PAGE_SIZE = 100
REPORT_PAGE_SIZE = 1000
UPSERT_BATCH_SIZE = 500
MANIFEST_CONCURRENCY = 15


def _artif(base_url: str, path: str) -> str:
    return f"{base_url}/artifactory/{path}"


def _xray(base_url: str, path: str) -> str:
    return f"{base_url}/xray/{path}"


async def test_connection(url: str, username: str, secret: str) -> dict:
    if not url or not secret:
        return {"ok": False, "message": "URL and password/API key are required"}
    try:
        async with httpx.AsyncClient(auth=(username, secret), timeout=10, verify=False) as client:
            resp = await client.get(_artif(url.rstrip("/"), "api/system/ping"))
    except httpx.HTTPError as e:
        return {"ok": False, "message": f"Connection failed: {e}"}
    if resp.status_code == 200:
        return {"ok": True, "message": "Connected to JFrog Artifactory"}
    return {"ok": False, "message": f"JFrog responded with {resp.status_code}"}


def _img_id(repo: str, name: str, tag: str) -> str:
    # repo is part of the hash — the same image name:tag can legitimately exist in
    # two different repos (e.g. docker-staging vs docker-prod) and must not collide.
    return hashlib.md5(f"jfrog:{repo}:{name}:{tag}".encode()).hexdigest()[:16]


def _parse_repos(extra: str | None) -> list[str]:
    """The Settings 'Repository' field is a comma-separated list for multi-repo Artifactory setups."""
    raw = extra or settings.jfrog_repo
    return [r.strip() for r in raw.split(",") if r.strip()]


def _vuln_id(img_id: str, cve_id: str, pkg: str) -> str:
    return hashlib.md5(f"{img_id}:{cve_id}:{pkg}".encode()).hexdigest()[:16]


async def _request(client: httpx.AsyncClient, method: str, url: str, **kwargs) -> httpx.Response:
    """Retries on 429/502/503/504 with capped exponential backoff — undocumented rate limits on both APIs."""
    resp = None
    for attempt in range(4):
        resp = await client.request(method, url, **kwargs)
        if resp.status_code not in (429, 502, 503, 504):
            return resp
        await asyncio.sleep(min(2 ** attempt, 20))
    return resp


# ---------------------------------------------------------------------------
# Phase 1: paginated Artifactory inventory walk
# ---------------------------------------------------------------------------

async def _paginated_catalog(client: httpx.AsyncClient, base_url: str, repo: str, page_size: int = INVENTORY_PAGE_SIZE):
    last = None
    while True:
        params = {"n": page_size, **({"last": last} if last else {})}
        resp = await _request(client, "GET", _artif(base_url, f"api/docker/{repo}/v2/_catalog"), params=params)
        if resp.status_code != 200:
            break
        names = resp.json().get("repositories", [])
        if not names:
            break
        yield names
        if len(names) < page_size:
            break
        last = names[-1]


async def _paginated_tags(client: httpx.AsyncClient, base_url: str, repo: str, img_name: str, page_size: int = INVENTORY_PAGE_SIZE):
    last = None
    while True:
        params = {"n": page_size, **({"last": last} if last else {})}
        resp = await _request(client, "GET", _artif(base_url, f"api/docker/{repo}/v2/{img_name}/tags/list"), params=params)
        if resp.status_code != 200:
            break
        tags = resp.json().get("tags") or []
        if not tags:
            break
        yield tags
        if len(tags) < page_size:
            break
        last = tags[-1]


async def _fetch_manifest(client: httpx.AsyncClient, base_url: str, repo: str, img_name: str, tag: str, sem: asyncio.Semaphore):
    async with sem:
        resp = await _request(client, "GET", _artif(base_url, f"api/storage/{repo}/{img_name}/{tag}/manifest.json"))
        if resp.status_code != 200:
            return None, None
        info = resp.json()
        digest = info.get("checksums", {}).get("sha256")
        size_bytes = info.get("size")
        size_mb = round(int(size_bytes) / 1024 / 1024, 2) if size_bytes else None
        return (f"sha256:{digest}" if digest else None), size_mb


# ---------------------------------------------------------------------------
# Batched upserts (INSERT ... ON CONFLICT DO UPDATE) — no per-row commits
# ---------------------------------------------------------------------------

def _bulk_upsert_images(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    deduped = list({r["id"]: r for r in rows}.values())
    stmt = pg_insert(Image.__table__).values(deduped)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Image.__table__.c.id],
        set_={"digest": stmt.excluded.digest, "size_mb": stmt.excluded.size_mb, "last_scanned_at": stmt.excluded.last_scanned_at},
    )
    db.execute(stmt)
    db.commit()


def _bulk_upsert_vulns(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    deduped = list({r["id"]: r for r in rows}.values())
    stmt = pg_insert(Vulnerability.__table__).values(deduped)
    stmt = stmt.on_conflict_do_update(
        index_elements=[Vulnerability.__table__.c.id],
        set_={
            "severity": stmt.excluded.severity, "installed_version": stmt.excluded.installed_version,
            "fixed_version": stmt.excluded.fixed_version, "cvss_score": stmt.excluded.cvss_score,
            "description": stmt.excluded.description, "status": stmt.excluded.status,
        },
    )
    db.execute(stmt)
    db.commit()


def _bulk_upsert_packages(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    deduped = list({r["id"]: r for r in rows}.values())
    stmt = pg_insert(ImagePackage.__table__).values(deduped)
    stmt = stmt.on_conflict_do_update(
        index_elements=[ImagePackage.__table__.c.id],
        set_={"version": stmt.excluded.version, "license": stmt.excluded.license},
    )
    db.execute(stmt)
    db.commit()


def _bulk_upsert_fixes(db: Session, rows: list[dict]) -> None:
    if not rows:
        return
    deduped = list({r["cve_id"]: r for r in rows}.values())
    stmt = pg_insert(FixSuggestion.__table__).values(deduped)
    stmt = stmt.on_conflict_do_update(
        index_elements=[FixSuggestion.__table__.c.cve_id],
        set_={"suggestion_text": stmt.excluded.suggestion_text, "copy_cmd": stmt.excluded.copy_cmd,
              "advisory_url": stmt.excluded.advisory_url, "cvss_vector": stmt.excluded.cvss_vector},
    )
    db.execute(stmt)
    db.commit()


def _image_id_from_path(path: str) -> str | None:
    """
    Report rows identify the artifact via `path` (e.g. "docker-reg/test-artifact/1.0.5/" —
    confirmed against a real captured response, see _parse_report_row), not a digest.
    Parses repo/name/tag directly into the same deterministic id used when the artifact
    was upserted during the inventory walk (Phase 1) — no DB digest lookup needed.
    """
    parts = [p for p in path.strip("/").split("/") if p]
    if len(parts) < 3:
        return None
    repo, tag = parts[0], parts[-1]
    name = "/".join(parts[1:-1])  # image names can themselves contain "/" (e.g. "team/service")
    return _img_id(repo, name, tag)


def _existing_image_ids(db: Session, ids: list[str]) -> set[str]:
    """
    Which of these (already deterministically computed) ids are actually synced images —
    Vulnerability.image_id is a real FK, inserting one that doesn't exist would violate it.
    Chunked, not one giant in-memory set (could be large at 2M rows).
    """
    if not ids:
        return set()
    rows = db.query(Image.id).filter(Image.id.in_(ids)).all()
    return {r[0] for r in rows}


# ---------------------------------------------------------------------------
# Xray Reports API — bulk/incremental vulnerability pull
# ---------------------------------------------------------------------------

async def _generate_vuln_report(client: httpx.AsyncClient, base_url: str, repos: list[str], scan_date_start: datetime | None) -> str:
    # One report covers all configured repos at once (resources.repositories accepts an array) —
    # cheaper than generating N separate reports for N repos.
    body = {
        "name": f"portal-sync-{int(datetime.utcnow().timestamp())}",
        "resources": {"repositories": [{"name": r} for r in repos]},
    }
    if scan_date_start:
        body["filters"] = {"scan_date": {"start": scan_date_start.strftime("%Y-%m-%dT%H:%M:%SZ")}}
    resp = await _request(client, "POST", _xray(base_url, "api/v1/reports/vulnerabilities"), json=body)
    resp.raise_for_status()
    return resp.json()["report_id"]


async def _poll_report(client: httpx.AsyncClient, base_url: str, report_id: str, timeout_s: int = 3600, interval_s: int = 10) -> dict:
    elapsed = 0
    while elapsed < timeout_s:
        resp = await _request(client, "GET", _xray(base_url, f"api/v1/reports/{report_id}"))
        resp.raise_for_status()
        data = resp.json()
        status = str(data.get("status", "")).lower()
        if status == "completed":
            return data
        if status == "failed":
            raise RuntimeError(f"Xray report {report_id} failed: {data}")
        await asyncio.sleep(interval_s)
        elapsed += interval_s
    raise TimeoutError(f"Xray report {report_id} did not complete within {timeout_s}s")


async def _fetch_report_pages(client: httpx.AsyncClient, base_url: str, report_id: str, page_size: int = REPORT_PAGE_SIZE):
    page = 1
    while True:
        body = {"page_num": page, "num_of_rows": page_size}
        resp = await _request(client, "POST", _xray(base_url, f"api/v1/reports/vulnerabilities/{report_id}"), json=body)
        resp.raise_for_status()
        data = resp.json()
        rows = data.get("rows") or []
        total = data.get("total_rows")
        if not rows:
            break
        yield rows, total
        if len(rows) < page_size:
            break
        page += 1


def _parse_report_row(row: dict, existing_image_ids: set[str]) -> tuple[list[dict], dict | None, dict[str, dict]]:
    """
    Maps one Vulnerabilities Report content row to (vulnerability rows, package row, fix rows).

    Field mapping CONFIRMED against a real captured Xray Unified report response — not a guess.
    Source: defectdojo/django-defectdojo's `jfrog_xray_unified` parser test fixture
    (`unittests/scans/jfrog_xray_unified/Vulnerabilities-Report-XRAY_Unified.json`), cross-checked
    against DefectDojo's own parser (`dojo/tools/jfrog_xray_unified/parser.py`) for how each field
    is actually used. Corrected several wrong assumptions from before this was checked:
      - There is NO sha256/digest field on a report row at all — the artifact is identified by
        `path` (e.g. "docker-reg/test-artifact/1.0.5/" = repo/name/tag), not a checksum.
      - `cves` is an ARRAY — one Xray issue can carry multiple CVEs, not a single top-level `cve`.
      - Advisory links come from `references` (a list), there's no `cve_link` field.
      - Per-CVE CVSS lives in `cves[].cvss_v3_score`, with `cvss3_max_score` as a row-level fallback.
    """
    path = row.get("path")
    img_id = _image_id_from_path(path) if path else None
    if not img_id or img_id not in existing_image_ids:
        return [], None, {}

    # vulnerable_component: "scheme://[epoch:]name:version" — last colon-segment is the version,
    # everything before it (minus the scheme prefix) is the name. Same split DefectDojo's own
    # parser uses.
    split_component = (row.get("vulnerable_component") or "").split(":")
    pkg_version = split_component[-1] if split_component else ""
    pkg_name_raw = ":".join(split_component[:-1])
    pkg_name = pkg_name_raw.split("://", 1)[1] if "://" in pkg_name_raw else pkg_name_raw
    pkg_name = pkg_name or "unknown"

    package_type = (row.get("package_type") or "unknown").lower()
    fixed_versions = row.get("fixed_versions") or []
    fixed_ver = fixed_versions[0] if fixed_versions else None
    references = row.get("references") or []
    description = row.get("description") or row.get("summary") or ""

    row_severity = (row.get("severity") or "low").lower()
    sev_map = {"critical": Severity.critical, "high": Severity.high, "medium": Severity.medium, "low": Severity.low}
    default_severity = sev_map.get(row_severity, Severity.low)

    vuln_rows: list[dict] = []
    fix_rows: dict[str, dict] = {}

    for cve_entry in row.get("cves") or []:
        cve_id = cve_entry.get("cve")
        if not cve_id:
            continue

        vuln_rows.append(dict(
            id=_vuln_id(img_id, cve_id, pkg_name), image_id=img_id, cve_id=cve_id, severity=default_severity,
            package_name=pkg_name, installed_version=pkg_version, fixed_version=fixed_ver,
            cvss_score=cve_entry.get("cvss_v3_score") or cve_entry.get("cvss_v2_score") or row.get("cvss3_max_score"),
            description=description, source_tool="jfrog", status=VulnStatus.open,
        ))

        if fixed_ver:
            fix_rows[cve_id] = dict(
                id=hashlib.md5(f"fix:{cve_id}".encode()).hexdigest()[:16], cve_id=cve_id,
                suggestion_text=f"Upgrade {pkg_name} to {fixed_ver}.",
                copy_cmd=f"# Upgrade {pkg_name} to {fixed_ver}",
                advisory_url=references[0] if references else f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                published=None, cvss_vector=cve_entry.get("cvss_v3_vector"),
            )

    pkg_row = None
    if pkg_name != "unknown":
        pkg_row = dict(
            id=hashlib.md5(f"pkg:{img_id}:{pkg_name}:{pkg_version}".encode()).hexdigest()[:16],
            image_id=img_id, name=pkg_name, version=pkg_version,
            pkg_type=package_type, license=None, source_tool="jfrog",
        )

    return vuln_rows, pkg_row, fix_rows


# ---------------------------------------------------------------------------
# On-demand single-image sync (summary/artifact — already batch-capable, fast)
# ---------------------------------------------------------------------------

def _parse_artifact_summary(img_id: str, xray_data: dict) -> tuple[list[dict], list[dict], dict[str, dict]]:
    """Parses summary/artifact's response shape (same shape the old whole-tool sync used)."""
    vuln_rows: list[dict] = []
    pkg_rows: list[dict] = []
    fix_rows: dict[str, dict] = {}

    for artifact in xray_data.get("artifacts", []):
        for comp in artifact.get("components", []):
            comp_id = comp.get("component_id", "")
            pkg_type = comp.get("package_type", "").lower()
            licenses = comp.get("licenses", [])
            license_str = licenses[0] if licenses else None
            parts = comp_id.split("://", 1)
            name_ver = parts[1] if len(parts) > 1 else comp_id
            name_parts = name_ver.rsplit(":", 1)
            pkg_name = name_parts[0] if name_parts else name_ver
            pkg_ver = name_parts[1] if len(name_parts) > 1 else ""

            pkg_rows.append(dict(
                id=hashlib.md5(f"pkg:{img_id}:{comp_id}".encode()).hexdigest()[:16],
                image_id=img_id, name=pkg_name or comp.get("name", "unknown"),
                version=pkg_ver or comp.get("version", ""), pkg_type=pkg_type or "unknown",
                license=license_str, source_tool="jfrog",
            ))

        for issue in artifact.get("issues", []):
            cves = issue.get("cves", [])
            if not cves:
                continue
            xray_sev = issue.get("severity", "low").lower()
            sev_map = {"critical": Severity.critical, "high": Severity.high,
                       "medium": Severity.medium, "low": Severity.low, "unknown": Severity.low}
            sev = sev_map.get(xray_sev, Severity.low)

            for cve_entry in cves:
                cve_id = cve_entry.get("cve")
                if not cve_id:
                    continue
                components = issue.get("components", [{}])
                for comp in components:
                    pkg_name = comp.get("name", "unknown")
                    installed_ver = comp.get("version", "")
                    fixed_versions = comp.get("fixed_versions", [])
                    fixed_ver = fixed_versions[0] if fixed_versions else None

                    vuln_rows.append(dict(
                        id=_vuln_id(img_id, cve_id, pkg_name), image_id=img_id, cve_id=cve_id, severity=sev,
                        package_name=pkg_name, installed_version=installed_ver, fixed_version=fixed_ver,
                        cvss_score=cve_entry.get("cvss_v3_score") or cve_entry.get("cvss_v2_score"),
                        description=issue.get("description", ""), source_tool="jfrog", status=VulnStatus.open,
                    ))

                    ext = issue.get("extended_information", {})
                    if ext:
                        remediation = ext.get("remediation") or (f"Upgrade {pkg_name} to {fixed_ver}." if fixed_ver else None)
                        fix_rows[cve_id] = dict(
                            id=hashlib.md5(f"fix:{cve_id}".encode()).hexdigest()[:16], cve_id=cve_id,
                            suggestion_text=remediation,
                            copy_cmd=f"# Upgrade {pkg_name} to {fixed_ver}" if fixed_ver else None,
                            advisory_url=cve_entry.get("cve_link") or f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                            published=None, cvss_vector=cve_entry.get("cvss_v3_vector"),
                        )

    return vuln_rows, pkg_rows, fix_rows


async def sync_one_image(db: Session, cfg: dict, img: Image) -> None:
    base_url = cfg["url"]
    # registry is stored as "{host}/{repo}" (see sync()) so a multi-repo config can tell which
    # repo THIS specific image came from — falls back to the first configured repo for any
    # image synced before multi-repo support existed (registry was just the bare host then).
    repo = img.registry.split("/", 1)[1] if "/" in img.registry else _parse_repos(cfg["extra"])[0]
    async with httpx.AsyncClient(auth=(cfg["username"], cfg["secret"]), timeout=30, verify=False) as client:
        digest = img.digest.replace("sha256:", "") if img.digest else None
        if digest:
            payload = {"checksums": [{"sha256": digest}]}
        else:
            payload = {"component_details": [
                {"artifact": {"pkg_type": "Docker", "name": f"{repo}/{img.name}", "version": img.tag}}
            ]}
        resp = await _request(client, "POST", _xray(base_url, "api/v1/summary/artifact"), json=payload)
        resp.raise_for_status()

        vuln_rows, pkg_rows, fix_rows = _parse_artifact_summary(img.id, resp.json())
        _bulk_upsert_vulns(db, vuln_rows)
        _bulk_upsert_packages(db, pkg_rows)
        if fix_rows:
            _bulk_upsert_fixes(db, list(fix_rows.values()))

        img.last_scanned_at = datetime.utcnow()
        db.commit()


# ---------------------------------------------------------------------------
# Whole-tool sync orchestration
# ---------------------------------------------------------------------------

async def sync(db: Session, job: SyncJob | None = None) -> dict:
    cfg_row = db.query(IntegrationConfig).filter(IntegrationConfig.tool == "jfrog").first()
    cfg = config_resolver.resolve(db, "jfrog")
    if cfg["source"] == "none":
        return {"records": 0, "note": "JFrog not configured"}

    base_url = cfg["url"]
    repos = _parse_repos(cfg["extra"])
    host = base_url.replace("http://", "").replace("https://", "")
    sync_start = datetime.utcnow()
    watermark = (cfg_row.last_synced_at - timedelta(minutes=5)) if cfg_row and cfg_row.last_synced_at else None
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

    async with httpx.AsyncClient(auth=(cfg["username"], cfg["secret"]), timeout=30, verify=False) as client:
        # Phase 1: paginated inventory walk, looped per repo (Artifactory's catalog API is
        # inherently per-repo — there's no single call that lists across repos at once).
        # Images only — no Xray call per tag anymore.
        sem = asyncio.Semaphore(MANIFEST_CONCURRENCY)
        batch: list[dict] = []
        seen = 0

        for repo in repos:
            set_phase(f"inventory:{repo}", processed=seen)
            async for names in _paginated_catalog(client, base_url, repo):
                for img_name in names:
                    async for tags in _paginated_tags(client, base_url, repo, img_name):
                        results = await asyncio.gather(*[
                            _fetch_manifest(client, base_url, repo, img_name, tag, sem) for tag in tags
                        ])
                        for tag, (digest, size_mb) in zip(tags, results):
                            batch.append(dict(
                                id=_img_id(repo, img_name, tag), name=img_name, tag=tag,
                                registry=f"{host}/{repo}",
                                digest=digest, size_mb=size_mb, last_scanned_at=sync_start,
                                source=ImageSource.jfrog, is_seed=False,
                            ))
                            seen += 1
                        if len(batch) >= UPSERT_BATCH_SIZE:
                            _bulk_upsert_images(db, batch)
                            batch = []
                            set_phase(f"inventory:{repo}", processed=seen)
        _bulk_upsert_images(db, batch)
        records += seen
        set_phase("inventory", total=seen, processed=seen)

        # Phase 2-4: Xray Reports API bulk vulnerability pull (all repos in one report),
        # incremental via scan_date watermark
        set_phase("report_generate")
        try:
            report_id = await _generate_vuln_report(client, base_url, repos, watermark)
        except httpx.HTTPError as e:
            return {"records": records, "error": f"Report generation failed: {e}"}

        set_phase("report_wait")
        try:
            await _poll_report(client, base_url, report_id)
        except (TimeoutError, RuntimeError) as e:
            return {"records": records, "error": str(e)}

        set_phase("report_fetch", processed=0)
        processed = 0
        vuln_batch: list[dict] = []
        pkg_batch: list[dict] = []
        fix_batch: dict[str, dict] = {}

        async for rows, total in _fetch_report_pages(client, base_url, report_id):
            candidate_ids = {_image_id_from_path(r["path"]) for r in rows if r.get("path")}
            candidate_ids.discard(None)
            existing_ids = _existing_image_ids(db, list(candidate_ids))

            for row in rows:
                v_rows, pkg_row, f_rows = _parse_report_row(row, existing_ids)
                vuln_batch.extend(v_rows)
                if pkg_row:
                    pkg_batch.append(pkg_row)
                fix_batch.update(f_rows)

            if len(vuln_batch) >= UPSERT_BATCH_SIZE:
                _bulk_upsert_vulns(db, vuln_batch)
                records += len(vuln_batch)
                vuln_batch = []
            if len(pkg_batch) >= UPSERT_BATCH_SIZE:
                _bulk_upsert_packages(db, pkg_batch)
                pkg_batch = []

            processed += len(rows)
            set_phase("report_fetch", total=total, processed=processed)

        if vuln_batch:
            _bulk_upsert_vulns(db, vuln_batch)
            records += len(vuln_batch)
        if pkg_batch:
            _bulk_upsert_packages(db, pkg_batch)
        if fix_batch:
            _bulk_upsert_fixes(db, list(fix_batch.values()))

    if cfg_row:
        cfg_row.last_synced_at = sync_start
        db.commit()
    set_phase("done")

    return {"records": records}
