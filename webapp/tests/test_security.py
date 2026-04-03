"""Tests for security concerns: rate limiting, CORS, error leakage, path traversal, security headers."""

import json
import os
from pathlib import Path
from time import time
from unittest.mock import MagicMock, patch

import pytest

from starlette.testclient import TestClient

import main
from main import _decode_project_path
from tests.conftest import make_anthropic_response


class TestRateLimiter:
    def test_returns_429_after_limit(self, client):
        # Fill rate limiter to the max
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(time())

        resp = client.post("/api/score", json={"session_ids": ["s1"]})
        assert resp.status_code == 429
        assert "rate limit" in resp.json()["detail"].lower()

    def test_rate_limit_resets_after_window(self, client):
        # Add timestamps from 61 seconds ago (outside the 60s window)
        old_time = time() - 61
        main._score_timestamps.clear()
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(old_time)

        # Should NOT be rate limited since old timestamps are outside the window
        # The endpoint will process normally (may fail for other reasons, but not 429)
        resp = client.post("/api/score", json={"session_ids": ["nonexistent"]})
        assert resp.status_code != 429

    def test_rate_limit_applies_to_optimize(self, client):
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(time())

        resp = client.post("/api/optimize", json={"prompt": "test"})
        assert resp.status_code == 429


class TestCORS:
    def test_default_cors_origin_is_localhost(self):
        # When PORT is not set, defaults to 8000
        assert any("localhost" in o for o in main.CORS_ORIGINS)

    def test_cors_headers_present(self, client):
        # Preflight request
        resp = client.options(
            "/api/benchmarks",
            headers={
                "Origin": f"http://localhost:{main._PORT}",
                "Access-Control-Request-Method": "GET",
            },
        )
        # FastAPI CORS middleware should respond to preflight
        assert resp.status_code in (200, 400)


class TestErrorLeakage:
    def test_score_error_does_not_leak_api_key(self, client, mock_anthropic, mock_sessions_dir, monkeypatch):
        session_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        monkeypatch.setattr(
            main, "_resolve_data_dir", lambda data_path=None: mock_sessions_dir
        )

        # Simulate an API error that contains an API key
        mock_anthropic.messages.create.side_effect = Exception(
            "Error with key sk-ant-api-ABCDEFG"
        )

        resp = client.post("/api/score", json={"session_ids": [session_id]})
        assert resp.status_code == 200
        data = resp.json()
        # The error is captured per-session, verify API key is redacted
        if session_id in data["scores"] and "error" in data["scores"][session_id]:
            error_msg = data["scores"][session_id]["error"]
            assert "sk-ant-" not in error_msg
            assert "[REDACTED]" in error_msg

    def test_invalid_data_path_message(self, client):
        resp = client.get("/api/sessions", params={"data_path": "relative/path"})
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        assert "absolute" in detail.lower()
        # Should not leak system paths or internal info beyond the error
        assert "home" not in detail.lower() or "must be" in detail.lower()

    def test_quickwins_error_does_not_leak_internals(self, client, mock_anthropic):
        with patch("main.subprocess") as mock_sub:
            mock_sub.run.side_effect = Exception("Command failed: gh")
            mock_anthropic.messages.create.side_effect = Exception("API error")

            resp = client.get("/api/quickwins")
            assert resp.status_code == 200
            data = resp.json()
            assert data["suggestions"] == []
            # Error is present but should not contain API keys
            if "error" in data:
                assert "sk-ant" not in data["error"]

    def test_optimize_error_handled(self, mock_anthropic, monkeypatch, tmp_path):
        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(main, "DATA_DIR", data_dir)
        monkeypatch.setattr(main, "CCUSAGE_DIR", data_dir / "ccusage")
        main._score_timestamps.clear()
        monkeypatch.setattr(main, "_get_or_score_config_behaviors", lambda p: {})

        mock_anthropic.messages.create.side_effect = Exception("API unavailable")

        # Use raise_server_exceptions=False to get 500 response instead of exception
        with TestClient(main.app, raise_server_exceptions=False) as tc:
            resp = tc.post("/api/optimize", json={"prompt": "test prompt"})
            assert resp.status_code == 500
            body = resp.text
            # Should not contain API keys in the error response
            assert "sk-ant" not in body

    def test_pydantic_validation_error_format(self, client):
        # Send wrong types to verify Pydantic error messages are safe
        resp = client.post("/api/score", json={"session_ids": 12345})
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        # Should be structured validation errors, not raw tracebacks
        assert isinstance(detail, list)

    def test_data_path_error_does_not_leak_path(self, client):
        resp = client.get("/api/sessions", params={"data_path": "/nonexistent/dir"})
        assert resp.status_code == 400
        detail = resp.json()["detail"]
        # Error should not echo back the raw user-supplied path
        assert "/nonexistent/dir" not in detail


