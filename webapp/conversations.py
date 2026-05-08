"""CodeFluent — Conversation assembly from pooled session messages."""

from datetime import datetime
from pathlib import Path

from extract_prompts import parse_session_messages, _get_project_path_encoded, _UUID_PATTERN, scan_subagent_tokens
from config import get_config
from task_classification import classify_task
from anti_patterns import detect_structured_output_anti_pattern
from error_recovery import compute_conversation_error_recovery
from verification_behaviors import compute_conversation_verification

CLAUDE_DATA_DIR = Path.home() / ".claude" / "projects"


def compute_content_hash(
    project_path_encoded: str,
    prompt_timestamps: list[str],
    started_at: str | None,
    user_prompts: list[str],
    prompt_count: int,
) -> str:
    """Compute a stable fingerprint for a conversation, independent of index position."""
    ts = prompt_timestamps[0] if prompt_timestamps else (started_at or "unknown")
    prefix = user_prompts[0][:50] if user_prompts else ""
    return f"{project_path_encoded}:{ts}:{prompt_count}:{prefix}"


def build_conversations(
    messages: list[dict],
    project: str,
    project_path_encoded: str,
    gap_minutes: float,
) -> list[dict]:
    """Split pooled messages into conversations based on inactivity gaps.

    Messages are sorted by (timestamp, file_position). A new conversation
    starts when the gap between consecutive user messages exceeds gap_minutes.
    """
    if not messages:
        return []

    # Sort by (timestamp, file_position) — stable ordering
    sorted_msgs = sorted(
        messages,
        key=lambda m: (m.get("timestamp") or "", m.get("file_position", 0)),
    )

    gap_ms = gap_minutes * 60 * 1000

    def _ts_to_ms(ts: str) -> float:
        """Parse ISO timestamp to epoch milliseconds."""
        ts = ts.replace("Z", "+00:00")
        return datetime.fromisoformat(ts).timestamp() * 1000

    # Split into conversation buckets
    buckets: list[list[dict]] = [[]]
    last_user_ts: float | None = None

    for msg in sorted_msgs:
        if msg["type"] == "user":
            # /clear always forces a new conversation boundary
            if msg.get("is_clear_command"):
                buckets.append([])
                buckets[-1].append(msg)
                continue
            if msg.get("timestamp"):
                ts = _ts_to_ms(msg["timestamp"])
                if last_user_ts is not None and (ts - last_user_ts) > gap_ms:
                    buckets.append([])
                last_user_ts = ts
        buckets[-1].append(msg)

    # Build conversations from buckets
    conversations: list[dict] = []

    for bucket in buckets:
        user_prompts = []
        prompt_timestamps: list[str] = []
        user_msg_count = 0
        assistant_msg_count = 0
        tool_use_count = 0
        tools_used: set[str] = set()
        commands_used: set[str] = set()
        thinking_count = 0
        used_plan_mode = False
        model = None
        version = None
        git_branch = None
        session_ids: set[str] = set()
        timestamps: list[str] = []
        total_input_tokens = 0
        total_output_tokens = 0
        total_cache_creation_tokens = 0
        total_cache_read_tokens = 0

        for msg in bucket:
            if msg.get("session_id"):
                session_ids.add(msg["session_id"])
            if msg.get("timestamp"):
                timestamps.append(msg["timestamp"])

            if msg["type"] == "user":
                if msg.get("is_clear_command"):
                    continue
                user_msg_count += 1
                if msg.get("content"):
                    user_prompts.append(msg["content"])
                    if msg.get("timestamp"):
                        prompt_timestamps.append(msg["timestamp"])
                if msg.get("used_plan_mode"):
                    used_plan_mode = True
                if msg.get("command_name"):
                    commands_used.add(msg["command_name"])
            elif msg["type"] == "assistant":
                assistant_msg_count += 1
                if msg.get("model") and not model:
                    model = msg["model"]
                usage = msg.get("usage")
                if usage:
                    total_input_tokens += usage.get("input_tokens", 0)
                    total_output_tokens += usage.get("output_tokens", 0)
                    total_cache_creation_tokens += usage.get("cache_creation_input_tokens", 0)
                    total_cache_read_tokens += usage.get("cache_read_input_tokens", 0)
                if msg.get("tool_names"):
                    tool_use_count += len(msg["tool_names"])
                    tools_used.update(msg["tool_names"])
            elif msg["type"] == "tool_use":
                tool_use_count += 1
                if msg.get("tool_names"):
                    tools_used.update(msg["tool_names"])
            elif msg["type"] == "thinking":
                thinking_count += 1

            if not version and msg.get("claude_code_version"):
                version = msg["claude_code_version"]
            if not git_branch and msg.get("git_branch"):
                git_branch = msg["git_branch"]

        # Skip conversations with no user prompts
        if not user_prompts:
            continue

        timestamps.sort()
        total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
        prompt_count = len(user_prompts)
        tokens_per_prompt = total_tokens / prompt_count if prompt_count > 0 else 0
        cache_hit_denom = total_cache_read_tokens + total_input_tokens + total_cache_creation_tokens
        cache_hit_rate = total_cache_read_tokens / cache_hit_denom if cache_hit_denom > 0 else 0

        content_hash = compute_content_hash(
            project_path_encoded, sorted(prompt_timestamps), timestamps[0] if timestamps else None, user_prompts, prompt_count,
        )

        conversations.append({
            "id": "",  # filled below
            "content_hash": content_hash,
            "project": project,
            "project_path_encoded": project_path_encoded,
            "session_ids": sorted(session_ids),
            "started_at": timestamps[0] if timestamps else None,
            "ended_at": timestamps[-1] if timestamps else None,
            "user_prompts": user_prompts,
            "prompt_timestamps": sorted(prompt_timestamps),
            "prompt_count": prompt_count,
            "user_message_count": user_msg_count,
            "assistant_message_count": assistant_msg_count,
            "tool_use_count": tool_use_count,
            "tools_used": sorted(tools_used),
            "commands_used": sorted(commands_used),
            "thinking_count": thinking_count,
            "used_plan_mode": used_plan_mode,
            "model": model,
            "claude_code_version": version,
            "git_branch": git_branch,
            "heuristic_task_type": classify_task(git_branch, user_prompts),
            **{k: v for k, v in detect_structured_output_anti_pattern(user_prompts).items()
               if k != "structured_output_antipattern_indices"},
            **compute_conversation_error_recovery(bucket),
            **compute_conversation_verification(bucket),
            "total_input_tokens": total_input_tokens,
            "total_output_tokens": total_output_tokens,
            "total_cache_creation_tokens": total_cache_creation_tokens,
            "total_cache_read_tokens": total_cache_read_tokens,
            "total_tokens": total_tokens,
            "tokens_per_prompt": tokens_per_prompt,
            "cache_hit_rate": cache_hit_rate,
            "compact_count": 0,
            "compact_trigger_manual": 0,
            "compact_trigger_auto": 0,
            "turn_count": 0,
            "total_turn_duration_ms": 0,
            "avg_turn_duration_ms": None,
            "local_command_count": 0,
        })

    # Assign deterministic IDs
    pad_width = max(3, len(str(len(conversations))))
    for i, conv in enumerate(conversations):
        conv["id"] = f"{project_path_encoded}:conv:{str(i).zfill(pad_width)}"

    return conversations


