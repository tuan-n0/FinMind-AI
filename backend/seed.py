"""
Seed dữ liệu mẫu cho backend — cùng một bộ dữ liệu với frontend (js/data.js)
để hai phần nhất quán khi demo / đối chiếu (Chương 7 của báo cáo).
Idempotent: chỉ chạy khi bảng users đang rỗng.
"""
import sys

import database
from auth import hash_password

DEMO_EMAIL = "tuan.ngo@finmind.vn"
DEMO_PASSWORD = "finmind123"
DEMO_NAME = "Ngô Anh Tuấn"

CATEGORIES = [
    ("an-uong", "Ăn uống", "expense", "🍜", "#f65c6f"),
    ("di-lai", "Đi lại", "expense", "🛵", "#2fb0f8"),
    ("mua-sam", "Mua sắm", "expense", "🛍️", "#8b6df2"),
    ("giai-tri", "Giải trí", "expense", "🎮", "#f6a623"),
    ("hoa-don", "Hóa đơn", "expense", "🧾", "#17b3ac"),
    ("suc-khoe", "Sức khỏe", "expense", "💊", "#ec6dab"),
    ("giao-duc", "Giáo dục", "expense", "📚", "#5b8def"),
    ("khac-chi", "Khác", "expense", "📦", "#8891ad"),
    ("luong", "Lương", "income", "💼", "#16b981"),
    ("thuong", "Thưởng", "income", "🎁", "#f6a623"),
    ("dau-tu", "Đầu tư", "income", "📈", "#8b6df2"),
    ("thu-khac", "Thu nhập khác", "income", "💰", "#2fb0f8"),
]

