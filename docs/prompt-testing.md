# Thử nghiệm & tối ưu prompt — chức năng "AI sinh báo cáo tháng" (F12)

Tài liệu này ghi lại quá trình thiết kế và tối ưu prompt cho chức năng F12
(AI sinh báo cáo chi tiêu tháng — Chương 4.5.1 báo cáo), theo đúng script
`backend/test_ai_prompts.py`. Ba vòng dưới đây là **kết quả thật**, chạy
trực tiếp trên Ollama (`llama3.2`) cài trên máy phát triển ngày 23/09/2026,
không phải số liệu minh họa/giả định.

## Môi trường chạy thử

- Ollama 0.34.2, model `llama3.2:latest` (2.0 GB), chạy CPU (không có GPU rời
  trên máy thử nghiệm — điều này ảnh hưởng trực tiếp tới thời gian phản hồi
  ghi nhận bên dưới).
- Dữ liệu dùng để thử nghiệm — cùng một bộ dữ liệu chi tiêu đã tổng hợp cho
  cả 3 vòng, để so sánh công bằng, chỉ thay đổi prompt/tham số gọi:

```json
{
  "monthly_expense_summary": [
    {"category": "Ăn uống", "spent": 6000000},
    {"category": "Mua sắm", "spent": 2900000},
    {"category": "Đi lại", "spent": 2650000},
    {"category": "Hóa đơn", "spent": 2300000},
    {"category": "Giải trí", "spent": 2100000}
  ],
  "budget_summary": [
    {"category": "Ăn uống", "limit": 6500000, "spent": 6000000},
    {"category": "Giải trí", "limit": 2000000, "spent": 2100000}
  ],
  "goals_summary": [
    {"name": "Quỹ khẩn cấp", "target": 30000000, "saved": 19500000}
  ]
}
```

## Vòng 1 — Prompt tự do, không ràng buộc định dạng

**System prompt:** "Bạn là trợ lý chi tiêu cá nhân. Hãy phân tích dữ liệu và đưa ra nhận xét."
**User prompt:** chèn thẳng dữ liệu JSON + "Hãy tóm tắt và gợi ý."
**Không** dùng tham số `format:"json"` của Ollama.

**Kết quả đo được:** 49.720 ms, **không phải JSON hợp lệ**. Model trả lời
bằng văn xuôi có markdown (tiêu đề `**...**`, gạch đầu dòng `+`/`-`), diễn
giải lại cấu trúc dữ liệu thay vì tóm tắt nó:

> "Dưới đây là tóm tắt và giải thích về các mục trên: **Đồ lưu trữ chi
> tiết** **Mục 1: Tóm tắt chi tiêu hàng tháng** * **Hình thức:** Mô hình dữ
> liệu JSON (JavaScript Object Notation) * **Nội dung:** + Dưới đây là tóm
> tắt chi tiêu hàng tháng của bạn với 5 loại chi tiêu chính..."

**Vấn đề quan sát được:** ứng dụng cần parse `summary`/`suggestions`/
`warnings` riêng biệt để hiển thị đúng từng khối trên giao diện, nhưng đầu
ra này không parse được bằng `json.loads()` — **không dùng được**.

**Kết luận:** cần ép buộc định dạng output ngay trong prompt.

## Vòng 2 — Yêu cầu JSON trong nội dung prompt (chưa bật `format:"json"`)

**System prompt:** thêm câu "Chỉ trả về JSON đúng định dạng:
`{"summary":"...","suggestions":[...],"warnings":[...]}`, không thêm chữ
nào khác ngoài JSON."

**Kết quả đo được:** 81.822 ms (**chậm hơn vòng 1**), **vẫn không phải JSON
hợp lệ**. Model bỏ qua hoàn toàn yêu cầu định dạng, chuyển sang chế độ
"giải bài toán từng bước" và sinh ra một đoạn **code Python mẫu** để tự xử
lý dữ liệu, thay vì tự trả lời:

> "Để giải quyết vấn đề này, chúng ta cần thực hiện các bước sau: 1. Xác
> định mục tiêu chính của dự án này... 4. Xây dựng chương trình Python
> thực hiện các bước trên: ```python import json def load_json(file_path):
> ...```"

**Vấn đề quan sát được:** ràng buộc bằng lời trong prompt **không đủ tin
cậy** — với model nhỏ chạy cục bộ, model có thể "lạc đề" hoàn toàn sang một
tác vụ khác (ở đây là viết code) thay vì tuân theo định dạng yêu cầu. Đây
là bằng chứng thực tế, không phải giả định, cho thấy ràng buộc ở tầng prompt
là chưa đủ.

**Kết luận:** cần ép buộc ở tầng API (constrained decoding), không chỉ dựa
vào việc model "nghe lời".

## Vòng 3 (đang dùng trong production) — `format:"json"` + validate + fallback

**Thay đổi:**
1. Gọi Ollama với `"format": "json"` trong request (`backend/ai.py::call_ollama`) — Ollama ép model chỉ sinh token hợp lệ theo cú pháp JSON (constrained decoding).
2. Vẫn giữ nguyên schema yêu cầu trong system/user prompt (`backend/prompts.py`) để model biết **những khóa nào cần có**.
3. Backend validate thêm ở `ai.py::monthly_summary`: `summary` phải là chuỗi không rỗng, `suggestions` phải là danh sách chuỗi — nếu sai, coi như thất bại và dùng fallback.
4. Nếu bất kỳ bước nào thất bại → tự động dùng rule-engine nội bộ (`finmind-rule-engine-v1`), tính từ số liệu thật trong CSDL.

