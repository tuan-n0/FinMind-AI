"""F03 — Quản lý danh mục."""
from typing import Optional

from fastapi import APIRouter, Depends

import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/categories", tags=["categories"])


@router.get("", response_model=list[schemas.CategoryOut])
def list_categories(type: Optional[str] = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.list_categories(conn, user["id"], type)


@router.post("", response_model=schemas.CategoryOut, status_code=201)
def create_category(data: schemas.CategoryCreate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.create_category(conn, user["id"], data)


@router.patch("/{category_id}", response_model=schemas.CategoryOut)
def update_category(category_id: int, data: schemas.CategoryCreate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.update_category(conn, user["id"], category_id, data)


@router.delete("/{category_id}")
def delete_category(category_id: int, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.delete_category(conn, user["id"], category_id)
