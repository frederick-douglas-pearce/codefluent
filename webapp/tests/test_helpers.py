"""Tests for helper functions in main.py."""

import os
import re
from pathlib import Path

import pytest

import main
from main import (
    BEHAVIORS,
    _config_content_hash,
    _decode_project_path,
    _detect_project_repo,
    classify_error,
    compute_aggregate,
    validate_config_score_result,
    validate_optimizer_result,
    validate_score_result,
)
from unittest.mock import MagicMock, patch


# --- _decode_project_path ---

class TestDecodeProjectPath:
    def test_decodes_standard_path(self):
        # Path must be within home directory
        import os
        user = os.path.basename(Path.home())
        encoded = f"-home-{user}-project"
        assert _decode_project_path(encoded) == f"/home/{user}/project"

    def test_handles_leading_dash(self):
        result = _decode_project_path("-home-fdpearce-Documents-Projects")
        assert result == "/home/fdpearce/Documents/Projects"

    def test_rejects_path_outside_home(self):
        with pytest.raises(ValueError, match="home directory"):
            _decode_project_path("-etc-passwd")

    def test_rejects_tmp_path(self):
        with pytest.raises(ValueError, match="home directory"):
            _decode_project_path("-tmp")


# --- _detect_project_repo ---

class TestDetectProjectRepo:
    def test_detects_https_remote(self):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "https://github.com/owner/repo-name.git"

        with patch("main.subprocess.run", return_value=mock_result):
            result = _detect_project_repo("/home/user/project")
            assert result == {"owner": "owner", "name": "repo-name"}

    def test_detects_ssh_remote(self):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "git@github.com:owner/myrepo.git"

        with patch("main.subprocess.run", return_value=mock_result):
            result = _detect_project_repo("/home/user/project")
            assert result == {"owner": "owner", "name": "myrepo"}

    def test_returns_none_when_git_fails(self):
        mock_result = MagicMock()
        mock_result.returncode = 128

        with patch("main.subprocess.run", return_value=mock_result):
            assert _detect_project_repo("/nonexistent") is None

    def test_returns_none_for_non_github(self):
        mock_result = MagicMock()
        mock_result.returncode = 0
        mock_result.stdout = "https://gitlab.com/owner/repo.git"

        with patch("main.subprocess.run", return_value=mock_result):
            assert _detect_project_repo("/home/user/project") is None

    def test_returns_none_on_exception(self):
        with patch("main.subprocess.run", side_effect=Exception("not found")):
            assert _detect_project_repo("/home/user/project") is None


# --- validate_score_result ---

class TestValidateScoreResult:
    def test_validates_well_formed_response(self):
        raw = {
            "fluency_behaviors": {b: (i < 5) for i, b in enumerate(BEHAVIORS)},
            "overall_score": 65,
            "coding_pattern": "conceptual_inquiry",
            "one_line_summary": "Good session",
        }
        result = validate_score_result(raw, "session-1", 5)
        assert result["session_id"] == "session-1"
        assert result["overall_score"] == 65
        assert result["coding_pattern"] == "conceptual_inquiry"
        assert result["coding_pattern_quality"] == "high"
        assert result["low_confidence"] is False
        assert len(result["fluency_behaviors"]) == len(BEHAVIORS)

    def test_handles_missing_behaviors(self):
        raw = {"fluency_behaviors": {}, "overall_score": 50}
        result = validate_score_result(raw, "s1", 5)
        assert all(v is False for v in result["fluency_behaviors"].values())

    def test_handles_invalid_behaviors_type(self):
        raw = {"fluency_behaviors": "invalid", "overall_score": 50}
        result = validate_score_result(raw, "s1", 5)
        assert all(v is False for v in result["fluency_behaviors"].values())

    def test_defaults_non_bool_behaviors_to_false(self):
        raw = {
            "fluency_behaviors": {"iteration_and_refinement": "yes", "clarifying_goals": 1},
            "overall_score": 50,
        }
        result = validate_score_result(raw, "s1", 5)
        assert result["fluency_behaviors"]["iteration_and_refinement"] is False
        assert result["fluency_behaviors"]["clarifying_goals"] is False

    def test_clamps_score_to_zero(self):
        raw = {"overall_score": -10}
        result = validate_score_result(raw, "s1", 5)
        assert result["overall_score"] == 0

    def test_clamps_score_to_hundred(self):
        raw = {"overall_score": 150}
        result = validate_score_result(raw, "s1", 5)
        assert result["overall_score"] == 100

    def test_detects_suspicious_perfect_score(self):
        raw = {
            "fluency_behaviors": {b: True for b in BEHAVIORS},
            "overall_score": 100,
        }
        result = validate_score_result(raw, "s1", 5)
        assert result["suspicious_perfect_score"] is True

    def test_non_perfect_not_suspicious(self):
        raw = {
            "fluency_behaviors": {b: True for b in BEHAVIORS},
            "overall_score": 90,
        }
        result = validate_score_result(raw, "s1", 5)
        assert result["suspicious_perfect_score"] is False

    def test_handles_invalid_coding_pattern(self):
        raw = {"coding_pattern": "made_up_pattern", "overall_score": 50}
        result = validate_score_result(raw, "s1", 5)
        assert result["coding_pattern"] == "unknown"
        assert result["coding_pattern_quality"] == "unknown"

    def test_low_confidence_with_few_prompts(self):
        raw = {"overall_score": 50}
        result = validate_score_result(raw, "s1", 2)
        assert result["low_confidence"] is True

    def test_not_dict_returns_error(self):
        result = validate_score_result("not a dict", "s1", 5)
        assert "error" in result

    def test_low_quality_coding_pattern(self):
        raw = {"coding_pattern": "ai_delegation", "overall_score": 30}
        result = validate_score_result(raw, "s1", 5)
        assert result["coding_pattern"] == "ai_delegation"
        assert result["coding_pattern_quality"] == "low"


