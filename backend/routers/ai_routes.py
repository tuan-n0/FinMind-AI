"""F12-F15 — AI tóm tắt, gợi ý ngân sách, hỏi-đáp, xu hướng (Chương 6)."""
from fastapi import APIRouter, Depends

import ai
import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/ai", tags=["ai"])


def _period(conn, user_id, year, month):
    if not month or not year:
        return crud.latest_period(conn, user_id)
    return year, month


@router.get("/summary", response_model=None)
def summary(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    year, month = _period(conn, user["id"], year, month)
    return ai.run_and_log(conn, user["id"], "report", ai.monthly_summary, year, month)


@router.get("/budget-suggest", response_model=None)
def budget_suggest(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    year, month = _period(conn, user["id"], year, month)
    return ai.run_and_log(conn, user["id"], "budget", ai.budget_suggestions, year, month)


@router.get("/trend", response_model=None)
def trend(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    year, month = _period(conn, user["id"], year, month)
    return ai.run_and_log(conn, user["id"], "trend", ai.trend_and_forecast, year, month)


@router.get("/anomalies", response_model=None)
def anomalies(month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    year, month = _period(conn, user["id"], year, month)
    return {"anomalies": ai.run_and_log(conn, user["id"], "anomaly", ai.anomalies, year, month)}


@router.post("/qa", response_model=schemas.AIResponse)
def qa(data: schemas.AIQuestion, month: int = None, year: int = None, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    year, month = _period(conn, user["id"], year, month)
    result = ai.run_and_log(conn, user["id"], "qa", ai.answer_question, year, month, data.question)
    return {"text": result["text"], "data": result.get("data")}


@router.get("/logs")
def logs(conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.list_ai_requests(conn, user["id"])
