"""
AI Service — tương ứng Chương 6 của báo cáo (AI-01..AI-06).

Guardrail áp dụng xuyên suốt file này:
  - Chỉ đọc dữ liệu ĐÃ TỔNG HỢP theo danh mục/tháng (qua crud.compute_totals,
    crud.group_by_category...) — không gửi từng giao dịch chi tiết hay thông
    tin định danh (email, tên) ra ngoài hàm xử lý.
  - Không tự bịa số liệu ngoài dữ liệu được cung cấp.
  - Luôn có thể fallback khi thiếu dữ liệu, không có ngoại lệ không kiểm soát.
  - Mọi lượt gọi được ghi vào bảng ai_requests (NFR10 — kiểm toán).

Mặc định AI_PROVIDER=ollama — gọi model Ollama chạy CỤC BỘ (đúng ưu tiên đã
nêu ở Chương 6.4: dữ liệu không rời khỏi máy, không cần khóa API trả phí).
Nếu Ollama chưa được cài/chưa chạy, hoặc trả lỗi/timeout/response sai định
dạng, hệ thống sẽ TỰ ĐỘNG rơi về rule-engine nội bộ (MODEL_NAME) — không có
ngoại lệ nào lọt ra ngoài, người dùng luôn nhận được kết quả.

Muốn dùng nhà cung cấp khác (Gemini/Claude/OpenAI/Hugging Face), đặt
AI_PROVIDER tương ứng trong file .env và hiện thực thêm một hàm call_*
tương tự call_ollama() bên dưới — khóa API luôn đọc từ biến môi trường,
không hardcode vào mã nguồn (NFR09).
"""
import json
import os
import statistics
import time

import requests

import crud
import database
import prompts

AI_PROVIDER = os.environ.get("AI_PROVIDER", "ollama")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://127.0.0.1:11434")  # 127.0.0.1 thay vì localhost: tránh Windows thử phân giải IPv6 trước, gây chậm khi Ollama chưa chạy
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "llama3.2")
OLLAMA_TIMEOUT_SECONDS = float(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "60"))

MODEL_NAME = "finmind-rule-engine-v1"  # dùng khi không gọi được LLM thật (fallback)


def format_vnd(n: float) -> str:
    return f"{int(round(n or 0)):,}".replace(",", ".") + " đ"


def call_ollama(system_prompt: str, user_prompt: str) -> dict | None:
    """Gọi Ollama cục bộ, yêu cầu trả về JSON. Trả None ở BẤT KỲ lỗi nào
    (Ollama chưa chạy, timeout, rate-limit, response rỗng/sai định dạng) —
    hàm gọi sẽ tự fallback về rule-engine, không bao giờ raise ra ngoài."""
    if AI_PROVIDER != "ollama":
        return None
    if len(user_prompt) > prompts.MAX_PROMPT_CHARS:
        user_prompt = user_prompt[:prompts.MAX_PROMPT_CHARS] + "…(đã rút gọn do quá dài)"

    try:
        resp = requests.post(
            f"{OLLAMA_URL}/api/chat",
            json={
                "model": OLLAMA_MODEL,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
                "format": "json",
                "stream": False,
            },
            timeout=OLLAMA_TIMEOUT_SECONDS,
        )
    except requests.exceptions.ConnectionError:
        return None  # Ollama chưa cài / chưa bật
    except requests.exceptions.Timeout:
        return None  # model phản hồi quá lâu

    if resp.status_code == 429:
        return None  # rate limit
    if resp.status_code != 200:
        return None  # lỗi model / lỗi server Ollama

    try:
        raw_content = resp.json()["message"]["content"]
    except (KeyError, ValueError, TypeError):
        return None  # response sai cấu trúc

    if not raw_content or not raw_content.strip():
        return None  # response rỗng

    try:
        return json.loads(raw_content)
    except json.JSONDecodeError:
        return None  # model không tuân thủ yêu cầu xuất JSON


def _budget_progress(conn, user_id, year, month):
    return crud.list_budgets(conn, user_id, month, year)