# --- validate_optimizer_result ---

class TestValidateOptimizerResult:
    def test_validates_well_formed_response(self):
        raw = {
            "input_behaviors": {b: (i < 3) for i, b in enumerate(BEHAVIORS)},
            "input_score": 30,
            "optimized_prompt": "Better prompt here",
            "behaviors_added": ["clarifying_goals"],
            "explanation": "Added goals",
            "one_line_summary": "Quick summary",
        }
        result = validate_optimizer_result(raw)
        assert result["input_score"] == 30
        assert result["optimized_prompt"] == "Better prompt here"
        assert "clarifying_goals" in result["behaviors_added"]

    def test_handles_missing_fields(self):
        result = validate_optimizer_result({})
        assert result["input_score"] == 0
        assert result["optimized_prompt"] is None
        assert result["behaviors_added"] == []
        assert result["explanation"] is None
        assert result["one_line_summary"] == ""
        assert all(v is False for v in result["input_behaviors"].values())

    def test_truncates_explanation_to_500(self):
        raw = {"explanation": "x" * 600}
        result = validate_optimizer_result(raw)
        assert len(result["explanation"]) == 500

    def test_clamps_score(self):
        raw = {"input_score": 200}
        result = validate_optimizer_result(raw)
        assert result["input_score"] == 100

    def test_filters_invalid_behaviors_added(self):
        raw = {"behaviors_added": ["clarifying_goals", "not_a_real_behavior", 123]}
        result = validate_optimizer_result(raw)
        assert result["behaviors_added"] == ["clarifying_goals"]

    def test_raises_on_non_dict(self):
        with pytest.raises(ValueError, match="not a valid object"):
            validate_optimizer_result("string")

    def test_handles_non_dict_input_behaviors(self):
        raw = {"input_behaviors": "invalid"}
        result = validate_optimizer_result(raw)
        assert all(v is False for v in result["input_behaviors"].values())


# --- validate_config_score_result ---

class TestValidateConfigScoreResult:
    def test_validates_well_formed_response(self):
        raw = {
            "fluency_behaviors": {b: (i < 4) for i, b in enumerate(BEHAVIORS)},
            "one_line_summary": "Project sets interaction terms",
        }
        result = validate_config_score_result(raw)
        assert len(result["fluency_behaviors"]) == len(BEHAVIORS)
        assert result["one_line_summary"] == "Project sets interaction terms"

    def test_handles_invalid_behaviors(self):
        raw = {"fluency_behaviors": "not_a_dict"}
        result = validate_config_score_result(raw)
        assert all(v is False for v in result["fluency_behaviors"].values())

    def test_raises_on_non_dict(self):
        with pytest.raises(ValueError, match="not a valid object"):
            validate_config_score_result([1, 2, 3])

    def test_handles_missing_summary(self):
        raw = {"fluency_behaviors": {}}
        result = validate_config_score_result(raw)
        assert result["one_line_summary"] == ""


# --- compute_aggregate ---

