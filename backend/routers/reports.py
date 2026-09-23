"""F10-F11 — Báo cáo tài chính & Dashboard."""
from fastapi import APIRouter, Depends

import auth
import crud
import database

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/summary")
def summary(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    if not month or not year:
        year, month = crud.latest_period(conn, user["id"])
    return {
        "period": {"year": year, "month": month},
        "totals": crud.compute_totals(conn, user["id"], year, month),
        "by_category_expense": crud.group_by_category(conn, user["id"], year, month, "expense"),
        "by_category_income": crud.group_by_category(conn, user["id"], year, month, "income"),
        "top_expenses": crud.top_expenses(conn, user["id"], year, month, 5),
        "budgets": crud.list_budgets(conn, user["id"], month, year),
    }


@router.get("/trend")
def trend(conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    rows = conn.execute(
        f"SELECT DISTINCT {database.year_expr('txn_date')} y, {database.month_expr('txn_date')} m "
        f"FROM transactions WHERE user_id=? ORDER BY y,m",
        (user["id"],),
    ).fetchall()
    series = [
        {"year": int(r["y"]), "month": int(r["m"]), **crud.compute_totals(conn, user["id"], int(r["y"]), int(r["m"]))}
        for r in rows
    ]
    return {"series": series}
