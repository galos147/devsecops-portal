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
    phase = Column(String, nullable=True)             # "inventory" | "report_generate" | "report_wait" | "report_fetch" | "done"
    total_items = Column(Integer, nullable=True)
    processed_items = Column(Integer, nullable=True, default=0)
    last_heartbeat_at = Column(DateTime, nullable=True)  # proves the owning process is still alive; see main.py's reaper
