# Minh chứng sử dụng AI trong phân tích, thiết kế và lập trình

Toàn bộ mã nguồn dự án này được xây dựng với sự hỗ trợ của Claude (Anthropic),
qua công cụ Claude Code, dưới sự chỉ đạo và kiểm tra trực tiếp của sinh viên.
Tài liệu này ghi lại các mốc trao đổi chính, phản hồi của AI, và phần sinh
viên đã kiểm chứng/chỉnh sửa — theo đúng tinh thần Chương 7 của báo cáo và
tiêu chí KT2 #9 / KT3 #9.

> Đây là log thật của quá trình làm việc (rút gọn), không phải ví dụ minh họa.

## 1. Xây dựng frontend từ mô tả đề tài + ảnh chụp giao diện mẫu

**Prompt:** Sinh viên cung cấp nội dung đề tài (Word) và 9 ảnh chụp giao diện
mẫu (dashboard, giao dịch, danh mục, ngân sách, mục tiêu, báo cáo, AI Chat...),
yêu cầu dựng thành web tại `C:\HTML\AI`.

**Phản hồi AI:** Đọc file `.docx` bằng cách bóc tách `document.xml`, dựng bộ
design system CSS dùng chung, sau đó lần lượt tạo 11 trang HTML/CSS/JS thuần
(không framework), dữ liệu mẫu lưu tạm bằng `localStorage` để demo nhanh.

**Kiểm chứng & chỉnh sửa của sinh viên:** Yêu cầu AI **không sao chép y hệt**
ảnh mẫu mà thiết kế lại theo phong cách riêng, sáng tạo hơn, phù hợp chủ đề.
AI đã tự kiểm tra chéo (mở từng trang bằng trình duyệt thật, đối chiếu số
liệu tính toán) trước khi báo hoàn thành.

## 2. Sửa lỗi UI: icon SVG phình to phá layout

**Bối cảnh:** Sinh viên chụp ảnh màn hình cho thấy khối avatar góc phải bị vỡ
(chữ tên xuống dòng từng ký tự).

**Phản hồi AI:** Chẩn đoán bằng cách đo `getBoundingClientRect()` trực tiếp
trên phần tử qua trình duyệt, phát hiện icon mũi tên (chevron) không có
`width`/`height` CSS riêng nên trình duyệt vẽ ở kích thước mặc định ~150px.

**Sửa/kiểm chứng:** Không chỉ sửa 1 chỗ, mà thêm quy tắc CSS toàn cục
(`svg{width:1em;height:1em}`) để mọi icon tương lai không mắc lại lỗi này —
kiểm tra lại bằng cách đo kích thước icon trên nhiều trang khác nhau.

## 3. Phát hiện lỗi kiến trúc: đăng nhập tài khoản khác vẫn ra dữ liệu cũ

**Prompt sinh viên:** "sao tôi đăng nhập bằng tên khác mà lần nào vào vẫn là
tên này vậy... mà tôi chưa thực hiện giao dịch nào sao lại có sẵn số tiền?"

**Phản hồi AI:** Nhận lỗi kiến trúc thật — toàn bộ ứng dụng khi đó dùng chung
một object `localStorage` bất kể ai đăng nhập. Thiết kế lại `Store` thành
mô hình nhiều tài khoản (mỗi email một "ngăn" dữ liệu riêng, mô phỏng cô lập
theo `user_id` như thiết kế backend thật), tài khoản mới luôn bắt đầu trống.

**Kiểm chứng:** Test trực tiếp bằng trình duyệt: đăng ký tài khoản
"Trần Thị Bình", xác nhận dashboard/AI Chat hiện đúng tên mới, dữ liệu = 0,
kỳ mặc định = tháng hiện tại thật (không còn cố định 5/2024); sau đó đăng
xuất, đăng nhập lại tài khoản demo, xác nhận dữ liệu cũ còn nguyên.

## 4. Đánh giá theo tiêu chí chấm điểm — tự phát hiện điểm yếu

**Prompt:** Sinh viên gửi ảnh chụp "BÀI KIỂM TRA THƯỜNG XUYÊN 2" (10 tiêu chí)
và hỏi web hiện tại có đáp ứng không.

