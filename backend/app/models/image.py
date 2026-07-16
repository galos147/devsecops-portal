from sqlalchemy import Column, String, Float, DateTime, Enum as SAEnum
from sqlalchemy.orm import relationship
from app.database import Base
import enum


class ImageSource(str, enum.Enum):
    jfrog = "jfrog"
    prisma = "prisma"


class Image(Base):
    __tablename__ = "images"

    id = Column(String, primary_key=True)
    name = Column(String, nullable=False)
    tag = Column(String, nullable=False)
    registry = Column(String, nullable=False)
    digest = Column(String)
    size_mb = Column(Float)
    pushed_at = Column(DateTime)
    last_scanned_at = Column(DateTime)
    source = Column(SAEnum(ImageSource), nullable=False)

    vulnerabilities = relationship("Vulnerability", back_populates="image")
