"""CodeFluent — Structured output anti-pattern detection."""

import re

STRUCTURED_OUTPUT_PATTERNS: list[re.Pattern] = [
    re.compile(r"\boutput\s+(as|in)\s+json\b", re.IGNORECASE),
    re.compile(r"\brespond\s+(in|with)\s+json(\s+format)?\b", re.IGNORECASE),
    re.compile(r"\breturn\s+a?\s*json\s+(object|response|output)\b", re.IGNORECASE),
    re.compile(r"\bformat\s+(your\s+)?response\s+as\s+json\b", re.IGNORECASE),
    re.compile(r"\bgive\s+me\s+(the\s+)?(result|response|output|answer)\s+(as|in)\s+json\b", re.IGNORECASE),
    re.compile(r"\breply\s+(in|with)\s+json\b", re.IGNORECASE),
    re.compile(r"\bprovide\s+(the\s+)?(result|response|output|answer)\s+(as|in|using)\s+json\b", re.IGNORECASE),
    re.compile(r"\bjson\s+format\s+(only|please)\b", re.IGNORECASE),
    re.compile(r"\b(must|should|needs?\s+to)\s+(be|return|output)\s+(in\s+)?json\b", re.IGNORECASE),
]


def detect_structured_output_anti_pattern(prompts: list[str]) -> dict:
    """Scan prompts for structured output anti-patterns (requesting JSON format).

    Returns a dict with:
      - has_structured_output_antipattern: bool
      - structured_output_antipattern_count: int
      - structured_output_antipattern_indices: list[int]
    """
    indices: list[int] = []

    for i, prompt in enumerate(prompts):
        for pattern in STRUCTURED_OUTPUT_PATTERNS:
            if pattern.search(prompt):
                indices.append(i)
                break

    return {
        "has_structured_output_antipattern": len(indices) > 0,
        "structured_output_antipattern_count": len(indices),
        "structured_output_antipattern_indices": indices,
    }


def detect_anti_patterns(user_prompts: list[str]) -> dict:
    """Convenience wrapper for all anti-pattern detection.

    Currently delegates to structured output detection only.
    Provides an extension point for future anti-pattern types.
    """
    return detect_structured_output_anti_pattern(user_prompts)
