from sqlalchemy import Column, String, DateTime
from app.database import Base


class IntegrationConfig(Base):
    __tablename__ = "integration_configs"

    id = Column(String, primary_key=True)
    tool = Column(String, nullable=False, unique=True)  # jfrog | sonarqube | prisma | gitlab
    url = Column(String)
    username = Column(String)
    secret = Column(String)  # plaintext; never echoed back over the API
    extra = Column(String)   # tool-specific extra (e.g. JFrog repo name)
    updated_at = Column(DateTime)
