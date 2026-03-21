#!/usr/bin/env python3
"""Analyze inter-message gap distribution across Claude Code session data.

Reads .jsonl session files, extracts timestamps from user messages,
computes gaps between consecutive messages, and outputs statistics
to inform the conversation inactivity threshold.

Usage:
    uv run python shared/tools/analyze_gaps.py                            # default path
    uv run python shared/tools/analyze_gaps.py /path/to/claude/projects   # custom path
    uv run python shared/tools/analyze_gaps.py --threshold 45             # test specific threshold
"""

import argparse
import json
import math
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

CANDIDATE_THRESHOLDS_MINUTES = [15, 30, 45, 60, 90, 120]

SKIP_PROMPTS = frozenset([
    "[Request interrupted by user for tool use]",
])


def parse_timestamp(ts: str) -> datetime:
    """Parse ISO 8601 timestamp string to datetime."""
    # Handle both 'Z' suffix and '+00:00' timezone formats
    ts = ts.replace("Z", "+00:00")
    return datetime.fromisoformat(ts)


def extract_user_timestamps(filepath: Path) -> list[datetime]:
    """Extract sorted timestamps from user messages in a JSONL file."""
    timestamps = []
    try:
        text = filepath.read_text(errors="replace")
    except OSError:
        return timestamps

    for line in text.split("\n"):
        line = line.strip()
        if not line:
            continue
        try:
            msg = json.loads(line)
        except json.JSONDecodeError:
            continue

        if msg.get("type") != "user":
            continue
        ts = msg.get("timestamp")
        if not ts:
            continue

        # Skip non-substantive prompts
        content = msg.get("message", {}).get("content", "")
        if isinstance(content, list):
            content = " ".join(
                block.get("text", "") for block in content if isinstance(block, dict)
            )
        content = content.strip()
        if not content or content in SKIP_PROMPTS:
            continue

        try:
            timestamps.append(parse_timestamp(ts))
        except (ValueError, TypeError):
            continue

    timestamps.sort()
    return timestamps


def compute_gaps(timestamps: list[datetime]) -> list[float]:
    """Compute gaps in minutes between consecutive timestamps."""
    if len(timestamps) < 2:
        return []
    return [
        (timestamps[i + 1] - timestamps[i]).total_seconds() / 60.0
        for i in range(len(timestamps) - 1)
    ]


def percentile(sorted_values: list[float], p: float) -> float:
    """Compute percentile using linear interpolation."""
    if not sorted_values:
        return 0.0
    n = len(sorted_values)
    k = (n - 1) * (p / 100.0)
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return sorted_values[int(k)]
    return sorted_values[f] * (c - k) + sorted_values[c] * (k - f)


def compute_statistics(gaps: list[float]) -> dict:
    """Compute summary statistics for a list of gap values (in minutes)."""
    if not gaps:
        return {"count": 0}

    sorted_gaps = sorted(gaps)
    return {
        "count": len(sorted_gaps),
        "min": sorted_gaps[0],
        "max": sorted_gaps[-1],
        "mean": sum(sorted_gaps) / len(sorted_gaps),
        "median": percentile(sorted_gaps, 50),
        "p75": percentile(sorted_gaps, 75),
        "p90": percentile(sorted_gaps, 90),
        "p95": percentile(sorted_gaps, 95),
        "p99": percentile(sorted_gaps, 99),
    }


def analyze_threshold(
    all_session_timestamps: list[list[datetime]], threshold_minutes: float
) -> dict:
    """Analyze what happens at a given threshold.

    Returns conversation count, average length (messages and duration),
    and the number/percentage of gaps exceeding the threshold.
    """
    all_gaps = []
    total_conversations = 0
    conversation_lengths = []  # message counts per conversation
    conversation_durations = []  # minutes per conversation

    for timestamps in all_session_timestamps:
        if not timestamps:
            continue

        gaps = compute_gaps(timestamps)
        all_gaps.extend(gaps)

        # Split into conversations at this threshold
        conv_start_idx = 0
        for i, gap in enumerate(gaps):
            if gap >= threshold_minutes:
                # End current conversation
                conv_msgs = i - conv_start_idx + 1
                conv_duration = (
                    timestamps[i] - timestamps[conv_start_idx]
                ).total_seconds() / 60.0
                conversation_lengths.append(conv_msgs)
                conversation_durations.append(conv_duration)
                total_conversations += 1
                conv_start_idx = i + 1

        # Final conversation in this session
        conv_msgs = len(timestamps) - conv_start_idx
        conv_duration = (
            timestamps[-1] - timestamps[conv_start_idx]
        ).total_seconds() / 60.0
        conversation_lengths.append(conv_msgs)
        conversation_durations.append(conv_duration)
        total_conversations += 1

    gaps_exceeding = [g for g in all_gaps if g >= threshold_minutes]

    return {
        "threshold_minutes": threshold_minutes,
        "total_conversations": total_conversations,
        "gaps_exceeding": len(gaps_exceeding),
        "gaps_exceeding_pct": (len(gaps_exceeding) / len(all_gaps) * 100) if all_gaps else 0,
        "avg_conversation_messages": (
            sum(conversation_lengths) / len(conversation_lengths)
            if conversation_lengths
            else 0
        ),
        "median_conversation_messages": (
            percentile(sorted(conversation_lengths), 50)
            if conversation_lengths
            else 0
        ),
        "avg_conversation_duration_min": (
            sum(conversation_durations) / len(conversation_durations)
            if conversation_durations
            else 0
        ),
        "median_conversation_duration_min": (
            percentile(sorted(conversation_durations), 50)
            if conversation_durations
            else 0
        ),
        "single_message_conversations": sum(
            1 for l in conversation_lengths if l == 1
        ),
    }


