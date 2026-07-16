from sqlalchemy import Column, String, Integer, Float
from app.database import Base


class CodeProject(Base):
    __tablename__ = "code_projects"

    id = Column(String, primary_key=True)
    project_key = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    quality_gate = Column(String)  # "passed" | "failed"
    bugs = Column(Integer, default=0)
    vulnerabilities = Column(Integer, default=0)
    code_smells = Column(Integer, default=0)
    coverage = Column(Float, default=0.0)
    hotspots = Column(Integer, default=0)
    sonar_url = Column(String)
