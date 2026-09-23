"""
Sao lưu / khôi phục CSDL SQLite (chitieu.db) — đáp ứng yêu cầu "có cơ chế
sao lưu định kỳ và khôi phục khi có sự cố" (NFR05).

Dùng sqlite3.Connection.backup() thay vì copy file thô, để tránh sao lưu
dở dang khi CSDL đang được ghi (an toàn hơn với ứng dụng đang chạy).

Chạy:
    python database/backup.py backup                # tạo bản sao lưu có timestamp
    python database/backup.py restore <đường_dẫn>    # khôi phục từ 1 bản sao lưu
    python database/backup.py list                     # liệt kê các bản sao lưu hiện có
"""
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

if sys.stdout.encoding != "utf-8":  # Console mặc định của Windows (cp1258/cp1252) không in được tiếng Việt
    sys.stdout.reconfigure(encoding="utf-8")

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR.parent / "backend" / "chitieu.db"
BACKUP_DIR = BASE_DIR / "backups"


def backup():
    if not DB_PATH.exists():
        print(f"Không tìm thấy CSDL tại {DB_PATH}. Hãy chạy backend ít nhất 1 lần trước.")
        sys.exit(1)

    BACKUP_DIR.mkdir(exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    dest = BACKUP_DIR / f"chitieu_{timestamp}.db"

    src_conn = sqlite3.connect(DB_PATH)
    dest_conn = sqlite3.connect(dest)
    with dest_conn:
        src_conn.backup(dest_conn)
    src_conn.close()
    dest_conn.close()

    print(f"Đã sao lưu vào: {dest}")


def restore(backup_file: str):
    src = Path(backup_file)
    if not src.exists():
        print(f"Không tìm thấy file sao lưu: {src}")
        sys.exit(1)

    if DB_PATH.exists():
        safety_copy = DB_PATH.with_suffix(".db.before-restore")
        shutil.copy2(DB_PATH, safety_copy)
        print(f"Đã lưu bản hiện tại sang {safety_copy} trước khi khôi phục (phòng khôi phục nhầm).")

    src_conn = sqlite3.connect(src)
    dest_conn = sqlite3.connect(DB_PATH)
    with dest_conn:
        src_conn.backup(dest_conn)
    src_conn.close()
    dest_conn.close()

    print(f"Đã khôi phục CSDL từ: {src}")
    print("Hãy khởi động lại backend (uvicorn) để áp dụng.")


def list_backups():
    if not BACKUP_DIR.exists() or not any(BACKUP_DIR.glob("*.db")):
        print("Chưa có bản sao lưu nào. Chạy `python database/backup.py backup` để tạo.")
        return
    for f in sorted(BACKUP_DIR.glob("*.db")):
        size_kb = f.stat().st_size / 1024
        print(f"  {f.name}  ({size_kb:.1f} KB)")


if __name__ == "__main__":
    if len(sys.argv) < 2 or sys.argv[1] not in ("backup", "restore", "list"):
        print(__doc__)
        sys.exit(1)

    command = sys.argv[1]
    if command == "backup":
        backup()
    elif command == "list":
        list_backups()
    elif command == "restore":
        if len(sys.argv) < 3:
            print("Thiếu đường dẫn file sao lưu. Dùng: python database/backup.py restore <đường_dẫn>")
            sys.exit(1)
        restore(sys.argv[2])