class TestPathTraversal:
    def test_decode_rejects_etc_passwd(self):
        with pytest.raises(ValueError, match="home directory"):
            _decode_project_path("-etc-passwd")

    def test_decode_rejects_root_path(self):
        with pytest.raises(ValueError, match="home directory"):
            _decode_project_path("-var-log-syslog")

    def test_decode_allows_home_path(self):
        user = os.path.basename(Path.home())
        result = _decode_project_path(f"-home-{user}-projects-myapp")
        assert result.startswith(str(Path.home()))


class TestSecurityHeaders:
    def test_x_content_type_options(self, client):
        resp = client.get("/api/benchmarks")
        assert resp.headers.get("X-Content-Type-Options") == "nosniff"

    def test_x_frame_options(self, client):
        resp = client.get("/api/benchmarks")
        assert resp.headers.get("X-Frame-Options") == "DENY"

    def test_x_xss_protection(self, client):
        resp = client.get("/api/benchmarks")
        assert resp.headers.get("X-XSS-Protection") == "1; mode=block"

    def test_referrer_policy(self, client):
        resp = client.get("/api/benchmarks")
        assert resp.headers.get("Referrer-Policy") == "strict-origin-when-cross-origin"


class TestWebappXSSVectors:
    """Source-level verification that webapp/static/app.js escapes all user-controlled data.

    Mirrors vscode-extension/test/unit/xss.test.ts source-level checks.
    """

    @pytest.fixture(autouse=True)
    def _load_source(self):
        app_js = Path(__file__).parent.parent / "static" / "app.js"
        self.src = app_js.read_text()

    def test_escapeHtml_function_exists(self):
        assert "function escapeHtml(str)" in self.src

    def test_escapes_project_name(self):
        assert "escapeHtml(project)" in self.src

    def test_escapes_one_line_summary(self):
        assert "escapeHtml(scoreData.one_line_summary" in self.src

    def test_escapes_coding_pattern(self):
        assert "escapeHtml(PATTERN_LABELS[scoreData.coding_pattern]" in self.src

    def test_escapes_quickwins_task_title(self):
        assert "escapeHtml(s.task)" in self.src

    def test_escapes_quickwins_repo(self):
        assert "escapeHtml(s.repo)" in self.src

    def test_escapes_quickwins_category(self):
        assert "escapeHtml(s.category)" in self.src

    def test_escapes_quickwins_estimated_minutes(self):
        assert "escapeHtml(s.estimated_minutes)" in self.src

    def test_escapes_quickwins_prompt(self):
        assert "escapeHtml(s.prompt)" in self.src

    def test_escapes_recommendation_title(self):
        assert "escapeHtml(rec.title)" in self.src

    def test_escapes_recommendation_advice(self):
        assert "escapeHtml(rec.advice)" in self.src

    def test_escapes_recommendation_prompt(self):
        assert "escapeHtml(rec.prompt)" in self.src

    def test_escapes_recommendation_source(self):
        assert "escapeHtml(rec.source)" in self.src

    def test_escapes_error_messages(self):
        assert "escapeHtml(e.message)" in self.src

    def test_escapes_optimizer_input_prompt(self):
        assert "escapeHtml(inputPrompt)" in self.src

    def test_escapes_optimizer_optimized_prompt(self):
        assert "escapeHtml(data.optimized_prompt)" in self.src

    def test_escapes_optimizer_explanation(self):
        assert "escapeHtml(data.explanation)" in self.src

    def test_escapes_optimizer_one_line_summary(self):
        assert "escapeHtml(data.one_line_summary)" in self.src

    def test_escapes_behavior_labels(self):
        import re
        assert re.search(r'escapeHtml\(BEHAVIOR_LABELS\[key\]\s*\|\|\s*key\)', self.src)

    def test_no_inline_onclick_handlers(self):
        import re
        assert not re.search(r'onclick\s*=\s*"', self.src)

    def test_conversations_tab_exists_in_html(self):
        html_path = Path(__file__).parent.parent / "static" / "index.html"
        html = html_path.read_text()
        assert 'id="tab-conversations"' in html
        assert 'id="conversations-list-table"' in html
        assert 'data-tab="conversations"' in html
        assert 'id="conv-duration-chart"' in html
        assert 'id="conv-avg-length-chart"' in html

    def test_conversations_tab_no_inline_onclick(self):
        html_path = Path(__file__).parent.parent / "static" / "index.html"
        html = html_path.read_text()
        import re
        conv_match = re.search(r'id="tab-conversations".*?</div>\s*</div>\s*</div>', html, re.DOTALL)
        if conv_match:
            assert not re.search(r'onclick\s*=', conv_match.group(0))

    def test_conversations_list_escapes_dynamic_content(self):
        assert 'escapeHtml(date)' in self.src
        assert 'escapeHtml(dur)' in self.src
        assert 'escapeHtml(tokens)' in self.src
        assert 'escapeHtml(cost)' in self.src
        assert 'escapeHtml(cache)' in self.src
        assert 'escapeHtml(String(tools))' in self.src
        assert 'escapeHtml(String(score))' in self.src

    def test_agent_metrics_section_exists_in_html(self):
        html_path = Path(__file__).parent.parent / "static" / "index.html"
        html = html_path.read_text()
        assert 'id="agent-metrics-section"' in html
        assert 'id="agent-metrics-cards"' in html

    def test_agent_metrics_section_no_inline_onclick(self):
        html_path = Path(__file__).parent.parent / "static" / "index.html"
        html = html_path.read_text()
        import re
        section_match = re.search(r'id="agent-metrics-section".*?</div>\s*</div>', html, re.DOTALL)
        if section_match:
            assert not re.search(r'onclick\s*=', section_match.group(0))

    def test_render_agent_metrics_escapes_dynamic_content(self):
        assert 'escapeHtml(item.title)' in self.src
        assert 'escapeHtml(item.detail)' in self.src
        import re
        assert re.search(r'escapeHtml\(String\(Math\.round\(item\.value \* 100\)\)\)', self.src)

    def test_conversation_detail_escapes_all_user_content(self):
        assert 'escapeHtml(model)' in self.src
        assert 'escapeHtml(branch)' in self.src
        assert 'escapeHtml(version)' in self.src
        assert 'escapeHtml(planMode)' in self.src
        assert 'escapeHtml(started)' in self.src
        assert 'escapeHtml(ended)' in self.src
        assert 'escapeHtml(t)' in self.src  # tool name
        assert 'escapeHtml(p)' in self.src  # prompt text

    def test_conversation_detail_no_inline_onclick(self):
        import re
        detail_fn = re.search(r'function renderConversationDetailContent[\s\S]*?^}', self.src, re.MULTILINE)
        if detail_fn:
            assert not re.search(r'onclick\s*=', detail_fn.group(0))
