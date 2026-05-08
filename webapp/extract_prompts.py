#!/usr/bin/env python3
"""CodeFluent — Extract user prompts from Claude Code JSONL sessions."""

import json
import re
from pathlib import Path
from datetime import datetime
import argparse


CLAUDE_DATA_DIR = Path.home() / ".claude" / "projects"

USER_TYPES = {"user"}
SIGNAL_TYPES = {"tool_use", "thinking"}
SKIP_TYPES = {
    "file-history-snapshot", "tool_result", "progress",
    "hook_progress", "bash_progress", "system", "create",
}


_UUID_PATTERN = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')


def _get_project_path_encoded(filepath: Path) -> str:
    """Get project path encoded, handling nested UUID subdirectory format."""
    dir_name = filepath.parent.name
    if _UUID_PATTERN.match(dir_name):
        return filepath.parent.parent.name
    return dir_name


def extract_user_text(message_content) -> str:
    """Extract text from message.content, handling both string and array formats."""
    if isinstance(message_content, str):
        return message_content.strip()
    if isinstance(message_content, list):
        parts = []
        for block in message_content:
            if isinstance(block, dict) and block.get("type") == "text":
                text = block.get("text", "").strip()
                if text:
                    parts.append(text)
        return " ".join(parts)
    return ""


_SLASH_COMMAND_RE = re.compile(r'<command-name>/')
_CLEAR_COMMAND_RE = re.compile(r'<command-name>/clear</command-name>')


def is_slash_command(text: str) -> bool:
    """Check if the extracted user text is any slash command."""
    return bool(_SLASH_COMMAND_RE.search(text))


def is_clear_command(text: str) -> bool:
    """Check if the extracted user text is a /clear command."""
    return bool(_CLEAR_COMMAND_RE.search(text))


_COMMAND_NAME_RE = re.compile(r'<command-name>(/[^<]+)</command-name>')

SYSTEM_COMMANDS = frozenset([
    '/clear', '/compact', '/exit', '/login', '/logout',
    '/status', '/init', '/help', '/cost', '/doctor',
    '/config', '/memory', '/permissions', '/review',
    '/terminal-setup', '/listen', '/mcp', '/vim',
])


def extract_command_name(text: str) -> str | None:
    """Extract the command name from a <command-name> tag."""
    match = _COMMAND_NAME_RE.search(text)
    return match.group(1) if match else None


def is_custom_command(text: str) -> bool:
    """Check if the text contains a custom command (not a system command)."""
    name = extract_command_name(text)
    if not name:
        return False
    return name not in SYSTEM_COMMANDS


_SYSTEM_INJECTED_TAGS = re.compile(
    r'<(?:task-notification|system-reminder|local-command-caveat'
    r'|local-command-stdout|local-command-stderr|user-prompt-submit-hook)[\s>]'
)

_SESSION_CONTINUATION_PREFIX = "This session is being continued from a previous conversation"


def is_system_injected_message(text: str) -> bool:
    """Detect system-injected messages that arrive as type 'user' but are not human input."""
    if _SYSTEM_INJECTED_TAGS.search(text):
        return True
    if text.startswith(_SESSION_CONTINUATION_PREFIX):
        return True
    return False


