"""Tests for extract_prompts.py — JSONL session parsing."""

import json
from pathlib import Path

import pytest

from extract_prompts import (
    extract_user_text,
    parse_session_file,
    get_all_sessions,
    _get_project_path_encoded,
)


# --- extract_user_text ---

class TestExtractUserText:
    def test_extracts_plain_string(self):
        assert extract_user_text("Hello world") == "Hello world"

    def test_strips_whitespace(self):
        assert extract_user_text("  padded text  ") == "padded text"

    def test_extracts_from_array_of_blocks(self):
        content = [
            {"type": "text", "text": "First part"},
            {"type": "text", "text": "Second part"},
        ]
        assert extract_user_text(content) == "First part Second part"

    def test_skips_non_text_blocks(self):
        content = [
            {"type": "text", "text": "Visible"},
            {"type": "image", "source": "data:..."},
            {"type": "text", "text": "Also visible"},
        ]
        assert extract_user_text(content) == "Visible Also visible"

    def test_handles_empty_string(self):
        assert extract_user_text("") == ""

    def test_handles_empty_list(self):
        assert extract_user_text([]) == ""

    def test_handles_none(self):
        assert extract_user_text(None) == ""

    def test_handles_integer(self):
        assert extract_user_text(42) == ""

    def test_skips_empty_text_blocks(self):
        content = [
            {"type": "text", "text": ""},
            {"type": "text", "text": "Real content"},
        ]
        assert extract_user_text(content) == "Real content"

    def test_handles_block_missing_text_key(self):
        content = [{"type": "text"}]
        assert extract_user_text(content) == ""

    def test_handles_block_missing_type_property(self):
        content = [{"text": "orphan"}]
        assert extract_user_text(content) == ""

    def test_skips_whitespace_only_text_blocks(self):
        content = [
            {"type": "text", "text": "   "},
            {"type": "text", "text": "real content"},
        ]
        assert extract_user_text(content) == "real content"


# --- _get_project_path_encoded ---

class TestGetProjectPathEncoded:
    def test_returns_parent_dir_name(self, tmp_path):
        project = tmp_path / "-home-user-myproject"
        project.mkdir()
        f = project / "session.jsonl"
        f.touch()
        assert _get_project_path_encoded(f) == "-home-user-myproject"

    def test_handles_uuid_subdirectory(self, tmp_path):
        project = tmp_path / "-home-user-myproject"
        uuid_dir = project / "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        uuid_dir.mkdir(parents=True)
        f = uuid_dir / "session.jsonl"
        f.touch()
        assert _get_project_path_encoded(f) == "-home-user-myproject"

    def test_non_uuid_subdir_returns_subdir_name(self, tmp_path):
        project = tmp_path / "-home-user-myproject"
        subdir = project / "not-a-uuid"
        subdir.mkdir(parents=True)
        f = subdir / "session.jsonl"
        f.touch()
        assert _get_project_path_encoded(f) == "not-a-uuid"


# --- parse_session_file ---

