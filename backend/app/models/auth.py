from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class LoginResponse(BaseModel):
    token: str
    username: str


class SessionUser(BaseModel):
    username: str
    login_at: float
    last_seen: float
