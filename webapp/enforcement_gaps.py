"""Enforcement gap detector for CLAUDE.md files.

Detects advisory language ("always", "never", "must") in CLAUDE.md content
that is NOT backed by programmatic hooks, and suggests which hook events
and matchers could enforce those statements.
"""

import re
from typing import Any

# Patterns that detect enforcement/imperative language in CLAUDE.md lines.
# Order matters: more specific patterns are checked first.
ENFORCEMENT_PATTERNS: list[tuple[re.Pattern[str], str]] = [
    (re.compile(r"\bshall\s+always\b", re.IGNORECASE), "shall always"),
    (re.compile(r"\bshould\s+always\b", re.IGNORECASE), "should always"),
    (re.compile(r"\bunder\s+no\s+circumstances\b", re.IGNORECASE), "under no circumstances"),
    (re.compile(r"\bdo\s+not\s+ever\b", re.IGNORECASE), "do not ever"),
    (re.compile(r"\bwithout\s+exception\b", re.IGNORECASE), "without exception"),
    (re.compile(r"\bevery\s+time\b", re.IGNORECASE), "every time"),
    (re.compile(r"\brequired\s+to\s+\w+", re.IGNORECASE), "required to"),
    (re.compile(r"\bmust\s+(not\s+)?\w+", re.IGNORECASE), "must"),
    (re.compile(r"\bnever\s+\w+", re.IGNORECASE), "never"),
    (re.compile(r"\balways\s+\w+", re.IGNORECASE), "always"),
]

# Keyword-to-hook mapping: maps domain keywords to suggested hook event + matcher.
KEYWORD_TO_HOOK: list[dict[str, Any]] = [
    {"keywords": re.compile(r"\b(commit|committing|pre-commit)\b", re.IGNORECASE), "event": "PreToolUse", "matcher": "Bash", "severity": "high"},
    {"keywords": re.compile(r"\b(push|pushing)\b", re.IGNORECASE), "event": "PreToolUse", "matcher": "Bash", "severity": "high"},
    {"keywords": re.compile(r"\b(test|tests|testing|npm\s+test|pytest)\b", re.IGNORECASE), "event": "PreToolUse", "matcher": "Bash", "severity": "high"},
    {"keywords": re.compile(r"\b(lint|linting|eslint|format|formatting|prettier)\b", re.IGNORECASE), "event": "PostToolUse", "matcher": "Edit|Write", "severity": "medium"},
    {"keywords": re.compile(r"\b(security|vulnerability|sanitize|escape|inject)\b", re.IGNORECASE), "event": "PreToolUse", "matcher": "Bash", "severity": "high"},
    {"keywords": re.compile(r"\b(build|compile|compilation)\b", re.IGNORECASE), "event": "PostToolUse", "matcher": "Bash", "severity": "medium"},
    {"keywords": re.compile(r"\b(review|approve|approval)\b", re.IGNORECASE), "event": "Stop", "matcher": None, "severity": "medium"},
]


def extract_enforcement_statements(content: str, source: str) -> list[dict]:
    """Extract enforcement statements from CLAUDE.md content.

    Skips lines inside fenced code blocks (``` delimiters) and
    frontmatter (--- delimiters at start of file).

    Args:
        content: Raw CLAUDE.md content.
        source: Label for the file location (e.g., "project root").

    Returns:
        List of dicts with statement, lineNumber, source, and pattern keys.
    """
    if not content:
        return []

    lines = content.split("\n")
    statements: list[dict] = []
    in_code_block = False
    in_frontmatter = False

    for i, line in enumerate(lines):
        trimmed = line.strip()

        # Handle frontmatter (only at start of file)
        if i == 0 and trimmed == "---":
            in_frontmatter = True
            continue
        if in_frontmatter:
            if trimmed == "---":
                in_frontmatter = False
            continue

        # Handle fenced code blocks
        if trimmed.startswith("```"):
            in_code_block = not in_code_block
            continue
        if in_code_block:
            continue

        # Check each enforcement pattern against this line
        for pattern, label in ENFORCEMENT_PATTERNS:
            if pattern.search(line):
                statements.append({
                    "statement": trimmed,
                    "lineNumber": i + 1,  # 1-based
                    "source": source,
                    "pattern": label,
                })
                break  # Only match the first pattern per line

    return statements


def map_to_hook_suggestion(statement: str) -> dict:
    """Map an enforcement statement to a suggested hook event + matcher.

    Args:
        statement: The enforcement statement text.

    Returns:
        Dict with event, matcher (optional), and severity keys.
    """
    for mapping in KEYWORD_TO_HOOK:
        if mapping["keywords"].search(statement):
            return {
                "event": mapping["event"],
                "matcher": mapping["matcher"],
                "severity": mapping["severity"],
            }
    # Default: generic stop hook with medium severity
    return {"event": "Stop", "matcher": None, "severity": "medium"}


def is_hook_covered(hooks: dict, event: str, matcher: str | None) -> bool:
    """Check if a hook configuration covers a given event + matcher.

    Args:
        hooks: Hook configuration dict with "events" and "matchers" lists.
        event: The hook event to check (e.g., "PreToolUse").
        matcher: Optional matcher to check (e.g., "Bash").

    Returns:
        True if the hook config covers this event+matcher.
    """
    if event not in hooks.get("events", []):
        return False
    if not matcher:
        return True
    return matcher in hooks.get("matchers", [])


def detect_enforcement_gaps(
    claude_md_content: str,
    hooks: dict,
    source: str = "project root",
) -> dict:
    """Detect gaps between enforcement statements and configured hooks.

    Scans the content for imperative/enforcement language, maps each statement
    to a suggested hook, and checks whether existing hook configuration covers it.

    Args:
        claude_md_content: Raw CLAUDE.md file content.
        hooks: Hook configuration dict from scan_configuration_maturity.
        source: Label for the file location (defaults to "project root").

    Returns:
        Dict with enforcementStatements, gaps, and coveredCount keys.
    """
    enforcement_statements = extract_enforcement_statements(claude_md_content, source)
    gaps: list[dict] = []
    covered_count = 0

    for stmt in enforcement_statements:
        suggestion = map_to_hook_suggestion(stmt["statement"])
        covered = is_hook_covered(hooks, suggestion["event"], suggestion["matcher"])

        if covered:
            covered_count += 1
        else:
            gaps.append({
                "statement": stmt["statement"],
                "lineNumber": stmt["lineNumber"],
                "source": stmt["source"],
                "suggestedHookEvent": suggestion["event"],
                "suggestedMatcher": suggestion.get("matcher"),
                "severity": suggestion["severity"],
            })

    return {
        "enforcementStatements": enforcement_statements,
        "gaps": gaps,
        "coveredCount": covered_count,
    }
