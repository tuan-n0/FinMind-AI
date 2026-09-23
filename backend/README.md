# FinMind AI — Backend (FastAPI + SQLite)

Backend cho đồ án **Hệ thống quản lý chi tiêu cá nhân có tích hợp AI**, hiện thực đúng kiến trúc mô tả ở Chương 4-6 của báo cáo: FastAPI (Python) + SQLite + AI Service tách lớp rõ ràng.

## 1. Cấu trúc thư mục

```
backend/
├── main.py            # Điểm vào ứng dụng, nạp .env, khởi tạo DB, gắn router, CORS
├── database.py         # Kết nối SQLite (schema đọc từ ../database/schema.sql)
├── auth.py              # Băm mật khẩu (PBKDF2), tạo/xác thực JWT, dependency get_current_user
├── crud.py               # Thao tác CRUD, mọi hàm đều lọc theo user_id (BR7)
├── schemas.py            # Pydantic models — áp Business Rules BR1, BR2, BR3, BR4, BR6
├── ai.py                  # AI Service — gọi Ollama thật + fallback rule-engine (AI-01..AI-06)
├── prompts.py             # System/user prompt tách riêng khỏi code xử lý (Chương 6.2)
├── seed.py                # Dữ liệu mẫu — ĐỒNG BỘ với frontend (../frontend/js/data.js cũ, nay lấy thẳng từ đây)
├── routers/               # Một router theo từng nhóm chức năng (F01-F16)
├── test_app.py            # pytest — auth, CRUD, business rules, cô lập dữ liệu theo user, AI
├── test_ai_ollama.py      # pytest — mock các tình huống lỗi AI (timeout, rate-limit, JSON sai...)
├── test_ai_prompts.py     # Script thử nghiệm/so sánh prompt qua Ollama thật (xem docs/prompt-testing.md)
├── requirements.txt
├── Dockerfile
└── start.bat               # Script khởi động nhanh trên Windows

../database/schema.sql   # Nguồn sự thật duy nhất cho cấu trúc CSDL (backend/database.py nạp trực tiếp)
../database/backup.py    # Sao lưu / khôi phục chitieu.db
```

## 2. Cài đặt & chạy (Windows)

Cách nhanh nhất — chạy thẳng:

```bash
start.bat
```

Hoặc thủ công:

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Server chạy tại `http://localhost:8000`, tài liệu API (Swagger UI) tự sinh tại **http://localhost:8000/docs**.

Lần chạy đầu tiên, `chitieu.db` sẽ tự được tạo và nạp sẵn **tài khoản demo** trùng với dữ liệu mẫu của frontend:

- Email: `tuan.ngo@finmind.vn`
- Mật khẩu: `finmind123`

## 3. Chạy kiểm thử

```bash
pytest -v
```

`test_app.py` chạy trên một file SQLite tạm riêng biệt (không đụng vào `chitieu.db` thật) và kiểm tra:

- Đăng ký / đăng nhập, từ chối email trùng, sai mật khẩu
- **BR1** số tiền phải > 0, **BR3** loại giao dịch phải khớp loại danh mục, **BR4** hạn mức ngân sách ≥ 0, **BR6** mục tiêu bắt buộc có số tiền & hạn hoàn thành
- **BR7** cô lập dữ liệu: user này không thể xem/sửa/xóa dữ liệu của user khác
- Yêu cầu không có token bị từ chối (401)
- AI không bịa số liệu khi tài khoản chưa có giao dịch; và khớp đúng số liệu đã seed khi có dữ liệu

## 4. Bản đồ API ↔ chức năng trong báo cáo

| Mã | Chức năng | Endpoint |
|---|---|---|
| F01 | Đăng ký / đăng nhập | `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` |
| F03 | Quản lý danh mục | `GET/POST /api/categories`, `DELETE /api/categories/{id}` |
| F04-F06 | Giao dịch (thêm/sửa/xóa/lọc) | `GET/POST /api/transactions`, `PATCH/DELETE /api/transactions/{id}` |
| F07-F08 | Ngân sách & theo dõi | `GET/POST /api/budgets`, `DELETE /api/budgets/{id}` |
| F09 | Mục tiêu tiết kiệm | `GET/POST /api/goals`, `PATCH/DELETE /api/goals/{id}` |
| F10-F11 | Báo cáo & Dashboard | `GET /api/reports/summary`, `GET /api/reports/trend` |
| F12 / AI-02 | AI tóm tắt tháng | `GET /api/ai/summary` |
| F13 / AI-03 | AI gợi ý ngân sách | `GET /api/ai/budget-suggest` |
| F14 / AI-04 | AI hỏi-đáp | `POST /api/ai/qa` |
| F15 / AI-05, AI-06 | AI xu hướng & bất thường | `GET /api/ai/trend`, `GET /api/ai/anomalies` |
| NFR10 | Nhật ký gọi AI (kiểm toán) | `GET /api/ai/logs` |

