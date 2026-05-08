"""Configuration scanner for .claude/ directory maturity assessment.

Scans the local filesystem for Claude Code configuration artifacts
(hooks, rules, commands, skills, MCP servers, CLAUDE.md, permissions)
and reports what is configured.
"""

import json
import os
import re
from pathlib import Path


def parse_frontmatter(content: str) -> dict[str, str] | None:
    """Parse simple YAML-like frontmatter from a markdown file.

    Checks if content starts with ``---\\n``, finds the closing ``---\\n``,
    and extracts simple ``key: value`` pairs. Returns None if no
    frontmatter is found.

    Limitation: array values stay as their raw bracketed string —
    ``tools: [Read, Grep]`` becomes ``"[Read, Grep]"``, not
    ``["Read", "Grep"]``. Sufficient for presence checks; callers needing
    parsed lists must split on their own.
    """
    normalized = content.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        return None

    closing_index = normalized.find("\n---\n", 4)
    if closing_index == -1:
        # Check if content ends with \n--- or \n---\n
        if normalized.endswith("\n---") or normalized.endswith("\n---\n"):
            end_idx = normalized.rfind("\n---")
            if end_idx <= 3:
                return None
            block = normalized[4:end_idx]
            return _parse_frontmatter_block(block)
        return None

    block = normalized[4:closing_index]
    return _parse_frontmatter_block(block)


def _parse_frontmatter_block(block: str) -> dict[str, str]:
    """Parse key: value pairs from a frontmatter block."""
    result: dict[str, str] = {}
    for line in block.split("\n"):
        trimmed = line.strip()
        if not trimmed or trimmed.startswith("#"):
            continue
        colon_idx = trimmed.find(":")
        if colon_idx == -1:
            continue
        key = trimmed[:colon_idx].strip()
        value = trimmed[colon_idx + 1:].strip()
        if key:
            result[key] = value
    return result


def _read_json_safe(file_path: Path) -> dict | None:
    """Read and parse a JSON file, returning None on any error."""
    try:
        return json.loads(file_path.read_text(encoding="utf-8"))
    except Exception:
        return None


def _listdir_safe(dir_path: Path) -> list[str]:
    """List directory contents, returning empty list on any error."""
    try:
        return os.listdir(dir_path)
    except Exception:
        return []


def _read_file_safe(file_path: Path) -> str | None:
    """Read file contents, returning None on any error."""
    try:
        return file_path.read_text(encoding="utf-8")
    except Exception:
        return None


def _scan_hooks(project_root: Path | None, home_dir: Path) -> dict:
    """Scan for hook configurations in settings.json files."""
    result = {"configured": False, "count": 0, "events": [], "handlerTypes": [], "matchers": [], "hookCommands": []}

    settings_paths = [home_dir / ".claude" / "settings.json"]
    if project_root:
        settings_paths.append(project_root / ".claude" / "settings.json")

    all_events: set[str] = set()
    all_handler_types: set[str] = set()
    all_matchers: set[str] = set()
    all_hook_commands: list[str] = []
    total_count = 0

    for settings_path in settings_paths:
        data = _read_json_safe(settings_path)
        if not data or "hooks" not in data:
            continue

        hooks = data["hooks"]
        if not isinstance(hooks, dict):
            continue

        for event, entries in hooks.items():
            if not isinstance(entries, list):
                continue
            all_events.add(event)
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                matcher = entry.get("matcher")
                if matcher:
                    all_matchers.add(matcher)
                hook_list = entry.get("hooks", [])
                if not isinstance(hook_list, list):
                    continue
                for hook in hook_list:
                    if not isinstance(hook, dict):
                        continue
                    total_count += 1
                    hook_type = hook.get("type")
                    if hook_type:
                        all_handler_types.add(hook_type)
                    cmd_text = hook.get("command") or hook.get("prompt") or ""
                    if cmd_text:
                        all_hook_commands.append(cmd_text)

    result["configured"] = total_count > 0
    result["count"] = total_count
    result["events"] = sorted(all_events)
    result["handlerTypes"] = sorted(all_handler_types)
    result["matchers"] = sorted(all_matchers)
    result["hookCommands"] = all_hook_commands
    return result


def _scan_rules(project_root: Path | None) -> dict:
    """Scan for rule files in .claude/rules/."""
    result = {"count": 0, "hasPathScoping": False}
    if not project_root:
        return result

    rules_dir = project_root / ".claude" / "rules"
    files = [f for f in _listdir_safe(rules_dir) if f.endswith(".md")]
    result["count"] = len(files)

    for file_name in files:
        content = _read_file_safe(rules_dir / file_name)
        if not content:
            continue
        fm = parse_frontmatter(content)
        if fm and "globs" in fm:
            result["hasPathScoping"] = True
            break

    return result


def _scan_commands(project_root: Path | None) -> dict:
    """Scan for command files in .claude/commands/."""
    if not project_root:
        return {"count": 0}
    commands_dir = project_root / ".claude" / "commands"
    files = [f for f in _listdir_safe(commands_dir) if f.endswith(".md")]
    return {"count": len(files)}


