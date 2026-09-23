"""
Thao tác CRUD trên SQLite. Mọi hàm đều nhận `user_id` và lọc theo đó
(BR7 — người dùng chỉ được xem/sửa dữ liệu của chính mình).
"""
import sqlite3

from fastapi import HTTPException, status

import database
import schemas


def row_to_dict(row):
    return dict(row) if row else None


# ---------------- Users ----------------
def get_user_by_email(conn: sqlite3.Connection, email: str):
    return row_to_dict(conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone())


def create_user(conn: sqlite3.Connection, email: str, password_hash: str, full_name: str | None):
    cur = conn.execute(
        "INSERT INTO users (email, password_hash, full_name) VALUES (?,?,?)",
        (email, password_hash, full_name),
    )
    conn.commit()
    return get_user_by_id(conn, cur.lastrowid)


# F03 / Chương 5.3.2 báo cáo — mỗi tài khoản mới được khởi tạo sẵn bộ danh mục mặc định.
DEFAULT_CATEGORIES = [
    ("Ăn uống", "expense", "🍜", "#f65c6f"),
    ("Đi lại", "expense", "🛵", "#2fb0f8"),
    ("Mua sắm", "expense", "🛍️", "#8b6df2"),
    ("Giải trí", "expense", "🎮", "#f6a623"),
    ("Hóa đơn", "expense", "🧾", "#17b3ac"),
    ("Sức khỏe", "expense", "💊", "#ec6dab"),
    ("Giáo dục", "expense", "📚", "#5b8def"),
    ("Khác", "expense", "📦", "#8891ad"),
    ("Lương", "income", "💼", "#16b981"),
    ("Thưởng", "income", "🎁", "#f6a623"),
    ("Đầu tư", "income", "📈", "#8b6df2"),
    ("Thu nhập khác", "income", "💰", "#2fb0f8"),
]


def create_default_categories(conn, user_id: int):
    for name, type_, icon, color in DEFAULT_CATEGORIES:
        conn.execute(
            "INSERT INTO categories (user_id, name, type, icon, color) VALUES (?,?,?,?,?)",
            (user_id, name, type_, icon, color),
        )
    conn.commit()


def get_user_by_id(conn: sqlite3.Connection, user_id: int):
    return row_to_dict(conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone())


def update_user(conn: sqlite3.Connection, user_id: int, data: "schemas.UserUpdate"):
    updates = data.model_dump(exclude_unset=True, exclude_none=True)
    if "email" in updates:
        existing = get_user_by_email(conn, updates["email"])
        if existing and existing["id"] != user_id:
            raise HTTPException(status.HTTP_409_CONFLICT, "Email này đã được dùng bởi tài khoản khác")
    if updates:
        fields = ", ".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE users SET {fields} WHERE id=?", (*updates.values(), user_id))
        conn.commit()
    return get_user_by_id(conn, user_id)


def update_password(conn: sqlite3.Connection, user_id: int, new_password_hash: str):
    conn.execute("UPDATE users SET password_hash=? WHERE id=?", (new_password_hash, user_id))
    conn.commit()


