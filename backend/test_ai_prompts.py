"""
Script thử nghiệm & so sánh prompt cho chức năng "AI sinh báo cáo tháng" —
minh chứng cho quy trình tối ưu prompt qua thử nghiệm (KT3 #4).

Yêu cầu: đã cài Ollama và có ít nhất 1 model (xem README.md mục 6).
Chạy:  python test_ai_prompts.py
Kết quả (thời gian phản hồi, JSON có hợp lệ hay không, nội dung) được in ra
màn hình VÀ ghi vào docs/prompt-testing-results.json để đối chiếu/nộp báo cáo.

Đây KHÔNG phải unit test (không chạy trong pytest) vì phụ thuộc Ollama đang
chạy thật trên máy — mục đích là công cụ để sinh viên tự thu thập minh chứng
thử nghiệm thật (không phải số liệu do AI khác bịa ra).
"""
import json
import sys
import time

import requests

OLLAMA_URL = "http://127.0.0.1:11434"
OLLAMA_MODEL = "llama3.2"

# Dữ liệu mẫu đã tổng hợp (giống hệt dữ liệu demo trong seed.py) — dùng chung cho mọi vòng thử nghiệm
SAMPLE_DATA = {
    "monthly_expense_summary": [
        {"category": "Ăn uống", "spent": 6000000},
        {"category": "Mua sắm", "spent": 2900000},
        {"category": "Đi lại", "spent": 2650000},
        {"category": "Hóa đơn", "spent": 2300000},
        {"category": "Giải trí", "spent": 2100000},
    ],
    "budget_summary": [
        {"category": "Ăn uống", "limit": 6500000, "spent": 6000000},
        {"category": "Giải trí", "limit": 2000000, "spent": 2100000},
    ],
    "goals_summary": [
        {"name": "Quỹ khẩn cấp", "target": 30000000, "saved": 19500000},
    ],
}

REQUIRED_KEYS = {"summary", "suggestions", "warnings"}


def call(system_prompt, user_prompt, use_json_format):
    payload = {
        "model": OLLAMA_MODEL,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
        "stream": False,
    }
    if use_json_format:
        payload["format"] = "json"

    started = time.time()
    try:
        resp = requests.post(f"{OLLAMA_URL}/api/chat", json=payload, timeout=90)
    except requests.exceptions.RequestException as exc:
        return {"elapsed_ms": int((time.time() - started) * 1000), "error": str(exc)}
    elapsed_ms = int((time.time() - started) * 1000)

    if resp.status_code != 200:
        return {"elapsed_ms": elapsed_ms, "error": f"HTTP {resp.status_code}: {resp.text[:200]}"}

    content = resp.json().get("message", {}).get("content", "")
    result = {"elapsed_ms": elapsed_ms, "raw": content}
    try:
        parsed = json.loads(content)
        result["valid_json"] = True
        result["has_required_keys"] = REQUIRED_KEYS.issubset(parsed.keys())
        result["parsed"] = parsed
    except json.JSONDecodeError:
        result["valid_json"] = False
        result["has_required_keys"] = False
    return result


# ---- Vòng 1: prompt tự do, không ràng buộc định dạng rõ ràng ----
ROUND_1 = {
    "name": "Vong 1 - khong rang buoc dinh dang",
    "system": "Ban la tro ly chi tieu ca nhan. Hay phan tich du lieu va dua ra nhan xet.",
    "user": f"Du lieu chi tieu: {json.dumps(SAMPLE_DATA, ensure_ascii=False)}. Hay tom tat va goi y.",
    "use_json_format": False,
}

# ---- Vòng 2: thêm system prompt ràng buộc vai trò + yêu cầu JSON trong prompt (nhưng chưa dùng tham số format của Ollama) ----
ROUND_2 = {
    "name": "Vong 2 - yeu cau JSON trong prompt",
    "system": (
        "Ban la tro ly chi tieu ca nhan. Chi dua goi y tham khao, khong tu van tai chinh chuyen nghiep. "
        'Chi tra ve JSON dung dinh dang: {"summary": "...", "suggestions": ["...","...","..."], "warnings": ["..."]}, '
        "khong them chu nao khac ngoai JSON."
    ),
    "user": f"Du lieu chi tieu da tong hop: {json.dumps(SAMPLE_DATA, ensure_ascii=False)}. Hay tom tat xu huong va goi y 3 diem can dieu chinh.",
    "use_json_format": False,
}

# ---- Vòng 3 (dùng trong production — prompts.py): giống vòng 2 + bật tham số format="json" của Ollama (ép model chỉ sinh JSON hợp lệ) ----
import prompts as _prompts  # noqa: E402  (import sau khi định nghĩa ROUND_1/2 cho rõ mạch thử nghiệm)

ROUND_3 = {
    "name": "Vong 3 (production) - system/user prompt tu prompts.py + format=json",
    "system": _prompts.SYSTEM_PROMPT_REPORT,
    "user": _prompts.build_report_user_prompt(
        SAMPLE_DATA["monthly_expense_summary"], SAMPLE_DATA["budget_summary"], SAMPLE_DATA["goals_summary"]
    ),
    "use_json_format": True,
}


def main():
    try:
        requests.get(OLLAMA_URL, timeout=2)
    except requests.exceptions.RequestException:
        print(f"Không kết nối được Ollama tại {OLLAMA_URL}. Hãy cài đặt và chạy Ollama trước (xem README.md mục 6).")
        sys.exit(1)

    results = []
    for round_def in (ROUND_1, ROUND_2, ROUND_3):
        print(f"\n=== {round_def['name']} ===")
        r = call(round_def["system"], round_def["user"], round_def["use_json_format"])
        r["round"] = round_def["name"]
        results.append(r)
        if "error" in r:
            print("Lỗi:", r["error"])
        else:
            print(f"Thời gian: {r['elapsed_ms']}ms | JSON hợp lệ: {r['valid_json']} | Đủ khóa bắt buộc: {r.get('has_required_keys')}")
            print("Nội dung thô:", r["raw"][:400])

    with open("../docs/prompt-testing-results.json", "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)
    print("\nĐã lưu kết quả vào docs/prompt-testing-results.json")


if __name__ == "__main__":
    # Ép terminal Windows in đúng tiếng Việt có dấu, tránh lỗi mã hóa codepage cũ.
    for _stream in (sys.stdout, sys.stderr):
        if hasattr(_stream, "reconfigure"):
            _stream.reconfigure(encoding="utf-8")

    main()
