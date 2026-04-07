"""Tests for enforcement_gaps module and /api/enforcement-gaps endpoint."""

import json
import sys
from pathlib import Path

import pytest

# Add webapp/ to sys.path so imports work
WEBAPP_DIR = Path(__file__).resolve().parent.parent
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from enforcement_gaps import (
    detect_enforcement_gaps,
    extract_enforcement_statements,
    extract_keywords,
    is_hook_covered,
    map_to_hook_suggestion,
)


# ---- extract_enforcement_statements ----


class TestExtractEnforcementStatements:
    def test_detects_always_pattern(self):
        result = extract_enforcement_statements("Always run tests before committing", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "always"
        assert result[0]["statement"] == "Always run tests before committing"
        assert result[0]["lineNumber"] == 1
        assert result[0]["source"] == "project root"

    def test_detects_never_pattern(self):
        result = extract_enforcement_statements("Never push directly to main", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "never"

    def test_detects_must_pattern(self):
        result = extract_enforcement_statements("You must run lint before committing", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "must"

    def test_detects_must_not_pattern(self):
        result = extract_enforcement_statements("You must not skip tests", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "must"

    def test_detects_required_to_pattern(self):
        result = extract_enforcement_statements("Developers are required to write tests", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "required to"

    def test_detects_every_time_pattern(self):
        result = extract_enforcement_statements("Run the build every time you change code", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "every time"

    def test_detects_without_exception_pattern(self):
        result = extract_enforcement_statements("Tests must pass without exception before merge", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "without exception"

    def test_detects_do_not_ever_pattern(self):
        result = extract_enforcement_statements("Do not ever commit secrets to the repo", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "do not ever"

    def test_detects_under_no_circumstances_pattern(self):
        result = extract_enforcement_statements(
            "Under no circumstances should you skip security reviews", "project root"
        )
        assert len(result) == 1
        assert result[0]["pattern"] == "under no circumstances"

    def test_detects_shall_always_pattern(self):
        result = extract_enforcement_statements("The CI pipeline shall always run before merge", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "shall always"

    def test_detects_should_always_pattern(self):
        result = extract_enforcement_statements("Commits should always be signed", "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "should always"

    def test_returns_correct_line_numbers(self):
        content = "Line 1\nLine 2\nAlways test\nLine 4"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["lineNumber"] == 3

    def test_skips_fenced_code_blocks(self):
        content = "# Rules\n```\nAlways use strict mode\n```\nNever skip tests"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["statement"] == "Never skip tests"

    def test_skips_code_blocks_with_language_annotation(self):
        content = "# Example\n```typescript\nconst always_run = true\n```\nMust lint code"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["statement"] == "Must lint code"

    def test_skips_frontmatter(self):
        content = "---\ntitle: Always be testing\n---\nNever push without review"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["statement"] == "Never push without review"

    def test_handles_empty_content(self):
        assert extract_enforcement_statements("", "project root") == []

    def test_handles_no_enforcement_language(self):
        content = "# README\nThis is a project description.\nFeel free to contribute."
        assert extract_enforcement_statements(content, "project root") == []

    def test_multiple_statements_different_lines(self):
        content = "Always run tests\nSome normal text\nNever skip linting\nMust review PRs"
        result = extract_enforcement_statements(content, ".claude/")
        assert len(result) == 3
        assert result[0]["lineNumber"] == 1
        assert result[1]["lineNumber"] == 3
        assert result[2]["lineNumber"] == 4
        assert result[0]["source"] == ".claude/"

    def test_is_case_insensitive(self):
        content = "ALWAYS run tests\nnEVeR skip linting"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 2

    def test_only_first_pattern_per_line(self):
        content = "You must always run tests"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["pattern"] == "must"

    def test_nested_code_blocks(self):
        content = "```\ncode block\n```\nAlways test\n```\nmore code\n```"
        result = extract_enforcement_statements(content, "project root")
        assert len(result) == 1
        assert result[0]["statement"] == "Always test"


# ---- map_to_hook_suggestion ----


class TestMapToHookSuggestion:
    def test_commit_keywords(self):
        result = map_to_hook_suggestion("Always run tests before committing")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"
        assert result["severity"] == "high"

    def test_push_keywords(self):
        result = map_to_hook_suggestion("Never push directly to main")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"
        assert result["severity"] == "high"

    def test_test_keywords(self):
        result = map_to_hook_suggestion("Must run tests before merge")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"
        assert result["severity"] == "high"

    def test_npm_test(self):
        result = map_to_hook_suggestion("Always run npm test first")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"

    def test_pytest(self):
        result = map_to_hook_suggestion("Must run pytest before pushing")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"

    def test_lint_keywords(self):
        result = map_to_hook_suggestion("Always lint code after changes")
        assert result["event"] == "PostToolUse"
        assert result["matcher"] == "Edit|Write"
        assert result["severity"] == "medium"

    def test_eslint(self):
        result = map_to_hook_suggestion("Must run eslint on all files")
        assert result["event"] == "PostToolUse"
        assert result["matcher"] == "Edit|Write"

    def test_formatting_keywords(self):
        result = map_to_hook_suggestion("Always format with prettier")
        assert result["event"] == "PostToolUse"
        assert result["matcher"] == "Edit|Write"

    def test_security_keywords(self):
        result = map_to_hook_suggestion("Must sanitize all user input")
        assert result["event"] == "PreToolUse"
        assert result["matcher"] == "Bash"
        assert result["severity"] == "high"

    def test_build_keywords(self):
        result = map_to_hook_suggestion("Always build before deploying")
        assert result["event"] == "PostToolUse"
        assert result["matcher"] == "Bash"
        assert result["severity"] == "medium"

    def test_compile_keywords(self):
        result = map_to_hook_suggestion("Must compile the project before deploying")
        assert result["event"] == "PostToolUse"
        assert result["matcher"] == "Bash"

    def test_review_keywords(self):
        result = map_to_hook_suggestion("Must get review before merging")
        assert result["event"] == "Stop"
        assert result["matcher"] is None
        assert result["severity"] == "medium"

    def test_unmapped_returns_default(self):
        result = map_to_hook_suggestion("Always be kind to your teammates")
        assert result["event"] == "Stop"
        assert result["matcher"] is None
        assert result["severity"] == "medium"


# ---- is_hook_covered ----


class TestExtractKeywords:
    def test_extracts_meaningful_words_and_stems(self):
        kw = extract_keywords("All scripts must have the nonce attribute")
        assert "script" in kw    # stemmed from "scripts"
        assert "nonce" in kw
        assert "attribute" in kw
        assert "must" not in kw  # stop word
        assert "all" not in kw   # stop word

    def test_returns_empty_for_stop_words_only(self):
        kw = extract_keywords("must always be used")
        assert len(kw) == 0


class TestIsHookCovered:
    def test_keyword_overlap_matches(self):
        assert is_hook_covered(
            "All scripts must have the nonce attribute",
            ['grep -L nonce= "$file" | echo "missing nonce attribute"'],
        ) is True

    def test_no_keyword_overlap(self):
        assert is_hook_covered(
            "Always explain trade-offs between approaches",
            ['find . -name "*.test.*" | grep -q . || exit 1'],
        ) is False

    def test_empty_hook_commands(self):
        assert is_hook_covered("Must run tests before commit", []) is False

    def test_test_statement_matches_test_hook(self):
        assert is_hook_covered(
            "All new features must have tests",
            ['find . -name "*.test.*" -o -name "test_*" | grep -q .'],
        ) is True

    def test_unrelated_hook_does_not_match(self):
        assert is_hook_covered(
            "All shell commands must use execFileSync with argument arrays",
            ['find . -name "*.test.*" | grep -q .'],
        ) is False

    def test_matches_across_multiple_commands(self):
        assert is_hook_covered(
            "All scripts must have the nonce attribute",
            ['echo "test check"', 'grep -L nonce= "$file" | echo "nonce missing"'],
        ) is True


# ---- detect_enforcement_gaps ----


NO_HOOKS = {
    "configured": False,
    "count": 0,
    "events": [],
    "handlerTypes": [],
    "matchers": [],
    "hookCommands": [],
}


class TestDetectEnforcementGaps:
    def test_all_gaps_when_no_hooks(self):
        content = "Always run tests\nNever push to main"
        report = detect_enforcement_gaps(content, NO_HOOKS)
        assert len(report["enforcementStatements"]) == 2
        assert len(report["gaps"]) == 2
        assert report["coveredCount"] == 0

    def test_covered_when_hook_command_has_keyword_overlap(self):
        content = "Always run tests before commit"
        hooks = {
            "configured": True,
            "count": 1,
            "events": ["PreToolUse"],
            "handlerTypes": ["command"],
            "matchers": ["Bash"],
            "hookCommands": ["git commit && npm test || exit 1"],
        }
        report = detect_enforcement_gaps(content, hooks)
        assert len(report["enforcementStatements"]) == 1
        assert len(report["gaps"]) == 0
        assert report["coveredCount"] == 1

    def test_mixed_covered_and_uncovered(self):
        content = "Always run tests\nAlways format with prettier\nAlways get review"
        hooks = {
            "configured": True,
            "count": 1,
            "events": ["PreToolUse"],
            "handlerTypes": ["command"],
            "matchers": ["Bash"],
            "hookCommands": ['find . -name "*.test.*" | grep -q . || echo "tests missing"'],
        }
        report = detect_enforcement_gaps(content, hooks)
        assert len(report["enforcementStatements"]) == 3
        # "tests" keyword overlaps -> covered; "prettier" and "review" don't -> gaps
        assert report["coveredCount"] == 1
        assert len(report["gaps"]) == 2

    def test_empty_content(self):
        report = detect_enforcement_gaps("", NO_HOOKS)
        assert report["enforcementStatements"] == []
        assert report["gaps"] == []
        assert report["coveredCount"] == 0

    def test_no_enforcement_language(self):
        report = detect_enforcement_gaps("# Project\nThis is a simple project.", NO_HOOKS)
        assert report["enforcementStatements"] == []
        assert report["gaps"] == []
        assert report["coveredCount"] == 0

    def test_uses_provided_source(self):
        report = detect_enforcement_gaps("Always test", NO_HOOKS, ".claude/")
        assert report["enforcementStatements"][0]["source"] == ".claude/"
        assert report["gaps"][0]["source"] == ".claude/"

    def test_defaults_source_to_project_root(self):
        report = detect_enforcement_gaps("Always test", NO_HOOKS)
        assert report["enforcementStatements"][0]["source"] == "project root"

    def test_gap_includes_suggested_hook(self):
        report = detect_enforcement_gaps("Must run tests before commit", NO_HOOKS)
        assert len(report["gaps"]) == 1
        assert report["gaps"][0]["suggestedHookEvent"] == "PreToolUse"
        assert report["gaps"][0]["suggestedMatcher"] == "Bash"
        assert report["gaps"][0]["severity"] == "high"

    def test_gap_for_unmapped_statement(self):
        report = detect_enforcement_gaps("Always be respectful", NO_HOOKS)
        assert report["gaps"][0]["suggestedHookEvent"] == "Stop"
        assert report["gaps"][0]["suggestedMatcher"] is None
        assert report["gaps"][0]["severity"] == "medium"

    def test_real_world_content(self):
        content = "\n".join([
            "# CLAUDE.md",
            "",
            "## Production Standards",
            "- **All new features must have tests.** No merging without test coverage.",
            "- Never commit secrets to the repository.",
            "- Always run `npm test` before pushing.",
            "",
            "```bash",
            "# This should always pass",
            "npm test",
            "```",
            "",
            "- Code should always be formatted with prettier.",
        ])
        report = detect_enforcement_gaps(content, NO_HOOKS)
        assert len(report["enforcementStatements"]) >= 3
        statements_text = [s["statement"] for s in report["enforcementStatements"]]
        assert "# This should always pass" not in statements_text


# ---- API endpoint tests ----


class TestEnforcementGapsEndpoint:
    """Tests for GET /api/enforcement-gaps endpoint."""

    @pytest.fixture()
    def client(self, tmp_path, monkeypatch):
        """TestClient with DATA_DIR pointed at a temp directory."""
        import main as _main
        from starlette.testclient import TestClient

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(_main, "DATA_DIR", data_dir)
        monkeypatch.setattr(_main, "CCUSAGE_DIR", data_dir / "ccusage")
        _main._score_timestamps.clear()
        return TestClient(_main.app)

    def test_no_project_returns_empty_report(self, client):
        resp = client.get("/api/enforcement-gaps")
        assert resp.status_code == 200
        data = resp.json()
        assert data["enforcementStatements"] == []
        assert data["gaps"] == []
        assert data["coveredCount"] == 0

    def test_valid_project_with_claude_md(self, client, tmp_path):
        home = Path.home()
        project_dir = home / "test_enforcement_project"
        project_dir.mkdir(exist_ok=True)
        claude_md = project_dir / "CLAUDE.md"
        claude_md.write_text("Always run tests\nNever skip linting")
        try:
            encoded = str(project_dir).replace("/", "-")
            resp = client.get(f"/api/enforcement-gaps?project={encoded}")
            assert resp.status_code == 200
            data = resp.json()
            assert len(data["enforcementStatements"]) == 2
            assert len(data["gaps"]) == 2
        finally:
            claude_md.unlink()
            project_dir.rmdir()

    def test_valid_project_without_claude_md(self, client, tmp_path):
        home = Path.home()
        project_dir = home / "test_enforcement_nomd"
        project_dir.mkdir(exist_ok=True)
        try:
            encoded = str(project_dir).replace("/", "-")
            resp = client.get(f"/api/enforcement-gaps?project={encoded}")
            assert resp.status_code == 200
            data = resp.json()
            assert data["enforcementStatements"] == []
        finally:
            project_dir.rmdir()

    def test_invalid_project_returns_400(self, client):
        resp = client.get("/api/enforcement-gaps?project=-etc-passwd")
        assert resp.status_code == 400
