"""Agent metrics computation — pure functions over conversation data."""

from datetime import datetime, timedelta


def _get_iso_week_key(date_str: str) -> tuple[str, str] | None:
    """Return (week_key, monday_date) for a timestamp string, or None if invalid."""
    try:
        dt = datetime.fromisoformat(date_str.replace("Z", "+00:00"))
    except (ValueError, TypeError):
        return None
    iso_year, iso_week, _ = dt.isocalendar()
    key = f"{iso_year}-W{iso_week:02d}"
    monday = dt.date() - timedelta(days=dt.weekday())
    return key, monday.isoformat()


def _conv_tool_diversity(conv: dict) -> float:
    tool_use_count = conv.get("tool_use_count", 0)
    if tool_use_count == 0:
        return 0.0
    tools_used = conv.get("tools_used", [])
    return len(tools_used) / tool_use_count


def _conv_thinking_rate(conv: dict) -> float:
    assistant_count = conv.get("assistant_message_count", 0)
    if assistant_count == 0:
        return 0.0
    return conv.get("thinking_count", 0) / assistant_count


def _conv_avg_prompt_length(conv: dict) -> float:
    prompts = conv.get("user_prompts", [])
    if not prompts:
        return 0.0
    return sum(len(p) for p in prompts) / len(prompts)


def compute_agent_metrics(conversations: list[dict]) -> dict:
    """Compute aggregate agent behavior metrics from conversation data."""
    if not conversations:
        return {
            "tool_diversity_index": 0,
            "plan_mode_adoption_rate": 0,
            "avg_cache_hit_rate": 0,
            "thinking_utilization_rate": 0,
            "command_adoption_rate": 0,
            "avg_prompt_length": 0,
            "conversation_count": 0,
        }

    n = len(conversations)

    # Tool diversity: mean of per-conversation values
    diversity_sum = sum(_conv_tool_diversity(c) for c in conversations)
    tool_diversity_index = diversity_sum / n

    # Plan mode adoption: fraction using plan mode
    plan_count = sum(1 for c in conversations if c.get("used_plan_mode"))
    plan_mode_adoption_rate = plan_count / n

    # Cache hit rate: mean of per-conversation values
    cache_sum = sum(c.get("cache_hit_rate", 0) for c in conversations)
    avg_cache_hit_rate = cache_sum / n

    # Thinking utilization: sum(thinking) / sum(assistant) across ALL conversations
    total_thinking = sum(c.get("thinking_count", 0) for c in conversations)
    total_assistant = sum(c.get("assistant_message_count", 0) for c in conversations)
    thinking_utilization_rate = total_thinking / total_assistant if total_assistant > 0 else 0

    # Command adoption: fraction of conversations using custom commands/skills
    command_count = sum(1 for c in conversations if c.get("commands_used"))
    command_adoption_rate = command_count / n

    # Avg prompt length: mean across ALL user prompts
    all_prompts = [p for c in conversations for p in c.get("user_prompts", [])]
    avg_prompt_length = sum(len(p) for p in all_prompts) / len(all_prompts) if all_prompts else 0

    return {
        "tool_diversity_index": round(tool_diversity_index, 4),
        "plan_mode_adoption_rate": round(plan_mode_adoption_rate, 4),
        "avg_cache_hit_rate": round(avg_cache_hit_rate, 4),
        "thinking_utilization_rate": round(thinking_utilization_rate, 4),
        "command_adoption_rate": round(command_adoption_rate, 4),
        "avg_prompt_length": round(avg_prompt_length),
        "conversation_count": n,
    }


def compute_per_conversation_metrics(conversations: list[dict]) -> list[dict]:
    """Compute per-conversation agent metrics."""
    return [
        {
            "id": conv.get("id", ""),
            "tool_diversity_index": round(_conv_tool_diversity(conv), 4),
            "thinking_utilization_rate": round(_conv_thinking_rate(conv), 4),
            "avg_prompt_length": round(_conv_avg_prompt_length(conv)),
        }
        for conv in conversations
    ]


def compute_weekly_agent_metrics(conversations: list[dict]) -> list[dict]:
    """Compute weekly agent behavior metrics, sorted ascending by week."""
    if not conversations:
        return []

    week_groups: dict[str, list[dict]] = {}
    for conv in conversations:
        started_at = conv.get("started_at")
        if not started_at:
            continue
        week_info = _get_iso_week_key(started_at)
        if not week_info:
            continue
        week_key, _ = week_info
        week_groups.setdefault(week_key, []).append(conv)

    result = []
    for week_key, week_convs in week_groups.items():
        n = len(week_convs)
        diversity_sum = sum(_conv_tool_diversity(c) for c in week_convs)
        plan_count = sum(1 for c in week_convs if c.get("used_plan_mode"))
        cache_sum = sum(c.get("cache_hit_rate", 0) for c in week_convs)
        total_thinking = sum(c.get("thinking_count", 0) for c in week_convs)
        total_assistant = sum(c.get("assistant_message_count", 0) for c in week_convs)
        cmd_count = sum(1 for c in week_convs if c.get("commands_used"))

        result.append({
            "week": week_key,
            "tool_diversity_index": round(diversity_sum / n, 4),
            "plan_mode_adoption_rate": round(plan_count / n, 4),
            "avg_cache_hit_rate": round(cache_sum / n, 4),
            "thinking_utilization_rate": round(total_thinking / total_assistant, 4) if total_assistant > 0 else 0,
            "command_adoption_rate": round(cmd_count / n, 4),
            "conversation_count": n,
        })

    result.sort(key=lambda w: w["week"])
    return result
