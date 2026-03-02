#!/usr/bin/env python3
"""CodeFluent — Extract user prompts from Claude Code JSONL sessions."""

import json
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

    if not user_prompts:
        return None

    if not session_id:
        session_id = filepath.stem

    project_name = project_cwd.rstrip("/").split("/")[-1] if project_cwd else filepath.parent.name
    timestamps.sort()

    return {
        "id": session_id,
        "project": project_name,
        "project_path_encoded": filepath.parent.name,
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
    }


def main():
    parser = argparse.ArgumentParser(description="Extract user prompts from Claude Code sessions")
    parser.add_argument("--path", type=str, help="Custom Claude data directory")
    parser.add_argument("--output", type=str, default="data/prompts", help="Output directory")
    parser.add_argument("--limit", type=int, help="Limit number of sessions to process")
    args = parser.parse_args()

    data_dir = Path(args.path) if args.path else CLAUDE_DATA_DIR

    if not data_dir.exists():
        print(f"Claude data directory not found: {data_dir}")
        return

    print(f"Reading from: {data_dir}")

    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)

    sessions = []
    for project_dir in sorted(data_dir.iterdir()):
        if not project_dir.is_dir():
            continue
        for jsonl_file in sorted(project_dir.glob("*.jsonl")):
            session = parse_session_file(jsonl_file)
            if session:
                sessions.append(session)

    sessions.sort(key=lambda s: s.get("started_at") or "", reverse=True)

    if args.limit:
        sessions = sessions[:args.limit]

    projects = set(s["project"] for s in sessions)
    total_prompts = sum(len(s["user_prompts"]) for s in sessions)

    print(f"Extracted {total_prompts} prompts from {len(sessions)} sessions across {len(projects)} projects")

    output = {
        "sessions": sessions,
        "metadata": {
            "total_sessions": len(sessions),
            "total_projects": len(projects),
            "total_prompts": total_prompts,
            "extracted_at": datetime.now().isoformat(),
        }
    }

    output_path = output_dir / "sessions.json"
    with open(output_path, "w") as f:
        json.dump(output, f, indent=2, default=str)

    print(f"Written to {output_path}")


if __name__ == "__main__":
    main()
