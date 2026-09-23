-- FinMind AI — Schema CSDL (SQL Server / T-SQL)
-- Bản chuyển đổi 1:1 từ database/schema.sql (SQLite) sang cú pháp T-SQL,
-- dùng khi chạy backend với FINMIND_DB_ENGINE=sqlserver.
-- Đối chiếu Chương 4.2 (Từ điển dữ liệu) của báo cáo — cùng cấu trúc bảng,
-- chỉ khác kiểu dữ liệu/cú pháp cho phù hợp SQL Server.

IF OBJECT_ID('dbo.users', 'U') IS NULL
CREATE TABLE dbo.users (
    id INT IDENTITY(1,1) PRIMARY KEY,
    email NVARCHAR(255) UNIQUE NOT NULL,
    password_hash NVARCHAR(255) NOT NULL,
    full_name NVARCHAR(255) NULL,
    created_at NVARCHAR(30) NOT NULL DEFAULT CONVERT(NVARCHAR(30), SYSDATETIME(), 120)
);

IF OBJECT_ID('dbo.categories', 'U') IS NULL
CREATE TABLE dbo.categories (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    type NVARCHAR(20) NOT NULL CHECK (type IN ('income','expense')),
    icon NVARCHAR(50) NULL,
    color NVARCHAR(20) NULL,
    CONSTRAINT uq_categories_user_name_type UNIQUE (user_id, name, type)
);

IF OBJECT_ID('dbo.transactions', 'U') IS NULL
CREATE TABLE dbo.transactions (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES dbo.categories(id),
    amount DECIMAL(18,2) NOT NULL CHECK (amount > 0),
    type NVARCHAR(20) NOT NULL CHECK (type IN ('income','expense')),
    note NVARCHAR(1000) NULL,
    account NVARCHAR(100) NULL,
    txn_date NVARCHAR(20) NOT NULL,
    created_at NVARCHAR(30) NOT NULL DEFAULT CONVERT(NVARCHAR(30), SYSDATETIME(), 120)
);

IF OBJECT_ID('dbo.budgets', 'U') IS NULL
CREATE TABLE dbo.budgets (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    category_id INT NOT NULL REFERENCES dbo.categories(id),
    month INT NOT NULL,
    year INT NOT NULL,
    limit_amount DECIMAL(18,2) NOT NULL CHECK (limit_amount >= 0),
    CONSTRAINT uq_budgets_period UNIQUE (user_id, category_id, month, year)
);

IF OBJECT_ID('dbo.savings_goals', 'U') IS NULL
CREATE TABLE dbo.savings_goals (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    name NVARCHAR(255) NOT NULL,
    target_amount DECIMAL(18,2) NOT NULL CHECK (target_amount > 0),
    saved_amount DECIMAL(18,2) NOT NULL DEFAULT 0,
    deadline NVARCHAR(20) NULL,
    emoji NVARCHAR(20) NULL,
    note NVARCHAR(1000) NULL,
    priority NVARCHAR(20) NULL,
    created_at NVARCHAR(30) NOT NULL DEFAULT CONVERT(NVARCHAR(30), SYSDATETIME(), 120)
);

-- Nhật ký gọi AI — phục vụ minh chứng/kiểm toán (NFR10). "model" ghi lại
-- model THỰC TẾ đã trả lời: tên model Ollama khi gọi LLM thật thành công,
-- hoặc "finmind-rule-engine-v1" khi rơi về rule-engine (Ollama lỗi/timeout).
IF OBJECT_ID('dbo.ai_requests', 'U') IS NULL
CREATE TABLE dbo.ai_requests (
    id INT IDENTITY(1,1) PRIMARY KEY,
    user_id INT NOT NULL REFERENCES dbo.users(id) ON DELETE CASCADE,
    feature NVARCHAR(20) NOT NULL CHECK (feature IN ('report','budget','qa','trend','anomaly')),
    model NVARCHAR(100) NOT NULL,
    request_summary NVARCHAR(500) NOT NULL,
    response NVARCHAR(2000) NULL,
    status NVARCHAR(20) NOT NULL CHECK (status IN ('success','fallback','error')),
    latency_ms INT NULL,
    created_at NVARCHAR(30) NOT NULL DEFAULT CONVERT(NVARCHAR(30), SYSDATETIME(), 120)
);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_ai_requests_user_created')
    CREATE INDEX idx_ai_requests_user_created ON dbo.ai_requests(user_id, created_at);

IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'idx_transactions_user_date')
    CREATE INDEX idx_transactions_user_date ON dbo.transactions(user_id, txn_date);
