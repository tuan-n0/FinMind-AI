"""
Kiểm thử call_ollama() với requests.post được mock — bao phủ các tình huống
lỗi/giới hạn AI theo yêu cầu: timeout, rate limit, response rỗng, response
sai định dạng JSON, lỗi kết nối, và trường hợp thành công.
Không cần Ollama thật đang chạy để chạy các test này.
"""
import os
import sys
from unittest.mock import MagicMock, patch

import requests

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import ai


class FakeResponse:
    def __init__(self, status_code=200, json_body=None, text=""):
        self.status_code = status_code
        self._json_body = json_body
        self.text = text

    def json(self):
        return self._json_body


def test_call_ollama_success_returns_parsed_dict():
    fake = FakeResponse(200, {"message": {"content": '{"summary": "ok", "suggestions": ["a"], "warnings": []}'}})
    with patch("ai.requests.post", return_value=fake):
        result = ai.call_ollama("system", "user")
    assert result == {"summary": "ok", "suggestions": ["a"], "warnings": []}


def test_call_ollama_connection_error_falls_back_to_none():
    with patch("ai.requests.post", side_effect=requests.exceptions.ConnectionError("refused")):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_timeout_falls_back_to_none():
    with patch("ai.requests.post", side_effect=requests.exceptions.Timeout("too slow")):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_rate_limited_falls_back_to_none():
    fake = FakeResponse(429, text="rate limited")
    with patch("ai.requests.post", return_value=fake):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_empty_response_falls_back_to_none():
    fake = FakeResponse(200, {"message": {"content": ""}})
    with patch("ai.requests.post", return_value=fake):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_malformed_json_falls_back_to_none():
    fake = FakeResponse(200, {"message": {"content": "Đây là câu trả lời, không phải JSON."}})
    with patch("ai.requests.post", return_value=fake):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_unexpected_response_shape_falls_back_to_none():
    fake = FakeResponse(200, {"unexpected": "shape"})
    with patch("ai.requests.post", return_value=fake):
        assert ai.call_ollama("system", "user") is None


def test_call_ollama_truncates_oversized_prompt():
    huge_prompt = "x" * (ai.prompts.MAX_PROMPT_CHARS + 500)
    captured = {}

    def fake_post(url, json, timeout):
        captured["user_len"] = len(json["messages"][1]["content"])
        return FakeResponse(200, {"message": {"content": '{"summary":"ok"}'}})

    with patch("ai.requests.post", side_effect=fake_post):
        ai.call_ollama("system", huge_prompt)
    assert captured["user_len"] <= ai.prompts.MAX_PROMPT_CHARS + 30  # + hậu tố "...(đã rút gọn...)"


def test_monthly_summary_falls_back_cleanly_when_ollama_unavailable(tmp_path):
    """monthly_summary() không được raise dù Ollama lỗi kết nối — luôn trả kết quả từ rule-engine."""
    import database
    import seed

    original_db_path = database.DB_PATH  # tránh làm lệch DB_PATH toàn cục cho các test khác (test_app.py)
    try:
        database.DB_PATH = str(tmp_path / "test_fallback.db")
        database.init_db()
        conn = database.get_connection()
        seed.run(conn)

        user = conn.execute("SELECT id FROM users WHERE email=?", (seed.DEMO_EMAIL,)).fetchone()
        with patch("ai.requests.post", side_effect=requests.exceptions.ConnectionError("refused")):
            result = ai.monthly_summary(conn, user["id"], 2024, 5)
        conn.close()
    finally:
        database.DB_PATH = original_db_path

    assert result["_model"] == ai.MODEL_NAME  # đã fallback về rule-engine
    assert "Ăn uống" in result["summary"]