# (category_key, amount, note, date, account)
TRANSACTIONS = [
    ("luong", 18000000, "Lương tháng 5", "2024-05-30", "Vietcombank"),
    ("thuong", 4500000, "Thưởng hoàn thành dự án", "2024-05-25", "Vietcombank"),
    ("dau-tu", 1800000, "Lãi đầu tư chứng khoán", "2024-05-20", "Vietcombank"),
    ("dau-tu", 1000000, "Cổ tức quỹ đầu tư", "2024-05-15", "Vietcombank"),
    ("thu-khac", 2200000, "Freelance thiết kế", "2024-05-18", "Momo"),
    ("thu-khac", 250000, "Hoàn tiền cashback thẻ", "2024-05-10", "Thẻ tín dụng"),
    ("thu-khac", 700000, "Bán đồ cũ online", "2024-05-05", "Momo"),

    ("an-uong", 450000, "Siêu thị Co.opmart", "2024-05-31", "Thẻ tín dụng"),
    ("an-uong", 45000, "Cơm trưa văn phòng", "2024-05-30", "Tiền mặt"),
    ("an-uong", 75000, "Cà phê Highlands", "2024-05-29", "Momo"),
    ("an-uong", 55000, "Trà sữa TocoToco", "2024-05-28", "Momo"),
    ("an-uong", 620000, "Ăn tối nhà hàng", "2024-05-27", "Thẻ tín dụng"),
    ("an-uong", 380000, "Siêu thị Bách Hóa Xanh", "2024-05-25", "Tiền mặt"),
    ("an-uong", 120000, "Đặt món GrabFood", "2024-05-24", "Momo"),
    ("an-uong", 45000, "Cơm trưa văn phòng", "2024-05-23", "Tiền mặt"),
    ("an-uong", 35000, "Cà phê sáng", "2024-05-22", "Tiền mặt"),
    ("an-uong", 180000, "Ăn vặt cuối tuần", "2024-05-20", "Momo"),
    ("an-uong", 520000, "Siêu thị Co.opmart", "2024-05-18", "Thẻ tín dụng"),
    ("an-uong", 850000, "Lẩu cuối tuần với bạn", "2024-05-17", "Thẻ tín dụng"),
    ("an-uong", 75000, "Cà phê Highlands", "2024-05-15", "Momo"),
    ("an-uong", 225000, "Cơm trưa văn phòng (tuần)", "2024-05-13", "Tiền mặt"),
    ("an-uong", 500000, "Sinh nhật bạn - nhà hàng", "2024-05-11", "Thẻ tín dụng"),
    ("an-uong", 400000, "Chợ thực phẩm tuần", "2024-05-10", "Tiền mặt"),
    ("an-uong", 40000, "Ăn sáng phở", "2024-05-08", "Tiền mặt"),
    ("an-uong", 610000, "Siêu thị mua đồ tuần", "2024-05-06", "Thẻ tín dụng"),
    ("an-uong", 55000, "Trà sữa", "2024-05-04", "Momo"),
    ("an-uong", 720000, "Ăn tối gia đình", "2024-05-02", "Thẻ tín dụng"),

    ("di-lai", 45000, "GrabBike", "2024-05-31", "Momo"),
    ("di-lai", 120000, "Đổ xăng", "2024-05-29", "Tiền mặt"),
    ("di-lai", 38000, "GrabBike", "2024-05-27", "Momo"),
    ("di-lai", 150000, "Gửi xe tháng", "2024-05-25", "Tiền mặt"),
    ("di-lai", 130000, "Đổ xăng", "2024-05-22", "Tiền mặt"),
    ("di-lai", 350000, "Taxi sân bay", "2024-05-20", "Thẻ tín dụng"),
    ("di-lai", 42000, "GrabBike", "2024-05-18", "Momo"),
    ("di-lai", 450000, "Vé xe khách về quê", "2024-05-15", "Tiền mặt"),
    ("di-lai", 1040000, "Sửa xe + thay lốp", "2024-05-14", "Thẻ tín dụng"),
    ("di-lai", 125000, "Đổ xăng", "2024-05-12", "Tiền mặt"),
    ("di-lai", 40000, "GrabBike", "2024-05-09", "Momo"),
    ("di-lai", 120000, "Đổ xăng", "2024-05-03", "Tiền mặt"),

    ("mua-sam", 850000, "Mua sắm Shopee", "2024-05-25", "Thẻ tín dụng"),
    ("mua-sam", 320000, "Sách trên Tiki", "2024-05-20", "Thẻ tín dụng"),
    ("mua-sam", 680000, "Quần áo mùa hè", "2024-05-16", "Thẻ tín dụng"),
    ("mua-sam", 450000, "Đồ gia dụng", "2024-05-10", "Momo"),
    ("mua-sam", 600000, "Giày thể thao", "2024-05-05", "Thẻ tín dụng"),

    ("giai-tri", 180000, "Netflix", "2024-05-27", "Thẻ tín dụng"),
    ("giai-tri", 59000, "Spotify Premium", "2024-05-20", "Thẻ tín dụng"),
    ("giai-tri", 340000, "Xem phim CGV cuối tuần", "2024-05-18", "Momo"),
    ("giai-tri", 650000, "Karaoke với bạn bè", "2024-05-11", "Tiền mặt"),
    ("giai-tri", 871000, "Du lịch trong ngày Vũng Tàu", "2024-05-04", "Thẻ tín dụng"),

    ("hoa-don", 1200000, "Tiền nhà", "2024-05-28", "Vietcombank"),
    ("hoa-don", 450000, "Hóa đơn tiền điện", "2024-05-30", "Vietcombank"),
    ("hoa-don", 120000, "Hóa đơn tiền nước", "2024-05-30", "Vietcombank"),
    ("hoa-don", 220000, "Internet + truyền hình", "2024-05-15", "Vietcombank"),
    ("hoa-don", 150000, "Cước điện thoại", "2024-05-15", "Momo"),
    ("hoa-don", 160000, "Phí gửi xe chung cư", "2024-05-01", "Tiền mặt"),

    ("suc-khoe", 500000, "Khám sức khỏe định kỳ", "2024-05-22", "Vietcombank"),
    ("suc-khoe", 150000, "Nhà thuốc", "2024-05-18", "Tiền mặt"),
    ("suc-khoe", 400000, "Gói tập gym tháng", "2024-05-01", "Thẻ tín dụng"),
    ("suc-khoe", 100000, "Vitamin & TPCN", "2024-05-09", "Momo"),

    ("giao-duc", 350000, "Khóa học online Udemy", "2024-05-12", "Thẻ tín dụng"),
    ("giao-duc", 250000, "Sách chuyên môn", "2024-05-06", "Momo"),
    ("giao-duc", 100000, "Tài liệu ôn chứng chỉ", "2024-05-02", "Tiền mặt"),

    ("khac-chi", 250000, "Quà tặng bạn bè", "2024-05-19", "Momo"),
    ("khac-chi", 150000, "Chi phí phát sinh khác", "2024-05-07", "Tiền mặt"),

    # ---- Tháng 4/2024 (lịch sử, phục vụ biểu đồ xu hướng & so sánh tháng trước) ----
    ("luong", 18000000, "Lương tháng 4", "2024-04-30", "Vietcombank"),
    ("thuong", 3200000, "Thưởng quý", "2024-04-25", "Vietcombank"),
    ("dau-tu", 2600000, "Lãi đầu tư", "2024-04-18", "Vietcombank"),
    ("thu-khac", 3300000, "Thu nhập ngoài lương", "2024-04-10", "Momo"),
    ("an-uong", 3200000, "Siêu thị & ăn uống trong tháng", "2024-04-15", "Thẻ tín dụng"),
    ("an-uong", 2600000, "Ăn uống, cà phê linh tinh", "2024-04-28", "Momo"),
    ("di-lai", 1600000, "Xăng xe + di chuyển", "2024-04-10", "Tiền mặt"),
    ("di-lai", 1300000, "Taxi/Grab trong tháng", "2024-04-22", "Momo"),
    ("mua-sam", 1500000, "Mua sắm online", "2024-04-08", "Thẻ tín dụng"),
    ("mua-sam", 1100000, "Quần áo, đồ dùng", "2024-04-20", "Thẻ tín dụng"),
    ("giai-tri", 1000000, "Giải trí, xem phim", "2024-04-12", "Momo"),
    ("giai-tri", 800000, "Cuối tuần cùng bạn bè", "2024-04-26", "Tiền mặt"),
    ("hoa-don", 1200000, "Tiền nhà", "2024-04-05", "Vietcombank"),
    ("hoa-don", 1000000, "Điện nước internet", "2024-04-15", "Vietcombank"),
    ("suc-khoe", 400000, "Gói tập gym tháng 4", "2024-04-01", "Thẻ tín dụng"),
    ("suc-khoe", 600000, "Khám & thuốc", "2024-04-18", "Tiền mặt"),
    ("giao-duc", 500000, "Khóa học online", "2024-04-10", "Thẻ tín dụng"),
    ("giao-duc", 400000, "Sách chuyên môn", "2024-04-20", "Momo"),
    ("khac-chi", 600000, "Chi phí phát sinh trong tháng", "2024-04-15", "Tiền mặt"),

    # ---- Tháng 3/2024 (lịch sử) ----
    ("luong", 18000000, "Lương tháng 3", "2024-03-30", "Vietcombank"),
    ("thuong", 2500000, "Thưởng dự án", "2024-03-25", "Vietcombank"),
    ("dau-tu", 2700000, "Lãi đầu tư", "2024-03-18", "Vietcombank"),
    ("thu-khac", 3600000, "Thu nhập ngoài lương", "2024-03-10", "Momo"),
    ("an-uong", 3600000, "Siêu thị & ăn uống trong tháng", "2024-03-15", "Thẻ tín dụng"),
    ("an-uong", 2600000, "Ăn ngoài, cà phê", "2024-03-28", "Momo"),
    ("di-lai", 1700000, "Xăng xe + di chuyển", "2024-03-10", "Tiền mặt"),
    ("di-lai", 1300000, "Taxi/Grab trong tháng", "2024-03-22", "Momo"),
    ("mua-sam", 1600000, "Mua sắm online", "2024-03-08", "Thẻ tín dụng"),
    ("mua-sam", 1100000, "Đồ dùng cá nhân", "2024-03-20", "Thẻ tín dụng"),
    ("giai-tri", 1200000, "Giải trí cuối tuần", "2024-03-12", "Momo"),
    ("giai-tri", 800000, "Xem phim, karaoke", "2024-03-26", "Tiền mặt"),
    ("hoa-don", 1200000, "Tiền nhà", "2024-03-05", "Vietcombank"),
    ("hoa-don", 1200000, "Điện nước internet", "2024-03-15", "Vietcombank"),
    ("suc-khoe", 400000, "Gói tập gym tháng 3", "2024-03-01", "Thẻ tín dụng"),
    ("suc-khoe", 500000, "Khám & thuốc", "2024-03-18", "Tiền mặt"),
    ("giao-duc", 700000, "Khóa học + sách", "2024-03-15", "Thẻ tín dụng"),
    ("khac-chi", 500000, "Chi phí phát sinh trong tháng", "2024-03-10", "Tiền mặt"),
]

