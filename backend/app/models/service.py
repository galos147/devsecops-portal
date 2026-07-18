from sqlalchemy import Column, String, Boolean, DateTime
from datetime import datetime
from app.database import Base


class Service(Base):
    """
    Links a SonarQube project / GitLab pipeline project / registry image together
    by explicit user choice, not name-matching (see docs/integrations.md section 3 —
    the removed PROJECT_META precedent — for why auto-matching was rejected).
    """
    __tablename__ = "services"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    image_name = Column(String, nullable=True)  # matches Image.name; "current" = most recent by pushed_at
    code_project_key = Column(String, nullable=True)  # matches CodeProject.project_key
    pipeline_project = Column(String, nullable=True)  # matches PipelineRun.project
    is_seed = Column(Boolean, nullable=False, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
