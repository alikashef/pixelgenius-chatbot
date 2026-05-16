from fastapi import APIRouter, HTTPException, status
from schemas import LoginRequest, TokenOut
from auth import ADMIN_USERNAME, ADMIN_PASSWORD, create_access_token

router = APIRouter()


@router.post("/auth/login", response_model=TokenOut)
async def login(body: LoginRequest):
    if body.username != ADMIN_USERNAME or body.password != ADMIN_PASSWORD:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="نام کاربری یا رمز عبور اشتباه است",
        )
    token = create_access_token({"sub": body.username})
    return TokenOut(access_token=token, token_type="bearer")
