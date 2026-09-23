"""
Thiết kế prompt cho các chức năng AI — TÁCH RIÊNG khỏi logic xử lý (ai.py)
theo đúng Chương 6.2 của báo cáo: có system prompt định vai trò/ràng buộc,
user prompt chèn dữ liệu động qua biến, và yêu cầu output đúng định dạng JSON.

Nguyên tắc bắt buộc (Data Guard — Chương 6.4):
  - Chỉ chèn dữ liệu ĐÃ TỔNG HỢP theo danh mục/tháng vào user prompt.
  - Không đưa từng giao dịch chi tiết, không đưa email/tên định danh vào prompt.
"""
import json

SYSTEM_PROMPT_REPORT = (
    "Bạn là trợ lý chi tiêu cá nhân. Chỉ đưa gợi ý tham khảo, "
    "không tư vấn tài chính chuyên nghiệp. Trả lời ngắn gọn bằng "
    "tiếng Việt và luôn xuất ra ĐÚNG định dạng JSON được yêu cầu, "
    "không thêm văn bản nào khác ngoài JSON. Không được bịa số liệu "
    "ngoài dữ liệu được cung cấp."
)

REPORT_OUTPUT_SCHEMA = '{"summary": "...", "suggestions": ["...", "...", "..."], "warnings": ["..."]}'


def build_report_user_prompt(monthly_expense_summary, budget_summary, goals_summary):
    """monthly_expense_summary / budget_summary / goals_summary: list[dict] đã tổng hợp, không có dữ liệu định danh."""
    return (
        # default=float: một số cột số tiền trả về kiểu Decimal khi CSDL là SQL Server
        # (khác với SQLite trả float sẵn) — Decimal không tự serialize JSON được.
        f"Dữ liệu chi tiêu tháng (đã tổng hợp theo danh mục): {json.dumps(monthly_expense_summary, ensure_ascii=False, default=float)}.\n"
        f"Ngân sách: {json.dumps(budget_summary, ensure_ascii=False, default=float)}.\n"
        f"Mục tiêu tiết kiệm: {json.dumps(goals_summary, ensure_ascii=False, default=float)}.\n"
        f"Hãy tóm tắt xu hướng chi tiêu tháng này và gợi ý 3 điểm cần điều chỉnh.\n"
        f"Chỉ trả về JSON đúng khuôn dạng sau, không thêm chữ nào khác: {REPORT_OUTPUT_SCHEMA}"
    )


SYSTEM_PROMPT_BUDGET = (
    "Bạn là trợ lý chi tiêu cá nhân. Hãy phân tích thu nhập và mức chi thực tế "
    "theo danh mục của các tháng gần nhất để đề xuất hạn mức cho tháng tới. "
    "Kết quả chỉ mang tính tham khảo, người dùng là người quyết định cuối cùng. "
    "Không đề xuất hạn mức cho danh mục không có trong dữ liệu đầu vào. Luôn "
    "xuất ra ĐÚNG định dạng JSON được yêu cầu, không thêm văn bản nào khác."
)

BUDGET_OUTPUT_SCHEMA = (
    '{"suggestions": [{"category": "...", "suggested_limit": 0, "reason": "..."}]}'
)


def build_budget_user_prompt(monthly_income, expense_history, goals_summary):
    """monthly_income: số; expense_history: list[dict] theo danh mục qua nhiều tháng gần nhất."""
    return (
        f"Thu nhập trung bình tháng: {json.dumps(monthly_income, default=float)}.\n"
        f"Lịch sử chi tiêu theo danh mục: {json.dumps(expense_history, ensure_ascii=False, default=float)}.\n"
        f"Mục tiêu tiết kiệm: {json.dumps(goals_summary, ensure_ascii=False, default=float)}.\n"
        f"Hãy đề xuất hạn mức cho từng danh mục trong tháng tới và giải thích ngắn "
        f"gọn cơ sở của từng đề xuất.\n"
        f"Chỉ trả về JSON đúng khuôn dạng sau, không thêm chữ nào khác: {BUDGET_OUTPUT_SCHEMA}"
    )


SYSTEM_PROMPT_QA = (
    "Bạn là trợ lý hỏi-đáp về chi tiêu cá nhân. Chỉ dùng dữ liệu tổng hợp "
    "được cung cấp để trả lời, không bịa thêm số liệu, không suy đoán "
    "thông tin không có trong dữ liệu. Trả lời ngắn gọn (1-3 câu), bằng "
    "tiếng Việt, giọng văn thân thiện. Luôn xuất ra ĐÚNG định dạng JSON "
    'được yêu cầu: {"text": "..."} — không thêm chữ nào khác ngoài JSON.'
)


def build_qa_user_prompt(question, aggregated_context):
    return (
        f"Dữ liệu tài chính đã tổng hợp của người dùng trong kỳ: {json.dumps(aggregated_context, ensure_ascii=False, default=float)}.\n"
        f'Câu hỏi của người dùng: "{question}"\n'
        f'Hãy trả lời dựa hoàn toàn trên dữ liệu ở trên. Chỉ trả về JSON: {{"text": "câu trả lời"}}'
    )


# Giới hạn độ dài input gửi cho AI — nếu vượt quá sẽ được rút gọn trước khi gửi
# (Chương 6.3: "nếu dữ liệu quá dài sẽ được tóm lược trước khi gửi").
MAX_PROMPT_CHARS = 4000
