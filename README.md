# FinMind AI — Hệ thống quản lý chi tiêu cá nhân có tích hợp AI

Đồ án môn Ứng dụng trí tuệ nhân tạo — quản lý thu/chi, danh mục, ngân sách,
mục tiêu tiết kiệm, kèm trợ lý AI (báo cáo tháng, gợi ý ngân sách, hỏi-đáp)
dựa trên dữ liệu tài chính thật của người dùng, lưu trong CSDL SQLite thật.

## Cấu trúc dự án

```
ChiTieu/
├── frontend/         HTML/CSS/JS thuần, gọi thẳng API backend qua fetch (không dùng framework)
│   ├── index.html, dashboard.html, transactions.html, ...
│   ├── css/style.css   Design system dùng chung
│   └── js/               api.js (lớp gọi API) + data.js (tính toán) + 1 file JS/trang
├── backend/            FastAPI + SQLite — xem backend/README.md để biết chi tiết
│   ├── main.py, database.py, auth.py, crud.py, schemas.py
│   ├── ai.py, prompts.py    AI Service: gọi Ollama thật, fallback rule-engine
│   ├── routers/                Các API theo nhóm chức năng
│   ├── seed.py, test_app.py, test_ai_ollama.py, test_ai_prompts.py
│   └── requirements.txt, start.bat, .env.example
├── database/           schema.sql — nguồn sự thật duy nhất cho cấu trúc CSDL
│   └── backup.py         Script sao lưu / khôi phục chitieu.db
├── docs/                 Tài liệu bổ sung: thử nghiệm prompt, minh chứng dùng AI khi lập trình
└── README.md (file này), .gitignore
```

## Công nghệ sử dụng

| Hạng mục | Thông tin |
|---|---|
| Backend | Python + FastAPI (SQL thuần qua `sqlite3`, không dùng ORM) |
| Frontend | HTML/CSS/JavaScript thuần (không framework), Chart.js cho biểu đồ |
| CSDL | SQLite (`database/schema.sql` là nguồn thiết kế duy nhất) |
| IDE/Editor | Visual Studio Code |
| Công cụ kiểm thử API | Swagger UI tự sinh tại `/docs`, bộ test tự động `pytest` (26 test, xem mục Kiểm thử) |
| AI/Model sử dụng trong SDLC | **Runtime:** Ollama (`llama3.2`, chạy cục bộ) cho 3 chức năng AI trong ứng dụng (báo cáo tháng, gợi ý ngân sách, hỏi-đáp), tự rơi về rule-engine nội bộ khi không có Ollama. **Lúc lập trình:** Claude (Anthropic, qua Claude Code) hỗ trợ sinh code, debug, review — xem `docs/ai-dev-log.md` |

## Kiến trúc: một hệ thống liền mạch

Frontend gọi thẳng API thật của backend (`frontend/js/api.js` → `http://localhost:8000/api/...`),
backend đọc/ghi CSDL SQLite thật (`database/schema.sql` → `backend/chitieu.db`).
Không còn dữ liệu giả lập bằng `localStorage` — mọi thao tác (thêm giao dịch,
sửa ngân sách, tạo mục tiêu...) đều là request HTTP thật, ghi thẳng vào CSDL,
và chức năng AI gọi model Ollama thật khi có, tự động rơi về rule-engine nội
bộ khi không có (xem `backend/README.md` mục 5-6).

## Chạy thử nhanh (cần chạy CẢ HAI, hai cửa sổ terminal riêng)

**1. Backend** — xem chi tiết trong [`backend/README.md`](backend/README.md):

```bash
cd backend
start.bat
```

API chạy tại `http://localhost:8000` (Swagger UI: `http://localhost:8000/docs`).
Lần chạy đầu tự tạo `chitieu.db` và nạp tài khoản demo:
`tuan.ngo@finmind.vn` / `finmind123`.

**2. Frontend** — mở terminal thứ hai:

```bash
cd frontend
python -m http.server 5173
```

Mở trình duyệt tới `http://localhost:5173/index.html`, đăng nhập bằng tài
khoản demo ở trên (hoặc bấm "Đăng ký" để tạo tài khoản trống mới).

> Mở `index.html` trực tiếp qua `file://` (double-click) sẽ KHÔNG hoạt động
> đầy đủ — trình duyệt chặn một số request tới `localhost:8000` từ nguồn
> `file://`. Luôn chạy qua static server như trên.

## Chạy bằng Docker (tùy chọn)

```bash
docker compose up --build
```

Backend tại `http://localhost:8000`, frontend tại `http://localhost:5173`.
Dữ liệu CSDL được lưu vào Docker volume `chitieu_data` (qua biến môi trường
`FINMIND_DB_PATH`), tồn tại lâu dài qua các lần rebuild container.

> Cấu hình Docker được cung cấp theo đúng thiết kế nhiều tầng của dự án, nhưng
> **chưa được kiểm thử trên máy phát triển này** (chưa cài Docker) — hãy chạy
> thử và báo lỗi nếu có trước khi dùng để demo.

## Kiểm thử

```bash
cd backend
python -m venv venv          & rem bỏ qua nếu đã chạy start.bat (venv đã có sẵn)
venv\Scripts\activate
pip install -r requirements.txt
pytest -v
```

26 test bao phủ auth, CRUD, Business Rules (BR1-BR10), cô lập dữ liệu theo
user, và các tình huống lỗi AI (timeout, response rỗng/sai định dạng, kết
nối thất bại) — xem chi tiết trong `backend/README.md` mục 3.

## Tùy chỉnh dữ liệu

- **Danh mục/giao dịch/ngân sách/mục tiêu mẫu**: sửa `backend/seed.py` rồi xóa `backend/chitieu.db` để seed lại, hoặc chỉnh trực tiếp trên giao diện (CRUD đầy đủ).
- **Sao lưu/khôi phục CSDL**: `python database/backup.py backup` và `python database/backup.py restore <file>` — xem `database/backup.py`.

## Tài liệu bổ sung

- [`backend/README.md`](backend/README.md) — kiến trúc backend, bản đồ API, cách bật AI thật với Ollama.
- [`docs/prompt-testing.md`](docs/prompt-testing.md) — quá trình thử nghiệm/tối ưu prompt AI qua 3 vòng.
- [`docs/ai-dev-log.md`](docs/ai-dev-log.md) — minh chứng sử dụng AI (Claude) trong quá trình phân tích, thiết kế và lập trình dự án này.