Mọi endpoint (trừ `/api/auth/register` và `/api/auth/login`) yêu cầu header `Authorization: Bearer <access_token>`.

## 5. Nguyên tắc bảo mật & AI đã áp dụng (đối chiếu NFR & Chương 6)

- Mật khẩu băm bằng PBKDF2-HMAC-SHA256 + salt ngẫu nhiên, không lưu dạng gốc (NFR01).
- Mọi query đều lọc theo `user_id`; không có endpoint nào đọc/ghi dữ liệu chéo giữa các tài khoản (NFR02, BR7).
- AI Service (`ai.py`) chỉ nhận dữ liệu **đã tổng hợp theo danh mục/tháng** — không truy cập từng giao dịch chi tiết hay thông tin định danh khi tạo câu trả lời (Data Guard, NFR09).
- Prompt hệ thống/người dùng được **tách riêng khỏi code xử lý**, nằm trong `prompts.py` (Chương 6.2), có ràng buộc output JSON rõ ràng.
- AI_PROVIDER mặc định là `ollama` — gọi model Ollama **chạy cục bộ** tại `OLLAMA_URL` (mặc định `http://127.0.0.1:11434`), đúng ưu tiên "dữ liệu không rời khỏi máy" trong báo cáo. Nếu Ollama chưa cài/chưa bật, hoặc gọi bị timeout/rate-limit/response rỗng/sai định dạng JSON, hệ thống **tự động rơi về rule-engine nội bộ** (`finmind-rule-engine-v1`) — không có ngoại lệ nào lọt ra ngoài, người dùng luôn nhận được kết quả (xem mục 7).
- Các con số hiển thị (highlights, causes, số liệu ngân sách...) luôn được **tính trực tiếp từ CSDL**, không bao giờ giao cho LLM sinh ra — chỉ phần văn xuôi (tóm tắt, gợi ý, trả lời hỏi-đáp ngoài mẫu câu đã biết) mới thử qua LLM thật.
- Mỗi lượt gọi AI được ghi vào bảng `ai_requests` (tính năng, **model thực tế đã dùng** — LLM thật hoặc rule-engine fallback —, dữ liệu đã gửi, kết quả, trạng thái, độ trễ) phục vụ minh chứng & kiểm toán (NFR10). Xem trực tiếp tại `GET /api/ai/logs` hoặc trang Cài đặt của frontend.

## 6. Bật AI thật với Ollama (tùy chọn)

Mặc định (chưa cài Ollama) hệ thống vẫn chạy đầy đủ chức năng AI bằng rule-engine. Muốn dùng LLM thật:

```bash
# 1. Cài Ollama: https://ollama.com/download (có bản Windows)
# 2. Tải một model nhỏ, phù hợp máy cá nhân
ollama pull llama3.2
# 3. Đảm bảo Ollama đang chạy nền (mặc định tự chạy sau khi cài, lắng nghe cổng 11434)
ollama list
```

Không cần chỉnh gì thêm — `backend/ai.py` mặc định `AI_PROVIDER=ollama` và sẽ tự phát hiện, gọi Ollama ngay khi nó sẵn sàng. Kiểm tra trong `GET /api/ai/logs`: cột `model` sẽ hiện `llama3.2` (LLM thật) thay vì `finmind-rule-engine-v1` (fallback) khi gọi thành công.

Muốn thử nghiệm/so sánh prompt trước khi tích hợp, chạy script `python test_ai_prompts.py` (yêu cầu Ollama đã cài) — xem `docs/prompt-testing.md` để biết chi tiết quy trình 3 vòng thử nghiệm đã thực hiện.

## 7. Kết nối với frontend

Frontend tĩnh trong thư mục gốc (`../index.html`, `../dashboard.html`, …) đã được nối trực tiếp vào API này qua `fetch` (xem `../js/api.js`, `../js/data.js`) — **không còn dùng `localStorage` để lưu dữ liệu nghiệp vụ** (chỉ còn dùng để lưu JWT token và lịch sử hội thoại AI Chat phía client). Chạy backend (`start.bat`) và một static server cho frontend (`python -m http.server 5173` ở thư mục `frontend/`), sau đó mở `http://localhost:5173`.
