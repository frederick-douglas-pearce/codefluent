"""CodeFluent — Error recovery pattern detection in conversation flow."""

from datetime import datetime

MAX_RECOVERY_WINDOW = 20


def _round_rate(x: float) -> float:
    return round(x * 10000) / 10000


def compute_conversation_error_recovery(messages: list[dict]) -> dict:
    """Analyze a single conversation's message stream for error-recovery patterns.

    Algorithm:
    1. Build tool_use_id -> tool_name map from assistant messages
    2. Find tool_result messages with is_error == True
    3. For each error, scan forward (max 20 msgs) for a successful tool_result
    4. Categorize recovery strategy: retry_same_tool, switch_tool, user_intervention
    """
    # Build tool_use_id -> tool_name map from assistant messages
    tool_use_id_to_name: dict[str, str] = {}
    for msg in messages:
        if msg.get("type") == "assistant":
            ids = msg.get("tool_use_ids") or []
            names = msg.get("tool_names") or []
            for j in range(min(len(ids), len(names))):
                if ids[j] and names[j]:
                    tool_use_id_to_name[ids[j]] = names[j]

    # Find errors and their resolutions
    error_tools: set[str] = set()
    strategies: set[str] = set()
    error_count = 0
    recovery_count = 0
    resolution_turns: list[int] = []

    for i, msg in enumerate(messages):
        if msg.get("type") != "tool_result" or not msg.get("is_error"):
            continue

        error_count += 1
        error_tool_name = None
        tool_use_id = msg.get("tool_use_id")
        if tool_use_id:
            error_tool_name = tool_use_id_to_name.get(tool_use_id)
        if error_tool_name:
            error_tools.add(error_tool_name)

        # Scan forward for resolution
        has_user_intervention = False
        limit = min(i + MAX_RECOVERY_WINDOW + 1, len(messages))
        for j in range(i + 1, limit):
            nxt = messages[j]
            if nxt.get("type") == "user" and nxt.get("content"):
                has_user_intervention = True
            if nxt.get("type") == "tool_result" and not nxt.get("is_error"):
                # Resolution found
                recovery_count += 1
                resolution_turns.append(j - i)

                # Categorize strategy
                resolution_tool_name = None
                res_tool_use_id = nxt.get("tool_use_id")
                if res_tool_use_id:
                    resolution_tool_name = tool_use_id_to_name.get(res_tool_use_id)

                if has_user_intervention:
                    strategy = "user_intervention"
                elif error_tool_name and resolution_tool_name and error_tool_name == resolution_tool_name:
                    strategy = "retry_same_tool"
                else:
                    strategy = "switch_tool"
                strategies.add(strategy)
                break

    avg_turns = (
        sum(resolution_turns) / len(resolution_turns)
        if resolution_turns
        else None
    )
    diversity = strategies.__len__() / recovery_count if recovery_count > 0 else 0

    return {
        "error_count": error_count,
        "recovery_count": recovery_count,
        "avg_failure_to_resolution_turns": _round_rate(avg_turns) if avg_turns is not None else None,
        "recovery_strategy_diversity": _round_rate(diversity),
        "error_tools": sorted(error_tools),
    }


def compute_error_recovery_metrics(conversations: list[dict]) -> dict:
    """Compute aggregate error recovery metrics across all conversations.

    Returns insufficient_data=True when fewer than 5 conversations have errors.
    """
    if not conversations:
        return {
            "total_error_count": 0,
            "total_recovery_count": 0,
            "recovery_rate": 0,
            "avg_failure_to_resolution_turns": None,
            "conversations_with_errors": 0,
            "conversation_count": 0,
            "insufficient_data": True,
        }

    total_errors = 0
    total_recoveries = 0
    convs_with_errors = 0
    turns_values: list[float] = []

    for conv in conversations:
        total_errors += conv.get("error_count", 0)
        total_recoveries += conv.get("recovery_count", 0)
        if conv.get("error_count", 0) > 0:
            convs_with_errors += 1
            avg_turns = conv.get("avg_failure_to_resolution_turns")
            if avg_turns is not None:
                turns_values.append(avg_turns)

    recovery_rate = total_recoveries / total_errors if total_errors > 0 else 0
    avg_turns = (
        sum(turns_values) / len(turns_values)
        if turns_values
        else None
    )

    return {
        "total_error_count": total_errors,
        "total_recovery_count": total_recoveries,
        "recovery_rate": _round_rate(recovery_rate),
        "avg_failure_to_resolution_turns": _round_rate(avg_turns) if avg_turns is not None else None,
        "conversations_with_errors": convs_with_errors,
        "conversation_count": len(conversations),
        "insufficient_data": convs_with_errors < 5,
    }


def _get_iso_week_key(timestamp: str) -> str | None:
    """Get ISO week key from timestamp string."""
    try:
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        iso = dt.isocalendar()
        return f"{iso.year}-W{iso.week:02d}"
    except (ValueError, AttributeError):
        return None


def compute_weekly_error_recovery(conversations: list[dict]) -> list[dict]:
    """Compute weekly error recovery breakdown."""
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
        total_errors = sum(c.get("error_count", 0) for c in week_convs)
        total_recoveries = sum(c.get("recovery_count", 0) for c in week_convs)
        convs_with_errors = sum(1 for c in week_convs if c.get("error_count", 0) > 0)

        result.append({
            "week": week,
            "error_count": total_errors,
            "recovery_rate": _round_rate(total_recoveries / total_errors) if total_errors > 0 else 0,
            "conversations_with_errors": convs_with_errors,
            "conversation_count": len(week_convs),
        })

    result.sort(key=lambda x: x["week"])
    return result
