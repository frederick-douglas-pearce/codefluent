"""Tests for prompt loading and template filling in main.py."""

from pathlib import Path

import pytest

import main
from main import _fill_template


class TestFillTemplate:
    def test_replaces_single_placeholder(self):
        result = _fill_template("Hello {{NAME}}", {"NAME": "World"})
        assert result == "Hello World"

    def test_replaces_multiple_placeholders(self):
        template = "{{A}} and {{B}}"
        result = _fill_template(template, {"A": "First", "B": "Second"})
        assert result == "First and Second"

    def test_leaves_unmatched_placeholders(self):
        result = _fill_template("{{KNOWN}} and {{UNKNOWN}}", {"KNOWN": "yes"})
        assert result == "yes and {{UNKNOWN}}"

    def test_empty_variables(self):
        result = _fill_template("No {{CHANGE}}", {})
        assert result == "No {{CHANGE}}"

    def test_replaces_same_placeholder_multiple_times(self):
        result = _fill_template("{{X}} + {{X}}", {"X": "1"})
        assert result == "1 + 1"

    def test_handles_empty_template(self):
        assert _fill_template("", {"A": "B"}) == ""

    def test_handles_multiline_template(self):
        template = "Line 1: {{A}}\nLine 2: {{B}}"
        result = _fill_template(template, {"A": "alpha", "B": "beta"})
        assert result == "Line 1: alpha\nLine 2: beta"


class TestLoadPrompt:
    """Verify all prompt types load correctly from shared/prompts/."""

    def test_scoring_prompt_loaded(self):
        assert main.SCORING_PROMPT_TEMPLATE
        assert main.SCORING_PROMPT_VERSION
        assert "scoring" in main.SCORING_PROMPT_VERSION

    def test_config_prompt_loaded(self):
        assert main.CONFIG_SCORING_PROMPT_TEMPLATE
        assert main.CONFIG_SCORING_PROMPT_VERSION
        assert "config" in main.CONFIG_SCORING_PROMPT_VERSION

    def test_optimizer_prompt_loaded(self):
        assert main.OPTIMIZER_PROMPT_TEMPLATE
        assert main.OPTIMIZER_PROMPT_VERSION
        assert "optimizer" in main.OPTIMIZER_PROMPT_VERSION

    def test_single_scoring_prompt_loaded(self):
        assert main.SINGLE_SCORING_PROMPT_TEMPLATE
        assert main.SINGLE_SCORING_PROMPT_VERSION
        assert "single_scoring" in main.SINGLE_SCORING_PROMPT_VERSION

    def test_scoring_template_has_expected_placeholders(self):
        for placeholder in ["{{USED_PLAN_MODE}}", "{{THINKING_COUNT}}", "{{TOOLS_USED}}", "{{PROMPTS}}"]:
            assert placeholder in main.SCORING_PROMPT_TEMPLATE

    def test_config_template_has_expected_placeholder(self):
        assert "{{CONTENT}}" in main.CONFIG_SCORING_PROMPT_TEMPLATE

    def test_optimizer_template_has_expected_placeholders(self):
        for placeholder in ["{{PROMPT}}", "{{MAX_LENGTH}}", "{{CONFIG_BEHAVIORS}}"]:
            assert placeholder in main.OPTIMIZER_PROMPT_TEMPLATE

    def test_single_scoring_template_has_expected_placeholder(self):
        assert "{{PROMPT}}" in main.SINGLE_SCORING_PROMPT_TEMPLATE

    def test_version_format(self):
        """All versions should match 'type-vX.Y' format."""
        import re
        for version in [
            main.SCORING_PROMPT_VERSION,
            main.CONFIG_SCORING_PROMPT_VERSION,
            main.OPTIMIZER_PROMPT_VERSION,
            main.SINGLE_SCORING_PROMPT_VERSION,
        ]:
            assert re.match(r'^[a-z_]+-v\d+\.\d+$', version), f"Bad version format: {version}"


class TestRegistryConsistency:
    """Verify registry.json points to files that exist."""

    def test_all_registry_files_exist(self):
        import json
        prompts_dir = Path(__file__).parent.parent.parent / "shared" / "prompts"
        with open(prompts_dir / "registry.json") as f:
            registry = json.load(f)
        for key, entry in registry.items():
            prompt_file = prompts_dir / entry["file"]
            assert prompt_file.exists(), f"Registry points to missing file: {entry['file']}"
            assert entry["version"], f"Empty version for {key}"
