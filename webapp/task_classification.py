"""Heuristic task classification for conversations.

Classifies conversations by branch prefix (if available) or keyword
patterns in the first few user prompts.
"""

import re

TASK_TYPES: list[str] = [
    "feature",
    "bug_fix",
    "refactor",
    "debug",
    "test",
    "docs",
    "chore",
    "exploration",
]

BRANCH_PREFIX_MAP: dict[str, str] = {
    "feature": "feature",
    "feat": "feature",
    "fix": "bug_fix",
    "bugfix": "bug_fix",
    "hotfix": "bug_fix",
    "refactor": "refactor",
    "test": "test",
    "docs": "docs",
    "chore": "chore",
    "ci": "chore",
    "build": "chore",
}

_SKIP_BRANCHES = frozenset({"main", "master", "develop"})

_KEYWORD_PATTERNS: list[tuple[str, re.Pattern]] = [
    ("bug_fix", re.compile(r"\b(fix|bug|broken|crash(es|ing)?|error|issue|wrong|not working|fails?|failing)\b")),
    ("debug", re.compile(r"\b(debug|trace|breakpoint|inspect|why is|what'?s wrong|figure out why|investigate)\b")),
    ("refactor", re.compile(r"\b(refactor|restructure|reorganize|clean ?up|simplify|extract|move .+ to)\b")),
    ("test", re.compile(r"\b(test|spec|coverage|assert|mock|stub|unit test|integration test)\b")),
    ("docs", re.compile(r"\b(doc(s|ument)?|readme|comment|jsdoc|docstring|typedoc)\b")),
    ("chore", re.compile(r"\b(ci|pipeline|deploy|build|lint(er|ing)?|format(ter)?|upgrade|bump|dependabot|release|configure)\b")),
    ("feature", re.compile(r"\b(add|implement|create|build|new|feature|introduce|support for)\b")),
    ("exploration", re.compile(r"\b(explore|experiment|try|prototype|spike|poc|proof of concept|how (do|does|can|to)|what is|explain)\b")),
]


def classify_by_branch(git_branch: str | None) -> str | None:
    """Classify a conversation by its git branch prefix.

    Returns None for main/master/develop, None branch, or unrecognized prefixes.
    """
    if not git_branch:
        return None

    slash_index = git_branch.find("/")
    if slash_index == -1:
        return None

    prefix = git_branch[:slash_index].lower()
    if prefix in _SKIP_BRANCHES:
        return None

    return BRANCH_PREFIX_MAP.get(prefix)


def classify_by_keywords(user_prompts: list[str]) -> str | None:
    """Classify a conversation by keyword patterns in user prompts.

    Only scans the first 3 prompts. First matching pattern wins.
    """
    if not user_prompts:
        return None

    text = " ".join(user_prompts[:3]).lower()

    for task_type, pattern in _KEYWORD_PATTERNS:
        if pattern.search(text):
            return task_type

    return None


def classify_task(git_branch: str | None, user_prompts: list[str]) -> str | None:
    """Classify a conversation using branch prefix first, then keyword fallback."""
    return classify_by_branch(git_branch) or classify_by_keywords(user_prompts)
