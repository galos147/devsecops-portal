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

    class Config:
        from_attributes = True
