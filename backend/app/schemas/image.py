from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class VulnCount(BaseModel):
    critical: int = 0
    high: int = 0
    medium: int = 0
    low: int = 0


class ImageOut(BaseModel):
    id: str
    name: str
    tag: str
    registry: str
    digest: Optional[str]
    size_mb: Optional[float]
    last_scanned_at: Optional[datetime]
    source: str
    counts: VulnCount

    class Config:
        from_attributes = True


class VulnOut(BaseModel):
    id: str
    cve_id: str
    severity: str
    package_name: Optional[str]
    installed_version: Optional[str]
    fixed_version: Optional[str]
    cvss_score: Optional[float]
    description: Optional[str]
    source_tool: Optional[str]
    status: str

    class Config:
        from_attributes = True


class ImageDetailOut(ImageOut):
    vulnerabilities: list[VulnOut] = []


class PackageOut(BaseModel):
    id: str
    name: str
    version: Optional[str]
    pkg_type: Optional[str]
    license: Optional[str]
    source_tool: Optional[str]
    vuln_severity: Optional[str] = None   # highest severity CVE on this package in this image
    fix_version: Optional[str] = None     # from vulnerability record

    class Config:
        from_attributes = True
