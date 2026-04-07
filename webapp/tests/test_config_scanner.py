"""Tests for config_scanner module and /api/config-maturity endpoint."""

import json
import sys
from pathlib import Path
from unittest.mock import patch

import pytest

# Add webapp/ to sys.path so imports work
WEBAPP_DIR = Path(__file__).resolve().parent.parent
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from config_scanner import parse_frontmatter, scan_configuration_maturity


# ---- parse_frontmatter ----


class TestParseFrontmatter:
    def test_returns_none_when_no_frontmatter(self):
        assert parse_frontmatter("# Hello world") is None

    def test_returns_none_for_incomplete_frontmatter(self):
        assert parse_frontmatter("---\nkey: value\n") is None

    def test_parses_simple_key_value_pairs(self):
        content = "---\ntitle: My Rule\ndescription: A test rule\n---\n# Content"
        result = parse_frontmatter(content)
        assert result == {"title": "My Rule", "description": "A test rule"}

    def test_handles_colon_in_value(self):
        content = "---\nurl: https://example.com\n---\n"
        result = parse_frontmatter(content)
        assert result == {"url": "https://example.com"}

    def test_detects_array_values(self):
        content = "---\nglobs: [*.ts, *.js]\n---\nContent"
        result = parse_frontmatter(content)
        assert result is not None
        assert result["globs"] == "[*.ts, *.js]"

    def test_handles_windows_line_endings(self):
        content = "---\r\nkey: value\r\n---\r\nContent"
        result = parse_frontmatter(content)
        assert result == {"key": "value"}

    def test_skips_comment_lines(self):
        content = "---\n# comment\nkey: value\n---\n"
        result = parse_frontmatter(content)
        assert result == {"key": "value"}

    def test_skips_empty_lines(self):
        content = "---\nkey: value\n\nother: thing\n---\n"
        result = parse_frontmatter(content)
        assert result == {"key": "value", "other": "thing"}

    def test_handles_frontmatter_at_end_of_file(self):
        content = "---\nkey: value\n---"
        result = parse_frontmatter(content)
        assert result == {"key": "value"}

    def test_returns_empty_dict_for_whitespace_only_frontmatter(self):
        content = "---\n  \n---\nContent"
        result = parse_frontmatter(content)
        assert result == {}

    def test_ignores_lines_without_colons(self):
        content = "---\nkey: value\nno-colon-here\n---\n"
        result = parse_frontmatter(content)
        assert result == {"key": "value"}


# ---- scan_configuration_maturity: hooks ----