def monthly_summary(conn, user_id, year, month) -> dict:
    """AI-02 SUMMARIZE."""
    totals = crud.compute_totals(conn, user_id, year, month)
    cats = crud.group_by_category(conn, user_id, year, month, "expense")
    budgets = _budget_progress(conn, user_id, year, month)

    if totals["count"] == 0:
        return {
            "summary": "Chưa có đủ dữ liệu giao dịch trong tháng này để AI phân tích.",
            "highlights": [], "causes": [], "suggestions": [], "warnings": [],
        }

    top = cats[0] if cats else None
    over = [b for b in budgets if b["used_pct"] >= 100]
    near = [b for b in budgets if 85 <= b["used_pct"] < 100]

    highlights = []
    if top:
        highlights.append({"label": f"Chi tiêu {top['name']} chiếm tỷ trọng lớn nhất", "detail": f"{top['percent']}% tổng chi, tương đương {format_vnd(top['amount'])}."})
    highlights.append({"label": f"Tỷ lệ tiết kiệm {'ở mức tốt' if totals['savings_rate'] >= 20 else 'cần cải thiện'}", "detail": f"Bạn đã tiết kiệm {totals['savings_rate']}% thu nhập trong tháng {month}/{year}."})

    causes = [{"label": c["name"], "detail": f"{format_vnd(c['amount'])} — chiếm {c['percent']}% tổng chi tiêu tháng này."} for c in cats[:3]]

    suggestions = []
    for b in over:
        suggestions.append(f'Danh mục "{b["category_name"]}" đã vượt ngân sách {format_vnd(b["spent"] - b["limit_amount"])}, nên rà soát lại chi tiêu.')
    for b in near:
        suggestions.append(f'Danh mục "{b["category_name"]}" đã dùng {b["used_pct"]}% ngân sách, cân nhắc kiểm soát chặt hơn.')
    if totals["savings_rate"] < 20:
        suggestions.append(f"Tỷ lệ tiết kiệm hiện {totals['savings_rate']}%, thấp hơn khuyến nghị 20%. Cân nhắc cắt giảm 5-10% ở danh mục chi lớn nhất.")
    if not suggestions:
        suggestions.append("Duy trì thói quen ghi chép đầy đủ giao dịch để AI phân tích chính xác hơn trong các tháng tới.")

    warnings = [f'{b["category_name"]} vượt ngân sách {b["used_pct"]}%' for b in over] + \
               [f'{b["category_name"]} gần chạm ngân sách ({b["used_pct"]}%)' for b in near]

    # highlights/causes/warnings LUÔN tính từ số liệu thật (không giao cho LLM,
    # để các con số hiển thị luôn truy vết được chính xác 100%).
    fallback_summary = (f"Trong tháng {month}/{year}, bạn thu {format_vnd(totals['income'])}, "
                         f"chi {format_vnd(totals['expense'])}, tiết kiệm được {totals['savings_rate']}% thu nhập. "
                         f"Khoản chi lớn nhất là {top['name'] if top else '—'}.")
    fallback_suggestions = suggestions[:4]

    # Chỉ phần văn xuôi (summary + suggestions) mới thử qua LLM thật — vì đây là
    # nội dung sinh ngôn ngữ tự nhiên, phù hợp với LLM hơn là các con số cần chính xác.
    summary, used_suggestions, model_used = fallback_summary, fallback_suggestions, MODEL_NAME
    goals = crud.list_goals(conn, user_id)
    llm_payload = call_ollama(
        prompts.SYSTEM_PROMPT_REPORT,
        prompts.build_report_user_prompt(
            monthly_expense_summary=[{"category": c["name"], "spent": c["amount"]} for c in cats],
            budget_summary=[{"category": b["category_name"], "limit": b["limit_amount"], "spent": b["spent"]} for b in budgets],
            goals_summary=[{"name": g["name"], "target": g["target_amount"], "saved": g["saved_amount"]} for g in goals],
        ),
    )
    if isinstance(llm_payload, dict) and isinstance(llm_payload.get("summary"), str) and llm_payload["summary"].strip():
        suggestions_from_llm = llm_payload.get("suggestions")
        if isinstance(suggestions_from_llm, list) and all(isinstance(s, str) for s in suggestions_from_llm):
            summary = llm_payload["summary"].strip()
            used_suggestions = suggestions_from_llm[:4] or fallback_suggestions
            model_used = OLLAMA_MODEL

    return {"summary": summary, "highlights": highlights, "causes": causes,
            "suggestions": used_suggestions, "warnings": warnings, "_model": model_used}


