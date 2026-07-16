from sqlalchemy import Column, String, Integer
from app.database import Base


class CodeIssue(Base):
    __tablename__ = "code_issues"

    id = Column(String, primary_key=True)
    project_key = Column(String, nullable=False, index=True)
    project_name = Column(String)
    rule_id = Column(String)
    type = Column(String)      # BUG | VULNERABILITY | CODE_SMELL
    severity = Column(String)  # blocker | critical | major | minor | info
    message = Column(String)
    file_path = Column(String)
    line_number = Column(Integer)
    status = Column(String, default="OPEN")
    effort = Column(String)
