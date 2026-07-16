from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.fix_suggestion import FixSuggestion
from app.schemas.vulnerability import FixSuggestionOut

router = APIRouter(prefix="/api/fix-suggestions", tags=["fix-suggestions"])


@router.get("/{cve_id}", response_model=FixSuggestionOut)
def get_fix_suggestion(cve_id: str, db: Session = Depends(get_db)):
    fix = db.query(FixSuggestion).filter(FixSuggestion.cve_id == cve_id).first()
    if not fix:
        raise HTTPException(status_code=404, detail="Fix suggestion not found")
    return FixSuggestionOut(
        cve_id=fix.cve_id,
        suggestion_text=fix.suggestion_text,
        copy_cmd=fix.copy_cmd,
        advisory_url=fix.advisory_url,
        published=fix.published,
        cvss_vector=fix.cvss_vector,
    )
