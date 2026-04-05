"""Tests for the config advisor API endpoint."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main
from tests.conftest import make_anthropic_response, _mock_project_encoded


VALID_API_RESPONSE = {
    "hookConfig": {
        "hooks": {
            "PreToolUse": [
                {
                    "matcher": "Bash",
                    "hooks": [
                        {
                            "type": "command",
                            "command": "echo \"$TOOL_INPUT\" | jq -r '.command' | grep -qvE '\\bgit\\s+push\\b' || (echo 'Direct git push is not allowed.' && exit 1)",
                        }
                    ],
                }
            ]
        }
    },
    "explanation": "This hook prevents direct git push by inspecting Bash commands before execution.",
    "applyInstructions": "Add this to your project's .claude/settings.json file.",
}


class TestPostGenerateHookConfig:
    def test_validates_empty_statement(self, client):
        resp = client.post("/api/generate-hook-config", json={"statement": ""})
        assert resp.status_code == 422

    def test_validates_missing_statement(self, client):
        resp = client.post("/api/generate-hook-config", json={})
        assert resp.status_code == 422

    def test_validates_statement_too_long(self, client):
        resp = client.post("/api/generate-hook-config", json={"statement": "x" * 2001})
        assert resp.status_code == 422

    def test_returns_hook_config(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly to main"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "hookConfig" in data
        assert "explanation" in data
        assert "applyInstructions" in data
        assert "prompt_version" in data
        assert isinstance(data["hookConfig"], dict)
        assert "hooks" in data["hookConfig"]

    def test_returns_cached_result_on_second_call(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        # First call
        resp1 = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly to main"},
        )
        assert resp1.status_code == 200

        # Second call should use cache (no additional API call)
        resp2 = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly to main"},
        )
        assert resp2.status_code == 200
        assert resp2.json() == resp1.json()
        # API should only have been called once
        assert mock_anthropic.messages.create.call_count == 1

    def test_different_statements_get_different_cache_keys(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        client.post(
            "/api/generate-hook-config",
            json={"statement": "Always run tests"},
        )
        assert mock_anthropic.messages.create.call_count == 2

    def test_rate_limiter_applies(self, client):
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(main.time())

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 429

    def test_handles_malformed_api_response(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            "not valid json at all"
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 500

    def test_handles_missing_hookConfig_in_response(self, client, mock_anthropic):
        incomplete_response = {
            "explanation": "Some explanation",
            "applyInstructions": "Some instructions",
        }
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(incomplete_response)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 500

    def test_handles_missing_explanation_in_response(self, client, mock_anthropic):
        incomplete_response = {
            "hookConfig": {"hooks": {}},
            "applyInstructions": "Some instructions",
        }
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(incomplete_response)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 500

    def test_handles_missing_applyInstructions_in_response(self, client, mock_anthropic):
        incomplete_response = {
            "hookConfig": {"hooks": {}},
            "explanation": "Some explanation",
        }
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(incomplete_response)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 500

    def test_default_hook_event_is_pretooluse(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 200
        # Verify the prompt contained PreToolUse
        call_args = mock_anthropic.messages.create.call_args
        sent_content = call_args[1]["messages"][0]["content"]
        assert "PreToolUse" in sent_content

    def test_custom_hook_event_is_used(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Always lint after editing", "hook_event": "PostToolUse"},
        )
        assert resp.status_code == 200
        call_args = mock_anthropic.messages.create.call_args
        sent_content = call_args[1]["messages"][0]["content"]
        assert "PostToolUse" in sent_content

    def test_strips_markdown_fences_from_response(self, client, mock_anthropic):
        fenced_response = "```json\n" + json.dumps(VALID_API_RESPONSE) + "\n```"
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            fenced_response
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "hookConfig" in data

    def test_uses_optimizer_model(self, client, mock_anthropic):
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        call_args = mock_anthropic.messages.create.call_args
        assert call_args[1]["model"] == main.get_config("optimizer.model")

    def test_error_messages_are_sanitized(self, client, mock_anthropic):
        mock_anthropic.messages.create.side_effect = Exception(
            "Error with key sk-ant-secret-key-12345"
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "Never push directly"},
        )
        assert resp.status_code == 500
        assert "sk-ant" not in resp.json()["detail"]
        assert "[REDACTED]" in resp.json()["detail"]


class TestConfigAdvisorCache:
    def test_load_returns_empty_dict_for_missing_file(self, client):
        result = main._load_config_advisor_cache()
        assert result == {}

    def test_save_and_load_round_trip(self, client):
        data = {"key1": {"hookConfig": {}, "prompt_version": "v1"}}
        main._save_config_advisor_cache(data)
        loaded = main._load_config_advisor_cache()
        assert loaded == data

    def test_cache_invalidated_by_prompt_version_change(self, client, mock_anthropic, monkeypatch):
        # Pre-seed cache with old version
        old_cache = {
            main._config_content_hash("test statementPreToolUse"): {
                "hookConfig": {"hooks": {}},
                "explanation": "old",
                "applyInstructions": "old",
                "prompt_version": "old-version",
            }
        }
        main._save_config_advisor_cache(old_cache)

        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(VALID_API_RESPONSE)
        )

        resp = client.post(
            "/api/generate-hook-config",
            json={"statement": "test statement"},
        )
        assert resp.status_code == 200
        # Should have called API because version mismatch
        assert mock_anthropic.messages.create.call_count == 1


class TestConfigAdvisorPrompt:
    def test_prompt_loads_from_registry(self):
        assert main.CONFIG_ADVISOR_PROMPT_TEMPLATE
        assert len(main.CONFIG_ADVISOR_PROMPT_TEMPLATE) > 100

    def test_prompt_version_set(self):
        assert main.CONFIG_ADVISOR_PROMPT_VERSION
        assert main.CONFIG_ADVISOR_PROMPT_VERSION.startswith("config_advisor-")

    def test_prompt_contains_placeholders(self):
        assert "{{STATEMENT}}" in main.CONFIG_ADVISOR_PROMPT_TEMPLATE
        assert "{{HOOK_EVENT}}" in main.CONFIG_ADVISOR_PROMPT_TEMPLATE
        assert "{{MATCHER}}" in main.CONFIG_ADVISOR_PROMPT_TEMPLATE
        assert "{{SEVERITY}}" in main.CONFIG_ADVISOR_PROMPT_TEMPLATE
        assert "{{CONTEXT}}" in main.CONFIG_ADVISOR_PROMPT_TEMPLATE
