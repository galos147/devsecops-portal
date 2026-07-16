from sqlalchemy import Column, String, ForeignKey
from app.database import Base


class ImagePackage(Base):
    __tablename__ = "image_packages"

    id = Column(String, primary_key=True)
    image_id = Column(String, ForeignKey("images.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    version = Column(String)
    pkg_type = Column(String)   # deb, rpm, jar, pip, npm, go, apk, gem
    license = Column(String)
    source_tool = Column(String)  # jfrog | prisma
