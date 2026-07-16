from pydantic import BaseModel
from typing import Optional


class SeverityCount(BaseModel):
    critical: int
    high: int
    medium: int
    low: int


class ToolHealth(BaseModel):
    tool: str
    label: str
    status: str
    last_sync: Optional[str]
    records_synced: int


class TopVulnImage(BaseModel):
    id: str
    name: str
    tag: str
    registry: str
    critical: int
    high: int


class RecentFailure(BaseModel):
    id: str
    project: str
    ref: str
    started_at: Optional[str]
    total_findings: int


class DashboardStats(BaseModel):
    total_images: int
    critical_cves: int
    high_code_issues: int
    failing_pipelines: int
    last_sync: Optional[str]
    severity_counts: SeverityCount
    tool_health: list[ToolHealth]
    top_vuln_images: list[TopVulnImage]
    recent_failures: list[RecentFailure]
