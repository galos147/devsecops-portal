from sqlalchemy import Column, String
from app.database import Base


class FixSuggestion(Base):
    __tablename__ = "fix_suggestions"

    id = Column(String, primary_key=True)
    cve_id = Column(String, nullable=False, unique=True, index=True)
    suggestion_text = Column(String)
    copy_cmd = Column(String)
    advisory_url = Column(String)
    published = Column(String)
    cvss_vector = Column(String)