def budget_suggestions(conn, user_id, year, month) -> dict:
    """F13/AI-03 BUDGET SUGGEST — luôn kèm ghi chú 'chỉ là đề xuất tham khảo'.
    Thử gọi LLM thật (System/User Prompt riêng — Chương 4.5.2 báo cáo) để đề xuất
    hạn mức tháng tới dựa trên thu nhập + lịch sử chi tiêu; nếu AI lỗi/timeout/JSON
    sai hoặc đề xuất danh mục không có trong dữ liệu, rơi về cảnh báo ngưỡng nội bộ
    (85%/100% theo BR6) — cơ chế dự phòng KHÔNG BAO GIỜ tắt hẳn (NFR11)."""
    budgets = _budget_progress(conn, user_id, year, month)
    fallback = []
    for b in budgets:
        if b["used_pct"] >= 100:
            tone, text = "danger", f'Ngân sách "{b["category_name"]}" đang vượt {format_vnd(b["spent"] - b["limit_amount"])}. Đề xuất tăng hạn mức hoặc cắt giảm chi tiêu thực tế (chỉ mang tính tham khảo).'
        elif b["used_pct"] >= 85:
            tone, text = "warn", f'"{b["category_name"]}" đã dùng {b["used_pct"]}% ngân sách. Nên theo dõi sát trong những ngày còn lại của tháng.'
        elif b["used_pct"] < 60:
            tone, text = "info", f'"{b["category_name"]}" mới dùng {b["used_pct"]}% hạn mức — có thể cân nhắc điều chỉnh giảm để tối ưu dòng tiền.'
        else:
            continue
        fallback.append({"category_id": b["category_id"], "category_name": b["category_name"], "used_pct": b["used_pct"], "tone": tone, "text": text})

    suggestions, model_used = fallback, MODEL_NAME

    cats_expense = crud.group_by_category(conn, user_id, year, month, "expense")
    if cats_expense:
        totals = crud.compute_totals(conn, user_id, year, month)
        goals = crud.list_goals(conn, user_id)
        name_to_id = {c["name"]: c["category_id"] for c in cats_expense}

        llm_payload = call_ollama(
            prompts.SYSTEM_PROMPT_BUDGET,
            prompts.build_budget_user_prompt(
                monthly_income=totals["income"],
                expense_history=[{"category": c["name"], "spent": c["amount"]} for c in cats_expense],
                goals_summary=[{"name": g["name"], "target": g["target_amount"], "saved": g["saved_amount"]} for g in goals],
            ),
        )
        if isinstance(llm_payload, dict) and isinstance(llm_payload.get("suggestions"), list):
            llm_suggestions = []
            for item in llm_payload["suggestions"]:
                if not (isinstance(item, dict) and isinstance(item.get("category"), str) and isinstance(item.get("reason"), str)):
                    continue
                cat_id = name_to_id.get(item["category"])
                if cat_id is None:
                    continue  # Guardrail F13 — AI không được đề xuất danh mục ngoài dữ liệu đầu vào
                limit_val = item.get("suggested_limit")
                limit_txt = f' (đề xuất hạn mức: {format_vnd(limit_val)})' if isinstance(limit_val, (int, float)) else ""
                llm_suggestions.append({
                    "category_id": cat_id, "category_name": item["category"],
                    "used_pct": None, "tone": "info", "text": item["reason"].strip() + limit_txt,
                })
            if llm_suggestions:
                suggestions = llm_suggestions
                model_used = OLLAMA_MODEL

    return {"suggestions": suggestions, "_model": model_used}


def trend_and_forecast(conn, user_id, current_year, current_month) -> dict:
    """AI-05 TREND — chỉ dùng lịch sử giao dịch đã có trong hệ thống."""
    rows = conn.execute(
        f"SELECT DISTINCT {database.year_expr('txn_date')} y, {database.month_expr('txn_date')} m "
        f"FROM transactions WHERE user_id=? ORDER BY y,m",
        (user_id,),
    ).fetchall()
    months = [(int(r["y"]), int(r["m"])) for r in rows]
    if len(months) < 2:
        return {"available": False, "note": "Cần ít nhất 2 tháng dữ liệu để phân tích xu hướng. Hiện hệ thống chưa đủ dữ liệu lịch sử."}

    series = [{"year": y, "month": m, **crud.compute_totals(conn, user_id, y, m)} for y, m in months]
    last3 = series[-3:] if len(series) >= 3 else series
    growth = 0.0
    if len(last3) >= 2 and last3[0]["expense"]:
        growth = ((last3[-1]["expense"] - last3[0]["expense"]) / last3[0]["expense"]) / max(1, len(last3) - 1)
    forecast_next = round(series[-1]["expense"] * (1 + growth))
    direction = "tăng" if growth > 0.01 else "giảm" if growth < -0.01 else "ổn định"
    return {
        "available": True, "series": series, "forecast_next": forecast_next,
        "growth_pct": round(growth * 100, 1), "direction": direction,
        "note": f"Dựa trên dữ liệu lịch sử, chi tiêu dự kiến {direction} khoảng {abs(round(growth * 100, 1))}%/tháng.",
    }


