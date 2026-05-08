"""Tests for verification_behaviors module."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from verification_behaviors import (
    compute_conversation_verification,
    compute_verification_metrics,
    compute_weekly_verification,
)


def with_tools(tools, commands=None):
    msg = {
        "type": "assistant",
        "timestamp": "2026-01-06T10:00:00Z",
        "session_id": "sess-1",
        "file_position": 0,
        "tool_names": tools,
    }
    if commands and any(commands):
        msg["bash_commands"] = commands
    return msg


def make_conversation(**overrides):
    base = {
        "id": "conv-1",
        "started_at": "2026-01-06T10:00:00Z",
        "edits_count": 0,
        "reviewed_edits": 0,
        "commits_count": 0,
        "tested_commits": 0,
    }
    base.update(overrides)
    return base


# --- compute_conversation_verification: review after edit ---


class TestReviewAfterEdit:
    def test_empty(self):
        result = compute_conversation_verification([])
        assert result["edits_count"] == 0
        assert result["review_before_accept_rate"] == 0

    def test_single_edit_then_read(self):
        result = compute_conversation_verification([with_tools(["Edit", "Read"])])
        assert result["edits_count"] == 1
        assert result["reviewed_edits"] == 1
        assert result["review_before_accept_rate"] == 1

    def test_write_followed_by_grep(self):
        result = compute_conversation_verification([with_tools(["Write", "Grep"])])
        assert result["reviewed_edits"] == 1

    def test_clusters_consecutive_edits(self):
        result = compute_conversation_verification([with_tools(["Edit", "Edit", "Write", "Read"])])
        assert result["edits_count"] == 1
        assert result["reviewed_edits"] == 1

    def test_unreviewed_cluster(self):
        result = compute_conversation_verification([
            with_tools(["Edit", "Edit", "Bash"], ["", "", "echo hi"]),
        ])
        assert result["edits_count"] == 1
        assert result["reviewed_edits"] == 0

    def test_separate_clusters(self):
        result = compute_conversation_verification([with_tools(["Edit", "Read", "Edit", "Read"])])
        assert result["edits_count"] == 2
        assert result["reviewed_edits"] == 2

    def test_window_limit(self):
        padding = ["Bash"] * 11
        cmds = [""] + ["ls"] * 11 + [""]
        result = compute_conversation_verification([
            with_tools(["Edit", *padding, "Read"], cmds),
        ])
        assert result["edits_count"] == 1
        assert result["reviewed_edits"] == 0

    def test_review_across_messages(self):
        result = compute_conversation_verification([
            with_tools(["Edit"]),
            with_tools(["Bash"], ["ls"]),
            with_tools(["Read"]),
        ])
        assert result["edits_count"] == 1
        assert result["reviewed_edits"] == 1


# --- compute_conversation_verification: test before commit ---


class TestTestBeforeCommit:
    def test_npm_test_before_commit(self):
        result = compute_conversation_verification([
            with_tools(["Bash", "Bash"], ["npm test", "git commit -m hi"]),
        ])
        assert result["commits_count"] == 1
        assert result["tested_commits"] == 1

    def test_multiple_runners(self):
        for cmd in ["pytest", "jest src/", "cargo test", "go test ./...", "rspec", "vitest", "tox", "bun test"]:
            result = compute_conversation_verification([
                with_tools(["Bash", "Bash"], [cmd, "git commit -m x"]),
            ])
            assert result["tested_commits"] == 1, f"failed for: {cmd}"

    def test_npm_run_test(self):
        result = compute_conversation_verification([
            with_tools(["Bash", "Bash"], ["npm run test", "git commit -m x"]),
        ])
        assert result["tested_commits"] == 1

    def test_untested_commit(self):
        result = compute_conversation_verification([
            with_tools(["Bash", "Bash"], ["echo hi", "git commit -m x"]),
        ])
        assert result["commits_count"] == 1
        assert result["tested_commits"] == 0

    def test_window_limit(self):
        padding = ["Bash"] * 11
        cmds = ["npm test", *(["echo"] * 10), "git commit -m hi"]
        result = compute_conversation_verification([with_tools([*padding, "Bash"], cmds)])
        assert result["commits_count"] == 1
        assert result["tested_commits"] == 0

    def test_lookback_truncated_at_prior_commit(self):
        result = compute_conversation_verification([
            with_tools(
                ["Bash", "Bash", "Bash", "Bash"],
                ["npm test", "git commit -m a", "echo", "git commit -m b"],
            ),
        ])
        assert result["commits_count"] == 2
        assert result["tested_commits"] == 1
        assert result["test_before_commit_rate"] == 0.5

    def test_ignores_non_commit_bash(self):
        result = compute_conversation_verification([with_tools(["Bash"], ["git status"])])
        assert result["commits_count"] == 0

    def test_only_matches_bash_for_test(self):
        result = compute_conversation_verification([
            with_tools(["Read", "Bash"], ["", "git commit -m x"]),
        ])
        assert result["tested_commits"] == 0


# --- compute_verification_metrics ---


class TestVerificationMetrics:
    def test_empty(self):
        result = compute_verification_metrics([])
        assert result["total_edit_clusters"] == 0
        assert result["insufficient_edits"] is True
        assert result["insufficient_commits"] is True

    def test_aggregate(self):
        conversations = [
            make_conversation(edits_count=4, reviewed_edits=3, commits_count=2, tested_commits=2),
            make_conversation(id="c2", edits_count=6, reviewed_edits=3, commits_count=4, tested_commits=2),
        ]
        result = compute_verification_metrics(conversations)
        assert result["total_edit_clusters"] == 10
        assert result["total_reviewed_edits"] == 6
        assert result["review_before_accept_rate"] == 0.6
        assert result["total_commits"] == 6
        assert abs(result["test_before_commit_rate"] - 0.6667) < 0.0001

    def test_insufficient_edits_threshold(self):
        conversations = [
            make_conversation(id=f"c{i}", edits_count=1, reviewed_edits=1, commits_count=1, tested_commits=1)
            for i in range(4)
        ]
        result = compute_verification_metrics(conversations)
        assert result["insufficient_edits"] is True
        assert result["insufficient_commits"] is True

    def test_threshold_met(self):
        conversations = [
            make_conversation(id=f"c{i}", edits_count=1, reviewed_edits=0, commits_count=1, tested_commits=0)
            for i in range(5)
        ]
        result = compute_verification_metrics(conversations)
        assert result["insufficient_edits"] is False
        assert result["insufficient_commits"] is False

    def test_independent_flags(self):
        conversations = [
            make_conversation(id=f"c{i}", edits_count=1, reviewed_edits=1, commits_count=0, tested_commits=0)
            for i in range(5)
        ]
        result = compute_verification_metrics(conversations)
        assert result["insufficient_edits"] is False
        assert result["insufficient_commits"] is True


# --- compute_weekly_verification ---


class TestWeeklyVerification:
    def test_empty(self):
        assert compute_weekly_verification([]) == []

    def test_groups_by_iso_week(self):
        conversations = [
            make_conversation(id="c1", started_at="2026-01-05T10:00:00Z", edits_count=2, reviewed_edits=1),
            make_conversation(id="c2", started_at="2026-01-07T10:00:00Z", edits_count=2, reviewed_edits=2),
            make_conversation(id="c3", started_at="2026-01-12T10:00:00Z", edits_count=1, reviewed_edits=0),
        ]
        weeks = compute_weekly_verification(conversations)
        assert len(weeks) == 2
        assert weeks[0]["week"] == "2026-W02"
        assert weeks[0]["review_before_accept_rate"] == 0.75
        assert weeks[1]["week"] == "2026-W03"

    def test_skips_missing_started_at(self):
        conversations = [
            make_conversation(id="c1", started_at=None),
            make_conversation(id="c2", started_at="2026-01-12T10:00:00Z", edits_count=1, reviewed_edits=1),
        ]
        weeks = compute_weekly_verification(conversations)
        assert len(weeks) == 1