def scan_projects(data_path: Path) -> dict[str, list[datetime]]:
    """Scan all .jsonl files under data_path and return per-project timestamp lists.

    Groups session files by their parent directory (project), pools all user
    message timestamps across sessions within each project, and returns a
    single sorted timestamp list per project. This means conversations can
    span multiple session files — session boundaries are ignored.
    """
    project_timestamps: dict[str, list[datetime]] = {}
    jsonl_files = sorted(data_path.rglob("*.jsonl"))

    for filepath in jsonl_files:
        project_dir = filepath.parent.name
        timestamps = extract_user_timestamps(filepath)
        if timestamps:
            if project_dir not in project_timestamps:
                project_timestamps[project_dir] = []
            project_timestamps[project_dir].extend(timestamps)

    # Sort each project's pooled timestamps
    for project_dir in project_timestamps:
        project_timestamps[project_dir].sort()

    return project_timestamps


def format_duration(minutes: float) -> str:
    """Format minutes into a human-readable duration string."""
    if minutes < 1:
        return f"{minutes * 60:.0f}s"
    if minutes < 60:
        return f"{minutes:.1f}m"
    hours = minutes / 60
    if hours < 24:
        return f"{hours:.1f}h"
    days = hours / 24
    return f"{days:.1f}d"


def recommend_threshold(threshold_results: list[dict]) -> tuple[float, str]:
    """Pick the best threshold and explain why.

    Heuristic: prefer the threshold that balances conversation granularity
    (not too many single-message conversations) against over-merging
    (not too few conversations from clearly separate work sessions).
    """
    best = None
    best_score = -1

    for result in threshold_results:
        total = result["total_conversations"]
        if total == 0:
            continue

        single_pct = result["single_message_conversations"] / total * 100
        median_msgs = result["median_conversation_messages"]

        # Penalize too many single-message conversations (over-splitting)
        if single_pct > 50:
            score = 0
        else:
            # Reward moderate median conversation length (3-15 messages ideal)
            if median_msgs < 2:
                msg_score = 0.2
            elif median_msgs <= 5:
                msg_score = 0.8
            elif median_msgs <= 15:
                msg_score = 1.0
            elif median_msgs <= 30:
                msg_score = 0.7
            else:
                msg_score = 0.4

            # Reward low single-message percentage
            single_score = max(0, 1 - single_pct / 50)

            score = msg_score * 0.6 + single_score * 0.4

        if score > best_score:
            best_score = score
            best = result

    if best is None:
        return 60, "Insufficient data; defaulting to 60 minutes."

    threshold = best["threshold_minutes"]
    reasons = []
    reasons.append(
        f"produces {best['total_conversations']} conversations "
        f"with median {best['median_conversation_messages']:.0f} messages each"
    )
    reasons.append(
        f"{best['single_message_conversations']} single-message conversations "
        f"({best['single_message_conversations'] / best['total_conversations'] * 100:.0f}%)"
    )
    reasons.append(
        f"median conversation duration: {format_duration(best['median_conversation_duration_min'])}"
    )

    return threshold, "; ".join(reasons)


