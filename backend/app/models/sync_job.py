from sqlalchemy import Column, String, Integer, DateTime
from app.database import Base


class SyncJob(Base):
    __tablename__ = "sync_jobs"

    id = Column(String, primary_key=True)
    tool = Column(String, nullable=False)  # jfrog | sonarqube | prisma | gitlab
    status = Column(String)               # running | success | failed
    started_at = Column(DateTime)
    finished_at = Column(DateTime)
    records_synced = Column(Integer, default=0)
    error_message = Column(String)