def anomalies(conn, user_id, year, month) -> list:
    """AI-06 ANOMALY — chỉ cảnh báo, không tự sửa/xóa giao dịch."""
    rows = conn.execute(
        "SELECT t.*, c.name AS category_name, c.icon AS category_icon FROM transactions t JOIN categories c ON c.id=t.category_id "
        f"WHERE t.user_id=? AND t.type='expense' AND {database.year_expr('t.txn_date')}=? AND {database.month_expr('t.txn_date')}=?",
        (user_id, str(year), f"{month:02d}"),
    ).fetchall()
    amounts = [r["amount"] for r in rows]
    if len(amounts) < 3:
        return []
    mean = statistics.mean(amounts)
    stdev = statistics.pstdev(amounts)
    result = []
    for r in rows:
        if r["amount"] > mean + 1.6 * stdev:
            result.append({
                "id": r["id"], "note": r["note"], "amount": r["amount"], "txn_date": r["txn_date"],
                "category_name": r["category_name"], "category_icon": r["category_icon"],
                "reason": f"Cao hơn mức chi trung bình ({format_vnd(mean)}) khoảng {round((r['amount']-mean)/mean*100)}%",
            })
    return sorted(result, key=lambda x: -x["amount"])[:3]


def _prev_period(year, month):
    return (year - 1, 12) if month == 1 else (year, month - 1)


