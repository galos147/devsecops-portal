from pydantic import BaseModel
from typing import Optional


class CodeProjectOut(BaseModel):
    id: str
    project_key: str
    name: str
    quality_gate: Optional[str]
    bugs: int
    vulnerabilities: int
    code_smells: int
    coverage: float
    hotspots: int = 0
    sonar_url: Optional[str] = None
    is_seed: bool = False

    class Config:
        from_attributes = True


class CodeIssueOut(BaseModel):
    id: str
    project_key: str
    project_name: Optional[str]
    rule_id: Optional[str]
    type: Optional[str]
    severity: Optional[str]
    message: Optional[str]
    file_path: Optional[str]
    line_number: Optional[int]
    status: Optional[str]
    effort: Optional[str]
    is_seed: bool = False

    class Config:
        from_attributes = True


class RuleInfoOut(BaseModel):
    rule_id: str
    name: Optional[str]
    type: Optional[str]
    remediation_effort: Optional[str]
    description: Optional[str]
    rule_url: Optional[str]
