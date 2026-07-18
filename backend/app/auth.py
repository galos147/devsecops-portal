import secrets
import bcrypt
from datetime import datetime, timedelta
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.session import UserSession

SESSION_COOKIE_NAME = "session_token"
SESSION_TTL = timedelta(days=7)  # fixed expiry from creation, no sliding renewal — simplest
                                  # correct choice for this scale; re-login after 7 days is fine


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def create_session(db: Session, user: User) -> tuple[str, datetime]:
    token = secrets.token_urlsafe(32)
    expires_at = datetime.utcnow() + SESSION_TTL
    db.add(UserSession(id=token, user_id=user.id, created_at=datetime.utcnow(), expires_at=expires_at))
    db.commit()
    return token, expires_at


def get_current_user(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")

    session = db.query(UserSession).filter(UserSession.id == token).first()
    if not session or session.expires_at < datetime.utcnow():
        raise HTTPException(status_code=401, detail="Session expired or invalid")

    user = db.query(User).filter(User.id == session.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Account inactive or missing")

    return user


def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin privileges required")
    return user
