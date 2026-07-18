from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class IntegrationOut(BaseModel):
    tool: str
    label: str
    url: Optional[str] = None
    username: Optional[str] = None
    secret_set: bool = False
    extra: Optional[str] = None
    source: str  # "database" | "none"
    updated_at: Optional[datetime] = None


class IntegrationUpdate(BaseModel):
    url: Optional[str] = None
    username: Optional[str] = None
    secret: Optional[str] = None  # omitted/None = keep existing saved secret
    extra: Optional[str] = None


class TestConnectionRequest(BaseModel):
    url: Optional[str] = None
    username: Optional[str] = None
    secret: Optional[str] = None


class TestConnectionResult(BaseModel):
    ok: bool
    message: str
