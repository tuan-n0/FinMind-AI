"""F04-F06 — Ghi nhận / sửa / xóa / tìm kiếm giao dịch."""
from typing import Optional

from fastapi import APIRouter, Depends

import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/transactions", tags=["transactions"])


@router.get("", response_model=list[schemas.TransactionOut])
def list_transactions(
    type: Optional[str] = None, category_id: Optional[int] = None,
    month: Optional[int] = None, year: Optional[int] = None, q: Optional[str] = None,
    conn=Depends(database.get_db), user=Depends(auth.get_current_user),
):
    return crud.list_transactions(conn, user["id"], type, category_id, month, year, q)


@router.post("", response_model=schemas.TransactionOut, status_code=201)
def create_transaction(data: schemas.TransactionCreate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.create_transaction(conn, user["id"], data)


@router.patch("/{txn_id}", response_model=schemas.TransactionOut)
def update_transaction(txn_id: int, data: schemas.TransactionUpdate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.update_transaction(conn, user["id"], txn_id, data)


@router.delete("/{txn_id}")
def delete_transaction(txn_id: int, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.delete_transaction(conn, user["id"], txn_id)
