"""Tests for anti_patterns.py — structured output anti-pattern detection."""

import pytest

from anti_patterns import (
    detect_structured_output_anti_pattern,
    detect_anti_patterns,
    STRUCTURED_OUTPUT_PATTERNS,
)


# ─── detect_structured_output_anti_pattern ──────────────────────────


class TestDetectStructuredOutputAntiPattern:
    """Positive, negative, and edge-case tests for structured output detection."""

    # ─── Positive cases ─────────────────────────────────────────────

    @pytest.mark.parametrize("prompt", [
        "Please output as JSON",
        "Please output in JSON",
        "Respond in JSON format",
        "Respond with JSON",
        "Return a JSON object",
        "Return JSON response",
        "Return a JSON output",
        "Format your response as JSON",
        "Format response as JSON",
        "Give me the result as JSON",
        "Give me the response in JSON",
        "Give me result as JSON",
        "Reply in JSON",
        "Reply with JSON",
        "Provide the output using JSON",
        "Provide the result as JSON",
        "Provide response in JSON",
        "JSON format only",
        "JSON format please",
        "Must return JSON",
        "Must be in JSON",
        "Should output JSON",
        "Needs to return JSON",
        "The response should be in json",  # case insensitive
    ])
    def test_positive_detection(self, prompt):
        result = detect_structured_output_anti_pattern([prompt])
        assert result["has_structured_output_antipattern"] is True
        assert result["structured_output_antipattern_count"] == 1
        assert result["structured_output_antipattern_indices"] == [0]

    # ─── Negative cases ─────────────────────────────────────────────

    @pytest.mark.parametrize("prompt", [
        "Parse the JSON file",
        "The API returns JSON",
        "Read the JSON config",
        "JSON is a data format",
        "I saved it as a .json file",
        "Explain JSON schema to me",
        "",
        "Fix the bug in the handler",
        "Convert the CSV to a different format",
    ])
    def test_negative_detection(self, prompt):
        result = detect_structured_output_anti_pattern([prompt])
        assert result["has_structured_output_antipattern"] is False
        assert result["structured_output_antipattern_count"] == 0
        assert result["structured_output_antipattern_indices"] == []

    # ─── Multiple prompts ───────────────────────────────────────────

    def test_mixed_prompts_correct_indices(self):
        prompts = [
            "Fix the login bug",
            "Output as JSON",
            "Add unit tests",
            "Reply in JSON",
            "Refactor the parser",
        ]
        result = detect_structured_output_anti_pattern(prompts)
        assert result["has_structured_output_antipattern"] is True
        assert result["structured_output_antipattern_count"] == 2
        assert result["structured_output_antipattern_indices"] == [1, 3]

    # ─── Empty array ────────────────────────────────────────────────

    def test_empty_array(self):
        result = detect_structured_output_anti_pattern([])
        assert result["has_structured_output_antipattern"] is False
        assert result["structured_output_antipattern_count"] == 0
        assert result["structured_output_antipattern_indices"] == []

    # ─── Count accuracy ─────────────────────────────────────────────

    def test_all_prompts_match(self):
        prompts = [
            "Respond in JSON format",
            "Return a JSON object",
            "Format your response as JSON",
        ]
        result = detect_structured_output_anti_pattern(prompts)
        assert result["has_structured_output_antipattern"] is True
        assert result["structured_output_antipattern_count"] == 3
        assert result["structured_output_antipattern_indices"] == [0, 1, 2]

    def test_counts_each_prompt_once(self):
        """A prompt matching multiple patterns should only be counted once."""
        result = detect_structured_output_anti_pattern(
            ["Return a JSON object and respond in JSON"]
        )
        assert result["structured_output_antipattern_count"] == 1
        assert result["structured_output_antipattern_indices"] == [0]


# ─── detect_anti_patterns ──────────────────────────────────────────


class TestDetectAntiPatterns:
    """Wrapper function delegates to structured output detection."""

    def test_delegates_correctly(self):
        prompts = ["Output as JSON", "Fix the bug"]
        result = detect_anti_patterns(prompts)
        assert result["has_structured_output_antipattern"] is True
        assert result["structured_output_antipattern_count"] == 1
        assert result["structured_output_antipattern_indices"] == [0]

    def test_no_matches(self):
        result = detect_anti_patterns(["Add tests", "Fix the bug"])
        assert result["has_structured_output_antipattern"] is False
        assert result["structured_output_antipattern_count"] == 0
        assert result["structured_output_antipattern_indices"] == []


# ─── STRUCTURED_OUTPUT_PATTERNS ─────────────────────────────────────


class TestPatterns:
    def test_pattern_count(self):
        assert len(STRUCTURED_OUTPUT_PATTERNS) == 9

    def test_all_patterns_are_compiled(self):
        import re
        for pattern in STRUCTURED_OUTPUT_PATTERNS:
            assert isinstance(pattern, re.Pattern)

    def test_all_patterns_are_case_insensitive(self):
        import re
        for pattern in STRUCTURED_OUTPUT_PATTERNS:
            assert pattern.flags & re.IGNORECASE
