"""
JFrog Artifactory + Xray integration.

Flow:
  1. List repositories in JFROG_REPO (docker-local) via Artifactory Docker v2 API
  2. For each image:tag, get the manifest sha256 from Artifactory
  3. POST to Xray /summary/artifact to get CVEs
  4. Upsert images, vulnerabilities, and fix_suggestions into the DB
"""

import hashlib
import httpx
from datetime import datetime
from sqlalchemy.orm import Session

from app.config import settings
from app.models.image import Image, ImageSource
from app.models.vulnerability import Vulnerability, Severity, VulnStatus
from app.models.fix_suggestion import FixSuggestion


def _auth() -> tuple[str, str]:
    return (settings.jfrog_username, settings.jfrog_password)


def _artif(path: str) -> str:
    return f"{settings.jfrog_url}/artifactory/{path}"


def _xray(path: str) -> str:
    return f"{settings.jfrog_url}/xray/{path}"


def _img_id(name: str, tag: str) -> str:
    return hashlib.md5(f"jfrog:{name}:{tag}".encode()).hexdigest()[:16]


def _vuln_id(img_id: str, cve_id: str, pkg: str) -> str:
    return hashlib.md5(f"{img_id}:{cve_id}:{pkg}".encode()).hexdigest()[:16]


async def sync(db: Session) -> dict:
    if not settings.jfrog_url or not settings.jfrog_password:
        return {"records": 0, "note": "JFROG_URL / JFROG_PASSWORD not configured"}

    repo = settings.jfrog_repo
    records = 0

    async with httpx.AsyncClient(auth=_auth(), timeout=30, verify=False) as client:
        # 1. List image names in the repo
        catalog_resp = await client.get(_artif(f"api/docker/{repo}/v2/_catalog"))
        if catalog_resp.status_code != 200:
            return {"records": 0, "error": f"Catalog fetch failed: {catalog_resp.status_code}"}

        image_names: list[str] = catalog_resp.json().get("repositories", [])

        for img_name in image_names:
            # 2. List tags for each image
            tags_resp = await client.get(_artif(f"api/docker/{repo}/v2/{img_name}/tags/list"))
            if tags_resp.status_code != 200:
                continue
            tags: list[str] = tags_resp.json().get("tags") or []

            for tag in tags:
                img_id = _img_id(img_name, tag)

                # 3. Get manifest to extract sha256 digest
                manifest_resp = await client.get(
                    _artif(f"api/storage/{repo}/{img_name}/{tag}/manifest.json")
                )
                digest = None
                size_mb = None
                if manifest_resp.status_code == 200:
                    info = manifest_resp.json()
                    digest = info.get("checksums", {}).get("sha256")
                    size_bytes = info.get("size")
                    if size_bytes:
                        size_mb = round(int(size_bytes) / 1024 / 1024, 2)

                # Upsert image
                existing_img = db.query(Image).filter(Image.id == img_id).first()
                if not existing_img:
                    db.add(Image(
                        id=img_id,
                        name=img_name,
                        tag=tag,
                        registry=settings.jfrog_url.replace("http://", "").replace("https://", ""),
                        digest=f"sha256:{digest}" if digest else None,
                        size_mb=size_mb,
                        last_scanned_at=datetime.utcnow(),
                        source=ImageSource.jfrog,
                    ))
                else:
                    existing_img.last_scanned_at = datetime.utcnow()
                    if digest:
                        existing_img.digest = f"sha256:{digest}"

                # 4. Get Xray scan summary
                xray_payload = {"checksums": []}
                if digest:
                    xray_payload["checksums"] = [{"sha256": digest}]
                else:
                    xray_payload = {"component_details": [
                        {"artifact": {"pkg_type": "Docker", "name": f"{repo}/{img_name}", "version": tag}}
                    ]}

                xray_resp = await client.post(
                    _xray("api/v1/summary/artifact"),
                    json=xray_payload,
                )
                if xray_resp.status_code != 200:
                    db.commit()
                    records += 1
                    continue

                xray_data = xray_resp.json()
                artifacts = xray_data.get("artifacts", [])

                for artifact in artifacts:
                    issues = artifact.get("issues", [])
                    for issue in issues:
                        cves = issue.get("cves", [])
                        if not cves:
                            continue

                        # Map Xray severity to our enum
                        xray_sev = issue.get("severity", "low").lower()
                        sev_map = {"critical": Severity.critical, "high": Severity.high,
                                   "medium": Severity.medium, "low": Severity.low,
                                   "unknown": Severity.low}
                        sev = sev_map.get(xray_sev, Severity.low)

                        for cve_entry in cves:
                            cve_id = cve_entry.get("cve")
                            if not cve_id:
                                continue

                            # Affected components (packages)
                            components = issue.get("components", [{}])
                            for comp in components:
                                pkg_name = comp.get("name", "unknown")
                                installed_ver = comp.get("version", "")
                                fixed_versions = comp.get("fixed_versions", [])
                                fixed_ver = fixed_versions[0] if fixed_versions else None

                                vuln_id = _vuln_id(img_id, cve_id, pkg_name)
                                existing_v = db.query(Vulnerability).filter(Vulnerability.id == vuln_id).first()

                                if not existing_v:
                                    db.add(Vulnerability(
                                        id=vuln_id,
                                        image_id=img_id,
                                        cve_id=cve_id,
                                        severity=sev,
                                        package_name=pkg_name,
                                        installed_version=installed_ver,
                                        fixed_version=fixed_ver,
                                        cvss_score=cve_entry.get("cvss_v3_score") or cve_entry.get("cvss_v2_score"),
                                        description=issue.get("description", ""),
                                        source_tool="jfrog",
                                        status=VulnStatus.open,
                                    ))

                                # Upsert fix suggestion from Xray extended_information
                                ext = issue.get("extended_information", {})
                                if ext and not db.query(FixSuggestion).filter(FixSuggestion.cve_id == cve_id).first():
                                    remediation = ext.get("remediation") or f"Upgrade {pkg_name} to {fixed_ver}." if fixed_ver else None
                                    db.add(FixSuggestion(
                                        id=hashlib.md5(f"fix:{cve_id}".encode()).hexdigest()[:16],
                                        cve_id=cve_id,
                                        suggestion_text=remediation,
                                        copy_cmd=f"# Upgrade {pkg_name} to {fixed_ver}" if fixed_ver else None,
                                        advisory_url=cve_entry.get("cve_link") or f"https://nvd.nist.gov/vuln/detail/{cve_id}",
                                        published=None,
                                        cvss_vector=cve_entry.get("cvss_v3_vector"),
                                    ))

                db.commit()
                records += 1

    return {"records": records}