**Kết quả đo được:** 12.976 ms (**nhanh hơn nhiều** so với vòng 1 và 2 —
sinh có ràng buộc grammar giúp model hội tụ nhanh hơn thay vì lan man).
`valid_json = True`, nhưng `has_required_keys = False` ở đúng lần chạy này:

```
{"summary": "Tháng này, chi tiêu chủ yếu tập trung vào các lĩnh vực như
Ăn uống và Mua sắm, trong khi Đi lại và Hóa đơn được chi tiêu hợp lý.",
"suggestions": ["Kiểm soát chi tiêu cho Mua sắm và Đi lại để tránh vượt quá
ngân sách.", "Đảm bảo đáp ứng nhu cầu của Quỹ khẩn cấp theo mục tiêu tiết
kiệm.", "Phát triển kế hoạch tiết kiệm cho các lĩnh vực chi tiêu hợp lý để
đạt mục tiêu tài chính.", "warnings): [ "              ]}
```

**Phát hiện quan trọng (real, không phải giả định):** model sinh cú pháp
JSON hợp lệ (dấu ngoặc cân đối, `json.loads()` parse thành công), nhưng
**quên hẳn khóa `"warnings"`** — thay vào đó nhét một chuỗi lỗi
`"warnings): [ "` làm phần tử thứ 4 của mảng `suggestions` rồi đóng JSON
sớm. Đây là bằng chứng thực tế cho nhận định: **`format:"json"` chỉ đảm bảo
đúng *cú pháp* JSON, không đảm bảo đúng *schema* (đủ khóa, đúng kiểu)**.

**Vì sao production vẫn dùng được kết quả này:** `backend/ai.py::monthly_summary`
chỉ bắt buộc 2 khóa `summary` + `suggestions` (không bắt buộc `warnings`, vì
`warnings` được tính lại từ số liệu thật ở tầng backend, không giao cho LLM
— xem `ai.py` dòng ~130 "highlights/causes/warnings LUÔN tính từ số liệu
thật"), nên kết quả ở trên **vẫn được chấp nhận là hợp lệ** trong hệ thống
thật, dù script thử nghiệm (đòi đủ cả 3 khóa để so sánh nghiêm ngặt hơn)
đánh dấu `has_required_keys = False`. Đây chính là lý do thiết kế: **không
giao cho LLM những con số cần chính xác tuyệt đối (số tiền, % vượt ngân
sách), chỉ giao phần văn xuôi (tóm tắt, gợi ý)**.

## Bảng tổng hợp (số liệu thật, không làm tròn/giả định)

| Vòng | Ràng buộc định dạng | Thời gian | JSON hợp lệ? | Đủ khóa yêu cầu? | Ghi chú |
|---|---|---|---|---|---|
| 1 | Không | 49.720 ms | Không | Không | Văn xuôi có markdown, không parse được |
| 2 | Chỉ trong lời prompt | 81.822 ms | Không | Không | Model lạc đề sang viết code Python |
| 3 (production) | `format:"json"` + validate schema + fallback | 12.976 ms | Có | Không (thiếu `warnings`) | Backend chỉ bắt buộc `summary`+`suggestions` nên vẫn dùng được |

**Nhận xét tổng quát:** ràng buộc bằng tham số API (`format:"json"`) không
chỉ cải thiện tỷ lệ JSON hợp lệ mà còn **giảm mạnh thời gian phản hồi**
(12,9s so với 49,7s và 81,8s) — sinh có ràng buộc grammar giúp model không
"lan man". Tuy nhiên vòng 3 vẫn cho thấy model nhỏ chạy cục bộ đôi khi bỏ
sót khóa JSON, nên **validate ở tầng backend + fallback nội bộ là bắt buộc**,
không thể chỉ tin tưởng `format:"json"` một mình.

## Phát hiện bổ sung: cần chỉnh `OLLAMA_TIMEOUT_SECONDS` dựa trên đo lường thật

Khi kiểm thử chức năng F13 (gợi ý ngân sách — prompt dài hơn, yêu cầu liệt
kê hạn mức cho nhiều danh mục kèm giải thích), thời gian phản hồi thực đo
được là **38,9 giây** — vượt xa giá trị mặc định ban đầu `OLLAMA_TIMEOUT_SECONDS=12`
(vốn chỉ đủ cho prompt ngắn ở F12). Nếu giữ nguyên 12 giây, F13 sẽ **luôn**
timeout và rơi về fallback, không bao giờ dùng được AI thật. Sau khi đo
thực tế trên nhiều lần gọi (F12: ~13-17s, F13: ~13-39s tùy số lượng danh
mục), giá trị `OLLAMA_TIMEOUT_SECONDS` trong `.env` được điều chỉnh từ
`12` → `60` để có đủ biên độ an toàn cho cả 3 chức năng AI, đồng thời vẫn
đủ ngắn để không làm người dùng chờ quá lâu trước khi hệ thống fallback khi
Ollama thực sự gặp sự cố.

## Cách tái tạo kết quả trên máy khác

```bash
cd backend
# (đã cài Ollama + `ollama pull llama3.2` — xem README.md mục 6)
venv\Scripts\activate
python test_ai_prompts.py
```

Script in ra thời gian phản hồi, nội dung thô, và việc JSON có hợp lệ hay
không cho cả 3 vòng, đồng thời ghi đè `docs/prompt-testing-results.json`
(kết quả thô dạng JSON của lần chạy gần nhất).