class TestParseSessionFile:
    def _write_jsonl(self, path: Path, lines: list[dict]):
        with open(path, "w") as f:
            for line in lines:
                f.write(json.dumps(line) + "\n")

    def test_parses_basic_session(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "version": "2.1.44",
                "message": {"role": "user", "content": "Hello"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result is not None
        assert result["id"] == "sid-1"
        assert result["user_prompts"] == ["Hello"]
        assert result["project"] == "project"
        assert result["claude_code_version"] == "2.1.44"

    def test_handles_content_as_array(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": [
                    {"type": "text", "text": "Array content"},
                ]},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["user_prompts"] == ["Array content"]

    def test_skips_non_user_types(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Real prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {"type": "file-history-snapshot", "timestamp": "2026-03-01T10:00:01.000Z"},
            {"type": "tool_result", "timestamp": "2026-03-01T10:00:02.000Z"},
            {"type": "progress", "timestamp": "2026-03-01T10:00:03.000Z"},
            {"type": "system", "timestamp": "2026-03-01T10:00:04.000Z"},
        ])
        result = parse_session_file(f)
        assert result["user_prompts"] == ["Real prompt"]
        assert result["user_message_count"] == 1

    def test_handles_malformed_jsonl_lines(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        with open(f, "w") as fh:
            fh.write("not valid json\n")
            fh.write(json.dumps({
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Valid line"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            }) + "\n")
            fh.write("{truncated json\n")
        result = parse_session_file(f)
        assert result is not None
        assert result["user_prompts"] == ["Valid line"]

    def test_detects_plan_mode(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Plan this feature"},
                "planContent": "Step 1: ...",
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["used_plan_mode"] is True

    def test_no_plan_mode_by_default(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Regular prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["used_plan_mode"] is False

    def test_counts_thinking(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {"type": "thinking", "timestamp": "2026-03-01T10:00:01.000Z"},
            {"type": "thinking", "timestamp": "2026-03-01T10:00:02.000Z"},
        ])
        result = parse_session_file(f)
        assert result["thinking_count"] == 2

    def test_counts_tool_use(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "assistant",
                "message": {
                    "model": "claude-sonnet-4-20250514",
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "name": "Read"},
                        {"type": "tool_use", "name": "Edit"},
                    ],
                },
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
            {
                "type": "tool_use",
                "name": "Bash",
                "timestamp": "2026-03-01T10:00:02.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["tool_use_count"] == 3
        assert sorted(result["tools_used"]) == ["Bash", "Edit", "Read"]

    def test_extracts_model(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "assistant",
                "message": {
                    "model": "claude-opus-4-6",
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Response"}],
                },
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["model"] == "claude-opus-4-6"

    def test_extracts_git_branch(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "gitBranch": "feature/test",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["git_branch"] == "feature/test"

    def test_skips_sidechain_sessions(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "isSidechain": True,
                "message": {"role": "user", "content": "Sidechain prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result is None

    def test_returns_none_for_empty_file(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        f.write_text("")
        assert parse_session_file(f) is None

    def test_returns_none_for_no_user_prompts(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {"type": "system", "timestamp": "2026-03-01T10:00:00.000Z"},
        ])
        assert parse_session_file(f) is None

    def test_truncates_prompts_to_2000_chars(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        long_prompt = "x" * 5000
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": long_prompt},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert len(result["user_prompts"][0]) == 2000

    def test_filters_interrupted_messages(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Real prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "[Request interrupted by user for tool use]"},
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["user_prompts"] == ["Real prompt"]
        assert result["user_message_count"] == 2

    def test_uses_filename_as_session_id_fallback(self, tmp_path):
        f = tmp_path / "project" / "my-session-id.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["id"] == "my-session-id"

    def test_extracts_timestamps(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "First"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Second"},
                "timestamp": "2026-03-01T10:05:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["started_at"] == "2026-03-01T10:00:00.000Z"
        assert result["ended_at"] == "2026-03-01T10:05:00.000Z"

    def test_returns_none_timestamps_when_absent(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "message": {"role": "user", "content": "No timestamp"},
            },
        ])
        result = parse_session_file(f)
        assert result["started_at"] is None
        assert result["ended_at"] is None

    def test_sorts_tools_used_alphabetically(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Build"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "assistant",
                "message": {
                    "model": "claude-sonnet-4-20250514",
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "name": "Write"},
                        {"type": "tool_use", "name": "Bash"},
                        {"type": "tool_use", "name": "Read"},
                    ],
                },
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["tools_used"] == ["Bash", "Read", "Write"]

    def test_extracts_tool_name_from_message_name(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Do it"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "tool_use",
                "message": {"name": "Grep"},
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
        ])
        result = parse_session_file(f)
        assert "Grep" in result["tools_used"]

    def test_extracts_tool_name_from_nested_content(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Do it"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "tool_use",
                "message": {"content": [{"type": "tool_use", "name": "Glob"}]},
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
        ])
        result = parse_session_file(f)
        assert "Glob" in result["tools_used"]

    def test_sets_project_path_encoded(self, tmp_path):
        project = tmp_path / "-home-user-my-project"
        project.mkdir()
        f = project / "session.jsonl"
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/my-project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["project_path_encoded"] == "-home-user-my-project"

    def test_isSidechain_false_parses_normally(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "isSidechain": False,
                "message": {"role": "user", "content": "Normal prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result is not None
        assert result["user_prompts"] == ["Normal prompt"]

    def test_counts_user_and_assistant_messages(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "First"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
            {
                "type": "assistant",
                "message": {"role": "assistant", "model": "claude-sonnet-4-20250514",
                            "content": [{"type": "text", "text": "Reply"}]},
                "timestamp": "2026-03-01T10:00:01.000Z",
            },
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": "Second"},
                "timestamp": "2026-03-01T10:00:02.000Z",
            },
            {
                "type": "assistant",
                "message": {"role": "assistant", "model": "claude-sonnet-4-20250514",
                            "content": [{"type": "text", "text": "Reply 2"}]},
                "timestamp": "2026-03-01T10:00:03.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["user_message_count"] == 2
        assert result["assistant_message_count"] == 2

    def test_derives_project_name_from_cwd(self, tmp_path):
        f = tmp_path / "encoded-path" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "cwd": "/home/user/my-project",
                "message": {"role": "user", "content": "Prompt"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["project"] == "my-project"

    def test_falls_back_to_dir_name_for_project(self, tmp_path):
        f = tmp_path / "fallback-project" / "session.jsonl"
        f.parent.mkdir()
        self._write_jsonl(f, [
            {
                "type": "user",
                "sessionId": "sid-1",
                "message": {"role": "user", "content": "No cwd"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_file(f)
        assert result["project"] == "fallback-project"


# --- get_all_sessions ---

class TestGetAllSessions:
    def _write_session(self, project_dir: Path, session_id: str, prompts: list[str]):
        f = project_dir / f"{session_id}.jsonl"
        with open(f, "w") as fh:
            for i, prompt in enumerate(prompts):
                fh.write(json.dumps({
                    "type": "user",
                    "sessionId": session_id,
                    "cwd": str(project_dir),
                    "message": {"role": "user", "content": prompt},
                    "timestamp": f"2026-03-01T10:{i:02d}:00.000Z",
                }) + "\n")

    def test_returns_empty_for_nonexistent_dir(self, tmp_path):
        result = get_all_sessions(tmp_path / "nonexistent")
        assert result["sessions"] == []
        assert result["metadata"]["total_sessions"] == 0

    def test_parses_multiple_sessions(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        self._write_session(project, "session-1", ["Prompt A"])
        self._write_session(project, "session-2", ["Prompt B", "Prompt C"])

        result = get_all_sessions(tmp_path)
        assert result["metadata"]["total_sessions"] == 2
        assert result["metadata"]["total_prompts"] == 3

    def test_respects_limit(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        self._write_session(project, "session-1", ["A"])
        self._write_session(project, "session-2", ["B"])
        self._write_session(project, "session-3", ["C"])

        result = get_all_sessions(tmp_path, limit=2)
        assert len(result["sessions"]) == 2

    def test_filters_by_project(self, tmp_path):
        p1 = tmp_path / "-home-user-alpha"
        p1.mkdir()
        self._write_session(p1, "s1", ["Alpha prompt"])

        p2 = tmp_path / "-home-user-beta"
        p2.mkdir()
        self._write_session(p2, "s2", ["Beta prompt"])

        result = get_all_sessions(tmp_path, project="-home-user-alpha")
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["project"] == "-home-user-alpha"

    def test_metadata_counts_projects(self, tmp_path):
        for name in ["proj-a", "proj-b", "proj-c"]:
            p = tmp_path / name
            p.mkdir()
            self._write_session(p, f"s-{name}", ["Prompt"])

        result = get_all_sessions(tmp_path)
        assert result["metadata"]["total_projects"] == 3

    def test_sorts_sessions_by_started_at_descending(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        # Write old session
        with open(project / "old.jsonl", "w") as fh:
            fh.write(json.dumps({
                "type": "user", "sessionId": "old", "cwd": str(project),
                "message": {"role": "user", "content": "Old"},
                "timestamp": "2026-01-01T00:00:00.000Z",
            }) + "\n")
        # Write new session
        with open(project / "new.jsonl", "w") as fh:
            fh.write(json.dumps({
                "type": "user", "sessionId": "new", "cwd": str(project),
                "message": {"role": "user", "content": "New"},
                "timestamp": "2026-03-01T00:00:00.000Z",
            }) + "\n")

        result = get_all_sessions(tmp_path)
        assert result["sessions"][0]["id"] == "new"
        assert result["sessions"][1]["id"] == "old"

    def test_metadata_extracted_at_is_iso_format(self, tmp_path):
        result = get_all_sessions(tmp_path / "nonexistent")
        assert "T" in result["metadata"]["extracted_at"]

    def test_discovers_sessions_in_uuid_subdirs(self, tmp_path):
        project = tmp_path / "-home-user-project"
        uuid_dir = project / "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        uuid_dir.mkdir(parents=True)
        with open(uuid_dir / "session.jsonl", "w") as fh:
            fh.write(json.dumps({
                "type": "user", "sessionId": "nested-1", "cwd": str(project),
                "message": {"role": "user", "content": "Nested"},
                "timestamp": "2026-03-01T10:00:00.000Z",
            }) + "\n")

        result = get_all_sessions(tmp_path)
        assert len(result["sessions"]) == 1
        assert result["sessions"][0]["id"] == "nested-1"

    def test_skips_non_directory_entries(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        self._write_session(project, "session-1", ["Prompt"])
        # Create a stray file at the top level
        (tmp_path / "stray-file.txt").write_text("not a directory")

        result = get_all_sessions(tmp_path)
        assert result["metadata"]["total_sessions"] == 1