class TestComputeAggregate:
    def test_computes_average_score(self):
        sessions = [
            {
                "fluency_behaviors": {b: (i < 6) for i, b in enumerate(BEHAVIORS)},
                "overall_score": 55,
                "coding_pattern": "conceptual_inquiry",
            },
            {
                "fluency_behaviors": {b: (i < 4) for i, b in enumerate(BEHAVIORS)},
                "overall_score": 36,
                "coding_pattern": "ai_delegation",
            },
        ]
        result = compute_aggregate(sessions)
        # Session 1: 6/11 = 55%, Session 2: 4/11 = 36% -> avg ~45
        assert result["sessions_scored"] == 2
        assert result["average_score"] == round((55 + 36) / 2)
        assert "behavior_prevalence" in result
        assert "pattern_distribution" in result

    def test_merges_config_behaviors_or_logic(self):
        sessions = [
            {
                "fluency_behaviors": {b: False for b in BEHAVIORS},
                "overall_score": 0,
                "coding_pattern": "unknown",
            },
        ]
        config = {"clarifying_goals": True, "providing_examples": True}
        result = compute_aggregate(sessions, config)
        # Config adds 2 behaviors -> 2/11 = 18%
        assert result["average_score"] == round((2 / 11) * 100)
        assert result["behavior_prevalence"]["clarifying_goals"] == 1.0
        assert result["behavior_prevalence"]["providing_examples"] == 1.0
        assert result["config_behaviors"] == config

    def test_handles_empty_session_list(self):
        result = compute_aggregate([])
        assert result["sessions_scored"] == 0
        assert result["average_score"] == 0

    def test_pattern_distribution(self):
        sessions = [
            {"fluency_behaviors": {b: False for b in BEHAVIORS}, "coding_pattern": "conceptual_inquiry"},
            {"fluency_behaviors": {b: False for b in BEHAVIORS}, "coding_pattern": "conceptual_inquiry"},
            {"fluency_behaviors": {b: False for b in BEHAVIORS}, "coding_pattern": "ai_delegation"},
        ]
        result = compute_aggregate(sessions)
        assert result["pattern_distribution"]["conceptual_inquiry"] == 2
        assert result["pattern_distribution"]["ai_delegation"] == 1


# --- classify_error ---

class TestClassifyError:
    def test_rate_limit_error(self):
        err = Exception("Rate limit exceeded")
        err.status_code = 429
        result = classify_error(err)
        assert result["type"] == "rate_limit"
        assert result["retryable"] is True

    def test_auth_error_401(self):
        err = Exception("Unauthorized")
        err.status_code = 401
        result = classify_error(err)
        assert result["type"] == "auth"
        assert result["retryable"] is False

    def test_auth_error_403(self):
        err = Exception("Forbidden")
        err.status_code = 403
        result = classify_error(err)
        assert result["type"] == "auth"
        assert result["retryable"] is False

    def test_server_error(self):
        err = Exception("Internal server error")
        err.status_code = 500
        result = classify_error(err)
        assert result["type"] == "server"
        assert result["retryable"] is True

    def test_network_error_econnreset(self):
        err = Exception("ECONNRESET: connection reset")
        result = classify_error(err)
        assert result["type"] == "network"
        assert result["retryable"] is True

    def test_network_error_timeout(self):
        err = Exception("network timeout on request")
        result = classify_error(err)
        assert result["type"] == "network"
        assert result["retryable"] is True

    def test_network_error_fetch_failed(self):
        err = Exception("fetch failed: socket error")
        result = classify_error(err)
        assert result["type"] == "network"
        assert result["retryable"] is True

    def test_invalid_request_400(self):
        err = Exception("Bad request")
        err.status_code = 400
        result = classify_error(err)
        assert result["type"] == "invalid_request"
        assert result["retryable"] is False

    def test_unknown_error(self):
        err = Exception("Something unexpected")
        result = classify_error(err)
        assert result["type"] == "unknown"
        assert result["retryable"] is False


# --- _config_content_hash ---

class TestConfigContentHash:
    def test_consistent_hash(self):
        content = "# My CLAUDE.md\nSome content here"
        assert _config_content_hash(content) == _config_content_hash(content)

    def test_different_content_different_hash(self):
        hash1 = _config_content_hash("Content A")
        hash2 = _config_content_hash("Content B")
        assert hash1 != hash2

    def test_length_matters(self):
        # Same first 100 chars but different total length
        base = "x" * 100
        hash1 = _config_content_hash(base)
        hash2 = _config_content_hash(base + "extra")
        assert hash1 != hash2

    def test_format(self):
        content = "short"
        result = _config_content_hash(content)
        assert result == "short:5"
