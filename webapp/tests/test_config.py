"""Tests for webapp config module."""
import json
import os
from pathlib import Path
from unittest.mock import patch

import pytest

from config import get_config, get_display_config, reset_config_cache, _DEFAULTS_PATH, _LOCAL_CONFIG_PATH


# Load defaults directly for snapshot assertions
defaults = json.loads(_DEFAULTS_PATH.read_text())


@pytest.fixture(autouse=True)
def _reset():
    """Reset config cache before each test."""
    reset_config_cache()
    yield
    reset_config_cache()


class TestGetConfig:
    def test_returns_defaults_with_no_overrides(self):
        assert get_config("scoring.model") == "claude-sonnet-4-20250514"
        assert get_config("scoring.maxPromptsPerConversation") == 20
        assert get_config("retry.maxAttempts") == 3

    def test_env_var_override_string(self):
        with patch.dict(os.environ, {"CODEFLUENT_SCORING_MODEL": "claude-haiku-4-5-20251001"}):
            assert get_config("scoring.model") == "claude-haiku-4-5-20251001"

    def test_env_var_override_int_coercion(self):
        with patch.dict(os.environ, {"CODEFLUENT_SCORING_MAXTOKENS": "2048"}):
            result = get_config("scoring.maxTokens")
            assert result == 2048
            assert isinstance(result, int)

    def test_config_json_override(self, tmp_path):
        config_file = tmp_path / "config.json"
        config_file.write_text(json.dumps({"scoring.model": "custom-model"}))
        with patch("config._LOCAL_CONFIG_PATH", config_file):
            reset_config_cache()
            assert get_config("scoring.model") == "custom-model"

    def test_priority_env_over_config_json(self, tmp_path):
        config_file = tmp_path / "config.json"
        config_file.write_text(json.dumps({"scoring.model": "from-config-json"}))
        with patch("config._LOCAL_CONFIG_PATH", config_file), \
             patch.dict(os.environ, {"CODEFLUENT_SCORING_MODEL": "from-env"}):
            reset_config_cache()
            assert get_config("scoring.model") == "from-env"

    def test_raises_on_unknown_key(self):
        with pytest.raises(KeyError, match="Unknown config key: nonexistent.key"):
            get_config("nonexistent.key")


class TestGetDisplayConfig:
    def test_returns_only_display_keys(self):
        display = get_display_config()
        assert len(display) > 0
        for key in display:
            assert key.startswith("display.")

    def test_includes_all_display_keys(self):
        display = get_display_config()
        assert "display.scoreColorGreen" in display
        assert "display.scoreColorAmber" in display
        assert "display.sparklineMaxWeeks" in display
        assert "display.dataCacheTtlMinutes" in display


class TestDefaultsIntegrity:
    def test_all_expected_keys_present(self):
        expected = [
            "scoring.model", "scoring.maxPromptsPerConversation", "scoring.configTruncationChars",
            "scoring.maxTokens", "scoring.lowConfidenceThreshold",
            "optimizer.model", "optimizer.maxTokens", "optimizer.alreadyGoodThreshold",
            "quickwins.model", "quickwins.maxTokens", "quickwins.claudeMdTruncationChars",
            "retry.maxAttempts", "retry.baseDelayMs",
            "display.scoreColorGreen", "display.scoreColorAmber", "display.sparklineMaxWeeks",
            "display.dataCacheTtlMinutes",
            "rateLimit.maxRequests", "rateLimit.windowSeconds",
            "conversation.inactivityGapMinutes",
        ]
        for key in expected:
            assert key in defaults, f"Missing key: {key}"

    def test_all_values_have_correct_types(self):
        for key, value in defaults.items():
            assert isinstance(value, (str, int, float, bool)), f"{key} has invalid type: {type(value)}"

    def test_default_values_match_previously_hardcoded(self):
        assert defaults["scoring.model"] == "claude-sonnet-4-20250514"
        assert defaults["scoring.maxPromptsPerConversation"] == 20
        assert defaults["scoring.configTruncationChars"] == 4000
        assert defaults["scoring.maxTokens"] == 1024
        assert defaults["scoring.lowConfidenceThreshold"] == 3
        assert defaults["optimizer.model"] == "claude-sonnet-4-20250514"
        assert defaults["optimizer.maxTokens"] == 2048
        assert defaults["optimizer.alreadyGoodThreshold"] == 90
        assert defaults["quickwins.model"] == "claude-sonnet-4-20250514"
        assert defaults["quickwins.maxTokens"] == 2048
        assert defaults["quickwins.claudeMdTruncationChars"] == 2000
        assert defaults["retry.maxAttempts"] == 3
        assert defaults["retry.baseDelayMs"] == 1000
        assert defaults["display.scoreColorGreen"] == 70
        assert defaults["display.scoreColorAmber"] == 50
        assert defaults["display.sparklineMaxWeeks"] == 12
        assert defaults["display.dataCacheTtlMinutes"] == 5
        assert defaults["rateLimit.maxRequests"] == 10
        assert defaults["rateLimit.windowSeconds"] == 60
        assert defaults["conversation.inactivityGapMinutes"] == 60
