"""Tests for agent_metrics module."""

import sys
from pathlib import Path

# Add webapp/ to sys.path
WEBAPP_DIR = Path(__file__).resolve().parent.parent
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

from agent_metrics import compute_agent_metrics, compute_per_conversation_metrics, compute_weekly_agent_metrics


def _make_conversation(overrides: dict | None = None) -> dict:
    base = {
        "id": "conv-1",
        "project": "test-project",
        "project_path_encoded": "-home-test-project",
        "session_ids": ["sess-1"],
        "started_at": "2026-01-06T10:00:00Z",  # Monday 2026-W02
        "ended_at": "2026-01-06T11:00:00Z",
        "user_prompts": ["hello world", "fix the bug"],
        "prompt_count": 2,
        "user_message_count": 2,
        "assistant_message_count": 3,
        "tool_use_count": 5,
        "tools_used": ["Read", "Edit", "Bash"],
        "thinking_count": 1,
        "used_plan_mode": False,
        "model": "claude-sonnet-4-20250514",
        "claude_code_version": "2.1.44",
        "git_branch": "main",
        "total_input_tokens": 1000,
        "total_output_tokens": 500,
        "total_cache_creation_tokens": 200,
        "total_cache_read_tokens": 800,
        "total_tokens": 2500,
        "tokens_per_prompt": 1250,
        "cache_hit_rate": 0.4,
    }
    if overrides:
        base.update(overrides)
    return base


class TestComputeAgentMetrics:
    def test_empty_array_returns_all_zeros(self):
        result = compute_agent_metrics([])
        assert result == {
            "tool_diversity_index": 0,
            "plan_mode_adoption_rate": 0,
            "avg_cache_hit_rate": 0,
            "thinking_utilization_rate": 0,
            "command_adoption_rate": 0,
            "avg_prompt_length": 0,
            "conversation_count": 0,
        }

    def test_single_conversation(self):
        conv = _make_conversation()
        result = compute_agent_metrics([conv])
        # tool_diversity = 3/5 = 0.6
        assert result["tool_diversity_index"] == 0.6
        assert result["plan_mode_adoption_rate"] == 0
        assert result["avg_cache_hit_rate"] == 0.4
        # thinking = 1/3 = 0.3333
        assert result["thinking_utilization_rate"] == 0.3333
        # avg_prompt_length = (11 + 11) / 2 = 11
        assert result["avg_prompt_length"] == 11
        assert result["conversation_count"] == 1

    def test_multiple_conversations_aggregation(self):
        conv1 = _make_conversation({
            "id": "c1",
            "tool_use_count": 4,
            "tools_used": ["Read", "Edit"],
            "thinking_count": 2,
            "assistant_message_count": 4,
            "cache_hit_rate": 0.6,
            "user_prompts": ["hello"],
            "used_plan_mode": True,
        })
        conv2 = _make_conversation({
            "id": "c2",
            "tool_use_count": 6,
            "tools_used": ["Read", "Edit", "Bash"],
            "thinking_count": 1,
            "assistant_message_count": 6,
            "cache_hit_rate": 0.8,
            "user_prompts": ["world!!"],
            "used_plan_mode": False,
        })
        result = compute_agent_metrics([conv1, conv2])
        assert result["tool_diversity_index"] == 0.5
        assert result["plan_mode_adoption_rate"] == 0.5
        assert result["avg_cache_hit_rate"] == 0.7
        # thinking = (2+1)/(4+6) = 0.3
        assert result["thinking_utilization_rate"] == 0.3
        # prompt length = (5+7)/2 = 6
        assert result["avg_prompt_length"] == 6
        assert result["conversation_count"] == 2

    def test_tool_use_count_zero(self):
        conv = _make_conversation({"tool_use_count": 0, "tools_used": []})
        result = compute_agent_metrics([conv])
        assert result["tool_diversity_index"] == 0

    def test_assistant_message_count_zero(self):
        conv = _make_conversation({"assistant_message_count": 0, "thinking_count": 0})
        result = compute_agent_metrics([conv])
        assert result["thinking_utilization_rate"] == 0

    def test_no_user_prompts(self):
        conv = _make_conversation({"user_prompts": []})
        result = compute_agent_metrics([conv])
        assert result["avg_prompt_length"] == 0

    def test_all_plan_mode_true(self):
        convs = [
            _make_conversation({"id": "c1", "used_plan_mode": True}),
            _make_conversation({"id": "c2", "used_plan_mode": True}),
        ]
        result = compute_agent_metrics(convs)
        assert result["plan_mode_adoption_rate"] == 1.0

    def test_mixed_plan_mode(self):
        convs = [
            _make_conversation({"id": "c1", "used_plan_mode": True}),
            _make_conversation({"id": "c2", "used_plan_mode": False}),
            _make_conversation({"id": "c3", "used_plan_mode": True}),
        ]
        result = compute_agent_metrics(convs)
        assert result["plan_mode_adoption_rate"] == 0.6667

    def test_rates_rounded_to_4_decimals(self):
        conv = _make_conversation({
            "tool_use_count": 3,
            "tools_used": ["Read"],
            "thinking_count": 1,
            "assistant_message_count": 3,
            "cache_hit_rate": 0.33333,
        })
        result = compute_agent_metrics([conv])
        assert result["tool_diversity_index"] == 0.3333
        assert result["thinking_utilization_rate"] == 0.3333
        assert result["avg_cache_hit_rate"] == 0.3333

    def test_avg_prompt_length_rounded_to_integer(self):
        conv = _make_conversation({"user_prompts": ["hi", "hey"]})
        result = compute_agent_metrics([conv])
        # (2 + 3) / 2 = 2.5 -> 2 (Python rounds half to even)
        assert result["avg_prompt_length"] == 2