def attribute_system_events(
    conversations: list[dict],
    system_events: list[dict],
) -> None:
    """Attribute timestamped system events to the conversation whose time range
    contains the event, or — if the event falls between conversations — to the
    nearest preceding conversation. Events with no preceding conversation are
    dropped. Mutates conversations in place.
    """
    if not conversations or not system_events:
        return

    sorted_convs = sorted(
        (c for c in conversations if c.get("started_at")),
        key=lambda c: c["started_at"],
    )

    for event in system_events:
        ts = event.get("timestamp")
        if not ts:
            continue
        target = None
        for conv in sorted_convs:
            if conv["started_at"] <= ts:
                target = conv
            else:
                break
        if target is None:
            continue

        subtype = event.get("subtype")
        if subtype == "compact_boundary":
            target["compact_count"] += 1
            if event.get("trigger") == "manual":
                target["compact_trigger_manual"] += 1
            else:
                target["compact_trigger_auto"] += 1
        elif subtype == "turn_duration":
            target["turn_count"] += 1
            target["total_turn_duration_ms"] += event.get("duration_ms") or 0
        elif subtype == "local_command":
            target["local_command_count"] += 1

    for conv in conversations:
        if conv["turn_count"] > 0:
            conv["avg_turn_duration_ms"] = conv["total_turn_duration_ms"] / conv["turn_count"]
        else:
            conv["avg_turn_duration_ms"] = None


