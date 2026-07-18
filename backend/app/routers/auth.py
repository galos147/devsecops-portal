from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.session import UserSession
from app.schemas.auth import LoginRequest, MeOut
from app.auth import verify_password, create_session, get_current_user, SESSION_COOKIE_NAME, SESSION_TTL
from app.config import settings

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/login", response_model=MeOut)
def login(body: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not user.is_active or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token, _expires_at = create_session(db, user)
    response.set_cookie(
        key=SESSION_COOKIE_NAME, value=token, httponly=True, samesite="lax",
        secure=settings.cookie_secure, max_age=int(SESSION_TTL.total_seconds()), path="/",
    )
    return MeOut(id=user.id, username=user.username, role=user.role)


@router.post("/logout")
def logout(request: Request, response: Response, db: Session = Depends(get_db)):
    token = request.cookies.get(SESSION_COOKIE_NAME)
    if token:
        db.query(UserSession).filter(UserSession.id == token).delete()
        db.commit()
    response.delete_cookie(SESSION_COOKIE_NAME, path="/")
    return {"ok": True}


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user)):
    return MeOut(id=user.id, username=user.username, role=user.role)
