from sqlalchemy import Column, String, Integer, DateTime, JSON
from app.database import Base


class PipelineRun(Base):
    __tablename__ = "pipeline_runs"

    id = Column(String, primary_key=True)
    gitlab_project_id = Column(String)
    project = Column(String, nullable=False)
    ref = Column(String)
    status = Column(String)  # passed | failed | running
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    sast = Column(Integer, default=0)
    dep_scan = Column(Integer, default=0)
    secret_detection = Column(Integer, default=0)
    findings = Column(JSON, default=list)
