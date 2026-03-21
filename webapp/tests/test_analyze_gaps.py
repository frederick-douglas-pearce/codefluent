"""Tests for the inter-message gap analysis tool."""

import json
from datetime import datetime, timezone, timedelta
from pathlib import Path

import pytest

# Import from shared/tools — adjust path
import sys
sys.path.insert(0, str(Path(__file__).parent.parent.parent / "shared" / "tools"))

from analyze_gaps import (
    parse_timestamp,
    extract_user_timestamps,
    compute_gaps,
    percentile,
    compute_statistics,
    analyze_threshold,
    format_duration,
    recommend_threshold,
    scan_projects,
    main,
)


# -- Timestamp parsing --

class TestParseTimestamp:
    def test_z_suffix(self):
        dt = parse_timestamp("2026-03-01T10:00:00.000Z")
        assert dt.year == 2026
        assert dt.month == 3
        assert dt.hour == 10
        assert dt.tzinfo is not None

    def test_offset_suffix(self):
        dt = parse_timestamp("2026-03-01T10:00:00+00:00")
        assert dt.hour == 10

    def test_no_milliseconds(self):
        dt = parse_timestamp("2026-03-01T10:00:00Z")
        assert dt.minute == 0


# -- Gap computation --

class TestComputeGaps:
    def test_empty_list(self):
        assert compute_gaps([]) == []

    def test_single_timestamp(self):
        ts = [datetime(2026, 1, 1, tzinfo=timezone.utc)]
        assert compute_gaps(ts) == []

    def test_two_timestamps(self):
        ts = [
            datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 10, 30, tzinfo=timezone.utc),
        ]
        gaps = compute_gaps(ts)
        assert len(gaps) == 1
        assert gaps[0] == pytest.approx(30.0)

    def test_multiple_timestamps(self):
        ts = [
            datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 10, 5, tzinfo=timezone.utc),
            datetime(2026, 1, 1, 12, 5, tzinfo=timezone.utc),
        ]
        gaps = compute_gaps(ts)
        assert len(gaps) == 2
        assert gaps[0] == pytest.approx(5.0)
        assert gaps[1] == pytest.approx(120.0)


# -- Percentile --

class TestPercentile:
    def test_empty(self):
        assert percentile([], 50) == 0.0

    def test_single_value(self):
        assert percentile([42.0], 50) == 42.0

    def test_median_odd(self):
        assert percentile([1, 2, 3, 4, 5], 50) == 3.0

    def test_median_even(self):
        result = percentile([1, 2, 3, 4], 50)
        assert result == pytest.approx(2.5)

    def test_p0(self):
        assert percentile([10, 20, 30], 0) == 10.0

    def test_p100(self):
        assert percentile([10, 20, 30], 100) == 30.0


# -- Statistics --

class TestComputeStatistics:
    def test_empty(self):
        stats = compute_statistics([])
        assert stats == {"count": 0}

    def test_single_gap(self):
        stats = compute_statistics([5.0])
        assert stats["count"] == 1
        assert stats["min"] == 5.0
        assert stats["max"] == 5.0
        assert stats["mean"] == 5.0
        assert stats["median"] == 5.0

    def test_multiple_gaps(self):
        gaps = [1.0, 2.0, 3.0, 10.0, 100.0]
        stats = compute_statistics(gaps)
        assert stats["count"] == 5
        assert stats["min"] == 1.0
        assert stats["max"] == 100.0
        assert stats["mean"] == pytest.approx(23.2)
        assert stats["median"] == 3.0


# -- JSONL extraction --