def parse_session_messages(filepath: Path) -> dict | None:
    """Parse a single JSONL session file and extract individual timestamped messages.

    Returns a dict with messages, session_id, project, project_path_encoded,
    or None if the file is empty, unreadable, or a sidechain session.
    """
    lines = []
    try:
        with open(filepath, "r", errors="replace") as f:
            for line in f:
                line = line.strip()
                if not line:
                    continue
                try:
                    lines.append(json.loads(line))
                except json.JSONDecodeError:
                    continue
    except OSError:
        return None

    if not lines:
        return None

    session_id = None
    project_cwd = None
    version = None
    git_branch = None
    is_sidechain = False

    messages = []
    system_events: list[dict] = []

    # Deduplication: buffer assistant messages by message.id, emit when ID changes.
    seen_assistant_ids: dict[str, dict] = {}
    pending_assistant_id: str | None = None

    def flush_pending_assistant():
        nonlocal pending_assistant_id
        if pending_assistant_id:
            pending = seen_assistant_ids.get(pending_assistant_id)
            if pending:
                messages.append(pending)
            pending_assistant_id = None

    for i, msg in enumerate(lines):
        msg_type = msg.get("type", "")

        # Extract `system` subtypes for context/efficiency metrics. Must run
        # before SKIP_TYPES gate and before metadata defaults so a system row
        # can't overwrite the canonical sessionId/version/etc. (See #160.)
        if msg_type == "system":
            if msg.get("isSidechain") is True:
                is_sidechain = True
            subtype = msg.get("subtype")
            if subtype == "compact_boundary":
                raw_trigger = (msg.get("compactMetadata") or {}).get("trigger")
                system_events.append({
                    "subtype": "compact_boundary",
                    "timestamp": msg.get("timestamp"),
                    "trigger": raw_trigger if isinstance(raw_trigger, str) else None,
                })
            elif subtype == "turn_duration":
                duration = msg.get("durationMs")
                system_events.append({
                    "subtype": "turn_duration",
                    "timestamp": msg.get("timestamp"),
                    "duration_ms": duration if isinstance(duration, (int, float)) else 0,
                })
            elif subtype == "local_command":
                # Pair-emitted with stdout/stderr companion entries; only count invocations.
                content = msg.get("content")
                if isinstance(content, str) and "<command-name>" in content:
                    system_events.append({
                        "subtype": "local_command",
                        "timestamp": msg.get("timestamp"),
                    })
            continue

        if msg_type in SKIP_TYPES:
            continue

        if not session_id and msg.get("sessionId"):
            session_id = msg["sessionId"]
        if not project_cwd and msg.get("cwd"):
            project_cwd = msg["cwd"]
        if not version and msg.get("version"):
            version = msg["version"]
        if not git_branch and msg.get("gitBranch"):
            git_branch = msg["gitBranch"]
        if msg.get("isSidechain") is True:
            is_sidechain = True

        if msg_type == "user":
            flush_pending_assistant()
            content = msg.get("message", {}).get("content", "")
            text = extract_user_text(content)
            is_interrupted = text == "[Request interrupted by user for tool use]"
            is_command = is_slash_command(text)
            is_system = not is_command and is_system_injected_message(text)
            is_clear = is_command and is_clear_command(text)
            cmd_name = extract_command_name(text) if is_command else None
            is_custom = cmd_name is not None and cmd_name not in SYSTEM_COMMANDS
            extracted = {
                "type": "user",
                "timestamp": msg.get("timestamp"),
                "session_id": "",  # filled after loop
                "file_position": i,
                "content": None if (not text or is_interrupted or is_command or is_system) else text[:2000],
                "used_plan_mode": bool(msg.get("planContent")),
            }
            if is_clear:
                extracted["is_clear_command"] = True
            if is_custom:
                extracted["command_name"] = cmd_name
            messages.append(extracted)


            # Extract tool_result blocks embedded in user message content
            raw_content = msg.get("message", {}).get("content", "")
            if isinstance(raw_content, list):
                for block in raw_content:
                    if isinstance(block, dict) and block.get("type") == "tool_result":
                        is_error = block.get("is_error") is True
                        error_content = None
                        if is_error:
                            block_content = block.get("content", "")
                            if isinstance(block_content, str):
                                error_content = block_content[:500]
                            elif isinstance(block_content, list):
                                for sub in block_content:
                                    if isinstance(sub, dict) and sub.get("type") == "text":
                                        error_content = (sub.get("text") or "")[:500]
                                        break
                        messages.append({
                            "type": "tool_result",
                            "timestamp": msg.get("timestamp"),
                            "session_id": "",
                            "file_position": i,
                            "is_error": is_error or None,
                            "tool_use_id": block.get("tool_use_id"),
                            "error_content": error_content,
                        })

        elif msg_type == "assistant":
            tool_names = []
            tool_use_ids = []
            bash_commands = []
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        if block.get("name"):
                            tool_names.append(block["name"])
                            cmd = ""
                            if block["name"] == "Bash":
                                cmd = str(block.get("input", {}).get("command") or "")[:200]
                            bash_commands.append(cmd)
                        if block.get("id"):
                            tool_use_ids.append(block["id"])
            usage = msg.get("message", {}).get("usage", {})
            extracted = {
                "type": "assistant",
                "timestamp": msg.get("timestamp"),
                "session_id": "",
                "file_position": i,
                "model": msg.get("message", {}).get("model"),
                "tool_names": tool_names if tool_names else None,
                "tool_use_ids": tool_use_ids if tool_use_ids else None,
                "bash_commands": bash_commands if any(bash_commands) else None,
            }
            message_id = msg.get("message", {}).get("id")
            if usage and message_id:
                extracted["usage"] = {
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                    "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
                }
                existing = seen_assistant_ids.get(message_id)
                if existing:
                    # Duplicate — keep highest output_tokens, merge tool_names
                    if extracted["usage"]["output_tokens"] > (existing.get("usage", {}).get("output_tokens", 0)):
                        existing["usage"] = extracted["usage"]
                    if extracted.get("tool_names"):
                        prev = existing.get("tool_names") or []
                        existing["tool_names"] = prev + extracted["tool_names"]
                    if extracted.get("tool_use_ids"):
                        prev = existing.get("tool_use_ids") or []
                        existing["tool_use_ids"] = prev + extracted["tool_use_ids"]
                    if extracted.get("bash_commands"):
                        prev = existing.get("bash_commands") or []
                        existing["bash_commands"] = prev + extracted["bash_commands"]
                    existing["timestamp"] = extracted["timestamp"]
                    existing["file_position"] = extracted["file_position"]
                    if extracted.get("model"):
                        existing["model"] = extracted["model"]
                else:
                    if pending_assistant_id and pending_assistant_id != message_id:
                        flush_pending_assistant()
                    seen_assistant_ids[message_id] = extracted
                    pending_assistant_id = message_id
            elif usage:
                flush_pending_assistant()
                extracted["usage"] = {
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
                    "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
                }
                messages.append(extracted)
            else:
                flush_pending_assistant()
                messages.append(extracted)

        elif msg_type == "tool_use":
            flush_pending_assistant()
            name = msg.get("name") or msg.get("message", {}).get("name")
            bash_command = ""
            if not name:
                content = msg.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            name = block.get("name")
                            if name == "Bash":
                                bash_command = str(block.get("input", {}).get("command") or "")[:200]
                            break
            elif name == "Bash":
                cmd = msg.get("input", {}).get("command") or msg.get("message", {}).get("input", {}).get("command")
                bash_command = str(cmd or "")[:200]
            messages.append({
                "type": "tool_use",
                "timestamp": msg.get("timestamp"),
                "session_id": "",
                "file_position": i,
                "tool_names": [name] if name else None,
                "bash_commands": [bash_command] if name and bash_command else None,
            })

        elif msg_type == "thinking":
            flush_pending_assistant()
            messages.append({
                "type": "thinking",
                "timestamp": msg.get("timestamp"),
                "session_id": "",
                "file_position": i,
            })

    flush_pending_assistant()

    if is_sidechain:
        return None

    if not session_id:
        session_id = filepath.stem

    project_name = project_cwd.rstrip("/").split("/")[-1] if project_cwd else filepath.parent.name

    # Backfill session_id and metadata
    for m in messages:
        m["session_id"] = session_id
        if version:
            m.setdefault("claude_code_version", version)
        if git_branch:
            m.setdefault("git_branch", git_branch)

    return {
        "messages": messages,
        "system_events": system_events,
        "session_id": session_id,
        "project": project_name,
        "project_path_encoded": _get_project_path_encoded(filepath),
    }