def print_report(
    data_path: Path,
    project_timestamps: dict[str, list[datetime]],
    stats: dict,
    threshold_results: list[dict],
    recommendation: tuple[float, str],
) -> None:
    """Print the analysis report to stdout."""
    all_project_ts = list(project_timestamps.values())
    total_messages = sum(len(ts) for ts in all_project_ts)
    all_gaps = []
    for ts in all_project_ts:
        all_gaps.extend(compute_gaps(ts))

    print("=" * 70)
    print("  Claude Code Inter-Message Gap Analysis")
    print("=" * 70)
    print()
    print(f"  Data path:       {data_path}")
    print(f"  Projects:        {len(project_timestamps)}")
    print(f"  User messages:   {total_messages}")
    print(f"  Inter-msg gaps:  {len(all_gaps)}")
    print()

    if stats["count"] == 0:
        print("  No gaps found (need at least 2 messages in a session).")
        return

    print("  Gap Distribution (minutes)")
    print("  " + "-" * 40)
    print(f"  Min:      {format_duration(stats['min']):>10}")
    print(f"  Median:   {format_duration(stats['median']):>10}")
    print(f"  Mean:     {format_duration(stats['mean']):>10}")
    print(f"  P75:      {format_duration(stats['p75']):>10}")
    print(f"  P90:      {format_duration(stats['p90']):>10}")
    print(f"  P95:      {format_duration(stats['p95']):>10}")
    print(f"  P99:      {format_duration(stats['p99']):>10}")
    print(f"  Max:      {format_duration(stats['max']):>10}")
    print()

    print("  Threshold Analysis")
    print("  " + "-" * 66)
    header = f"  {'Threshold':>10} {'Convos':>7} {'Splits':>7} {'Med Msgs':>9} {'Med Dur':>9} {'1-msg%':>7}"
    print(header)
    print("  " + "-" * 66)

    for r in threshold_results:
        t = r["threshold_minutes"]
        label = f"{t}m" if t < 120 else f"{t // 60}h"
        single_pct = (
            r["single_message_conversations"] / r["total_conversations"] * 100
            if r["total_conversations"]
            else 0
        )
        print(
            f"  {label:>10} {r['total_conversations']:>7} "
            f"{r['gaps_exceeding']:>7} "
            f"{r['median_conversation_messages']:>9.0f} "
            f"{format_duration(r['median_conversation_duration_min']):>9} "
            f"{single_pct:>6.0f}%"
        )

    print()
    rec_threshold, rec_reason = recommendation
    print(f"  Recommendation: {rec_threshold:.0f}-minute threshold")
    print(f"  Rationale: {rec_reason}")
    print()
    print("  " + "-" * 66)
    print("  Splits = number of gaps >= threshold (conversation boundaries)")
    print("  Med Msgs = median messages per conversation")
    print("  Med Dur = median conversation duration")
    print("  1-msg% = percentage of single-message conversations")
    print("=" * 70)


def main(argv: list[str] | None = None) -> None:
    parser = argparse.ArgumentParser(
        description="Analyze inter-message gap distribution in Claude Code session data."
    )
    parser.add_argument(
        "data_path",
        nargs="?",
        default=os.path.expanduser("~/.claude/projects/"),
        help="Path to Claude Code session data directory (default: ~/.claude/projects/)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        help="Test a specific threshold in addition to the defaults",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="Output results as JSON instead of formatted text",
    )
    args = parser.parse_args(argv)

    data_path = Path(args.data_path)
    if not data_path.exists():
        print(f"Error: path does not exist: {data_path}", file=sys.stderr)
        sys.exit(1)

    project_timestamps = scan_projects(data_path)

    if not project_timestamps:
        print(f"No session data found in {data_path}", file=sys.stderr)
        sys.exit(1)

    # Each project's pooled timestamps become the analysis unit
    all_project_ts = list(project_timestamps.values())

    # Compute overall gap statistics
    all_gaps = []
    for ts in all_project_ts:
        all_gaps.extend(compute_gaps(ts))

    stats = compute_statistics(all_gaps)

    # Analyze each candidate threshold
    thresholds = list(CANDIDATE_THRESHOLDS_MINUTES)
    if args.threshold and args.threshold not in thresholds:
        thresholds.append(args.threshold)
        thresholds.sort()

    threshold_results = [analyze_threshold(all_project_ts, t) for t in thresholds]
    recommendation = recommend_threshold(threshold_results)

    if args.json:
        output = {
            "data_path": str(data_path),
            "project_count": len(project_timestamps),
            "total_messages": sum(len(ts) for ts in all_project_ts),
            "total_gaps": len(all_gaps),
            "statistics": stats,
            "thresholds": threshold_results,
            "recommendation": {
                "threshold_minutes": recommendation[0],
                "rationale": recommendation[1],
            },
        }
        print(json.dumps(output, indent=2))
    else:
        print_report(data_path, project_timestamps, stats, threshold_results, recommendation)


if __name__ == "__main__":
    main()
