from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


class FailedJob(BaseModel):
    stage: Optional[str] = None
    name: Optional[str] = None
    failure_reason: Optional[str] = None


class PipelineOut(BaseModel):
    id: str
    project: str
    ref: Optional[str]
    status: Optional[str]
    started_at: Optional[datetime]
    finished_at: Optional[datetime]
    sast: int
    dep_scan: int
    secret_detection: int
    findings: Optional[Any]
    web_url: Optional[str] = None
    failed_jobs: Optional[list[FailedJob]] = None
    is_seed: bool = False

    class Config:
        from_attributes = True