def parse_session_file(filepath: Path) -> dict | None:
    """Parse a single JSONL session file and extract prompt data."""
    lines = []
    with open(filepath, "r", errors="replace") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                lines.append(json.loads(line))
            except json.JSONDecodeError:
                continue

    if not lines:
        return None

    session_id = None
    project_cwd = None
    user_prompts = []
    timestamps = []
    tool_use_count = 0
    tools_used = set()
    commands_used = set()
    thinking_count = 0
    user_msg_count = 0
    assistant_msg_count = 0
    used_plan_mode = False
    model = None
    version = None
    git_branch = None
    is_sidechain = False
    total_input_tokens = 0
    total_output_tokens = 0
    total_cache_creation_tokens = 0
    total_cache_read_tokens = 0

    # Deduplication: Claude Code emits multiple assistant messages per API call
    # (streaming snapshots). Per Anthropic docs, deduplicate by message.id and
    # keep the highest output_tokens.
    seen_message_ids: dict[str, dict] = {}
    _no_id_counter = 0

    for msg in lines:
        msg_type = msg.get("type", "")

        if msg_type in SKIP_TYPES:
            continue

        if not session_id and msg.get("sessionId"):
            session_id = msg["sessionId"]
        if not project_cwd and msg.get("cwd"):
            project_cwd = msg["cwd"]
        if not version and msg.get("version"):
            version = msg["version"]
        if not git_branch and msg.get("gitBranch"):
            git_branch = msg["gitBranch"]
        if msg.get("isSidechain") is True:
            is_sidechain = True

        timestamp = msg.get("timestamp")
        if timestamp:
            timestamps.append(timestamp)

        if msg_type == "user":
            content = msg.get("message", {}).get("content", "")
            text = extract_user_text(content)
            if is_slash_command(text):
                cmd_name = extract_command_name(text)
                if cmd_name and cmd_name not in SYSTEM_COMMANDS:
                    commands_used.add(cmd_name)
                continue  # skip all slash commands (not natural language prompts)
            if is_system_injected_message(text):
                continue  # skip system-injected messages
            user_msg_count += 1
            if text and text != "[Request interrupted by user for tool use]":
                user_prompts.append(text[:2000])
            if msg.get("planContent"):
                used_plan_mode = True

        elif msg_type == "assistant":
            msg_model = msg.get("message", {}).get("model")
            if msg_model and not model:
                model = msg_model
            usage = msg.get("message", {}).get("usage", {})
            message_id = msg.get("message", {}).get("id")
            if usage and message_id:
                existing = seen_message_ids.get(message_id)
                if existing:
                    if (usage.get("output_tokens", 0)) > existing["output"]:
                        existing["output"] = usage.get("output_tokens", 0)
                else:
                    assistant_msg_count += 1
                    seen_message_ids[message_id] = {
                        "input": usage.get("input_tokens", 0),
                        "output": usage.get("output_tokens", 0),
                        "cache_create": usage.get("cache_creation_input_tokens", 0),
                        "cache_read": usage.get("cache_read_input_tokens", 0),
                    }
            elif usage:
                _no_id_counter += 1
                assistant_msg_count += 1
                seen_message_ids[f"_no_id_{_no_id_counter}"] = {
                    "input": usage.get("input_tokens", 0),
                    "output": usage.get("output_tokens", 0),
                    "cache_create": usage.get("cache_creation_input_tokens", 0),
                    "cache_read": usage.get("cache_read_input_tokens", 0),
                }
            else:
                assistant_msg_count += 1
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tool_use_count += 1
                        if block.get("name"):
                            tools_used.add(block["name"])

        elif msg_type == "tool_use":
            tool_use_count += 1
            name = msg.get("name") or msg.get("message", {}).get("name")
            if not name:
                content = msg.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            name = block.get("name")
                            break
            if name:
                tools_used.add(name)

        elif msg_type == "thinking":
            thinking_count += 1

    # Sum deduplicated usage
    for u in seen_message_ids.values():
        total_input_tokens += u["input"]
        total_output_tokens += u["output"]
        total_cache_creation_tokens += u["cache_create"]
        total_cache_read_tokens += u["cache_read"]

    if is_sidechain:
        return None
    if not user_prompts:
        return None

    if not session_id:
        session_id = filepath.stem

    project_name = project_cwd.rstrip("/").split("/")[-1] if project_cwd else filepath.parent.name
    timestamps.sort()

    total_tokens = total_input_tokens + total_output_tokens + total_cache_creation_tokens + total_cache_read_tokens
    tokens_per_prompt = total_tokens / user_msg_count if user_msg_count > 0 else 0
    cache_hit_denom = total_cache_read_tokens + total_input_tokens + total_cache_creation_tokens
    cache_hit_rate = total_cache_read_tokens / cache_hit_denom if cache_hit_denom > 0 else 0

    return {
        "id": session_id,
        "project": project_name,
        "project_path_encoded": _get_project_path_encoded(filepath),
        "started_at": timestamps[0] if timestamps else None,
        "ended_at": timestamps[-1] if timestamps else None,
        "user_prompts": user_prompts,
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
        "total_input_tokens": total_input_tokens,
        "total_output_tokens": total_output_tokens,
        "total_cache_creation_tokens": total_cache_creation_tokens,
        "total_cache_read_tokens": total_cache_read_tokens,
        "total_tokens": total_tokens,
        "tokens_per_prompt": tokens_per_prompt,
        "cache_hit_rate": cache_hit_rate,
    }