def get_all_conversations(
    data_dir: Path = None,
    limit: int = None,
    project: str = None,
    max_files: int = None,
    gap_minutes: float = None,
) -> dict:
    """Parse all sessions and assemble into conversations."""
    if data_dir is None:
        data_dir = CLAUDE_DATA_DIR
    if gap_minutes is None:
        gap_minutes = get_config("conversation.inactivityGapMinutes")

    if not data_dir.exists():
        return {
            "conversations": [],
            "metadata": {
                "total_conversations": 0,
                "total_projects": 0,
                "total_prompts": 0,
                "extracted_at": datetime.now().isoformat(),
            },
        }

    # Collect all JSONL file paths
    file_paths: list[Path] = []
    for project_dir in sorted(data_dir.iterdir()):
        if not project_dir.is_dir():
            continue

        flat_files = sorted(project_dir.glob("*.jsonl"))
        seen_ids = {f.stem for f in flat_files}
        file_paths.extend(flat_files)

        for subdir in sorted(project_dir.iterdir()):
            if not subdir.is_dir() or subdir.name in seen_ids:
                continue
            file_paths.extend(sorted(subdir.glob("*.jsonl")))

    # When max_files is set, sort by mtime descending
    if max_files and max_files < len(file_paths):
        file_paths.sort(key=lambda fp: fp.stat().st_mtime, reverse=True)
        file_paths = file_paths[:max_files]

    # Parse all files into messages
    parsed = []
    for fp in file_paths:
        result = parse_session_messages(fp)
        if result:
            parsed.append(result)

    # Group messages by project_path_encoded
    by_project: dict[str, dict] = {}
    for result in parsed:
        key = result["project_path_encoded"]
        if key not in by_project:
            by_project[key] = {"project": result["project"], "encoded": key, "messages": [], "system_events": []}
        by_project[key]["messages"].extend(result["messages"])
        by_project[key]["system_events"].extend(result.get("system_events", []))

    # Build conversations per project, then attribute system events
    all_conversations = []
    for info in by_project.values():
        convs = build_conversations(info["messages"], info["project"], info["encoded"], gap_minutes)
        attribute_system_events(convs, info["system_events"])
        all_conversations.extend(convs)

    # Add subagent token usage to conversations.
    # Attribute to the FIRST conversation containing each session_id to avoid
    # double-counting when a session spans multiple conversations.
    claimed_sessions: set[str] = set()
    for project_dir in sorted(data_dir.iterdir()):
        if not project_dir.is_dir():
            continue
        subagent_map = scan_subagent_tokens(project_dir)
        if not subagent_map:
            continue
        for conv in all_conversations:
            for sid in conv.get("session_ids", []):
                if sid in claimed_sessions:
                    continue
                tokens = subagent_map.get(sid)
                if not tokens:
                    continue
                claimed_sessions.add(sid)
                conv["total_input_tokens"] += tokens["input_tokens"]
                conv["total_output_tokens"] += tokens["output_tokens"]
                conv["total_cache_creation_tokens"] += tokens["cache_creation_tokens"]
                conv["total_cache_read_tokens"] += tokens["cache_read_tokens"]
                conv["total_tokens"] += (
                    tokens["input_tokens"] + tokens["output_tokens"]
                    + tokens["cache_creation_tokens"] + tokens["cache_read_tokens"]
                )

    # Recompute derived fields after adding subagent tokens
    for conv in all_conversations:
        pc = conv.get("prompt_count", 0)
        conv["tokens_per_prompt"] = conv["total_tokens"] / pc if pc > 0 else 0
        denom = conv["total_cache_read_tokens"] + conv["total_input_tokens"] + conv["total_cache_creation_tokens"]
        conv["cache_hit_rate"] = conv["total_cache_read_tokens"] / denom if denom > 0 else 0

    # Sort by started_at descending
    all_conversations.sort(key=lambda c: c.get("started_at") or "", reverse=True)

    # Apply filters
    if project:
        all_conversations = [c for c in all_conversations if c["project"] == project]
    if limit:
        all_conversations = all_conversations[:limit]

    projects = set(c["project"] for c in all_conversations)
    total_prompts = sum(len(c["user_prompts"]) for c in all_conversations)

    return {
        "conversations": all_conversations,
        "metadata": {
            "total_conversations": len(all_conversations),
            "total_projects": len(projects),
            "total_prompts": total_prompts,
            "extracted_at": datetime.now().isoformat(),
        },
    }
