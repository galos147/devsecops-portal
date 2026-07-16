from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from app.database import get_db
from app.models.code_project import CodeProject
from app.models.code_issue import CodeIssue
from app.schemas.code_quality import CodeProjectOut, CodeIssueOut, RuleInfoOut
from app.integrations import sonarqube

router = APIRouter(prefix="/api", tags=["code-quality"])


@router.get("/projects", response_model=list[CodeProjectOut])
def list_projects(db: Session = Depends(get_db)):
    return db.query(CodeProject).all()


@router.get("/code-issues", response_model=list[CodeIssueOut])
def list_code_issues(
    project: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    query = db.query(CodeIssue)
    if project and project != "all":
        query = query.filter(CodeIssue.project_key == project)
    if type and type != "all":
        query = query.filter(CodeIssue.type == type)
    if severity and severity != "all":
        query = query.filter(CodeIssue.severity == severity)
    return query.all()


@router.get("/rules/{rule_id}", response_model=RuleInfoOut)
async def get_rule_info(rule_id: str, db: Session = Depends(get_db)):
    info = await sonarqube.fetch_rule_info(db, rule_id)
    if not info:
        raise HTTPException(status_code=404, detail="Rule info not found")
    return RuleInfoOut(**info)
