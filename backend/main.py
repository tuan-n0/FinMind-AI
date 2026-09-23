"""
FinMind AI — Backend API (FastAPI + SQLite)
Điểm vào ứng dụng: khởi tạo DB, seed dữ liệu mẫu (idempotent), gắn các router.

Chạy: uvicorn main:app --reload --port 8000   (hoặc dùng start.bat)
Tài liệu API tự sinh: http://localhost:8000/docs
"""
from contextlib import asynccontextmanager

from dotenv import load_dotenv

load_dotenv()  # phải chạy TRƯỚC khi import ai.py (đọc os.environ ở mức module)

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
import seed
from routers import ai_routes, auth_routes, budgets, categories, goals, reports, transactions


@asynccontextmanager
async def lifespan(app: FastAPI):
    database.init_db()
    conn = database.get_connection()
    try:
        seed.run(conn)
    finally:
        conn.close()
    yield


app = FastAPI(
    title="FinMind AI API",
    description="Backend cho Hệ thống quản lý chi tiêu cá nhân có tích hợp AI",
    version="1.0.0",
    lifespan=lifespan,
)

# Dev: cho phép frontend tĩnh (mở qua file:// hoặc http-server ở cổng khác) gọi API.
# Khi triển khai thật, nên giới hạn allow_origins về đúng domain frontend.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {"name": "FinMind AI API", "status": "ok", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}


app.include_router(auth_routes.router)
app.include_router(categories.router)
app.include_router(transactions.router)
app.include_router(budgets.router)
app.include_router(goals.router)
app.include_router(reports.router)
app.include_router(ai_routes.router)
