"""F07-F08 — Thiết lập & theo dõi ngân sách."""
from fastapi import APIRouter, Depends

import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/budgets", tags=["budgets"])


@router.get("", response_model=list[schemas.BudgetOut])
def list_budgets(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    if not month or not year:
        year, month = crud.latest_period(conn, user["id"])
    return crud.list_budgets(conn, user["id"], month, year)


@router.post("", response_model=schemas.BudgetOut, status_code=201)
def create_or_update_budget(data: schemas.BudgetCreate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.upsert_budget(conn, user["id"], data)


@router.delete("/{budget_id}")
def delete_budget(budget_id: int, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.delete_budget(conn, user["id"], budget_id)