BUDGETS = [
    ("an-uong", 6500000), ("di-lai", 3500000), ("mua-sam", 3000000), ("giai-tri", 2000000),
    ("hoa-don", 2500000), ("suc-khoe", 1500000), ("giao-duc", 1000000), ("khac-chi", 500000),
]

GOALS = [
    ("Quỹ khẩn cấp", 30000000, 19500000, "2024-09-30", "🛡️", "Dự phòng cho tình huống bất ngờ", "Ưu tiên cao", "2024-01-05"),
    ("Du lịch Đà Nẵng", 15000000, 8200000, "2024-11-20", "🏖️", "Chuyến đi cùng gia đình 4 ngày 3 đêm", "Trung bình", "2024-02-10"),
    ("Mua laptop mới", 25000000, 7000000, "2025-03-31", "💻", "Nâng cấp thiết bị làm việc", "Dài hạn", "2024-03-01"),
]


def run(conn=None):
    own_conn = conn is None
    conn = conn or database.get_connection()
    if not database.is_empty(conn):
        return False

    cur = conn.cursor()
    cur.execute(
        "INSERT INTO users (email, password_hash, full_name) VALUES (?,?,?)",
        (DEMO_EMAIL, hash_password(DEMO_PASSWORD), DEMO_NAME),
    )
    user_id = cur.lastrowid

    cat_ids = {}
    for key, name, type_, icon, color in CATEGORIES:
        cur.execute(
            "INSERT INTO categories (user_id, name, type, icon, color) VALUES (?,?,?,?,?)",
            (user_id, name, type_, icon, color),
        )
        cat_ids[key] = cur.lastrowid

    for key, amount, note, date, account in TRANSACTIONS:
        cat = next(c for c in CATEGORIES if c[0] == key)
        cur.execute(
            "INSERT INTO transactions (user_id, category_id, amount, type, note, account, txn_date) VALUES (?,?,?,?,?,?,?)",
            (user_id, cat_ids[key], amount, cat[2], note, account, date),
        )

    for key, limit_amount in BUDGETS:
        cur.execute(
            "INSERT INTO budgets (user_id, category_id, month, year, limit_amount) VALUES (?,?,?,?,?)",
            (user_id, cat_ids[key], 5, 2024, limit_amount),
        )

    for name, target, saved, deadline, emoji, note, priority, created_at in GOALS:
        cur.execute(
            "INSERT INTO savings_goals (user_id, name, target_amount, saved_amount, deadline, emoji, note, priority, created_at) VALUES (?,?,?,?,?,?,?,?,?)",
            (user_id, name, target, saved, deadline, emoji, note, priority, created_at),
        )

    conn.commit()
    if own_conn:
        conn.close()
    return True


if __name__ == "__main__":
    # Ép terminal Windows in đúng tiếng Việt có dấu, tránh lỗi mã hóa codepage cũ.
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8")

    database.init_db()
    created = run()
    print("Đã tạo dữ liệu mẫu." if created else "Dữ liệu đã tồn tại, bỏ qua seed.")
