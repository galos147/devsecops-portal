import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.session import UserSession
from app.schemas.user import UserOut, UserCreate, UserUpdate
from app.auth import hash_password, get_current_user

router = APIRouter(prefix="/api/users", tags=["users"])


def _active_admin_count(db: Session) -> int:
    return db.query(User).filter(User.role == "admin", User.is_active == True).count()  # noqa: E712


@router.get("", response_model=list[UserOut])
def list_users(db: Session = Depends(get_db)):
    return [UserOut.model_validate(u) for u in db.query(User).order_by(User.created_at).all()]


@router.post("", response_model=UserOut)
def create_user(body: UserCreate, db: Session = Depends(get_db)):
    if body.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'member'")
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already exists")

    u = User(
        id=f"user-{uuid.uuid4().hex[:12]}", username=body.username,
        password_hash=hash_password(body.password), role=body.role,
        is_active=True, created_at=datetime.utcnow(),
    )
    db.add(u)
    db.commit()
    return UserOut.model_validate(u)


@router.put("/{user_id}", response_model=UserOut)
def update_user(user_id: str, body: UserUpdate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None and body.role not in ("admin", "member"):
        raise HTTPException(status_code=400, detail="role must be 'admin' or 'member'")

    demoting = body.role is not None and body.role != "admin" and target.role == "admin"
    deactivating = body.is_active is False and target.is_active
    if target.role == "admin" and (demoting or deactivating) and _active_admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Cannot remove the last remaining admin's privileges")

    if body.password:
        target.password_hash = hash_password(body.password)
    if body.role is not None:
        target.role = body.role
    if body.is_active is not None:
        target.is_active = body.is_active
        if body.is_active is False:
            db.query(UserSession).filter(UserSession.user_id == target.id).delete()  # revoke live sessions

    db.commit()
    return UserOut.model_validate(target)


@router.delete("/{user_id}")
def delete_user(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    target = db.query(User).filter(User.id == user_id).first()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.id == current_user.id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account while logged in as it")
    if target.role == "admin" and _active_admin_count(db) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last remaining admin")

    db.query(UserSession).filter(UserSession.user_id == target.id).delete()
    db.delete(target)
    db.commit()
    return {"id": user_id, "deleted": True}
