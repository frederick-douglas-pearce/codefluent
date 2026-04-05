"""Tests for conversations.py — conversation assembly from pooled session messages."""

import json
from datetime import datetime
from pathlib import Path

import pytest

from extract_prompts import parse_session_messages
from conversations import build_conversations, get_all_conversations


# ─── Helpers ─────────────────────────────────────────────────────────

def _write_jsonl(path: Path, lines: list[dict]):
    with open(path, "w") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")


def _user_msg(content="Prompt", session_id="sid-1", timestamp="2026-03-01T10:00:00.000Z", **kwargs):
    return {
        "type": "user",
        "sessionId": session_id,
        "cwd": kwargs.pop("cwd", "/home/user/project"),
        "message": {"role": "user", "content": content},
        "timestamp": timestamp,
        **kwargs,
    }


def _assistant_msg(timestamp="2026-03-01T10:00:05.000Z", usage=None, **kwargs):
    msg = {
        "type": "assistant",
        "message": {
            "model": "claude-sonnet-4-20250514",
            "role": "assistant",
            "content": [{"type": "text", "text": "Response"}],
        },
        "timestamp": timestamp,
        **kwargs,
    }
    if usage:
        msg["message"]["usage"] = usage
    return msg


def _make_user_message(timestamp, content, session_id="sess-1", pos=0):
    return {
        "type": "user", "timestamp": timestamp, "session_id": session_id,
        "file_position": pos, "content": content, "used_plan_mode": False,
    }


def _make_assistant_message(timestamp, usage=None, session_id="sess-1", pos=0):
    msg = {
        "type": "assistant", "timestamp": timestamp, "session_id": session_id,
        "file_position": pos, "model": "claude-sonnet-4-20250514",
    }
    if usage:
        msg["usage"] = usage
    return msg


def _make_tool_use(timestamp, name, session_id="sess-1", pos=0):
    return {
        "type": "tool_use", "timestamp": timestamp, "session_id": session_id,
        "file_position": pos, "tool_names": [name],
    }


def _make_thinking(timestamp, session_id="sess-1", pos=0):
    return {
        "type": "thinking", "timestamp": timestamp, "session_id": session_id,
        "file_position": pos,
    }


# ─── parse_session_messages ──────────────────────────────────────────