def _scan_skills(project_root: Path | None) -> dict:
    """Scan for skill subdirectories in .claude/skills/."""
    result = {"count": 0, "hasFrontmatter": False}
    if not project_root:
        return result

    skills_dir = project_root / ".claude" / "skills"
    entries = _listdir_safe(skills_dir)

    skill_count = 0
    for entry in entries:
        entry_path = skills_dir / entry
        try:
            if not entry_path.is_dir():
                continue
        except Exception:
            continue
        skill_count += 1

        # Check files within the skill subdirectory for frontmatter
        if not result["hasFrontmatter"]:
            sub_files = _listdir_safe(entry_path)
            for sub_file in sub_files:
                content = _read_file_safe(entry_path / sub_file)
                if content and parse_frontmatter(content):
                    result["hasFrontmatter"] = True
                    break

    result["count"] = skill_count
    return result


def _scan_mcp(project_root: Path | None, home_dir: Path) -> dict:
    """Scan for MCP server configurations."""
    result = {"configured": False, "serverCount": 0}
    server_names: set[str] = set()

    # Project-level .mcp.json
    if project_root:
        project_mcp = _read_json_safe(project_root / ".mcp.json")
        if project_mcp and isinstance(project_mcp.get("mcpServers"), dict):
            for name in project_mcp["mcpServers"]:
                server_names.add(name)

    # User-level ~/.claude.json (top-level mcpServers)
    user_mcp = _read_json_safe(home_dir / ".claude.json")
    if user_mcp and isinstance(user_mcp.get("mcpServers"), dict):
        for name in user_mcp["mcpServers"]:
            server_names.add(name)

    # Project-level mcpServers in ~/.claude.json (projects.<path>.mcpServers)
    if project_root and user_mcp and isinstance(user_mcp.get("projects"), dict):
        project_entry = user_mcp["projects"].get(str(project_root))
        if project_entry and isinstance(project_entry.get("mcpServers"), dict):
            for name in project_entry["mcpServers"]:
                server_names.add(name)

    result["serverCount"] = len(server_names)
    result["configured"] = len(server_names) > 0
    return result


def _scan_claude_md(project_root: Path | None, home_dir: Path) -> dict:
    """Scan for CLAUDE.md files at various locations in the hierarchy."""
    result = {"present": False, "locations": [], "hasImports": False}

    candidates: list[tuple[str, Path]] = []
    if project_root:
        candidates.append(("project root", project_root / "CLAUDE.md"))
        candidates.append((".claude/", project_root / ".claude" / "CLAUDE.md"))
    candidates.append(("~/.claude/", home_dir / ".claude" / "CLAUDE.md"))

    for label, file_path in candidates:
        content = _read_file_safe(file_path)
        if content is not None:
            result["locations"].append(label)
            if re.search(r"^@import\b", content, re.MULTILINE):
                result["hasImports"] = True

    result["present"] = len(result["locations"]) > 0
    return result


def _scan_agents_dir(dir_path: Path) -> list[dict]:
    """Scan a single agents directory for *.md files with frontmatter."""
    definitions: list[dict] = []
    files = [f for f in _listdir_safe(dir_path) if f.endswith(".md")]
    for file_name in files:
        content = _read_file_safe(dir_path / file_name)
        if not content:
            continue
        fm = parse_frontmatter(content)
        if not fm:
            continue
        name = fm.get("name") or file_name[:-3]
        model = fm.get("model") or None
        has_tool_restrictions = bool(fm.get("tools")) or bool(fm.get("disallowedTools"))
        entry: dict = {"name": name, "hasToolRestrictions": has_tool_restrictions}
        if model:
            entry["model"] = model
        definitions.append(entry)
    return definitions


def _scan_agents(project_root: Path | None, home_dir: Path) -> dict:
    """Scan for custom subagent definitions in .claude/agents/ directories."""
    project_defs = (
        _scan_agents_dir(project_root / ".claude" / "agents") if project_root else []
    )
    user_defs = _scan_agents_dir(home_dir / ".claude" / "agents")
    definitions = project_defs + user_defs
    return {
        "count": len(definitions),
        "projectCount": len(project_defs),
        "userCount": len(user_defs),
        "hasToolRestrictions": any(d["hasToolRestrictions"] for d in definitions),
        "hasModelRouting": any("model" in d for d in definitions),
        "definitions": definitions,
    }


def _scan_permissions(project_root: Path | None) -> dict:
    """Scan for permission settings in settings.local.json."""
    if not project_root:
        return {"configured": False}
    data = _read_json_safe(project_root / ".claude" / "settings.local.json")
    return {"configured": bool(data and "permissions" in data)}


def scan_configuration_maturity(
    project_root: str | None,
    home_dir: str | None = None,
) -> dict:
    """Scan the .claude/ directory hierarchy for configuration maturity signals.

    Args:
        project_root: Workspace root path, or None for home-dir-only scan.
        home_dir: Home directory path (defaults to Path.home(), injectable for testing).

    Returns:
        A dict matching the ConfigurationMaturity shape with hooks, rules,
        commands, skills, mcp, claudeMd, and permissions sections.
    """
    home = Path(home_dir) if home_dir else Path.home()
    root = Path(project_root) if project_root else None

    return {
        "hooks": _scan_hooks(root, home),
        "rules": _scan_rules(root),
        "commands": _scan_commands(root),
        "skills": _scan_skills(root),
        "mcp": _scan_mcp(root, home),
        "claudeMd": _scan_claude_md(root, home),
        "permissions": _scan_permissions(root),
        "agents": _scan_agents(root, home),
    }