def answer_question(conn, user_id, year, month, question: str) -> dict:
    """AI-04 Q&A — trả lời dựa trên dữ liệu đã tổng hợp, không suy diễn ngoài hệ thống."""
    q = question.lower()
    totals = crud.compute_totals(conn, user_id, year, month)
    cats = crud.group_by_category(conn, user_id, year, month, "expense")
    top = cats[0] if cats else None

    if any(k in q for k in ["nhiều nhất", "cao nhất", "tốn nhất"]) and top:
        return {"text": f'Trong tháng {month}/{year}, bạn chi nhiều nhất vào "{top["name"]}" với {format_vnd(top["amount"])}, chiếm {top["percent"]}% tổng chi.', "data": {"categories": cats}}

    if any(k in q for k in ["so sánh", "tháng trước", "tăng", "giảm"]):
        py, pm = _prev_period(year, month)
        prev = crud.compute_totals(conn, user_id, py, pm)
        if prev["count"] == 0:
            return {"text": f"Chưa có dữ liệu tháng {pm}/{py} để so sánh."}
        income_delta = ((totals["income"] - prev["income"]) / prev["income"] * 100) if prev["income"] else 0
        expense_delta = ((totals["expense"] - prev["expense"]) / prev["expense"] * 100) if prev["expense"] else 0
        return {"text": f"So với tháng trước, thu nhập {'tăng' if income_delta>=0 else 'giảm'} {abs(round(income_delta,1))}% và chi tiêu {'tăng' if expense_delta>=0 else 'giảm'} {abs(round(expense_delta,1))}%."}

    if "mục tiêu" in q:
        goals = crud.list_goals(conn, user_id)
        if not goals:
            return {"text": "Bạn chưa tạo mục tiêu tiết kiệm nào. Vào mục \"Mục tiêu tiết kiệm\" để tạo mục tiêu đầu tiên nhé!"}
        from datetime import date
        def days_left(g):
            try:
                d = date.fromisoformat(g["deadline"])
                return max(0, (d - date.today()).days)
            except (TypeError, ValueError):
                return 999999
        nearest = min(goals, key=days_left)
        pct_done = (nearest["saved_amount"] / nearest["target_amount"] * 100) if nearest["target_amount"] else 0
        remaining = max(0, nearest["target_amount"] - nearest["saved_amount"])
        deadline_vn = "/".join(reversed(nearest["deadline"].split("-"))) if nearest["deadline"] else "—"
        return {"text": f'Mục tiêu gần về đích nhất là "{nearest["name"]}" — đã đạt {round(pct_done)}%, còn thiếu {format_vnd(remaining)}, hạn {deadline_vn}.'}

    if any(k in q for k in ["kế hoạch", "lập kế hoạch", "tháng sau", "tháng tới"]):
        forecast = trend_and_forecast(conn, user_id, year, month)
        if not forecast["available"]:
            return {"text": forecast["note"]}
        return {"text": f'Dự báo chi tiêu tháng tới khoảng {format_vnd(forecast["forecast_next"])} (xu hướng {forecast["direction"]}). Đây chỉ là ước tính tham khảo dựa trên xu hướng gần đây, không phải cam kết.'}

    if any(k in q for k in ["ngân sách", "vượt"]):
        budgets = _budget_progress(conn, user_id, year, month)
        over = [b for b in budgets if b["used_pct"] >= 100]
        if not over:
            return {"text": "Hiện chưa có danh mục nào vượt ngân sách tháng này — bạn đang kiểm soát chi tiêu khá tốt!"}
        return {"text": "Danh mục đang vượt ngân sách: " + ", ".join(f'{b["category_name"]} ({b["used_pct"]}%)' for b in over)}

    if "tiết kiệm" in q:
        return {"text": f"Bạn đã tiết kiệm được {format_vnd(totals['balance'])}, tương đương {totals['savings_rate']}% thu nhập trong tháng {month}/{year}."}

    if "tổng thu" in q or "thu nhập" in q:
        return {"text": f"Tổng thu nhập tháng {month}/{year} là {format_vnd(totals['income'])}."}

    if "tổng chi" in q:
        return {"text": f"Tổng chi tiêu tháng {month}/{year} là {format_vnd(totals['expense'])}."}

    if not top:
        return {"text": "Chưa có đủ dữ liệu giao dịch trong tháng này để trả lời câu hỏi của bạn."}

    # Câu hỏi không khớp mẫu nào đã biết -> thử LLM thật với đúng dữ liệu đã tổng hợp,
    # nếu Ollama không khả dụng thì rơi về câu trả lời tổng quát dựa trên số liệu thật.
    fallback_text = (f'Dựa trên dữ liệu tháng {month}/{year}: thu {format_vnd(totals["income"])}, '
                      f'chi {format_vnd(totals["expense"])}, danh mục chi nhiều nhất là "{top["name"]}". '
                      f'Bạn có thể hỏi cụ thể hơn, ví dụ "Tháng này tôi chi nhiều nhất vào đâu?".')
    llm_payload = call_ollama(
        prompts.SYSTEM_PROMPT_QA,
        prompts.build_qa_user_prompt(question, {
            "income": totals["income"], "expense": totals["expense"], "savings_rate": totals["savings_rate"],
            "categories": [{"name": c["name"], "spent": c["amount"], "percent": c["percent"]} for c in cats],
        }),
    )
    if isinstance(llm_payload, dict) and isinstance(llm_payload.get("text"), str) and llm_payload["text"].strip():
        return {"text": llm_payload["text"].strip(), "data": {"categories": cats}, "_model": OLLAMA_MODEL}
    return {"text": fallback_text, "data": {"categories": cats}}


def run_and_log(conn, user_id: int, feature: str, fn, *args):
    """Bọc mọi lời gọi AI để đo thời gian và ghi log vào ai_requests (NFR10).
    Nếu hàm trả về khóa nội bộ "_model" (báo đã dùng LLM thật thay vì rule-engine),
    khóa đó được dùng để ghi log rồi loại bỏ khỏi payload trả về cho client."""
    started = time.time()
    try:
        result = fn(conn, user_id, *args)
        latency = int((time.time() - started) * 1000)
        model_used = result.pop("_model", MODEL_NAME) if isinstance(result, dict) else MODEL_NAME
        # status="success" khi mô hình Ollama thật trả lời; "fallback" khi rơi về rule-engine nội bộ
        # (Ollama lỗi/timeout/JSON sai) — khớp 3 giá trị success/fallback/error theo Chương 4.8 báo cáo.
        status_ = "success" if model_used != MODEL_NAME else "fallback"
        crud.log_ai_request(conn, user_id, feature, model_used, f"{fn.__name__}({args})", str(result)[:500], status_, latency)
        return result
    except Exception as exc:
        latency = int((time.time() - started) * 1000)
        crud.log_ai_request(conn, user_id, feature, MODEL_NAME, f"{fn.__name__}({args})", str(exc), "error", latency)
        raise