class TestExtractUserTimestamps:
    def test_extracts_user_timestamps(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "hello"}},
            {"type": "assistant", "timestamp": "2026-01-01T10:01:00Z",
             "message": {"role": "assistant", "content": "hi"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "thanks"}},
        ]
        jsonl.write_text("\n".join(json.dumps(m) for m in messages))

        timestamps = extract_user_timestamps(jsonl)
        assert len(timestamps) == 2
        assert timestamps[0] < timestamps[1]

    def test_skips_empty_content(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": ""}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "real prompt"}},
        ]
        jsonl.write_text("\n".join(json.dumps(m) for m in messages))

        timestamps = extract_user_timestamps(jsonl)
        assert len(timestamps) == 1

    def test_skips_interrupted_prompts(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "[Request interrupted by user for tool use]"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "real prompt"}},
        ]
        jsonl.write_text("\n".join(json.dumps(m) for m in messages))

        timestamps = extract_user_timestamps(jsonl)
        assert len(timestamps) == 1

    def test_handles_array_content(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": [{"type": "text", "text": "hello"}]}},
        ]
        jsonl.write_text("\n".join(json.dumps(m) for m in messages))

        timestamps = extract_user_timestamps(jsonl)
        assert len(timestamps) == 1

    def test_handles_corrupt_lines(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        content = (
            '{"type": "user", "timestamp": "2026-01-01T10:00:00Z", '
            '"message": {"role": "user", "content": "hello"}}\n'
            'not valid json\n'
            '{"type": "user", "timestamp": "2026-01-01T10:05:00Z", '
            '"message": {"role": "user", "content": "world"}}\n'
        )
        jsonl.write_text(content)

        timestamps = extract_user_timestamps(jsonl)
        assert len(timestamps) == 2

    def test_returns_sorted(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:30:00Z",
             "message": {"role": "user", "content": "second"}},
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "first"}},
        ]
        jsonl.write_text("\n".join(json.dumps(m) for m in messages))

        timestamps = extract_user_timestamps(jsonl)
        assert timestamps[0] < timestamps[1]

    def test_empty_file(self, tmp_path):
        jsonl = tmp_path / "session.jsonl"
        jsonl.write_text("")
        assert extract_user_timestamps(jsonl) == []

    def test_nonexistent_file(self, tmp_path):
        jsonl = tmp_path / "nope.jsonl"
        assert extract_user_timestamps(jsonl) == []


# -- Threshold analysis --

class TestAnalyzeThreshold:
    def _make_timestamps(self, gaps_minutes: list[float]) -> list[datetime]:
        """Build a timestamp list from gap sizes."""
        base = datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)
        timestamps = [base]
        for gap in gaps_minutes:
            timestamps.append(timestamps[-1] + timedelta(minutes=gap))
        return timestamps

    def test_no_splits(self):
        # All gaps under threshold
        ts = self._make_timestamps([5, 10, 5, 10])
        result = analyze_threshold([ts], 60)
        assert result["total_conversations"] == 1
        assert result["gaps_exceeding"] == 0

    def test_one_split(self):
        # One gap above threshold
        ts = self._make_timestamps([5, 10, 120, 5])
        result = analyze_threshold([ts], 60)
        assert result["total_conversations"] == 2
        assert result["gaps_exceeding"] == 1

    def test_multiple_splits(self):
        ts = self._make_timestamps([5, 120, 5, 120, 5])
        result = analyze_threshold([ts], 60)
        assert result["total_conversations"] == 3
        assert result["gaps_exceeding"] == 2

    def test_multiple_projects(self):
        ts1 = self._make_timestamps([5, 120, 5])
        ts2 = self._make_timestamps([5, 5, 5])
        result = analyze_threshold([ts1, ts2], 60)
        assert result["total_conversations"] == 3  # 2 from ts1, 1 from ts2

    def test_empty_sessions(self):
        result = analyze_threshold([], 60)
        assert result["total_conversations"] == 0

    def test_single_message_sessions(self):
        ts = [datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc)]
        result = analyze_threshold([ts], 60)
        assert result["total_conversations"] == 1
        assert result["single_message_conversations"] == 1

    def test_exact_threshold_triggers_split(self):
        ts = self._make_timestamps([60])
        result = analyze_threshold([ts], 60)
        assert result["total_conversations"] == 2
        assert result["gaps_exceeding"] == 1