def get_all_sessions(data_dir: Path = None, limit: int = None, project: str = None, max_files: int = None) -> dict:
    """Parse all sessions from JSONL files. Used by both CLI and API."""
    if data_dir is None:
        data_dir = CLAUDE_DATA_DIR

    if not data_dir.exists():
        return {
            "sessions": [],
            "metadata": {
                "total_sessions": 0,
                "total_projects": 0,
                "total_prompts": 0,
                "extracted_at": datetime.now().isoformat(),
            },
        }

    # Collect all JSONL file paths first
    file_paths: list[Path] = []
    for project_dir in sorted(data_dir.iterdir()):
        if not project_dir.is_dir():
            continue

        # Parse flat .jsonl files
        flat_files = sorted(project_dir.glob("*.jsonl"))
        seen_ids = {f.stem for f in flat_files}
        file_paths.extend(flat_files)

        # Also check UUID subdirectories for main session files (future-proofing)
        for subdir in sorted(project_dir.iterdir()):
            if not subdir.is_dir() or subdir.name in seen_ids:
                continue
            file_paths.extend(sorted(subdir.glob("*.jsonl")))

    # When max_files is set, sort by mtime descending and take only the newest files
    if max_files and max_files < len(file_paths):
        file_paths.sort(key=lambda fp: fp.stat().st_mtime, reverse=True)
        file_paths = file_paths[:max_files]

    sessions = []
    for jsonl_file in file_paths:
        session = parse_session_file(jsonl_file)
        if session:
            sessions.append(session)

    sessions.sort(key=lambda s: s.get("started_at") or "", reverse=True)

    if project:
        sessions = [s for s in sessions if s["project"] == project]
    if limit:
        sessions = sessions[:limit]

    projects = set(s["project"] for s in sessions)
    total_prompts = sum(len(s["user_prompts"]) for s in sessions)

    return {
        "sessions": sessions,
        "metadata": {
            "total_sessions": len(sessions),
            "total_projects": len(projects),
            "total_prompts": total_prompts,
            "extracted_at": datetime.now().isoformat(),
        },
    }


