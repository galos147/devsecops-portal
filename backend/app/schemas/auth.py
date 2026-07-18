from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class MeOut(BaseModel):
    id: str
    username: str
    role: str