# ---------------- Categories ----------------
def list_categories(conn, user_id: int, type_: str | None = None):
    if type_:
        rows = conn.execute("SELECT * FROM categories WHERE user_id=? AND type=? ORDER BY id", (user_id, type_)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM categories WHERE user_id=? ORDER BY id", (user_id,)).fetchall()
    return [row_to_dict(r) for r in rows]


def get_category(conn, user_id: int, category_id: int):
    row = conn.execute("SELECT * FROM categories WHERE id=? AND user_id=?", (category_id, user_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy danh mục")
    return row_to_dict(row)


def _category_name_taken(conn, user_id: int, name: str, type_: str, exclude_id: int | None = None) -> bool:
    """Kiểm tra trùng (user_id, name, type) trước khi ghi — tương ứng ràng buộc
    UNIQUE(user_id, name, type) ở database/schema.sql (mục 3.3 báo cáo)."""
    row = conn.execute(
        "SELECT id FROM categories WHERE user_id=? AND name=? AND type=?",
        (user_id, name, type_),
    ).fetchone()
    return bool(row) and row["id"] != exclude_id


def create_category(conn, user_id: int, data: schemas.CategoryCreate):
    if _category_name_taken(conn, user_id, data.name, data.type):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Danh mục "{data.name}" đã tồn tại')
    cur = conn.execute(
        "INSERT INTO categories (user_id, name, type, icon, color) VALUES (?,?,?,?,?)",
        (user_id, data.name, data.type, data.icon, data.color),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM categories WHERE id=?", (cur.lastrowid,)).fetchone())


def update_category(conn, user_id: int, category_id: int, data: schemas.CategoryCreate):
    get_category(conn, user_id, category_id)
    if _category_name_taken(conn, user_id, data.name, data.type, exclude_id=category_id):
        raise HTTPException(status.HTTP_409_CONFLICT, f'Danh mục "{data.name}" đã tồn tại')
    conn.execute(
        "UPDATE categories SET name=?, type=?, icon=?, color=? WHERE id=? AND user_id=?",
        (data.name, data.type, data.icon, data.color, category_id, user_id),
    )
    conn.commit()
    return get_category(conn, user_id, category_id)


def delete_category(conn, user_id: int, category_id: int):
    cat = get_category(conn, user_id, category_id)  # 404 nếu không thuộc user
    in_use = conn.execute("SELECT COUNT(*) c FROM transactions WHERE category_id=? AND user_id=?", (category_id, user_id)).fetchone()["c"]

    if in_use:
        # Chuyển các giao dịch đang thuộc danh mục này sang danh mục "Khác" cùng loại,
        # tránh vi phạm khóa ngoại và tránh mất dữ liệu giao dịch (giống hành vi ở frontend).
        fallback = conn.execute(
            "SELECT id FROM categories WHERE user_id=? AND type=? AND name='Khác' AND id!=?",
            (user_id, cat["type"], category_id),
        ).fetchone()
        if not fallback:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                f"Danh mục này đang có {in_use} giao dịch và không có danh mục \"Khác\" để chuyển sang. Hãy chuyển các giao dịch sang danh mục khác trước khi xóa.",
            )
        conn.execute("UPDATE transactions SET category_id=? WHERE category_id=? AND user_id=?", (fallback["id"], category_id, user_id))

    conn.execute("DELETE FROM budgets WHERE category_id=? AND user_id=?", (category_id, user_id))
    conn.execute("DELETE FROM categories WHERE id=? AND user_id=?", (category_id, user_id))
    conn.commit()
    return {"deleted": True, "affected_transactions": in_use}


# ---------------- Transactions ----------------
def list_transactions(conn, user_id: int, type_=None, category_id=None, month=None, year=None, q=None):
    sql = "SELECT * FROM transactions WHERE user_id=?"
    params = [user_id]
    if type_:
        sql += " AND type=?"; params.append(type_)
    if category_id:
        sql += " AND category_id=?"; params.append(category_id)
    if year:
        sql += f" AND {database.year_expr('txn_date')}=?"; params.append(str(year))
    if month:
        sql += f" AND {database.month_expr('txn_date')}=?"; params.append(f"{int(month):02d}")
    if q:
        sql += " AND note LIKE ?"; params.append(f"%{q}%")
    sql += " ORDER BY txn_date DESC, id DESC"
    rows = conn.execute(sql, params).fetchall()
    return [row_to_dict(r) for r in rows]


def create_transaction(conn, user_id: int, data: schemas.TransactionCreate):
    cat = get_category(conn, user_id, data.category_id)
    if cat["type"] != data.type:
        # BR3 — giao dịch phải thuộc đúng loại danh mục (thu/chi)
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Loại giao dịch không khớp với loại danh mục")
    cur = conn.execute(
        "INSERT INTO transactions (user_id, category_id, amount, type, note, account, txn_date) VALUES (?,?,?,?,?,?,?)",
        (user_id, data.category_id, data.amount, data.type, data.note, data.account, data.txn_date),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM transactions WHERE id=?", (cur.lastrowid,)).fetchone())


def get_transaction(conn, user_id: int, txn_id: int):
    row = conn.execute("SELECT * FROM transactions WHERE id=? AND user_id=?", (txn_id, user_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy giao dịch")
    return row_to_dict(row)


def update_transaction(conn, user_id: int, txn_id: int, data: schemas.TransactionUpdate):
    existing = get_transaction(conn, user_id, txn_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return existing
    if "category_id" in updates:
        get_category(conn, user_id, updates["category_id"])
    fields = ", ".join(f"{k}=?" for k in updates)
    conn.execute(f"UPDATE transactions SET {fields} WHERE id=? AND user_id=?", (*updates.values(), txn_id, user_id))
    conn.commit()
    return get_transaction(conn, user_id, txn_id)


def delete_transaction(conn, user_id: int, txn_id: int):
    get_transaction(conn, user_id, txn_id)
    conn.execute("DELETE FROM transactions WHERE id=? AND user_id=?", (txn_id, user_id))
    conn.commit()
    return {"deleted": True}


# ---------------- Budgets ----------------
def list_budgets(conn, user_id: int, month: int, year: int):
    month_pad = database.month_expr("t.txn_date")
    year_txt = database.year_expr("t.txn_date")
    b_year_txt = "CAST(b.year AS VARCHAR(4))" if database.DB_ENGINE == "sqlserver" else "CAST(b.year AS TEXT)"
    b_month_pad = (
        "RIGHT('0' + CAST(b.month AS VARCHAR(2)), 2)"
        if database.DB_ENGINE == "sqlserver"
        else "printf('%02d', b.month)"
    )
    rows = conn.execute(
        f"""SELECT b.*, c.name AS category_name, c.icon AS category_icon,
                  COALESCE((SELECT SUM(t.amount) FROM transactions t
                            WHERE t.user_id=b.user_id AND t.category_id=b.category_id
                              AND t.type='expense' AND {year_txt}={b_year_txt}
                              AND {month_pad}={b_month_pad}), 0) AS spent
           FROM budgets b JOIN categories c ON c.id=b.category_id
           WHERE b.user_id=? AND b.month=? AND b.year=?
           ORDER BY spent DESC""",
        (user_id, month, year),
    ).fetchall()
    result = []
    for r in rows:
        d = row_to_dict(r)
        d["used_pct"] = round((d["spent"] / d["limit_amount"] * 100), 1) if d["limit_amount"] else 0
        result.append(d)
    return result


def upsert_budget(conn, user_id: int, data: schemas.BudgetCreate):
    get_category(conn, user_id, data.category_id)
    existing = conn.execute(
        "SELECT id FROM budgets WHERE user_id=? AND category_id=? AND month=? AND year=?",
        (user_id, data.category_id, data.month, data.year),
    ).fetchone()
    if existing:
        # F07 — kiểm tra trùng: nếu đã có ngân sách cho kỳ này thì cập nhật hạn mức thay vì tạo trùng
        conn.execute("UPDATE budgets SET limit_amount=? WHERE id=?", (data.limit_amount, existing["id"]))
        budget_id = existing["id"]
    else:
        cur = conn.execute(
            "INSERT INTO budgets (user_id, category_id, month, year, limit_amount) VALUES (?,?,?,?,?)",
            (user_id, data.category_id, data.month, data.year, data.limit_amount),
        )
        budget_id = cur.lastrowid
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM budgets WHERE id=?", (budget_id,)).fetchone())


def delete_budget(conn, user_id: int, budget_id: int):
    row = conn.execute("SELECT * FROM budgets WHERE id=? AND user_id=?", (budget_id, user_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy ngân sách")
    conn.execute("DELETE FROM budgets WHERE id=? AND user_id=?", (budget_id, user_id))
    conn.commit()
    return {"deleted": True}


# ---------------- Savings goals ----------------
def list_goals(conn, user_id: int):
    rows = conn.execute("SELECT * FROM savings_goals WHERE user_id=? ORDER BY created_at", (user_id,)).fetchall()
    return [row_to_dict(r) for r in rows]


def create_goal(conn, user_id: int, data: schemas.GoalCreate):
    cur = conn.execute(
        "INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, deadline, emoji, note, priority) VALUES (?,?,?,?,?,?,?,?)",
        (user_id, data.name, data.target_amount, data.saved_amount, data.deadline, data.emoji, data.note, data.priority),
    )
    conn.commit()
    return row_to_dict(conn.execute("SELECT * FROM savings_goals WHERE id=?", (cur.lastrowid,)).fetchone())


def get_goal(conn, user_id: int, goal_id: int):
    row = conn.execute("SELECT * FROM savings_goals WHERE id=? AND user_id=?", (goal_id, user_id)).fetchone()
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Không tìm thấy mục tiêu")
    return row_to_dict(row)


def update_goal(conn, user_id: int, goal_id: int, data: schemas.GoalUpdate):
    get_goal(conn, user_id, goal_id)
    updates = data.model_dump(exclude_unset=True)
    if updates:
        fields = ", ".join(f"{k}=?" for k in updates)
        conn.execute(f"UPDATE savings_goals SET {fields} WHERE id=? AND user_id=?", (*updates.values(), goal_id, user_id))
        conn.commit()
    return get_goal(conn, user_id, goal_id)


def delete_goal(conn, user_id: int, goal_id: int):
    get_goal(conn, user_id, goal_id)
    conn.execute("DELETE FROM savings_goals WHERE id=? AND user_id=?", (goal_id, user_id))
    conn.commit()
    return {"deleted": True}


def latest_period(conn, user_id: int):
    """Kỳ (năm, tháng) gần nhất có giao dịch — dùng làm mặc định cho báo cáo/AI khi client không truyền year/month."""
    row = conn.execute("SELECT MAX(txn_date) d FROM transactions WHERE user_id=?", (user_id,)).fetchone()
    if not row or not row["d"]:
        from datetime import date
        today = date.today()
        return today.year, today.month
    return int(row["d"][:4]), int(row["d"][5:7])


# ---------------- Reports / aggregation (dữ liệu ĐÃ TỔNG HỢP dùng cho AI) ----------------
def compute_totals(conn, user_id: int, year: int, month: int):
    row = conn.execute(
        f"""SELECT
             COALESCE(SUM(CASE WHEN type='income' THEN amount END),0) AS income,
             COALESCE(SUM(CASE WHEN type='expense' THEN amount END),0) AS expense,
             COUNT(*) AS count
           FROM transactions
           WHERE user_id=? AND {database.year_expr('txn_date')}=? AND {database.month_expr('txn_date')}=?""",
        (user_id, str(year), f"{month:02d}"),
    ).fetchone()
    income, expense, count = row["income"], row["expense"], row["count"]
    balance = income - expense
    savings_rate = (balance / income * 100) if income else 0
    return {"income": income, "expense": expense, "balance": balance, "savings_rate": round(savings_rate, 1), "count": count}


def group_by_category(conn, user_id: int, year: int, month: int, type_: str):
    rows = conn.execute(
        f"""SELECT c.id AS category_id, c.name, c.icon, SUM(t.amount) AS amount
           FROM transactions t JOIN categories c ON c.id=t.category_id
           WHERE t.user_id=? AND t.type=? AND {database.year_expr('t.txn_date')}=? AND {database.month_expr('t.txn_date')}=?
           GROUP BY c.id, c.name, c.icon ORDER BY amount DESC""",
        (user_id, type_, str(year), f"{month:02d}"),
    ).fetchall()
    data = [row_to_dict(r) for r in rows]
    total = sum(d["amount"] for d in data) or 1
    for d in data:
        d["percent"] = round(d["amount"] / total * 100, 1)
    return data


def top_expenses(conn, user_id: int, year: int, month: int, limit: int = 5):
    # limit được chèn trực tiếp vào SQL bởi top_clause()/limit_clause() (không qua "?"),
    # vì SQL Server cần TOP (n) ngay sau SELECT còn SQLite cần LIMIT n ở cuối câu.
    params = [user_id, str(year), f"{month:02d}"]
    rows = conn.execute(
        f"""SELECT {database.top_clause(limit)}t.*, c.name AS category_name, c.icon AS category_icon FROM transactions t
           JOIN categories c ON c.id=t.category_id
           WHERE t.user_id=? AND t.type='expense' AND {database.year_expr('t.txn_date')}=? AND {database.month_expr('t.txn_date')}=?
           ORDER BY t.amount DESC{database.limit_clause(limit)}""",
        params,
    ).fetchall()
    return [row_to_dict(r) for r in rows]


def log_ai_request(conn, user_id: int, feature: str, model: str, request_summary: str, response: str, status_: str, latency_ms: int):
    conn.execute(
        "INSERT INTO ai_requests (user_id, feature, model, request_summary, response, status, latency_ms) VALUES (?,?,?,?,?,?,?)",
        (user_id, feature, model, request_summary[:500], (response or "")[:2000], status_, latency_ms),
    )
    conn.commit()


def list_ai_requests(conn, user_id: int, limit: int = 50):
    sql = (
        f"SELECT {database.top_clause(limit)}* FROM ai_requests WHERE user_id=? "
        f"ORDER BY created_at DESC{database.limit_clause(limit)}"
    )
    rows = conn.execute(sql, [user_id]).fetchall()
    return [row_to_dict(r) for r in rows]