**Phản hồi AI:** Tự đối chiếu từng tiêu chí, **chủ động báo các điểm chưa đạt**
thay vì chỉ khẳng định "đạt" cho có: frontend chưa gọi backend thật (chỉ dùng
`localStorage`), chưa có git/commit, thiếu tài liệu minh chứng dùng AI. Đây là
bước tự phản biện (self-review) trước khi sinh viên yêu cầu sửa.

## 5. Nối frontend ↔ backend thật + xử lý lỗi mạng phát sinh khi test

**Phản hồi AI:** Viết `frontend/js/api.js` (lớp gọi API có retry khi mất kết
nối tạm thời) và viết lại `frontend/js/data.js` để lắp ráp `state` từ dữ liệu
API thay vì `localStorage`, giữ nguyên các hàm tính toán thuần (không cần sửa
lại logic hiển thị của từng trang).

**Sự cố phát sinh khi tự kiểm thử:** Khi bắn nhiều request song song ngay
lúc tải trang, trình duyệt test báo lỗi kiểu CORS dù cấu hình CORS đúng.

**Chẩn đoán của AI:** Kiểm tra log backend (`uvicorn_out.log`) thấy server
luôn trả `200 OK` — chứng tỏ lỗi nằm ở tầng kết nối mạng của trình duyệt sandbox
test, không phải lỗi ứng dụng. Xử lý bằng 2 lớp phòng vệ: (1) gọi API tuần tự
thay vì `Promise.all` để giảm số kết nối đồng thời, (2) thêm cơ chế tự thử
lại (retry + backoff) trong `api.js`. Đã test lại và xác nhận ổn định.

## 6. Rà soát lại khi porting rule-engine JS → Python — tự phát hiện thiếu sót

**Bối cảnh:** Khi test AI Chat với câu hỏi "So sánh với tháng trước", AI phát
hiện backend Python trả lời sai nhánh (rơi vào câu trả lời chung chung) dù
bản JS gốc xử lý đúng câu hỏi này.

**Tự sửa:** Rà lại `backend/ai.py::answer_question`, phát hiện đã bỏ sót 3
nhánh câu hỏi (so sánh tháng trước, mục tiêu, lập kế hoạch) khi viết lại từ
JS sang Python. Bổ sung đầy đủ, viết thêm test tự động (`test_ai_qa_covers_*`)
để tránh tái diễn, chạy lại toàn bộ 24 test xác nhận không có gì hỏng thêm.

## 7. Tích hợp AI thật (Ollama) + tài liệu thử nghiệm prompt

**Prompt:** Sinh viên gửi thêm tiêu chí KT3 (yêu cầu gọi model AI thật, không
chỉ rule-engine) và yêu cầu đáp ứng đầy đủ.

**Phản hồi AI:** Thiết kế `backend/prompts.py` (system/user prompt tách khỏi
code) và `backend/ai.py::call_ollama()` gọi Ollama cục bộ, có xử lý đầy đủ
timeout/rate-limit/response rỗng/sai định dạng — luôn tự rơi về rule-engine
khi lỗi, không bao giờ crash. Vì máy đang dùng chưa cài Ollama, AI **minh
bạch báo rõ** không thể tự sinh kết quả LLM thật, và thay vào đó: (1) viết
test giả lập (`test_ai_ollama.py`, dùng `unittest.mock`) để kiểm chứng logic
xử lý lỗi mà không cần Ollama thật, (2) viết script `test_ai_prompts.py` và
tài liệu `docs/prompt-testing.md` để sinh viên tự chạy và thu thập kết quả
thật khi có Ollama, thay vì AI tự bịa số liệu thử nghiệm.

## Nguyên tắc xuyên suốt

- Mọi khẳng định "đã sửa xong" đều đi kèm bước tự kiểm chứng (chạy pytest,
  mở trình duyệt thật, đọc log server) — không báo cáo dựa trên suy đoán.
- Khi không thể tự kiểm chứng (ví dụ thiếu Ollama trên máy), AI nói rõ giới
  hạn thay vì giả vờ đã test, và cung cấp công cụ để sinh viên tự kiểm chứng.
- Các quyết định kiến trúc có ảnh hưởng lớn (đổi CSDL, tái cấu trúc thư mục,
  khởi tạo git) đều được hỏi ý kiến sinh viên trước khi thực hiện.
