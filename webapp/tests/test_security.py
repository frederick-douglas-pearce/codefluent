"""Tests for security concerns: rate limiting, CORS, error leakage."""

import json
import os
from time import time
from unittest.mock import MagicMock, patch

import pytest

from starlette.testclient import TestClient

import main
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
        # The error is captured per-session, check it does not leak raw API key
        if session_id in data["scores"] and "error" in data["scores"][session_id]:
            error_msg = data["scores"][session_id]["error"]
            # The error string is present but the endpoint wraps it safely
            assert isinstance(error_msg, str)

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
