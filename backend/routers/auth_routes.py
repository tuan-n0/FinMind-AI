"""F01 — Đăng ký / đăng nhập."""
from fastapi import APIRouter, Depends, HTTPException, status

import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=schemas.TokenOut, status_code=status.HTTP_201_CREATED)
def register(data: schemas.UserCreate, conn=Depends(database.get_db)):
    if crud.get_user_by_email(conn, data.email):
        raise HTTPException(status.HTTP_409_CONFLICT, "Email này đã được đăng ký")
    user = crud.create_user(conn, data.email, auth.hash_password(data.password), data.full_name)
    crud.create_default_categories(conn, user["id"])  # Chương 5.3.2 báo cáo — bộ danh mục mặc định
    token = auth.create_access_token(user["id"], user["email"])
    return {"access_token": token, "user": user}


@router.post("/login", response_model=schemas.TokenOut)
def login(data: schemas.UserLogin, conn=Depends(database.get_db)):
    user = crud.get_user_by_email(conn, data.email)
    if not user or not auth.verify_password(data.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Email hoặc mật khẩu không đúng")
    token = auth.create_access_token(user["id"], user["email"])
    return {"access_token": token, "user": user}


@router.get("/me", response_model=schemas.UserOut)
def me(current_user: dict = Depends(auth.get_current_user)):
    return current_user


@router.patch("/me", response_model=schemas.UserOut)
def update_me(data: schemas.UserUpdate, conn=Depends(database.get_db), current_user: dict = Depends(auth.get_current_user)):
    return crud.update_user(conn, current_user["id"], data)


@router.post("/change-password")
def change_password(data: schemas.PasswordChange, conn=Depends(database.get_db), current_user: dict = Depends(auth.get_current_user)):
    if not auth.verify_password(data.current_password, current_user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Mật khẩu hiện tại không đúng")
    crud.update_password(conn, current_user["id"], auth.hash_password(data.new_password))
    return {"updated": True}
