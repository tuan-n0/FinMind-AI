-- FinMind AI — Schema CSDL (SQLite)
-- Nguồn sự thật duy nhất cho cấu trúc bảng — được backend/database.py nạp
-- trực tiếp khi khởi động (init_db()), tránh trùng lặp/lệch schema.
-- Đối chiếu Chương 4.2 (Từ điển dữ liệu) của báo cáo.

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    icon TEXT,
    color TEXT,
    UNIQUE (user_id, name, type)
);

CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    amount REAL NOT NULL CHECK (amount > 0),
    type TEXT NOT NULL CHECK (type IN ('income','expense')),
    note TEXT,
    account TEXT,
    txn_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    category_id INTEGER NOT NULL REFERENCES categories(id),
    month INTEGER NOT NULL,
    year INTEGER NOT NULL,
    limit_amount REAL NOT NULL CHECK (limit_amount >= 0),
    UNIQUE (user_id, category_id, month, year)
);

CREATE TABLE IF NOT EXISTS savings_goals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    target_amount REAL NOT NULL CHECK (target_amount > 0),
    saved_amount REAL NOT NULL DEFAULT 0,
    deadline TEXT,
    emoji TEXT,
    note TEXT,
    priority TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Nhật ký gọi AI — phục vụ minh chứng/kiểm toán (NFR10). "model" ghi lại
-- model THỰC TẾ đã trả lời: tên model Ollama khi gọi LLM thật thành công,
-- hoặc "finmind-rule-engine-v1" khi rơi về rule-engine (Ollama lỗi/timeout).
CREATE TABLE IF NOT EXISTS ai_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    feature TEXT NOT NULL CHECK (feature IN ('report','budget','qa','trend','anomaly')),
    model TEXT NOT NULL,
    request_summary TEXT NOT NULL,
    response TEXT,
    status TEXT NOT NULL CHECK (status IN ('success','fallback','error')),
    latency_ms INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_requests_user_created ON ai_requests(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, txn_date);
