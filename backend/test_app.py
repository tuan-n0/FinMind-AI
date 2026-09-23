"""
Kiểm thử backend — bao phủ auth, CRUD, các Business Rule (BR1-BR8) và AI (Chương 6).
Chạy: pytest -v
"""
import os
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database

database.DB_PATH = os.path.join(tempfile.gettempdir(), "finmind_test.db")
if os.path.exists(database.DB_PATH):
    os.remove(database.DB_PATH)

import pytest
from fastapi.testclient import TestClient

import crud
import seed
from main import app

database.init_db()
conn = database.get_connection()
seed.run(conn)
conn.close()

client = TestClient(app)


def register(email="user_a@test.com", password="password123"):
    r = client.post("/api/auth/register", json={"email": email, "password": password, "full_name": "Test User"})
    assert r.status_code == 201, r.text
    return r.json()["access_token"]


def auth_headers(token):
    return {"Authorization": f"Bearer {token}"}


def test_register_and_login():
    token = register("register_test@test.com")
    assert token
    r = client.post("/api/auth/login", json={"email": "register_test@test.com", "password": "password123"})
    assert r.status_code == 200
    assert r.json()["user"]["email"] == "register_test@test.com"


def test_new_account_has_12_default_categories():
    # Chương 5.3.2 báo cáo — mỗi tài khoản mới được khởi tạo sẵn bộ danh mục mặc định.
    token = register("defaultcats@test.com")
    headers = auth_headers(token)
    cats = client.get("/api/categories", headers=headers).json()
    assert len(cats) == 12
    names = {c["name"] for c in cats}
    assert names == {
        "Ăn uống", "Đi lại", "Mua sắm", "Giải trí", "Hóa đơn", "Sức khỏe",
        "Giáo dục", "Khác", "Lương", "Thưởng", "Đầu tư", "Thu nhập khác",
    }


def test_duplicate_category_name_rejected():
    token = register("dupcat@test.com")
    headers = auth_headers(token)
    # "Ăn uống"/expense đã tồn tại sẵn từ bộ mặc định -> tạo lại phải bị từ chối (UNIQUE user_id,name,type).
    r = client.post("/api/categories", json={"name": "Ăn uống", "type": "expense", "icon": "🍜"}, headers=headers)
    assert r.status_code == 409


def test_duplicate_register_rejected():
    register("dup@test.com")
    r = client.post("/api/auth/register", json={"email": "dup@test.com", "password": "password123"})
    assert r.status_code == 409


def test_login_wrong_password_rejected():
    register("wrongpw@test.com")
    r = client.post("/api/auth/login", json={"email": "wrongpw@test.com", "password": "sai-mat-khau"})
    assert r.status_code == 401


def test_transaction_amount_must_be_positive():
    token = register("br1@test.com")
    headers = auth_headers(token)
    cat = client.post("/api/categories", json={"name": "Ăn uống BR1", "type": "expense", "icon": "🍜"}, headers=headers).json()
    r = client.post("/api/transactions", json={
        "category_id": cat["id"], "amount": -50000, "type": "expense", "txn_date": "2024-05-01",
    }, headers=headers)
    assert r.status_code == 422  # BR1


def test_transaction_type_must_match_category_type():
    token = register("br3@test.com")
    headers = auth_headers(token)
    cat = client.post("/api/categories", json={"name": "Ăn uống BR3", "type": "expense", "icon": "🍜"}, headers=headers).json()
    r = client.post("/api/transactions", json={
        "category_id": cat["id"], "amount": 50000, "type": "income", "txn_date": "2024-05-01",
    }, headers=headers)
    assert r.status_code == 400  # BR3


def test_budget_limit_cannot_be_negative():
    token = register("br4@test.com")
    headers = auth_headers(token)
    cat = client.post("/api/categories", json={"name": "Đi lại BR4", "type": "expense", "icon": "🛵"}, headers=headers).json()
    r = client.post("/api/budgets", json={"category_id": cat["id"], "month": 5, "year": 2024, "limit_amount": -1}, headers=headers)
    assert r.status_code == 422  # BR4


def test_category_update():
    token = register("catupdate@test.com")
    headers = auth_headers(token)
    cat = client.post("/api/categories", json={"name": "Ăn uống Update", "type": "expense", "icon": "🍜", "color": "#f65c6f"}, headers=headers).json()
    r = client.patch(f"/api/categories/{cat['id']}", json={"name": "Ăn ngoài", "type": "expense", "icon": "🍔", "color": "#ff0000"}, headers=headers)
    assert r.status_code == 200
    assert r.json()["name"] == "Ăn ngoài"


def test_delete_category_reassigns_transactions_to_khac():
    token = register("catdelete@test.com")
    headers = auth_headers(token)
    an_uong = client.post("/api/categories", json={"name": "Ăn uống Delete", "type": "expense", "icon": "🍜"}, headers=headers).json()
    # "Khác" đã tự có sẵn từ bộ danh mục mặc định khi đăng ký (Chương 5.3.2 báo cáo) — lấy lại, không tạo mới.
    khac = next(c for c in client.get("/api/categories?type=expense", headers=headers).json() if c["name"] == "Khác")
    txn = client.post("/api/transactions", json={
        "category_id": an_uong["id"], "amount": 50000, "type": "expense", "txn_date": "2024-05-01",
    }, headers=headers).json()

    r = client.delete(f"/api/categories/{an_uong['id']}", headers=headers)
    assert r.status_code == 200
    assert r.json()["affected_transactions"] == 1

    updated = client.get("/api/transactions", headers=headers).json()
    moved = next(t for t in updated if t["id"] == txn["id"])
    assert moved["category_id"] == khac["id"]


