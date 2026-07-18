from pydantic import BaseModel
from typing import Optional
from app.schemas.code_quality import CodeProjectOut, CodeIssueOut
from app.schemas.pipeline import PipelineOut
from app.schemas.image import ImageDetailOut


class ServiceOut(BaseModel):
    id: str
    name: str
    image_name: Optional[str] = None
    code_project_key: Optional[str] = None
    pipeline_project: Optional[str] = None
    is_seed: bool = False
    quality_gate: Optional[str] = None
    last_pipeline_status: Optional[str] = None
    top_vuln_severity: Optional[str] = None


class ServiceDetailOut(BaseModel):
    id: str
    name: str
    is_seed: bool = False
    image_name: Optional[str] = None
    code_project_key: Optional[str] = None
    pipeline_project: Optional[str] = None
    code_project: Optional[CodeProjectOut] = None
    code_issues: list[CodeIssueOut] = []
    pipelines: list[PipelineOut] = []
    image: Optional[ImageDetailOut] = None


class ServiceCreate(BaseModel):
    name: str
    image_name: Optional[str] = None
    code_project_key: Optional[str] = None
    pipeline_project: Optional[str] = None


class ServiceUpdate(BaseModel):
    name: Optional[str] = None
    image_name: Optional[str] = None
    code_project_key: Optional[str] = None
    pipeline_project: Optional[str] = None