class TestScanHooks:
    def test_returns_defaults_when_no_settings(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"] == {
            "configured": False,
            "count": 0,
            "events": [],
            "handlerTypes": [],
            "matchers": [],
            "hookCommands": [],
        }

    def test_detects_hooks_from_project_settings(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.json").write_text(json.dumps({
            "hooks": {
                "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo"}]}],
            },
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["configured"] is True
        assert result["hooks"]["count"] == 1
        assert result["hooks"]["events"] == ["PreToolUse"]
        assert result["hooks"]["handlerTypes"] == ["command"]
        assert result["hooks"]["matchers"] == ["Bash"]

    def test_detects_hooks_from_user_settings(self, tmp_path):
        home = tmp_path / "home"
        settings_dir = home / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.json").write_text(json.dumps({
            "hooks": {
                "PostToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "lint"}]}],
            },
        }))
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["configured"] is True
        assert result["hooks"]["events"] == ["PostToolUse"]

    def test_merges_hooks_from_project_and_user(self, tmp_path):
        home = tmp_path / "home"
        user_settings = home / ".claude"
        user_settings.mkdir(parents=True)
        (user_settings / "settings.json").write_text(json.dumps({
            "hooks": {
                "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo 1"}]}],
            },
        }))
        project = tmp_path / "project"
        proj_settings = project / ".claude"
        proj_settings.mkdir(parents=True)
        (proj_settings / "settings.json").write_text(json.dumps({
            "hooks": {
                "PostToolUse": [{"matcher": "Edit", "hooks": [{"type": "command", "command": "echo 2"}]}],
            },
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["count"] == 2
        assert result["hooks"]["events"] == ["PostToolUse", "PreToolUse"]
        assert result["hooks"]["matchers"] == ["Bash", "Edit"]

    def test_handles_malformed_json(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.json").write_text("not json{{{")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["configured"] is False

    def test_handles_missing_hooks_key(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.json").write_text(json.dumps({"other": True}))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["configured"] is False

    def test_counts_multiple_hooks_within_single_event(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.json").write_text(json.dumps({
            "hooks": {
                "PreToolUse": [
                    {"matcher": "Bash", "hooks": [
                        {"type": "command", "command": "echo 1"},
                        {"type": "command", "command": "echo 2"},
                    ]},
                    {"matcher": "Edit", "hooks": [{"type": "command", "command": "lint"}]},
                ],
            },
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["hooks"]["count"] == 3


# ---- scan_configuration_maturity: rules ----


class TestScanRules:
    def test_returns_defaults_when_missing(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["rules"] == {"count": 0, "hasPathScoping": False}

    def test_counts_md_files(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        rules_dir = project / ".claude" / "rules"
        rules_dir.mkdir(parents=True)
        (rules_dir / "rule1.md").write_text("# Rule 1")
        (rules_dir / "rule2.md").write_text("# Rule 2")
        (rules_dir / "ignore.txt").write_text("not a rule")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["rules"]["count"] == 2

    def test_detects_path_scoping(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        rules_dir = project / ".claude" / "rules"
        rules_dir.mkdir(parents=True)
        (rules_dir / "scoped.md").write_text("---\nglobs: [*.ts]\n---\nUse strict mode")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["rules"]["hasPathScoping"] is True

    def test_no_path_scoping_without_globs(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        rules_dir = project / ".claude" / "rules"
        rules_dir.mkdir(parents=True)
        (rules_dir / "global.md").write_text("---\ntitle: Rule\n---\nContent")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["rules"]["hasPathScoping"] is False


# ---- scan_configuration_maturity: commands ----


class TestScanCommands:
    def test_returns_zero_when_missing(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["commands"] == {"count": 0}

    def test_counts_md_files(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        commands_dir = project / ".claude" / "commands"
        commands_dir.mkdir(parents=True)
        (commands_dir / "deploy.md").write_text("# Deploy")
        (commands_dir / "test.md").write_text("# Test")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["commands"]["count"] == 2


# ---- scan_configuration_maturity: skills ----


class TestScanSkills:
    def test_returns_defaults_when_missing(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["skills"] == {"count": 0, "hasFrontmatter": False}

    def test_counts_subdirectories(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        skills_dir = project / ".claude" / "skills"
        (skills_dir / "skill-a").mkdir(parents=True)
        (skills_dir / "skill-b").mkdir(parents=True)
        # Regular file should not be counted
        (skills_dir / "readme.md").write_text("not a skill")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["skills"]["count"] == 2

    def test_detects_frontmatter_in_skill_files(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        skill_dir = project / ".claude" / "skills" / "my-skill"
        skill_dir.mkdir(parents=True)
        (skill_dir / "skill.md").write_text("---\nname: My Skill\n---\nContent")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["skills"]["hasFrontmatter"] is True

    def test_no_frontmatter_when_absent(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        skill_dir = project / ".claude" / "skills" / "basic"
        skill_dir.mkdir(parents=True)
        (skill_dir / "readme.md").write_text("# Just a heading")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["skills"]["hasFrontmatter"] is False


# ---- scan_configuration_maturity: mcp ----


class TestScanMcp:
    def test_returns_defaults_when_no_config(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["mcp"] == {"configured": False, "serverCount": 0}

    def test_detects_project_mcp_json(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"github": {"command": "gh-mcp"}, "slack": {"command": "slack-mcp"}},
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["mcp"]["configured"] is True
        assert result["mcp"]["serverCount"] == 2

    def test_detects_user_claude_json(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (home / ".claude.json").write_text(json.dumps({
            "mcpServers": {"global": {"command": "server"}},
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["mcp"]["configured"] is True
        assert result["mcp"]["serverCount"] == 1

    def test_merges_and_deduplicates(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"shared": {"command": "a"}, "project_only": {"command": "b"}},
        }))
        (home / ".claude.json").write_text(json.dumps({
            "mcpServers": {"shared": {"command": "c"}, "user_only": {"command": "d"}},
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["mcp"]["serverCount"] == 3

    def test_handles_malformed_json(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / ".mcp.json").write_text("not json")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["mcp"]["configured"] is False


# ---- scan_configuration_maturity: claudeMd ----


class TestScanClaudeMd:
    def test_returns_defaults_when_absent(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["claudeMd"] == {"present": False, "locations": [], "hasImports": False}

    def test_detects_at_project_root(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / "CLAUDE.md").write_text("# Instructions")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["claudeMd"]["present"] is True
        assert "project root" in result["claudeMd"]["locations"]

    def test_detects_at_claude_subdir(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        claude_dir = project / ".claude"
        claude_dir.mkdir(parents=True)
        (claude_dir / "CLAUDE.md").write_text("# Hidden")
        result = scan_configuration_maturity(str(project), str(home))
        assert ".claude/" in result["claudeMd"]["locations"]

    def test_detects_at_user_home(self, tmp_path):
        home = tmp_path / "home"
        claude_dir = home / ".claude"
        claude_dir.mkdir(parents=True)
        (claude_dir / "CLAUDE.md").write_text("# User-level")
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert "~/.claude/" in result["claudeMd"]["locations"]

    def test_detects_multiple_locations(self, tmp_path):
        home = tmp_path / "home"
        home_claude = home / ".claude"
        home_claude.mkdir(parents=True)
        (home_claude / "CLAUDE.md").write_text("# Home")
        project = tmp_path / "project"
        project.mkdir()
        (project / "CLAUDE.md").write_text("# Root")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["claudeMd"]["locations"] == ["project root", "~/.claude/"]

    def test_detects_import_directive(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / "CLAUDE.md").write_text("@import ./docs/spec.md\n# Content")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["claudeMd"]["hasImports"] is True

    def test_no_imports_when_absent(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        (project / "CLAUDE.md").write_text("# No imports")
        result = scan_configuration_maturity(str(project), str(home))
        assert result["claudeMd"]["hasImports"] is False


# ---- scan_configuration_maturity: permissions ----


class TestScanPermissions:
    def test_not_configured_when_missing(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        project.mkdir()
        result = scan_configuration_maturity(str(project), str(home))
        assert result["permissions"] == {"configured": False}

    def test_detects_permissions_key(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.local.json").write_text(json.dumps({
            "permissions": {"allow": ["Bash"]},
        }))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["permissions"]["configured"] is True

    def test_not_configured_without_permissions_key(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        settings_dir = project / ".claude"
        settings_dir.mkdir(parents=True)
        (settings_dir / "settings.local.json").write_text(json.dumps({"other": "stuff"}))
        result = scan_configuration_maturity(str(project), str(home))
        assert result["permissions"]["configured"] is False


# ---- Error resilience ----


class TestErrorResilience:
    def test_returns_defaults_with_none_project_root(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        result = scan_configuration_maturity(None, str(home))
        assert result["rules"] == {"count": 0, "hasPathScoping": False}
        assert result["commands"] == {"count": 0}
        assert result["skills"] == {"count": 0, "hasFrontmatter": False}
        assert result["permissions"] == {"configured": False}

    def test_never_throws_for_nonexistent_path(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        result = scan_configuration_maturity("/nonexistent/path", str(home))
        assert "hooks" in result
        assert "rules" in result

    def test_returns_complete_structure(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        result = scan_configuration_maturity(None, str(home))
        expected_keys = {"hooks", "rules", "commands", "skills", "mcp", "claudeMd", "permissions"}
        assert set(result.keys()) == expected_keys


# ---- Full scan ----


class TestFullScan:
    def test_detects_all_artifacts(self, tmp_path):
        home = tmp_path / "home"
        home.mkdir()
        project = tmp_path / "project"
        claude_dir = project / ".claude"

        # Hooks
        claude_dir.mkdir(parents=True)
        (claude_dir / "settings.json").write_text(json.dumps({
            "hooks": {
                "PreToolUse": [{"matcher": "Bash", "hooks": [{"type": "command", "command": "echo"}]}],
            },
        }))

        # Rules
        rules_dir = claude_dir / "rules"
        rules_dir.mkdir()
        (rules_dir / "ts-rule.md").write_text("---\nglobs: [*.ts]\n---\nContent")

        # Commands
        commands_dir = claude_dir / "commands"
        commands_dir.mkdir()
        (commands_dir / "deploy.md").write_text("# Deploy")

        # Skills
        skill_dir = claude_dir / "skills" / "my-skill"
        skill_dir.mkdir(parents=True)
        (skill_dir / "skill.md").write_text("---\nname: test\n---\nContent")

        # MCP
        (project / ".mcp.json").write_text(json.dumps({
            "mcpServers": {"github": {"command": "gh-mcp"}},
        }))

        # CLAUDE.md
        (project / "CLAUDE.md").write_text("# Project\n@import ./spec.md")

        # Permissions
        (claude_dir / "settings.local.json").write_text(json.dumps({
            "permissions": {"allow": ["Bash"]},
        }))

        result = scan_configuration_maturity(str(project), str(home))

        assert result["hooks"]["configured"] is True
        assert result["hooks"]["count"] == 1
        assert result["rules"]["count"] == 1
        assert result["rules"]["hasPathScoping"] is True
        assert result["commands"]["count"] == 1
        assert result["skills"]["count"] == 1
        assert result["skills"]["hasFrontmatter"] is True
        assert result["mcp"]["configured"] is True
        assert result["mcp"]["serverCount"] == 1
        assert result["claudeMd"]["present"] is True
        assert result["claudeMd"]["hasImports"] is True
        assert result["permissions"]["configured"] is True


# ---- API endpoint tests ----


class TestConfigMaturityEndpoint:
    """Tests for GET /api/config-maturity endpoint."""

    @pytest.fixture()
    def client(self, tmp_path, monkeypatch):
        """TestClient with DATA_DIR pointed at a temp directory."""
        from unittest.mock import MagicMock, patch as _patch
        import main as _main
        from starlette.testclient import TestClient

        data_dir = tmp_path / "data"
        data_dir.mkdir()
        monkeypatch.setattr(_main, "DATA_DIR", data_dir)
        monkeypatch.setattr(_main, "CCUSAGE_DIR", data_dir / "ccusage")
        _main._score_timestamps.clear()
        return TestClient(_main.app)

    def test_no_project_returns_home_only_scan(self, client):
        resp = client.get("/api/config-maturity")
        assert resp.status_code == 200
        data = resp.json()
        assert "hooks" in data
        assert "rules" in data
        assert "commands" in data
        assert "skills" in data
        assert "mcp" in data
        assert "claudeMd" in data
        assert "permissions" in data

    def test_valid_project_returns_structure(self, client, tmp_path):
        # Create a project within home dir for path validation
        home = Path.home()
        project_dir = home / "test-config-maturity-project"
        project_dir.mkdir(exist_ok=True)
        try:
            encoded = str(project_dir).replace("/", "-")
            resp = client.get(f"/api/config-maturity?project={encoded}")
            assert resp.status_code == 200
            data = resp.json()
            assert "hooks" in data
        finally:
            project_dir.rmdir()

    def test_invalid_project_returns_400(self, client):
        # Path outside home directory should be rejected
        resp = client.get("/api/config-maturity?project=-etc-passwd")
        assert resp.status_code == 400
