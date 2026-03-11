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
            user_msg_count += 1
            content = msg.get("message", {}).get("content", "")
            text = extract_user_text(content)
            if text and text != "[Request interrupted by user for tool use]":
                user_prompts.append(text[:2000])
            if msg.get("planContent"):
                used_plan_mode = True

        elif msg_type == "assistant":
            assistant_msg_count += 1
            msg_model = msg.get("message", {}).get("model")
            if msg_model and not model:
                model = msg_model
            usage = msg.get("message", {}).get("usage", {})
            if usage:
                total_input_tokens += usage.get("input_tokens", 0)
                total_output_tokens += usage.get("output_tokens", 0)
                total_cache_creation_tokens += usage.get("cache_creation_input_tokens", 0)
                total_cache_read_tokens += usage.get("cache_read_input_tokens", 0)
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


def get_all_sessions(data_dir: Path = None, limit: int = None, project: str = None) -> dict:
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

    sessions = []
    for project_dir in sorted(data_dir.iterdir()):
        if not project_dir.is_dir():
            continue

        # Parse flat .jsonl files
        flat_files = sorted(project_dir.glob("*.jsonl"))
        seen_ids = {f.stem for f in flat_files}
        for jsonl_file in flat_files:
            session = parse_session_file(jsonl_file)
            if session:
                sessions.append(session)

        # Also check UUID subdirectories for main session files (future-proofing)
        for subdir in sorted(project_dir.iterdir()):
            if not subdir.is_dir() or subdir.name in seen_ids:
                continue
            for jsonl_file in sorted(subdir.glob("*.jsonl")):
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


if __name__ == "__main__":
    main()