class TestComputePerConversationMetrics:
    def test_empty_input(self):
        assert compute_per_conversation_metrics([]) == []

    def test_returns_same_length(self):
        convs = [
            _make_conversation({"id": "c1"}),
            _make_conversation({"id": "c2"}),
        ]
        result = compute_per_conversation_metrics(convs)
        assert len(result) == 2

    def test_correct_per_conv_metrics(self):
        conv = _make_conversation({
            "id": "conv-abc",
            "tool_use_count": 10,
            "tools_used": ["Read", "Edit"],
            "thinking_count": 2,
            "assistant_message_count": 5,
            "user_prompts": ["short", "longer prompt"],
        })
        result = compute_per_conversation_metrics([conv])
        assert result[0]["id"] == "conv-abc"
        assert result[0]["tool_diversity_index"] == 0.2
        assert result[0]["thinking_utilization_rate"] == 0.4
        assert result[0]["avg_prompt_length"] == 9

    def test_zero_tool_uses(self):
        conv = _make_conversation({"tool_use_count": 0, "tools_used": []})
        result = compute_per_conversation_metrics([conv])
        assert result[0]["tool_diversity_index"] == 0

    def test_zero_assistant_messages(self):
        conv = _make_conversation({"assistant_message_count": 0, "thinking_count": 0})
        result = compute_per_conversation_metrics([conv])
        assert result[0]["thinking_utilization_rate"] == 0


class TestComputeWeeklyAgentMetrics:
    def test_empty_input(self):
        assert compute_weekly_agent_metrics([]) == []

    def test_same_week_single_entry(self):
        conv1 = _make_conversation({
            "id": "c1",
            "started_at": "2026-01-06T10:00:00Z",
            "used_plan_mode": True,
            "tool_use_count": 4,
            "tools_used": ["Read", "Edit"],
            "thinking_count": 1,
            "assistant_message_count": 2,
            "cache_hit_rate": 0.5,
        })
        conv2 = _make_conversation({
            "id": "c2",
            "started_at": "2026-01-07T14:00:00Z",
            "used_plan_mode": False,
            "tool_use_count": 6,
            "tools_used": ["Read", "Edit", "Bash"],
            "thinking_count": 3,
            "assistant_message_count": 4,
            "cache_hit_rate": 0.7,
        })
        result = compute_weekly_agent_metrics([conv1, conv2])
        assert len(result) == 1
        assert result[0]["week"] == "2026-W02"
        assert result[0]["conversation_count"] == 2
        assert result[0]["tool_diversity_index"] == 0.5
        assert result[0]["plan_mode_adoption_rate"] == 0.5
        assert result[0]["avg_cache_hit_rate"] == 0.6
        # (1+3)/(2+4) = 0.6667
        assert result[0]["thinking_utilization_rate"] == 0.6667

    def test_different_weeks_sorted_ascending(self):
        conv1 = _make_conversation({
            "id": "c1",
            "started_at": "2026-01-13T10:00:00Z",  # W03
        })
        conv2 = _make_conversation({
            "id": "c2",
            "started_at": "2026-01-06T10:00:00Z",  # W02
        })
        result = compute_weekly_agent_metrics([conv1, conv2])
        assert len(result) == 2
        assert result[0]["week"] == "2026-W02"
        assert result[1]["week"] == "2026-W03"

    def test_week_format(self):
        conv = _make_conversation({"started_at": "2026-01-06T10:00:00Z"})
        result = compute_weekly_agent_metrics([conv])
        import re
        assert re.match(r"^\d{4}-W\d{2}$", result[0]["week"])

    def test_skips_null_started_at(self):
        conv = _make_conversation({"started_at": None})
        result = compute_weekly_agent_metrics([conv])
        assert len(result) == 0
