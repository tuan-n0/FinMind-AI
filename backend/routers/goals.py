"""F09 — Quản lý mục tiêu tiết kiệm."""
from fastapi import APIRouter, Depends

import auth
import crud
import database
import schemas

router = APIRouter(prefix="/api/goals", tags=["goals"])


@router.get("", response_model=list[schemas.GoalOut])
def list_goals(conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.list_goals(conn, user["id"])


@router.post("", response_model=schemas.GoalOut, status_code=201)
def create_goal(data: schemas.GoalCreate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.create_goal(conn, user["id"], data)


@router.patch("/{goal_id}", response_model=schemas.GoalOut)
def update_goal(goal_id: int, data: schemas.GoalUpdate, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.update_goal(conn, user["id"], goal_id, data)


@router.delete("/{goal_id}")
def delete_goal(goal_id: int, conn=Depends(database.get_db), user=Depends(auth.get_current_user)):
    return crud.delete_goal(conn, user["id"], goal_id)
