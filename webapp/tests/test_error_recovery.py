"""Tests for error_recovery module."""

import pytest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from error_recovery import (
    compute_conversation_error_recovery,
    compute_error_recovery_metrics,
    compute_weekly_error_recovery,
)


def make_message(**overrides):
    base = {
        "type": "user",
        "timestamp": "2026-01-06T10:00:00Z",
        "session_id": "sess-1",
        "file_position": 0,
    }
    base.update(overrides)
    return base


def make_conversation(**overrides):
    base = {
        "id": "conv-1",
        "content_hash": "hash",
        "project": "test-project",
        "project_path_encoded": "-home-test",
        "session_ids": ["sess-1"],
        "started_at": "2026-01-06T10:00:00Z",
        "ended_at": "2026-01-06T11:00:00Z",
        "user_prompts": ["hello"],
        "prompt_timestamps": ["2026-01-06T10:00:00Z"],
        "prompt_count": 1,
        "user_message_count": 1,
        "assistant_message_count": 1,
        "tool_use_count": 1,
        "tools_used": ["Bash"],
        "commands_used": [],
        "thinking_count": 0,
        "used_plan_mode": False,
        "model": "claude-sonnet-4-20250514",
        "claude_code_version": "2.1.44",
        "git_branch": "main",
        "heuristic_task_type": None,
        "has_structured_output_antipattern": False,
        "structured_output_antipattern_count": 0,
        "error_count": 0,
        "recovery_count": 0,
        "avg_failure_to_resolution_turns": None,
        "recovery_strategy_diversity": 0,
        "error_tools": [],
        "total_input_tokens": 1000,
        "total_output_tokens": 500,
        "total_cache_creation_tokens": 200,
        "total_cache_read_tokens": 800,
        "total_tokens": 2500,
        "tokens_per_prompt": 1250,
        "cache_hit_rate": 0.4,
    }
    base.update(overrides)
    return base


# --- compute_conversation_error_recovery ---


class TestComputeConversationErrorRecovery:
    def test_empty_messages(self):
        result = compute_conversation_error_recovery([])
        assert result["error_count"] == 0
        assert result["recovery_count"] == 0
        assert result["avg_failure_to_resolution_turns"] is None
        assert result["recovery_strategy_diversity"] == 0
        assert result["error_tools"] == []

    def test_no_tool_results(self):
        messages = [
            make_message(type="user", content="fix the bug"),
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 0
        assert result["recovery_count"] == 0

    def test_single_error_no_recovery(self):
        messages = [
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1", error_content="Exit code 1"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 0
        assert result["avg_failure_to_resolution_turns"] is None
        assert result["error_tools"] == ["Bash"]

    def test_error_with_retry_same_tool_recovery(self):
        messages = [
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1"),
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-2"]),
            make_message(type="tool_result", tool_use_id="tu-2"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 1
        assert result["avg_failure_to_resolution_turns"] == 2.0  # index 3 - 1

    def test_error_with_switch_tool_recovery(self):
        messages = [
            make_message(type="assistant", tool_names=["Edit"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1"),
            make_message(type="assistant", tool_names=["Read"], tool_use_ids=["tu-2"]),
            make_message(type="tool_result", tool_use_id="tu-2"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 1

    def test_user_intervention_strategy(self):
        messages = [
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1"),
            make_message(type="user", content="try a different approach"),
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-2"]),
            make_message(type="tool_result", tool_use_id="tu-2"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 1
        assert result["avg_failure_to_resolution_turns"] == 3.0  # index 4 - 1

    def test_multiple_errors_mixed_recovery(self):
        messages = [
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1"),
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-2"]),
            make_message(type="tool_result", tool_use_id="tu-2"),
            make_message(type="assistant", tool_names=["Edit"], tool_use_ids=["tu-3"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-3"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 2
        assert result["recovery_count"] == 1
        assert sorted(result["error_tools"]) == ["Bash", "Edit"]

    def test_recovery_window_limit(self):
        messages = [
            make_message(type="assistant", tool_names=["Bash"], tool_use_ids=["tu-1"]),
            make_message(type="tool_result", is_error=True, tool_use_id="tu-1"),
        ]
        for k in range(21):
            messages.append(make_message(type="assistant", file_position=k + 2))
        messages.append(make_message(type="tool_result", tool_use_id="tu-1"))

        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 0  # Beyond window

    def test_error_without_tool_use_id_linkage(self):
        messages = [
            make_message(type="tool_result", is_error=True, error_content="unknown"),
            make_message(type="tool_result"),
        ]
        result = compute_conversation_error_recovery(messages)
        assert result["error_count"] == 1
        assert result["recovery_count"] == 1
        assert result["error_tools"] == []


# --- compute_error_recovery_metrics ---


class TestComputeErrorRecoveryMetrics:
    def test_empty_conversations(self):
        result = compute_error_recovery_metrics([])
        assert result["total_error_count"] == 0
        assert result["insufficient_data"] is True

    def test_aggregation(self):
        convs = [
            make_conversation(error_count=3, recovery_count=2, avg_failure_to_resolution_turns=2.5),
            make_conversation(id="conv-2", error_count=1, recovery_count=1, avg_failure_to_resolution_turns=4.0),
            make_conversation(id="conv-3", error_count=0, recovery_count=0),
        ]
        result = compute_error_recovery_metrics(convs)
        assert result["total_error_count"] == 4
        assert result["total_recovery_count"] == 3
        assert result["recovery_rate"] == 0.75
        assert result["conversations_with_errors"] == 2
        assert result["insufficient_data"] is True

    def test_sufficient_data(self):
        convs = [
            make_conversation(id=f"conv-{i}", error_count=1, recovery_count=1, avg_failure_to_resolution_turns=2.0)
            for i in range(5)
        ]
        result = compute_error_recovery_metrics(convs)
        assert result["insufficient_data"] is False

    def test_zero_errors_no_division_error(self):
        result = compute_error_recovery_metrics([make_conversation()])
        assert result["recovery_rate"] == 0
        assert result["avg_failure_to_resolution_turns"] is None


# --- compute_weekly_error_recovery ---


class TestComputeWeeklyErrorRecovery:
    def test_empty(self):
        assert compute_weekly_error_recovery([]) == []

    def test_groups_by_week(self):
        convs = [
            make_conversation(started_at="2026-01-06T10:00:00Z", error_count=2, recovery_count=1),
            make_conversation(id="conv-2", started_at="2026-01-07T10:00:00Z", error_count=1, recovery_count=1),
            make_conversation(id="conv-3", started_at="2026-01-13T10:00:00Z", error_count=3, recovery_count=2),
        ]
        result = compute_weekly_error_recovery(convs)
        assert len(result) == 2
        assert result[0]["week"] == "2026-W02"
        assert result[0]["error_count"] == 3
        assert result[1]["week"] == "2026-W03"

    def test_sorted_ascending(self):
        convs = [
            make_conversation(id="conv-2", started_at="2026-02-01T10:00:00Z", error_count=1),
            make_conversation(started_at="2026-01-06T10:00:00Z", error_count=1),
        ]
        result = compute_weekly_error_recovery(convs)
        assert result[0]["week"] == "2026-W02"

    def test_skips_no_started_at(self):
        convs = [make_conversation(started_at=None, error_count=1)]
        assert compute_weekly_error_recovery(convs) == []
