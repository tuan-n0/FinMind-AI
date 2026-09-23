"""
Tầng dữ liệu — hỗ trợ 2 công cụ CSDL, chọn qua biến môi trường FINMIND_DB_ENGINE:
  - "sqlite"    (mặc định) — SQLite thuần, không ORM, dùng file .db cục bộ.
  - "sqlserver" — Microsoft SQL Server qua pyodbc (Windows Authentication mặc định).
Cả 2 chế độ dùng chung crud.py/main.py — object trả về từ get_connection() đều
hỗ trợ .execute(sql, params) trả về cursor có .fetchone()/.fetchall() với các
dòng truy cập được như dict (giống sqlite3.Row), nên phần còn lại của backend
không cần biết đang chạy trên engine nào.
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_ENGINE = os.environ.get("FINMIND_DB_ENGINE", "sqlite").strip().lower()

SQLITE_SCHEMA_FILE = os.path.join(BASE_DIR, "..", "database", "schema.sql")
SQLSERVER_SCHEMA_FILE = os.path.join(BASE_DIR, "..", "database", "schema_sqlserver.sql")

# Cho phép ghi đè vị trí file CSDL SQLite qua biến môi trường (vd. trỏ vào volume khi chạy Docker)
DB_PATH = os.environ.get("FINMIND_DB_PATH") or os.path.join(BASE_DIR, "chitieu.db")

# Cấu hình kết nối SQL Server (mặc định: instance mặc định trên máy cục bộ, Windows Authentication)
SQLSERVER_SERVER = os.environ.get("FINMIND_SQLSERVER_SERVER", "localhost")
SQLSERVER_DATABASE = os.environ.get("FINMIND_SQLSERVER_DATABASE", "finmind_ai")
SQLSERVER_DRIVER = os.environ.get("FINMIND_SQLSERVER_DRIVER", "ODBC Driver 17 for SQL Server")
SQLSERVER_UID = os.environ.get("FINMIND_SQLSERVER_UID")  # để trống -> dùng Windows Authentication
SQLSERVER_PWD = os.environ.get("FINMIND_SQLSERVER_PWD")


def year_expr(col: str) -> str:
    """Biểu thức SQL trả về năm của cột ngày dạng chuỗi (VD '2026'), tương thích cả 2 engine."""
    if DB_ENGINE == "sqlserver":
        return f"CAST(YEAR({col}) AS VARCHAR(4))"
    return f"strftime('%Y', {col})"


def month_expr(col: str) -> str:
    """Biểu thức SQL trả về tháng của cột ngày dạng chuỗi 2 số (VD '03'), tương thích cả 2 engine."""
    if DB_ENGINE == "sqlserver":
        return f"RIGHT('0' + CAST(MONTH({col}) AS VARCHAR(2)), 2)"
    return f"strftime('%m', {col})"


def top_clause(n: int) -> str:
    """SQL Server dùng TOP (n) ngay sau SELECT; SQLite dùng LIMIT n ở cuối câu — trả về phần
    cần chèn ngay sau SELECT (rỗng với SQLite, phần LIMIT tự thêm riêng ở cuối bởi caller)."""
    return f"TOP ({int(n)}) " if DB_ENGINE == "sqlserver" else ""


def limit_clause(n: int) -> str:
    """Phần LIMIT n ở cuối câu — chỉ áp dụng cho SQLite (SQL Server dùng top_clause ở đầu)."""
    return "" if DB_ENGINE == "sqlserver" else f" LIMIT {int(n)}"


# ---------------------------------------------------------------------------
# SQLite
# ---------------------------------------------------------------------------
def _sqlite_connect(db_path: str = None):
    import sqlite3

    resolved_path = db_path or DB_PATH
    parent = os.path.dirname(resolved_path)
    if parent:
        os.makedirs(parent, exist_ok=True)
    conn = sqlite3.connect(resolved_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _sqlite_init(db_path: str = None):
    conn = _sqlite_connect(db_path)
    with open(SQLITE_SCHEMA_FILE, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# SQL Server — wrapper mỏng để crud.py dùng conn.execute(...) giống sqlite3
# ---------------------------------------------------------------------------
class _MssqlRow:
    """Bọc 1 dòng kết quả pyodbc để truy cập được kiểu dict: row["ten_cot"]."""

    __slots__ = ("_cols", "_values")

    def __init__(self, cols, values):
        self._cols = cols
        self._values = values

    def __getitem__(self, key):
        if isinstance(key, str):
            return self._values[self._cols.index(key)]
        return self._values[key]

    def keys(self):
        return list(self._cols)

    def __iter__(self):
        return iter(self.keys())

    def __repr__(self):
        return repr(dict(self))


def _mssql_run(raw_cursor, sql, params):
    """Chạy 1 câu lệnh trên cursor pyodbc thô; nếu là INSERT thì tự chèn
    OUTPUT INSERTED.id để lấy id vừa tạo trong CÙNG câu lệnh (mọi bảng của dự án
    đều dùng "id" làm khóa chính IDENTITY) — KHÔNG dùng SELECT SCOPE_IDENTITY()
    ở một execute() riêng, vì pyodbc gửi mỗi execute() như một scope/batch riêng
    nên SCOPE_IDENTITY() sẽ trả về NULL. Trả về (cols, lastrowid)."""
    upper = sql.strip().upper()
    is_insert = upper.startswith("INSERT INTO") and " OUTPUT " not in upper
    if is_insert:
        idx = sql.upper().index(" VALUES ")
        sql = sql[:idx] + " OUTPUT INSERTED.id" + sql[idx:]
    if params:
        raw_cursor.execute(sql, tuple(params))
    else:
        raw_cursor.execute(sql)
    lastrowid = None
    cols = [c[0] for c in raw_cursor.description] if raw_cursor.description else None
    if is_insert:
        row = raw_cursor.fetchone()  # đọc ngay, trước khi caller kịp commit() — tránh mất kết quả OUTPUT
        lastrowid = row[0] if row else None
        cols = None
    return cols, lastrowid


class _MssqlCursor:
    """Trả về từ conn.execute(...) HOẶC conn.cursor() — hỗ trợ cả gọi execute() một
    lần (crud.py) lẫn tái sử dụng cùng 1 cursor cho nhiều execute() liên tiếp (seed.py),
    giống hệt cách dùng sqlite3.Cursor."""

    def __init__(self, raw_cursor):
        self._cur = raw_cursor
        self._cols = None
        self._lastrowid = None

    def execute(self, sql, params=()):
        self._cols, self._lastrowid = _mssql_run(self._cur, sql, params)
        return self

    def fetchone(self):
        row = self._cur.fetchone()
        return _MssqlRow(self._cols, list(row)) if row is not None else None

    def fetchall(self):
        return [_MssqlRow(self._cols, list(r)) for r in self._cur.fetchall()]

    @property
    def lastrowid(self):
        return self._lastrowid


class _MssqlConnection:
    """Bọc pyodbc.Connection để có .execute(sql, params) và .cursor() như sqlite3.Connection
    (pyodbc dùng '?' làm paramstyle mặc định giống sqlite3 nên không cần đổi placeholder)."""

    def __init__(self, raw_conn):
        self._conn = raw_conn

    def cursor(self) -> _MssqlCursor:
        return _MssqlCursor(self._conn.cursor())

    def execute(self, sql, params=()):
        return self.cursor().execute(sql, params)

    def executescript(self, script: str):
        # pyodbc chỉ chạy được 1 câu lệnh mỗi execute() — tách theo dòng trống.
        cur = self._conn.cursor()
        for stmt in [s.strip() for s in script.split("\n\n") if s.strip()]:
            cur.execute(stmt)

    def commit(self):
        self._conn.commit()

    def close(self):
        self._conn.close()


def _mssql_conn_str(database_name: str) -> str:
    parts = [
        f"DRIVER={{{SQLSERVER_DRIVER}}}",
        f"SERVER={SQLSERVER_SERVER}",
        f"DATABASE={database_name}",
    ]
    if SQLSERVER_UID:
        parts.append(f"UID={SQLSERVER_UID}")
        parts.append(f"PWD={SQLSERVER_PWD or ''}")
    else:
        parts.append("Trusted_Connection=yes")  # Windows Authentication
    return ";".join(parts) + ";"


def _mssql_connect() -> _MssqlConnection:
    import pyodbc

    raw = pyodbc.connect(_mssql_conn_str(SQLSERVER_DATABASE), autocommit=False)
    return _MssqlConnection(raw)


def _mssql_ensure_database():
    """Tạo database SQLSERVER_DATABASE nếu chưa tồn tại (kết nối tạm vào 'master')."""
    import pyodbc

    raw = pyodbc.connect(_mssql_conn_str("master"), autocommit=True)
    cur = raw.cursor()
    cur.execute("SELECT database_id FROM sys.databases WHERE name = ?", (SQLSERVER_DATABASE,))
    if cur.fetchone() is None:
        cur.execute(f"CREATE DATABASE [{SQLSERVER_DATABASE}]")
    raw.close()


def _mssql_init():
    _mssql_ensure_database()
    conn = _mssql_connect()
    with open(SQLSERVER_SCHEMA_FILE, "r", encoding="utf-8") as f:
        conn.executescript(f.read())
    conn.commit()
    conn.close()


# ---------------------------------------------------------------------------
# API dùng chung (main.py / crud.py / seed.py gọi các hàm này, không quan tâm engine)
# ---------------------------------------------------------------------------
def get_connection(db_path: str = None):
    if DB_ENGINE == "sqlserver":
        return _mssql_connect()
    return _sqlite_connect(db_path)


def init_db(db_path: str = None):
    if DB_ENGINE == "sqlserver":
        _mssql_init()
    else:
        _sqlite_init(db_path)


def is_empty(conn) -> bool:
    row = conn.execute("SELECT COUNT(*) AS c FROM users").fetchone()
    return row["c"] == 0


def get_db():
    """FastAPI dependency — một kết nối CSDL riêng cho mỗi request."""
    conn = get_connection()
    try:
        yield conn
    finally:
        conn.close()