def main():
    parser = argparse.ArgumentParser(description="Extract user prompts from Claude Code sessions")
    parser.add_argument("--path", type=str, help="Custom Claude data directory")
    parser.add_argument("--output", type=str, default="data/prompts", help="Output directory")
    parser.add_argument("--limit", type=int, help="Limit number of sessions to process")
    args = parser.parse_args()

    data_dir = Path(args.path) if args.path else None
    result = get_all_sessions(data_dir, args.limit)

    if not result["sessions"] and data_dir:
        print(f"Claude data directory not found or empty: {data_dir}")
        return

    print(f"Reading from: {data_dir or CLAUDE_DATA_DIR}")
    print(f"Extracted {result['metadata']['total_prompts']} prompts from {result['metadata']['total_sessions']} sessions across {result['metadata']['total_projects']} projects")

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    output_path = output_dir / "sessions.json"
    with open(output_path, "w") as f:
        json.dump(result, f, indent=2, default=str)

    print(f"Written to {output_path}")


def scan_subagent_tokens(project_dir: Path) -> dict[str, dict]:
    """Scan subagent JSONL files under a project directory for token usage.

    Returns a dict of parent sessionId -> {input_tokens, output_tokens,
    cache_creation_tokens, cache_read_tokens}.

    Subagent files live at <project>/<session-uuid>/subagents/agent-<id>.jsonl
    and their sessionId matches the parent UUID directory name.
    Token deduplication (streaming chunks) is applied.
    """
    result: dict[str, dict] = {}

    try:
        entries = list(project_dir.iterdir())
    except OSError:
        return result

    for entry in entries:
        if not entry.is_dir() or not _UUID_PATTERN.match(entry.name):
            continue
        subagents_dir = entry / "subagents"
        if not subagents_dir.is_dir():
            continue

        for sf in subagents_dir.iterdir():
            if not sf.name.endswith(".jsonl"):
                continue

            session_id = None
            msg_id_usage: dict[str, dict] = {}
            no_id_counter = 0

            try:
                with open(sf, "r", errors="replace") as fh:
                    for line in fh:
                        line = line.strip()
                        if not line:
                            continue
                        try:
                            msg = json.loads(line)
                        except json.JSONDecodeError:
                            continue

                        if not session_id and msg.get("sessionId"):
                            session_id = msg["sessionId"]

                        if msg.get("type") == "assistant":
                            usage = msg.get("message", {}).get("usage", {})
                            message_id = msg.get("message", {}).get("id")
                            if usage:
                                key = message_id or f"_no_id_{no_id_counter}"
                                if not message_id:
                                    no_id_counter += 1
                                existing = msg_id_usage.get(key)
                                if existing:
                                    if (usage.get("output_tokens", 0)) > existing["output"]:
                                        existing["output"] = usage.get("output_tokens", 0)
                                else:
                                    msg_id_usage[key] = {
                                        "input": usage.get("input_tokens", 0),
                                        "output": usage.get("output_tokens", 0),
                                        "cache_create": usage.get("cache_creation_input_tokens", 0),
                                        "cache_read": usage.get("cache_read_input_tokens", 0),
                                    }

            except OSError:
                continue

            total_input = sum(u["input"] for u in msg_id_usage.values())
            total_output = sum(u["output"] for u in msg_id_usage.values())
            total_cache_create = sum(u["cache_create"] for u in msg_id_usage.values())
            total_cache_read = sum(u["cache_read"] for u in msg_id_usage.values())

            if not session_id:
                session_id = entry.name
            total = total_input + total_output + total_cache_create + total_cache_read
            if total == 0:
                continue

            if session_id in result:
                result[session_id]["input_tokens"] += total_input
                result[session_id]["output_tokens"] += total_output
                result[session_id]["cache_creation_tokens"] += total_cache_create
                result[session_id]["cache_read_tokens"] += total_cache_read
            else:
                result[session_id] = {
                    "input_tokens": total_input,
                    "output_tokens": total_output,
                    "cache_creation_tokens": total_cache_create,
                    "cache_read_tokens": total_cache_read,
                }

    return result


if __name__ == "__main__":
    main()
