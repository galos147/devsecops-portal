from sqlalchemy import Column, String, Float, DateTime, Boolean, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ImageSource(str, enum.Enum):
    jfrog = "jfrog"
    prisma = "prisma"


class Image(Base):
    __tablename__ = "images"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)  # ilike-searched at scale; pg_trgm GIN index applied via raw SQL, see docs/integrations.md
    tag = Column(String, nullable=False)   # same as above
    registry = Column(String, nullable=False, index=True)
    digest = Column(String, index=True)
    size_mb = Column(Float)
    pushed_at = Column(DateTime)
    last_scanned_at = Column(DateTime)
    source = Column(SAEnum(ImageSource), nullable=False, index=True)
    is_seed = Column(Boolean, nullable=False, default=False)

    vulnerabilities = relationship("Vulnerability", back_populates="image")