def test_goal_requires_target_and_deadline():
    token = register("br6@test.com")
    headers = auth_headers(token)
    r = client.post("/api/goals", json={"name": "Mua xe", "target_amount": 0, "deadline": "2025-01-01"}, headers=headers)
    assert r.status_code == 422  # target phải > 0
    r2 = client.post("/api/goals", json={"name": "Mua xe", "target_amount": 1000000, "deadline": ""}, headers=headers)
    assert r2.status_code == 422  # deadline bắt buộc


def test_ownership_isolation_between_users():
    token_a = register("owner_a@test.com")
    token_b = register("owner_b@test.com")
    headers_a, headers_b = auth_headers(token_a), auth_headers(token_b)

    cat = client.post("/api/categories", json={"name": "Ăn uống Owner", "type": "expense", "icon": "🍜"}, headers=headers_a).json()
    txn = client.post("/api/transactions", json={
        "category_id": cat["id"], "amount": 100000, "type": "expense", "txn_date": "2024-05-01",
    }, headers=headers_a).json()

    # BR7 — user B không được thấy / sửa / xóa giao dịch của user A
    listing_b = client.get("/api/transactions", headers=headers_b).json()
    assert all(t["id"] != txn["id"] for t in listing_b)

    r_delete = client.delete(f"/api/transactions/{txn['id']}", headers=headers_b)
    assert r_delete.status_code == 404


def test_unauthenticated_request_rejected():
    r = client.get("/api/transactions")
    assert r.status_code == 401


def test_ai_summary_on_empty_account_has_no_fabricated_numbers():
    token = register("empty_ai@test.com")
    r = client.get("/api/ai/summary", headers=auth_headers(token))
    assert r.status_code == 200
    data = r.json()
    assert "Chưa có đủ dữ liệu" in data["summary"]
    assert data["highlights"] == []


def test_ai_summary_matches_seeded_demo_data():
    # Đăng nhập bằng tài khoản demo đã được seed sẵn (đồng bộ với frontend js/data.js)
    r = client.post("/api/auth/login", json={"email": seed.DEMO_EMAIL, "password": seed.DEMO_PASSWORD})
    assert r.status_code == 200
    headers = auth_headers(r.json()["access_token"])

    report = client.get("/api/reports/summary", params={"year": 2024, "month": 5}, headers=headers).json()
    assert report["totals"]["income"] == 28450000
    assert report["totals"]["expense"] == 18200000
    assert report["by_category_expense"][0]["name"] == "Ăn uống"

    ai_summary = client.get("/api/ai/summary", params={"year": 2024, "month": 5}, headers=headers).json()
    assert "Ăn uống" in ai_summary["summary"]

    qa = client.post("/api/ai/qa", params={"year": 2024, "month": 5}, json={"question": "Tháng này tôi chi nhiều nhất vào đâu?"}, headers=headers)
    assert qa.status_code == 200
    assert "Ăn uống" in qa.json()["text"]

    logs = client.get("/api/ai/logs", headers=headers).json()
    assert len(logs) >= 2  # summary + qa đã được ghi vào ai_requests
    # status luôn phải là "success" (gọi được Ollama thật) hoặc "fallback" (rơi về
    # rule-engine nội bộ khi Ollama không chạy/lỗi/timeout) — không bao giờ "error"
    # cho các câu hỏi hợp lệ này, dù máy chạy test có cài Ollama hay không (Chương 4.8).
    assert all(log["status"] in ("success", "fallback") for log in logs)
    for log in logs:
        if log["status"] == "success":
            assert log["model"] != "finmind-rule-engine-v1"
        else:
            assert log["model"] == "finmind-rule-engine-v1"


def test_ai_qa_covers_comparison_goal_and_plan_questions():
    """Bao phủ các nhánh Q&A: so sánh tháng trước, mục tiêu, lập kế hoạch (từng bị bỏ sót khi port sang Python)."""
    r = client.post("/api/auth/login", json={"email": seed.DEMO_EMAIL, "password": seed.DEMO_PASSWORD})
    headers = auth_headers(r.json()["access_token"])
    params = {"year": 2024, "month": 5}

    compare = client.post("/api/ai/qa", params=params, json={"question": "So sánh với tháng trước"}, headers=headers).json()
    assert "%" in compare["text"]

    goal = client.post("/api/ai/qa", params=params, json={"question": "Mục tiêu nào tôi sắp hoàn thành nhất?"}, headers=headers).json()
    assert "Quỹ khẩn cấp" in goal["text"]

    plan = client.post("/api/ai/qa", params=params, json={"question": "Lập kế hoạch tháng tới"}, headers=headers).json()
    assert "Dự báo" in plan["text"]


def test_ai_qa_handles_first_month_with_no_prior_history():
    """Biên: tháng đầu tiên có dữ liệu (tháng 3/2024) không có tháng trước để so sánh -> phải trả lời rõ ràng, không crash."""
    r = client.post("/api/auth/login", json={"email": seed.DEMO_EMAIL, "password": seed.DEMO_PASSWORD})
    headers = auth_headers(r.json()["access_token"])
    compare = client.post("/api/ai/qa", params={"year": 2024, "month": 3}, json={"question": "So sánh với tháng trước"}, headers=headers)
    assert compare.status_code == 200
    assert "Chưa có dữ liệu" in compare.json()["text"]
