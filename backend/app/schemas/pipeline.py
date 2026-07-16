from pydantic import BaseModel
from typing import Optional, Any
from datetime import datetime


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

    class Config:
        from_attributes = True