# -- Project scanning (cross-session merging) --

class TestScanProjects:
    def test_merges_sessions_within_same_project(self, tmp_path):
        """Sessions in the same project directory are pooled into one timestamp list."""
        project = tmp_path / "my-project"
        project.mkdir()

        # Session 1: messages at 10:00 and 10:05
        s1 = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "first"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "second"}},
        ]
        (project / "session-1.jsonl").write_text("\n".join(json.dumps(m) for m in s1))

        # Session 2: messages at 10:10 and 10:15 (same conversation, different file)
        s2 = [
            {"type": "user", "timestamp": "2026-01-01T10:10:00Z",
             "message": {"role": "user", "content": "third"}},
            {"type": "user", "timestamp": "2026-01-01T10:15:00Z",
             "message": {"role": "user", "content": "fourth"}},
        ]
        (project / "session-2.jsonl").write_text("\n".join(json.dumps(m) for m in s2))

        result = scan_projects(tmp_path)
        assert len(result) == 1  # one project
        assert len(result["my-project"]) == 4  # all 4 messages pooled
        # Verify sorted
        for i in range(len(result["my-project"]) - 1):
            assert result["my-project"][i] <= result["my-project"][i + 1]

    def test_separates_different_projects(self, tmp_path):
        """Sessions in different project directories stay separate."""
        proj_a = tmp_path / "project-a"
        proj_b = tmp_path / "project-b"
        proj_a.mkdir()
        proj_b.mkdir()

        msg_a = [{"type": "user", "timestamp": "2026-01-01T10:00:00Z",
                   "message": {"role": "user", "content": "hello"}}]
        msg_b = [{"type": "user", "timestamp": "2026-01-01T10:05:00Z",
                   "message": {"role": "user", "content": "world"}}]

        (proj_a / "s1.jsonl").write_text(json.dumps(msg_a[0]))
        (proj_b / "s1.jsonl").write_text(json.dumps(msg_b[0]))

        result = scan_projects(tmp_path)
        assert len(result) == 2
        assert "project-a" in result
        assert "project-b" in result

    def test_cross_session_conversations(self, tmp_path):
        """Messages 5 min apart across sessions in the same project form one conversation."""
        project = tmp_path / "my-project"
        project.mkdir()

        # Three separate session files, 5 minutes apart
        for i, ts in enumerate(["10:00:00", "10:05:00", "10:10:00"]):
            msg = {"type": "user", "timestamp": f"2026-01-01T{ts}Z",
                   "message": {"role": "user", "content": f"prompt {i+1}"}}
            (project / f"session-{i+1}.jsonl").write_text(json.dumps(msg))

        result = scan_projects(tmp_path)
        pooled = result["my-project"]
        assert len(pooled) == 3

        # At 15-minute threshold, all 3 should be one conversation
        analysis = analyze_threshold([pooled], 15)
        assert analysis["total_conversations"] == 1

    def test_empty_sessions_excluded(self, tmp_path):
        project = tmp_path / "project"
        project.mkdir()
        (project / "empty.jsonl").write_text("")
        (project / "real.jsonl").write_text(json.dumps(
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "hello"}}
        ))

        result = scan_projects(tmp_path)
        assert len(result) == 1
        assert len(result["project"]) == 1


# -- Format duration --

class TestFormatDuration:
    def test_seconds(self):
        assert format_duration(0.5) == "30s"

    def test_minutes(self):
        assert format_duration(5.0) == "5.0m"

    def test_hours(self):
        assert format_duration(90.0) == "1.5h"

    def test_days(self):
        assert format_duration(2880.0) == "2.0d"


# -- Recommendation --

