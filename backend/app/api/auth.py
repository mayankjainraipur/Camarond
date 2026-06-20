from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..config import settings

router = APIRouter(prefix="/api/auth")


class HostLoginRequest(BaseModel):
    password: str


@router.post("/host-verify")
def host_verify(body: HostLoginRequest) -> dict:
    if body.password != settings.host_password:
        raise HTTPException(status_code=401, detail="invalid_password")
    return {"ok": True}
