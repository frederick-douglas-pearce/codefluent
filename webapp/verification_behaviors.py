"""CodeFluent — Verification behavior detection in tool sequences.

Mirrors vscode-extension/src/verificationBehaviors.ts. Detects two patterns:
- Review after edit: a maximal Edit/Write cluster is "reviewed" when a
  Read or Grep follows within WINDOW tool positions.
- Test before commit: a `git commit` Bash is "tested" when a test-runner
  Bash precedes it within WINDOW tool positions, with the lookback
  truncated at the previous commit so a test for an earlier commit
  doesn't credit a later one.
"""

import re
from datetime import datetime

WINDOW = 10
MIN_CONVS_FOR_RATE = 5
EDIT_TOOLS = {"Edit", "Write", "NotebookEdit"}
REVIEW_TOOLS = {"Read", "Grep"}
TEST_PATTERN = re.compile(
    r"\b(npm (run )?test|pytest|jest|cargo test|go test|rspec|mocha|vitest|bun test|tox)\b",
    re.IGNORECASE,
)
COMMIT_PATTERN = re.compile(r"\bgit commit\b")


def _round_rate(x: float) -> float:
    return round(x * 10000) / 10000


def _get_iso_week_key(timestamp: str) -> str | None:
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        iso = dt.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    except (ValueError, AttributeError):
        return None


def _flatten_tools(messages: list[dict]) -> tuple[list[str], list[str]]:
    tools: list[str] = []
    commands: list[str] = []
    for msg in messages:
        names = msg.get("tool_names") or []
        cmds = msg.get("bash_commands") or []
        for i, name in enumerate(names):
            tools.append(name)
            commands.append(cmds[i] if i < len(cmds) else "")
    return tools, commands


def compute_conversation_verification(messages: list[dict]) -> dict:
    """Compute per-conversation review-after-edit and test-before-commit rates."""
    tools, commands = _flatten_tools(messages)

    edit_clusters = 0
    reviewed_clusters = 0
    i = 0
    while i < len(tools):
        if tools[i] not in EDIT_TOOLS:
            i += 1
            continue
        end = i
        while end + 1 < len(tools) and tools[end + 1] in EDIT_TOOLS:
            end += 1
        edit_clusters += 1
        limit = min(end + 1 + WINDOW, len(tools))
        for j in range(end + 1, limit):
            if tools[j] in REVIEW_TOOLS:
                reviewed_clusters += 1
                break
        i = end + 1

    commits = 0
    tested_commits = 0
    for k in range(len(tools)):
        if tools[k] != "Bash" or not COMMIT_PATTERN.search(commands[k]):
            continue
        commits += 1
        lo = max(0, k - WINDOW)
        for m in range(k - 1, lo - 1, -1):
            if tools[m] != "Bash":
                continue
            if COMMIT_PATTERN.search(commands[m]):
                break
            if TEST_PATTERN.search(commands[m]):
                tested_commits += 1
                break

    return {
        "edits_count": edit_clusters,
        "reviewed_edits": reviewed_clusters,
        "commits_count": commits,
        "tested_commits": tested_commits,
        "review_before_accept_rate": _round_rate(reviewed_clusters / edit_clusters) if edit_clusters > 0 else 0,
        "test_before_commit_rate": _round_rate(tested_commits / commits) if commits > 0 else 0,
    }


def compute_verification_metrics(conversations: list[dict]) -> dict:
    total_edits = 0
    total_reviewed = 0
    total_commits = 0
    total_tested = 0
    convs_with_edits = 0
    convs_with_commits = 0

    for conv in conversations:
        total_edits += conv.get("edits_count", 0)
        total_reviewed += conv.get("reviewed_edits", 0)
        total_commits += conv.get("commits_count", 0)
        total_tested += conv.get("tested_commits", 0)
        if conv.get("edits_count", 0) > 0:
            convs_with_edits += 1
        if conv.get("commits_count", 0) > 0:
            convs_with_commits += 1

    return {
        "total_edit_clusters": total_edits,
        "total_reviewed_edits": total_reviewed,
        "review_before_accept_rate": _round_rate(total_reviewed / total_edits) if total_edits > 0 else 0,
        "total_commits": total_commits,
        "total_tested_commits": total_tested,
        "test_before_commit_rate": _round_rate(total_tested / total_commits) if total_commits > 0 else 0,
        "conversations_with_edits": convs_with_edits,
        "conversations_with_commits": convs_with_commits,
        "conversation_count": len(conversations),
        "insufficient_edits": convs_with_edits < MIN_CONVS_FOR_RATE,
        "insufficient_commits": convs_with_commits < MIN_CONVS_FOR_RATE,
    }


def compute_weekly_verification(conversations: list[dict]) -> list[dict]:
    if not conversations:
        return []

    week_groups: dict[str, list[dict]] = {}
    for conv in conversations:
        started_at = conv.get("started_at")
        if not started_at:
            continue
        week = _get_iso_week_key(started_at)
        if not week:
            continue
        week_groups.setdefault(week, []).append(conv)

    result = []
    for week, week_convs in week_groups.items():
        edits = sum(c.get("edits_count", 0) for c in week_convs)
        reviewed = sum(c.get("reviewed_edits", 0) for c in week_convs)
        commits = sum(c.get("commits_count", 0) for c in week_convs)
        tested = sum(c.get("tested_commits", 0) for c in week_convs)
        convs_with_edits = sum(1 for c in week_convs if c.get("edits_count", 0) > 0)
        convs_with_commits = sum(1 for c in week_convs if c.get("commits_count", 0) > 0)
        result.append({
            "week": week,
            "review_before_accept_rate": _round_rate(reviewed / edits) if edits > 0 else 0,
            "test_before_commit_rate": _round_rate(tested / commits) if commits > 0 else 0,
            "edit_clusters": edits,
            "commits": commits,
            "conversations_with_edits": convs_with_edits,
            "conversations_with_commits": convs_with_commits,
            "conversation_count": len(week_convs),
        })

    result.sort(key=lambda x: x["week"])
    return result
