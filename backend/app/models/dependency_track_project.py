from sqlalchemy import Column, String, DateTime, Boolean
from app.database import Base


class DependencyTrackProject(Base):
    __tablename__ = "dependency_track_projects"

    id = Column(String, primary_key=True)  # Dependency-Track's own project UUID
    name = Column(String, nullable=False)
    version = Column(String)
    last_synced_at = Column(DateTime)
    is_seed = Column(Boolean, nullable=False, default=False)