class TestRecommendThreshold:
    def test_returns_threshold_and_rationale(self):
        results = [
            {
                "threshold_minutes": 30,
                "total_conversations": 10,
                "median_conversation_messages": 8,
                "single_message_conversations": 2,
                "median_conversation_duration_min": 25.0,
                "gaps_exceeding": 5,
                "gaps_exceeding_pct": 10,
                "avg_conversation_messages": 8,
                "avg_conversation_duration_min": 30,
            },
            {
                "threshold_minutes": 60,
                "total_conversations": 7,
                "median_conversation_messages": 12,
                "single_message_conversations": 1,
                "median_conversation_duration_min": 40.0,
                "gaps_exceeding": 3,
                "gaps_exceeding_pct": 5,
                "avg_conversation_messages": 12,
                "avg_conversation_duration_min": 45,
            },
        ]
        threshold, rationale = recommend_threshold(results)
        assert threshold in (30, 60)
        assert isinstance(rationale, str)
        assert len(rationale) > 0

    def test_empty_results(self):
        threshold, rationale = recommend_threshold([])
        assert threshold == 60
        assert "Insufficient data" in rationale

    def test_penalizes_high_single_message_pct(self):
        high_single = {
            "threshold_minutes": 15,
            "total_conversations": 100,
            "median_conversation_messages": 1,
            "single_message_conversations": 60,
            "median_conversation_duration_min": 0.0,
            "gaps_exceeding": 50,
            "gaps_exceeding_pct": 20,
            "avg_conversation_messages": 2,
            "avg_conversation_duration_min": 5,
        }
        low_single = {
            "threshold_minutes": 60,
            "total_conversations": 50,
            "median_conversation_messages": 8,
            "single_message_conversations": 10,
            "median_conversation_duration_min": 30.0,
            "gaps_exceeding": 10,
            "gaps_exceeding_pct": 5,
            "avg_conversation_messages": 8,
            "avg_conversation_duration_min": 40,
        }
        threshold, _ = recommend_threshold([high_single, low_single])
        assert threshold == 60


# -- CLI / main --

class TestMain:
    def test_nonexistent_path(self):
        with pytest.raises(SystemExit):
            main(["/nonexistent/path"])

    def test_no_sessions(self, tmp_path):
        with pytest.raises(SystemExit):
            main([str(tmp_path)])

    def test_runs_with_synthetic_data(self, tmp_path, capsys):
        # Create a project directory with session files
        project = tmp_path / "project"
        project.mkdir()

        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "first"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "second"}},
            {"type": "user", "timestamp": "2026-01-01T12:00:00Z",
             "message": {"role": "user", "content": "after break"}},
            {"type": "user", "timestamp": "2026-01-01T12:03:00Z",
             "message": {"role": "user", "content": "follow up"}},
        ]
        session = project / "session-1.jsonl"
        session.write_text("\n".join(json.dumps(m) for m in messages))

        main([str(tmp_path)])
        output = capsys.readouterr().out
        assert "Gap Analysis" in output
        assert "Recommendation" in output

    def test_json_output(self, tmp_path, capsys):
        project = tmp_path / "project"
        project.mkdir()

        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "first"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "second"}},
        ]
        session = project / "session-1.jsonl"
        session.write_text("\n".join(json.dumps(m) for m in messages))

        main([str(tmp_path), "--json"])
        output = capsys.readouterr().out
        data = json.loads(output)
        assert data["project_count"] == 1
        assert data["total_messages"] == 2
        assert "recommendation" in data

    def test_custom_threshold(self, tmp_path, capsys):
        project = tmp_path / "project"
        project.mkdir()

        messages = [
            {"type": "user", "timestamp": "2026-01-01T10:00:00Z",
             "message": {"role": "user", "content": "first"}},
            {"type": "user", "timestamp": "2026-01-01T10:05:00Z",
             "message": {"role": "user", "content": "second"}},
        ]
        session = project / "session-1.jsonl"
        session.write_text("\n".join(json.dumps(m) for m in messages))

        main([str(tmp_path), "--threshold", "45"])
        output = capsys.readouterr().out
        assert "45m" in output
