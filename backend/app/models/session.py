from sqlalchemy import Column, String, DateTime, ForeignKey
from app.database import Base


class UserSession(Base):
    """
    Named UserSession, not Session — sqlalchemy.orm.Session (imported as `Session` in
    every router via `db: Session = Depends(get_db)`) would collide with a model class
    literally named `Session`.
    """
    __tablename__ = "sessions"

    id = Column(String, primary_key=True)  # the random token IS the cookie value/PK
    user_id = Column(String, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, nullable=False)
    expires_at = Column(DateTime, nullable=False, index=True)