class TestParseSessionMessages:
    def test_returns_none_for_empty_file(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        f.write_text("")
        assert parse_session_messages(f) is None

    def test_returns_none_for_nonexistent_file(self, tmp_path):
        assert parse_session_messages(tmp_path / "nonexistent.jsonl") is None

    def test_returns_none_for_sidechain(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [_user_msg(isSidechain=True)])
        assert parse_session_messages(f) is None

    def test_extracts_user_messages(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg("Hello Claude"),
            _assistant_msg(),
        ])
        result = parse_session_messages(f)
        assert result is not None
        user_msgs = [m for m in result["messages"] if m["type"] == "user"]
        assert len(user_msgs) == 1
        assert user_msgs[0]["content"] == "Hello Claude"

    def test_extracts_array_content(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            {
                "type": "user", "sessionId": "sid-1",
                "cwd": "/home/user/project",
                "message": {"role": "user", "content": [{"type": "text", "text": "Array content"}]},
                "timestamp": "2026-03-01T10:00:00.000Z",
            },
        ])
        result = parse_session_messages(f)
        user_msgs = [m for m in result["messages"] if m["type"] == "user"]
        assert user_msgs[0]["content"] == "Array content"

    def test_filters_interrupted_messages(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg("Real prompt"),
            _user_msg("[Request interrupted by user for tool use]", timestamp="2026-03-01T10:01:00.000Z"),
        ])
        result = parse_session_messages(f)
        user_msgs = [m for m in result["messages"] if m["type"] == "user"]
        assert len(user_msgs) == 2
        assert user_msgs[0]["content"] == "Real prompt"
        assert user_msgs[1]["content"] is None

    def test_truncates_at_2000_chars(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [_user_msg("x" * 5000)])
        result = parse_session_messages(f)
        user_msgs = [m for m in result["messages"] if m["type"] == "user"]
        assert len(user_msgs[0]["content"]) == 2000

    def test_preserves_timestamps_and_file_position(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg("First", timestamp="2026-03-01T10:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T10:00:05.000Z"),
        ])
        result = parse_session_messages(f)
        assert result["messages"][0]["timestamp"] == "2026-03-01T10:00:00.000Z"
        assert result["messages"][0]["file_position"] == 0
        assert result["messages"][1]["timestamp"] == "2026-03-01T10:00:05.000Z"
        assert result["messages"][1]["file_position"] == 1

    def test_extracts_assistant_token_usage(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            _assistant_msg(usage={
                "input_tokens": 100, "output_tokens": 50,
                "cache_creation_input_tokens": 200, "cache_read_input_tokens": 300,
            }),
        ])
        result = parse_session_messages(f)
        assistants = [m for m in result["messages"] if m["type"] == "assistant"]
        assert assistants[0]["usage"]["input_tokens"] == 100
        assert assistants[0]["usage"]["output_tokens"] == 50

    def test_extracts_tool_names_from_assistant(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            {
                "type": "assistant",
                "message": {
                    "model": "claude-sonnet-4-20250514",
                    "role": "assistant",
                    "content": [
                        {"type": "tool_use", "name": "Write"},
                        {"type": "tool_use", "name": "Bash"},
                    ],
                },
                "timestamp": "2026-03-01T10:00:05Z",
            },
        ])
        result = parse_session_messages(f)
        assistants = [m for m in result["messages"] if m["type"] == "assistant"]
        assert assistants[0]["tool_names"] == ["Write", "Bash"]

    def test_extracts_top_level_tool_use(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            {"type": "tool_use", "name": "Read", "timestamp": "2026-03-01T10:00:01Z"},
        ])
        result = parse_session_messages(f)
        tools = [m for m in result["messages"] if m["type"] == "tool_use"]
        assert len(tools) == 1
        assert tools[0]["tool_names"] == ["Read"]

    def test_extracts_nested_tool_name(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            {
                "type": "tool_use",
                "message": {"content": [{"type": "tool_use", "name": "Glob"}]},
                "timestamp": "2026-03-01T10:00:01Z",
            },
        ])
        result = parse_session_messages(f)
        tools = [m for m in result["messages"] if m["type"] == "tool_use"]
        assert tools[0]["tool_names"] == ["Glob"]

    def test_counts_thinking(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            {"type": "thinking", "timestamp": "2026-03-01T10:00:01Z"},
            {"type": "thinking", "timestamp": "2026-03-01T10:00:02Z"},
        ])
        result = parse_session_messages(f)
        thinking = [m for m in result["messages"] if m["type"] == "thinking"]
        assert len(thinking) == 2

    def test_detects_plan_mode(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [_user_msg("Plan this", planContent="My plan...")])
        result = parse_session_messages(f)
        user_msgs = [m for m in result["messages"] if m["type"] == "user"]
        assert user_msgs[0]["used_plan_mode"] is True

    def test_sets_session_id_on_all_messages(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [_user_msg(session_id="my-sess"), _assistant_msg()])
        result = parse_session_messages(f)
        for msg in result["messages"]:
            assert msg["session_id"] == "my-sess"

    def test_falls_back_to_filename_for_session_id(self, tmp_path):
        f = tmp_path / "project" / "abc-123.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [{
            "type": "user",
            "message": {"role": "user", "content": "Hi"},
            "timestamp": "2026-03-01T10:00:00Z",
        }])
        result = parse_session_messages(f)
        assert result["session_id"] == "abc-123"

    def test_sets_project_path_encoded(self, tmp_path):
        project = tmp_path / "-home-user-my-project"
        project.mkdir()
        f = project / "session.jsonl"
        _write_jsonl(f, [_user_msg()])
        result = parse_session_messages(f)
        assert result["project_path_encoded"] == "-home-user-my-project"

    def test_uuid_subdir_project_path_encoded(self, tmp_path):
        project = tmp_path / "-home-user-my-project"
        uuid_dir = project / "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        uuid_dir.mkdir(parents=True)
        f = uuid_dir / "session.jsonl"
        _write_jsonl(f, [_user_msg()])
        result = parse_session_messages(f)
        assert result["project_path_encoded"] == "-home-user-my-project"

    def test_skips_skip_types(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(),
            {"type": "file-history-snapshot", "data": {}},
            {"type": "tool_result", "content": "result"},
            {"type": "progress", "percent": 50},
            _assistant_msg(),
        ])
        result = parse_session_messages(f)
        assert len(result["messages"]) == 2

    def test_skips_malformed_lines(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        with open(f, "w") as fh:
            fh.write("not valid json\n")
            fh.write(json.dumps(_user_msg("Valid")) + "\n")
        result = parse_session_messages(f)
        assert result is not None
        assert len(result["messages"]) == 1

    def test_backfills_version_and_branch(self, tmp_path):
        f = tmp_path / "project" / "session.jsonl"
        f.parent.mkdir()
        _write_jsonl(f, [
            _user_msg(version="2.1.44", gitBranch="feature/test"),
            _assistant_msg(),
        ])
        result = parse_session_messages(f)
        for msg in result["messages"]:
            assert msg.get("claude_code_version") == "2.1.44"
            assert msg.get("git_branch") == "feature/test"


# ─── build_conversations ─────────────────────────────────────────────

class TestBuildConversations:
    def test_empty_messages(self):
        assert build_conversations([], "proj", "enc", 60) == []

    def test_single_conversation_within_gap(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Hello", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", pos=1),
            _make_user_message("2026-03-01T10:10:00.000Z", "Follow-up", pos=2),
            _make_assistant_message("2026-03-01T10:10:05.000Z", pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["user_prompts"] == ["Hello", "Follow-up"]
        assert result[0]["user_message_count"] == 2
        assert result[0]["assistant_message_count"] == 2

    def test_splits_at_gap_exceeding_threshold(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Conv1", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", pos=1),
            _make_user_message("2026-03-01T12:00:00.000Z", "Conv2", pos=2),
            _make_assistant_message("2026-03-01T12:00:05.000Z", pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 2
        assert result[0]["user_prompts"] == ["Conv1"]
        assert result[1]["user_prompts"] == ["Conv2"]

    def test_no_split_at_exact_threshold(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T11:00:00.000Z", "Second", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1

    def test_split_at_threshold_plus_one_ms(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T11:00:00.001Z", "Second", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 2

    def test_deterministic_ids(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T12:00:00.000Z", "Second", pos=1),
            _make_user_message("2026-03-01T14:00:00.000Z", "Third", pos=2),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 3
        assert result[0]["id"] == "enc:conv:000"
        assert result[1]["id"] == "enc:conv:001"
        assert result[2]["id"] == "enc:conv:002"

    def test_same_data_same_ids(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T12:00:00.000Z", "Second", pos=1),
        ]
        r1 = build_conversations(messages, "proj", "enc", 60)
        r2 = build_conversations(messages, "proj", "enc", 60)
        assert [c["id"] for c in r1] == [c["id"] for c in r2]

    def test_accumulates_tokens(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Hello", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage={
                "input_tokens": 100, "output_tokens": 50,
                "cache_creation_input_tokens": 200, "cache_read_input_tokens": 300,
            }, pos=1),
            _make_user_message("2026-03-01T10:10:00.000Z", "Follow-up", pos=2),
            _make_assistant_message("2026-03-01T10:10:05.000Z", usage={
                "input_tokens": 150, "output_tokens": 75,
                "cache_creation_input_tokens": 100, "cache_read_input_tokens": 400,
            }, pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["total_input_tokens"] == 250
        assert result[0]["total_output_tokens"] == 125
        assert result[0]["total_cache_creation_tokens"] == 300
        assert result[0]["total_cache_read_tokens"] == 700
        assert result[0]["total_tokens"] == 1375

    def test_token_conservation(self):
        u1 = {"input_tokens": 100, "output_tokens": 50, "cache_creation_input_tokens": 200, "cache_read_input_tokens": 300}
        u2 = {"input_tokens": 150, "output_tokens": 75, "cache_creation_input_tokens": 100, "cache_read_input_tokens": 400}
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Conv1", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage=u1, pos=1),
            _make_user_message("2026-03-01T12:00:00.000Z", "Conv2", pos=2),
            _make_assistant_message("2026-03-01T12:00:05.000Z", usage=u2, pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        total_from_convs = sum(c["total_tokens"] for c in result)
        total_from_msgs = sum(v for v in u1.values()) + sum(v for v in u2.values())
        assert total_from_convs == total_from_msgs

    def test_tokens_per_prompt(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage={
                "input_tokens": 100, "output_tokens": 100,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=1),
            _make_user_message("2026-03-01T10:10:00.000Z", "Second", pos=2),
            _make_assistant_message("2026-03-01T10:10:05.000Z", usage={
                "input_tokens": 100, "output_tokens": 100,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["tokens_per_prompt"] == 200
        assert result[0]["prompt_count"] == 2

    def test_prompt_count_excludes_contentless_user_messages(self):
        """Tool result messages are type 'user' but have no content — they should not count as prompts."""
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Real prompt", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage={
                "input_tokens": 50, "output_tokens": 50,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=1),
            # Tool result messages — type 'user' with no content
            {"type": "user", "timestamp": "2026-03-01T10:00:10.000Z", "session_id": "sess-1", "file_position": 2, "used_plan_mode": False},
            {"type": "user", "timestamp": "2026-03-01T10:00:15.000Z", "session_id": "sess-1", "file_position": 3, "used_plan_mode": False},
            {"type": "user", "timestamp": "2026-03-01T10:00:20.000Z", "session_id": "sess-1", "file_position": 4, "used_plan_mode": False},
            _make_assistant_message("2026-03-01T10:00:25.000Z", usage={
                "input_tokens": 50, "output_tokens": 50,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=5),
            _make_user_message("2026-03-01T10:05:00.000Z", "Another real prompt", pos=6),
            _make_assistant_message("2026-03-01T10:05:05.000Z", usage={
                "input_tokens": 50, "output_tokens": 50,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=7),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["user_message_count"] == 5  # all type 'user' messages
        assert result[0]["prompt_count"] == 2  # only messages with content
        assert result[0]["tokens_per_prompt"] == 150  # 300 total / 2 prompts

    def test_cache_hit_rate(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Hello", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage={
                "input_tokens": 100, "output_tokens": 50,
                "cache_creation_input_tokens": 200, "cache_read_input_tokens": 300,
            }, pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["cache_hit_rate"] == pytest.approx(0.5)

    def test_tracks_multi_session_ids(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Sess1", session_id="sess-1", pos=0),
            _make_user_message("2026-03-01T10:10:00.000Z", "Sess2", session_id="sess-2", pos=0),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["session_ids"] == ["sess-1", "sess-2"]

    def test_collects_tools_used(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Build", pos=0),
            {**_make_assistant_message("2026-03-01T10:00:05.000Z", pos=1), "tool_names": ["Write", "Bash"]},
            _make_tool_use("2026-03-01T10:00:10.000Z", "Read", pos=2),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["tools_used"] == ["Bash", "Read", "Write"]
        assert result[0]["tool_use_count"] == 3

    def test_counts_thinking(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Think", pos=0),
            _make_thinking("2026-03-01T10:00:01.000Z", pos=1),
            _make_thinking("2026-03-01T10:00:02.000Z", pos=2),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["thinking_count"] == 2

    def test_detects_plan_mode(self):
        messages = [
            {**_make_user_message("2026-03-01T10:00:00.000Z", "Plan this", pos=0), "used_plan_mode": True},
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["used_plan_mode"] is True

    def test_started_at_and_ended_at(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_assistant_message("2026-03-01T10:30:05.000Z", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["started_at"] == "2026-03-01T10:00:00.000Z"
        assert result[0]["ended_at"] == "2026-03-01T10:30:05.000Z"

    def test_filters_conversations_without_user_prompts(self):
        messages = [
            # No content on user message
            {"type": "user", "timestamp": "2026-03-01T10:00:00.000Z", "session_id": "s1", "file_position": 0, "used_plan_mode": False},
            _make_assistant_message("2026-03-01T10:00:05.000Z", pos=1),
            # Real content after gap
            _make_user_message("2026-03-01T12:00:00.000Z", "Real prompt", pos=2),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["user_prompts"] == ["Real prompt"]

    def test_single_message_conversation(self):
        messages = [_make_user_message("2026-03-01T10:00:00.000Z", "Solo", pos=0)]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["user_message_count"] == 1

    def test_multi_session_merge(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Sess1", session_id="sess-1", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", session_id="sess-1", pos=1),
            _make_user_message("2026-03-01T10:05:00.000Z", "Sess2", session_id="sess-2", pos=0),
            _make_assistant_message("2026-03-01T10:05:05.000Z", session_id="sess-2", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["user_prompts"] == ["Sess1", "Sess2"]

    def test_sorts_messages_by_timestamp(self):
        messages = [
            _make_user_message("2026-03-01T10:10:00.000Z", "Second", pos=2),
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["user_prompts"] == ["First", "Second"]

    def test_file_position_tiebreaker(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "User", pos=0),
            _make_assistant_message("2026-03-01T10:00:00.000Z", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["user_prompts"] == ["User"]
        assert result[0]["assistant_message_count"] == 1

    def test_null_timestamps(self):
        messages = [
            {"type": "user", "timestamp": None, "session_id": "s1", "file_position": 0, "content": "No ts", "used_plan_mode": False},
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert len(result) == 1
        assert result[0]["started_at"] is None

    def test_configurable_gap_threshold(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T10:20:00.000Z", "Second", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 15)
        assert len(result) == 2

    def test_zero_padded_ids(self):
        messages = [_make_user_message("2026-03-01T10:00:00.000Z", "Only", pos=0)]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["id"] == "enc:conv:000"

    def test_version_and_branch_extraction(self):
        messages = [
            {**_make_user_message("2026-03-01T10:00:00.000Z", "Hi", pos=0),
             "claude_code_version": "2.1.44", "git_branch": "main"},
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["claude_code_version"] == "2.1.44"
        assert result[0]["git_branch"] == "main"

    def test_gap_zero_splits_every_message(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First", pos=0),
            _make_user_message("2026-03-01T10:00:01.000Z", "Second", pos=1),
        ]
        result = build_conversations(messages, "proj", "enc", 0)
        assert len(result) == 2

    def test_assistant_tokens_stay_in_correct_conversation(self):
        messages = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Conv1", pos=0),
            _make_assistant_message("2026-03-01T10:00:05.000Z", usage={
                "input_tokens": 500, "output_tokens": 200,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=1),
            _make_user_message("2026-03-01T12:00:00.000Z", "Conv2", pos=2),
            _make_assistant_message("2026-03-01T12:00:05.000Z", usage={
                "input_tokens": 300, "output_tokens": 100,
                "cache_creation_input_tokens": 0, "cache_read_input_tokens": 0,
            }, pos=3),
        ]
        result = build_conversations(messages, "proj", "enc", 60)
        assert result[0]["total_tokens"] == 700
        assert result[1]["total_tokens"] == 400


# ─── get_all_conversations ───────────────────────────────────────────

class TestGetAllConversations:
    def test_returns_empty_for_nonexistent_dir(self, tmp_path):
        result = get_all_conversations(data_dir=tmp_path / "nonexistent")
        assert result["conversations"] == []
        assert result["metadata"]["total_conversations"] == 0

    def test_assembles_conversations_from_session_files(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        _write_jsonl(project / "sess-1.jsonl", [
            _user_msg("Hello", timestamp="2026-03-01T10:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T10:01:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert len(result["conversations"]) == 1
        assert result["conversations"][0]["user_prompts"] == ["Hello"]

    def test_merges_sessions_within_gap(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        _write_jsonl(project / "sess-1.jsonl", [
            _user_msg("Morning", session_id="sess-1", timestamp="2026-03-01T09:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T09:01:00.000Z"),
        ])
        _write_jsonl(project / "sess-2.jsonl", [
            _user_msg("Afternoon", session_id="sess-2", timestamp="2026-03-01T09:30:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T09:31:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert len(result["conversations"]) == 1
        assert result["conversations"][0]["session_ids"] == ["sess-1", "sess-2"]

    def test_splits_across_large_gap(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        _write_jsonl(project / "sess-1.jsonl", [
            _user_msg("Morning", timestamp="2026-03-01T09:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T09:01:00.000Z"),
            _user_msg("Evening", timestamp="2026-03-01T20:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T20:01:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert len(result["conversations"]) == 2

    def test_applies_project_filter(self, tmp_path):
        for name in ["-home-user-alpha", "-home-user-beta"]:
            p = tmp_path / name
            p.mkdir()
            _write_jsonl(p / "s.jsonl", [
                _user_msg("Prompt", cwd=f"/home/user/{name.split('-')[-1]}",
                          timestamp="2026-03-01T10:00:00.000Z"),
            ])
        result = get_all_conversations(data_dir=tmp_path, project="alpha", gap_minutes=60)
        assert len(result["conversations"]) == 1

    def test_applies_limit(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        _write_jsonl(project / "s.jsonl", [
            _user_msg("First", timestamp="2026-03-01T08:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T08:01:00.000Z"),
            _user_msg("Second", timestamp="2026-03-01T12:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T12:01:00.000Z"),
            _user_msg("Third", timestamp="2026-03-01T20:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T20:01:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, limit=2, gap_minutes=60)
        assert len(result["conversations"]) == 2

    def test_sorts_by_started_at_descending(self, tmp_path):
        project = tmp_path / "-home-user-project"
        project.mkdir()
        _write_jsonl(project / "s.jsonl", [
            _user_msg("Old", timestamp="2026-01-01T10:00:00.000Z"),
            _assistant_msg(timestamp="2026-01-01T10:01:00.000Z"),
            _user_msg("New", timestamp="2026-03-01T10:00:00.000Z"),
            _assistant_msg(timestamp="2026-03-01T10:01:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert result["conversations"][0]["user_prompts"] == ["New"]

    def test_metadata_counts(self, tmp_path):
        for name in ["proj-a", "proj-b"]:
            p = tmp_path / name
            p.mkdir()
            _write_jsonl(p / "s.jsonl", [
                _user_msg("P1", cwd=f"/home/user/{name}", timestamp="2026-03-01T10:00:00.000Z"),
                _user_msg("P2", cwd=f"/home/user/{name}", timestamp="2026-03-01T10:05:00.000Z"),
            ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert result["metadata"]["total_conversations"] == 2
        assert result["metadata"]["total_projects"] == 2
        assert result["metadata"]["total_prompts"] == 4
        assert "T" in result["metadata"]["extracted_at"]

    def test_skips_sidechain(self, tmp_path):
        project = tmp_path / "proj"
        project.mkdir()
        _write_jsonl(project / "s.jsonl", [
            _user_msg("Agent prompt", isSidechain=True),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert len(result["conversations"]) == 0

    def test_discovers_uuid_subdirs(self, tmp_path):
        project = tmp_path / "-home-user-project"
        uuid_dir = project / "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
        uuid_dir.mkdir(parents=True)
        _write_jsonl(uuid_dir / "session.jsonl", [
            _user_msg("Nested", session_id="nested-1", timestamp="2026-03-01T10:00:00.000Z"),
        ])
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert len(result["conversations"]) == 1

    def test_skips_non_directory_entries(self, tmp_path):
        project = tmp_path / "proj"
        project.mkdir()
        _write_jsonl(project / "s.jsonl", [_user_msg(timestamp="2026-03-01T10:00:00.000Z")])
        (tmp_path / "stray.txt").write_text("not a dir")
        result = get_all_conversations(data_dir=tmp_path, gap_minutes=60)
        assert result["metadata"]["total_conversations"] == 1


# ─── compute_content_hash ───────────────────────────────────────────

class TestComputeContentHash:
    def test_basic_hash(self):
        from conversations import compute_content_hash
        h = compute_content_hash("-home-proj", ["2026-03-01T10:00:00.000Z"], "2026-03-01T10:00:00.000Z", ["Hello"], 1)
        assert h == "-home-proj:2026-03-01T10:00:00.000Z:1:Hello"

    def test_uses_first_prompt_timestamp(self):
        from conversations import compute_content_hash
        h = compute_content_hash("-proj", ["2026-03-01T10:05:00.000Z", "2026-03-01T10:10:00.000Z"], "2026-03-01T10:00:00.000Z", ["P1", "P2"], 2)
        assert "10:05:00" in h
        assert "10:00:00" not in h

    def test_falls_back_to_started_at(self):
        from conversations import compute_content_hash
        h = compute_content_hash("-proj", [], "2026-03-01T10:00:00.000Z", ["P"], 1)
        assert "2026-03-01T10:00:00.000Z" in h

    def test_unknown_when_no_timestamps(self):
        from conversations import compute_content_hash
        h = compute_content_hash("-proj", [], None, ["P"], 1)
        assert ":unknown:" in h

    def test_truncates_first_prompt(self):
        from conversations import compute_content_hash
        h = compute_content_hash("-proj", ["ts"], None, ["A" * 100], 1)
        assert h == f"-proj:ts:1:{'A' * 50}"


class TestContentHashInBuildConversations:
    def test_content_hash_set_on_conversations(self):
        msgs = [
            _make_user_message("2026-03-01T10:00:00.000Z", "Hello"),
            _make_assistant_message("2026-03-01T10:00:05.000Z"),
        ]
        convs = build_conversations(msgs, "proj", "-home-proj", 60)
        assert len(convs) == 1
        assert convs[0]["content_hash"] == "-home-proj:2026-03-01T10:00:00.000Z:1:Hello"

    def test_content_hash_stable_after_reindex(self):
        """When new data shifts indices, content_hash stays the same."""
        msgs = [
            _make_user_message("2026-03-01T10:00:00.000Z", "First"),
            _make_assistant_message("2026-03-01T10:00:05.000Z"),
            _make_user_message("2026-03-01T12:00:00.000Z", "Second"),
            _make_assistant_message("2026-03-01T12:00:05.000Z"),
        ]
        convs = build_conversations(msgs, "proj", "-home-proj", 60)
        assert len(convs) == 2
        hash0, hash1 = convs[0]["content_hash"], convs[1]["content_hash"]

        # Add a new earlier conversation
        new_msgs = [
            _make_user_message("2026-03-01T08:00:00.000Z", "New early"),
            _make_assistant_message("2026-03-01T08:00:05.000Z"),
        ] + msgs
        new_convs = build_conversations(new_msgs, "proj", "-home-proj", 60)
        assert len(new_convs) == 3

        # IDs shifted (old conv:000 is now conv:001) but hashes stayed the same
        assert new_convs[1]["id"] != convs[0]["id"]  # same content, different index-based ID
        assert new_convs[1]["content_hash"] == hash0
        assert new_convs[2]["content_hash"] == hash1


class TestClearConversationBoundary:
    """Tests for /clear command as conversation boundary."""

    def _make_msg(self, type, ts, **kwargs):
        return {"type": type, "timestamp": ts, "session_id": "sess-1", "file_position": 0, **kwargs}

    def test_splits_at_clear(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="first", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", content="second", file_position=1),
            self._make_msg("user", "2026-01-01T10:06:00Z", is_clear_command=True, file_position=2),
            self._make_msg("user", "2026-01-01T10:07:00Z", content="third", file_position=3),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 2
        assert convs[0]["user_prompts"] == ["first", "second"]
        assert convs[1]["user_prompts"] == ["third"]

    def test_no_empty_conversation_at_start(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", is_clear_command=True, file_position=0),
            self._make_msg("user", "2026-01-01T10:01:00Z", content="first", file_position=1),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 1
        assert convs[0]["user_prompts"] == ["first"]

    def test_no_empty_conversation_at_end(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="first", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", is_clear_command=True, file_position=1),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 1
        assert convs[0]["user_prompts"] == ["first"]

    def test_splits_without_inactivity_gap(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="p1", file_position=0),
            self._make_msg("user", "2026-01-01T10:00:30Z", is_clear_command=True, file_position=1),
            self._make_msg("user", "2026-01-01T10:01:00Z", content="p2", file_position=2),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 2

    def test_compact_does_not_split(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="p1", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", content="compact text", file_position=1),
            self._make_msg("user", "2026-01-01T10:10:00Z", content="p2", file_position=2),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 1
        assert len(convs[0]["user_prompts"]) == 3

    def test_consecutive_clears(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="p1", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", is_clear_command=True, file_position=1),
            self._make_msg("user", "2026-01-01T10:06:00Z", is_clear_command=True, file_position=2),
            self._make_msg("user", "2026-01-01T10:07:00Z", content="p2", file_position=3),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert len(convs) == 2
        assert convs[0]["user_prompts"] == ["p1"]
        assert convs[1]["user_prompts"] == ["p2"]

    def test_clear_not_counted_in_user_message_count(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="p1", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", is_clear_command=True, file_position=1),
            self._make_msg("user", "2026-01-01T10:10:00Z", content="p2", file_position=2),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        assert convs[0]["user_message_count"] == 1
        assert convs[1]["user_message_count"] == 1

    def test_clear_not_in_user_prompts(self):
        msgs = [
            self._make_msg("user", "2026-01-01T10:00:00Z", content="p1", file_position=0),
            self._make_msg("user", "2026-01-01T10:05:00Z", is_clear_command=True, file_position=1),
            self._make_msg("user", "2026-01-01T10:10:00Z", content="p2", file_position=2),
        ]
        convs = build_conversations(msgs, "test", "-test", 60)
        all_prompts = [p for c in convs for p in c["user_prompts"]]
        assert all_prompts == ["p1", "p2"]
