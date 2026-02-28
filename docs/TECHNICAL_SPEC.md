# CodeFluent — Technical Specification

## 1. Data Pipeline Overview

CodeFluent uses two independent data paths:

| Concern | Tool | Input | Output |
|---------|------|-------|--------|
| Token/cost data | `ccusage` (npm) | `~/.claude/projects/*.jsonl` | `data/ccusage/*.json` |
| User prompts for scoring | `extract_prompts.py` | `~/.claude/projects/*.jsonl` | `data/prompts/sessions.json` |

This hybrid approach means zero custom token/cost parsing — ccusage handles all the tricky math, caching, and model pricing. We only write a lightweight extractor for the one thing ccusage doesn't export: user prompt text.

---

## 2. ccusage Data Ingestion

### Commands (run once before starting web app)
```bash
npx ccusage@latest daily --json > data/ccusage/daily.json
npx ccusage@latest monthly --json > data/ccusage/monthly.json
npx ccusage@latest session --json -o desc > data/ccusage/session.json
npx ccusage@latest blocks --json > data/ccusage/blocks.json
```

### Verified JSON Schema — `daily.json`
```json
{
  "daily": [
    {
      "date": "2025-12-28",
      "inputTokens": 102,
      "outputTokens": 36,
      "cacheCreationTokens": 95593,
      "cacheReadTokens": 390211,
      "totalTokens": 485942,
      "totalCost": 0.79397175,
      "modelsUsed": ["claude-opus-4-5-20251101"],
      "modelBreakdowns": [
        {
          "modelName": "claude-opus-4-5-20251101",
          "inputTokens": 102,
          "outputTokens": 36,
          "cacheCreationTokens": 95593,
          "cacheReadTokens": 390211,
          "cost": 0.79397175
        }
      ]
    }
  ]
}
```

The `monthly.json` and `session.json` follow the same structure but grouped differently. The `blocks.json` groups by billing block (5-hour windows).

### Usage in FastAPI
```python
@app.get("/api/usage")
async def get_usage():
    data = {}
    for name in ["daily", "monthly", "session", "blocks"]:
        path = Path("data/ccusage") / f"{name}.json"
        if path.exists():
            with open(path) as f:
                data[name] = json.load(f)
    return data
```

No transformation needed — serve ccusage JSON directly to the frontend.

---

## 3. Prompt Extractor (`extract_prompts.py`)

### Purpose
Reads JSONL session files and extracts ONLY user prompts + metadata needed for AI fluency scoring. Does NOT parse tokens or costs.

### Verified JSONL Schema

**User messages (`type: "user"`):**
```json
{
  "type": "user",
  "sessionId": "8b1b21d0-87ee-4b2b-aff9-6abf4ded3e17",
  "version": "2.1.44",
  "gitBranch": "main",
  "cwd": "/home/fdpearce/Documents/.../sportswear-esg-news-classifier",
  "message": {
    "role": "user",
    "content": "Implement the following plan:..."
  },
  "uuid": "61368fa4-5062-48e4-a7b4-18b4f6359ab2",
  "timestamp": "2026-02-27T01:10:20.969Z",
  "planContent": "# Plan: Phase 3..."
}
```

**CRITICAL:** `message.content` can be:
- A string: `"content": "Implement the following plan..."`
- An array: `"content": [{"type": "text", "text": "[Request interrupted by user for tool use]"}]`

**Assistant messages (`type: "assistant"`) — count only, don't extract content:**
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "content": [{"type": "text", "text": "..."}, {"type": "tool_use", ...}],
    "usage": {
      "input_tokens": 3,
      "output_tokens": 2,
      "cache_creation_input_tokens": 14450,
      "cache_read_input_tokens": 19155
    }
  },
  "timestamp": "2026-02-27T01:10:24.420Z"
}
```

**Types to skip entirely:** `file-history-snapshot`, `tool_result`, `progress`, `hook_progress`, `bash_progress`, `system`, `create`

**Types to count as signals:** `tool_use` (top-level), `thinking`

### Output Schema — `data/prompts/sessions.json`
```json
{
  "sessions": [
    {
      "id": "8b1b21d0-87ee-4b2b-aff9-6abf4ded3e17",
      "project": "sportswear-esg-news-classifier",
      "project_path_encoded": "-home-fdpearce-Documents-...",
      "started_at": "2026-02-27T01:10:20.969Z",
      "ended_at": "2026-02-27T02:15:00.000Z",
      "user_prompts": [
        "Implement the following plan: Phase 3 — Workflow Learning...",
        "Can you also add error handling for the edge case where..."
      ],
      "user_message_count": 12,
      "assistant_message_count": 15,
      "tool_use_count": 8,
      "tools_used": ["Read", "Edit", "Bash", "Grep"],
      "thinking_count": 2,
      "used_plan_mode": true,
      "model": "claude-opus-4-6",
      "claude_code_version": "2.1.44",
      "git_branch": "main"
    }
  ],
  "metadata": {
    "total_sessions": 117,
    "total_projects": 2,
    "extracted_at": "2026-02-28T09:00:00Z"
  }
}
```

### Implementation

```python
#!/usr/bin/env python3
"""CodeFluent — Extract user prompts from Claude Code JSONL sessions."""

import json
from pathlib import Path
from collections import defaultdict
from datetime import datetime
import argparse


CLAUDE_DATA_DIR = Path.home() / ".claude" / "projects"

# Types that contain user prompts
USER_TYPES = {"user"}

# Types to count as behavioral signals
SIGNAL_TYPES = {"tool_use", "thinking"}

# Types to skip entirely
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


def decode_project_name(encoded_name: str) -> str:
    """Convert path-encoded dir name to readable project name.
    e.g. '-home-fdpearce-Documents-...-sportswear-esg-news-classifier'
    → 'sportswear-esg-news-classifier'
    """
    # The project name is the last segment of the original path
    # Encoded as: -home-user-path-to-project becomes the dir name
    # Split on the pattern and take meaningful trailing segments
    parts = encoded_name.strip("-").split("-")

    # Find where the actual project name starts by looking for common path prefixes
    skip_prefixes = {"home", "Users", "root", "var", "tmp", "Documents", "Projects",
                     "Courses", "Code", "repos", "src", "projects"}

    # Walk backwards to find the project name portion
    # Heuristic: project names often have multiple hyphenated words
    # The encoded dir uses single hyphens for path separators AND word separators
    # Best approach: use the cwd from any message in the session to get the real name
    return encoded_name  # Will be overridden by cwd-based extraction


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

        # Extract session metadata from any message that has it
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

        # User messages — extract prompts
        if msg_type == "user":
            user_msg_count += 1
            content = msg.get("message", {}).get("content", "")
            text = extract_user_text(content)
            if text and text != "[Request interrupted by user for tool use]":
                user_prompts.append(text[:2000])  # Truncate very long prompts

            # Check for Plan Mode
            if msg.get("planContent"):
                used_plan_mode = True

        # Assistant messages — count and extract model
        elif msg_type == "assistant":
            assistant_msg_count += 1
            msg_model = msg.get("message", {}).get("model")
            if msg_model and not model:
                model = msg_model

        # Tool use — count and track names
        elif msg_type == "tool_use":
            tool_use_count += 1
            # Top-level tool_use has name in message.content or directly
            name = msg.get("name") or msg.get("message", {}).get("name")
            if not name:
                # Check nested content
                content = msg.get("message", {}).get("content", [])
                if isinstance(content, list):
                    for block in content:
                        if isinstance(block, dict) and block.get("type") == "tool_use":
                            name = block.get("name")
                            break
            if name:
                tools_used.add(name)

        # Thinking — count as signal
        elif msg_type == "thinking":
            thinking_count += 1

        # Also check assistant messages for nested tool_use in content
        if msg_type == "assistant":
            content = msg.get("message", {}).get("content", [])
            if isinstance(content, list):
                for block in content:
                    if isinstance(block, dict) and block.get("type") == "tool_use":
                        tool_use_count += 1
                        if block.get("name"):
                            tools_used.add(block["name"])

    if not user_prompts:
        return None

    # Use session file name as fallback ID
    if not session_id:
        session_id = filepath.stem

    # Derive project name from cwd
    project_name = project_cwd.rstrip("/").split("/")[-1] if project_cwd else filepath.parent.name

    # Sort timestamps
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
        print(f"❌ Claude data directory not found: {data_dir}")
        return

    print(f"📁 Reading from: {data_dir}")

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

    # Sort by start time (most recent first)
    sessions.sort(key=lambda s: s.get("started_at") or "", reverse=True)

    if args.limit:
        sessions = sessions[:args.limit]

    projects = set(s["project"] for s in sessions)
    total_prompts = sum(len(s["user_prompts"]) for s in sessions)

    print(f"✅ Extracted {total_prompts} prompts from {len(sessions)} sessions across {len(projects)} projects")

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

    print(f"📊 Written to {output_path}")


if __name__ == "__main__":
    main()
```

---

## 4. FastAPI Backend (`main.py`)

### Full Implementation Sketch

```python
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import json
import subprocess
import os
from anthropic import Anthropic

app = FastAPI(title="CodeFluent")
client = Anthropic()  # Uses ANTHROPIC_API_KEY env var

# Serve static files
app.mount("/static", StaticFiles(directory="static"), name="static")

@app.get("/")
async def root():
    return FileResponse("static/index.html")


# --- Usage Data (from ccusage) ---

@app.get("/api/usage")
async def get_usage():
    """Serve ccusage JSON data directly."""
    data = {}
    ccusage_dir = Path("data/ccusage")
    for name in ["daily", "monthly", "session", "blocks"]:
        path = ccusage_dir / f"{name}.json"
        if path.exists():
            with open(path) as f:
                data[name] = json.load(f)
    return data


# --- Session/Prompt Data ---

@app.get("/api/sessions")
async def get_sessions(limit: int = 50, project: str = None):
    """Serve extracted prompt data."""
    path = Path("data/prompts/sessions.json")
    if not path.exists():
        return {"sessions": [], "metadata": {}}
    with open(path) as f:
        data = json.load(f)
    sessions = data["sessions"]
    if project:
        sessions = [s for s in sessions if s["project"] == project]
    return {"sessions": sessions[:limit], "metadata": data["metadata"]}


# --- AI Fluency Scoring ---

SCORING_PROMPT = """You are an AI Fluency Analyst. Analyze this Claude Code session's user prompts and score against Anthropic's 4D AI Fluency Framework and their 6 coding interaction patterns.

## AI Fluency Behavioral Indicators (score each true/false)

1. **iteration_and_refinement** — Builds on Claude's responses, refining rather than accepting first answer
2. **clarifying_goals** — Clearly states what they're trying to accomplish
3. **specifying_format** — Specifies how they want output formatted
4. **providing_examples** — Provides examples of desired output
5. **setting_interaction_terms** — Tells Claude how to interact ("push back if wrong", "explain reasoning")
6. **checking_facts** — Verifies or questions factual claims
7. **questioning_reasoning** — Asks Claude to explain its rationale
8. **identifying_missing_context** — Identifies gaps in Claude's knowledge or assumptions
9. **adjusting_approach** — Changes strategy based on responses
10. **building_on_responses** — Uses Claude's output as foundation for further work
11. **providing_feedback** — Gives feedback on response quality

## Coding Interaction Patterns (classify into ONE)

**High-quality (65%+):**
- **conceptual_inquiry** — Asks conceptual questions, codes manually
- **generation_then_comprehension** — Generates code, then asks follow-ups to understand
- **hybrid_code_explanation** — Requests code + explanations simultaneously

**Low-quality (<40%):**
- **ai_delegation** — Entirely delegates with minimal engagement
- **progressive_ai_reliance** — Starts engaged, gradually offloads
- **iterative_ai_debugging** — Uses AI to debug without understanding

## Additional Signals
- **used_plan_mode**: {used_plan_mode} (positive signal if true)
- **thinking_count**: {thinking_count} (extended thinking usage)
- **tool_diversity**: {tools_used}

## User Prompts From This Session

{prompts}

## Respond with ONLY a JSON object:

{{
  "fluency_behaviors": {{
    "iteration_and_refinement": true/false,
    "clarifying_goals": true/false,
    "specifying_format": true/false,
    "providing_examples": true/false,
    "setting_interaction_terms": true/false,
    "checking_facts": true/false,
    "questioning_reasoning": true/false,
    "identifying_missing_context": true/false,
    "adjusting_approach": true/false,
    "building_on_responses": true/false,
    "providing_feedback": true/false
  }},
  "coding_pattern": "one_of_the_six_patterns",
  "coding_pattern_quality": "high" or "low",
  "overall_score": 0-100,
  "one_line_summary": "Brief assessment."
}}"""


@app.post("/api/score")
async def score_sessions(request: dict):
    """Score sessions for AI fluency using Anthropic API."""
    session_ids = request.get("session_ids", [])
    force = request.get("force_rescore", False)

    # Load cached scores
    scores_path = Path("data/scores.json")
    cached = {}
    if scores_path.exists():
        with open(scores_path) as f:
            cached = json.load(f)

    # Load session data
    with open("data/prompts/sessions.json") as f:
        all_sessions = {s["id"]: s for s in json.load(f)["sessions"]}

    results = {}
    for sid in session_ids:
        # Use cache if available
        if sid in cached and not force:
            results[sid] = cached[sid]
            continue

        session = all_sessions.get(sid)
        if not session or not session["user_prompts"]:
            continue

        # Build prompt
        prompts_text = "\n\n---\n\n".join(
            f"Prompt {i+1}: {p}" for i, p in enumerate(session["user_prompts"][:20])
        )
        prompt = SCORING_PROMPT.format(
            used_plan_mode=session.get("used_plan_mode", False),
            thinking_count=session.get("thinking_count", 0),
            tools_used=", ".join(session.get("tools_used", [])),
            prompts=prompts_text,
        )

        try:
            response = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                messages=[{"role": "user", "content": prompt}],
            )
            text = response.content[0].text.strip()
            # Strip markdown code fences if present
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            score = json.loads(text)
            score["session_id"] = sid
            results[sid] = score
            cached[sid] = score
        except Exception as e:
            results[sid] = {"error": str(e), "session_id": sid}

    # Save cache
    with open(scores_path, "w") as f:
        json.dump(cached, f, indent=2)

    # Compute aggregate
    scored = [r for r in results.values() if "fluency_behaviors" in r]
    aggregate = compute_aggregate(scored) if scored else {}

    return {"scores": results, "aggregate": aggregate}


def compute_aggregate(scored_sessions: list) -> dict:
    """Compute aggregate fluency metrics across scored sessions."""
    behaviors = [
        "iteration_and_refinement", "clarifying_goals", "specifying_format",
        "providing_examples", "setting_interaction_terms", "checking_facts",
        "questioning_reasoning", "identifying_missing_context",
        "adjusting_approach", "building_on_responses", "providing_feedback",
    ]
    n = len(scored_sessions)
    prevalence = {}
    for b in behaviors:
        count = sum(1 for s in scored_sessions if s.get("fluency_behaviors", {}).get(b, False))
        prevalence[b] = round(count / n, 2) if n else 0

    patterns = {}
    for s in scored_sessions:
        p = s.get("coding_pattern", "unknown")
        patterns[p] = patterns.get(p, 0) + 1

    avg_score = round(sum(s.get("overall_score", 0) for s in scored_sessions) / n) if n else 0

    return {
        "sessions_scored": n,
        "average_score": avg_score,
        "behavior_prevalence": prevalence,
        "pattern_distribution": patterns,
    }


# --- Quick Wins ---

QUICKWINS_PROMPT = """The user has a Claude Code Max plan and is underutilizing their token allocation.

Here are their active GitHub repositories:
{repos}

Here are their open issues:
{issues}

Suggest 3-5 quick tasks they could assign to Claude Code right now. Each should be:
- Completable in 15-30 minutes of Claude Code time
- Genuinely useful (not busywork)
- Specific enough to copy-paste as a Claude Code prompt

Respond with ONLY a JSON array:
[
  {{
    "repo": "repo-name",
    "task": "Brief description",
    "prompt": "Exact Claude Code prompt to use",
    "estimated_minutes": 15,
    "category": "testing|docs|refactor|bugfix|feature"
  }}
]"""


@app.get("/api/quickwins")
async def get_quickwins():
    """Generate quick win suggestions from GitHub repos."""
    try:
        repos_result = subprocess.run(
            ["gh", "repo", "list", "--json", "name,url,pushedAt,description", "--limit", "20"],
            capture_output=True, text=True, timeout=10,
        )
        repos = repos_result.stdout if repos_result.returncode == 0 else "[]"

        issues_result = subprocess.run(
            ["gh", "issue", "list", "--json", "title,url,labels,repository", "--state", "open", "--limit", "30"],
            capture_output=True, text=True, timeout=10,
        )
        issues = issues_result.stdout if issues_result.returncode == 0 else "[]"

        prompt = QUICKWINS_PROMPT.format(repos=repos, issues=issues)
        response = client.messages.create(
            model="claude-sonnet-4-20250514",
            max_tokens=1024,
            messages=[{"role": "user", "content": prompt}],
        )
        text = response.content[0].text.strip()
        if text.startswith("```"):
            text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
        return {"suggestions": json.loads(text)}

    except Exception as e:
        return {"suggestions": [], "error": str(e)}
```

---

## 5. AI Fluency Scoring — Benchmark Values

From Anthropic's AI Fluency Index (Feb 23, 2026), population-level prevalence:

| Behavior | Avg Prevalence | Notes |
|----------|---------------|-------|
| iteration_and_refinement | 85.7% | Most common behavior |
| building_on_responses | ~75% | |
| clarifying_goals | ~70% | +14.7pp when creating artifacts |
| adjusting_approach | ~60% | |
| questioning_reasoning | ~40% | -3.1pp when creating artifacts |
| providing_feedback | ~35% | |
| specifying_format | ~30% | |
| checking_facts | ~25% | -3.7pp when creating artifacts |
| setting_interaction_terms | ~30% | Least common |
| providing_examples | ~25% | |
| identifying_missing_context | ~20% | -5.2pp when creating artifacts |

These values are used in the frontend to render benchmark markers on the behavior bars.

---

## 6. Recommendations Engine

Hardcoded mapping from low-scoring behaviors to actionable advice:

```python
RECOMMENDATIONS = {
    "setting_interaction_terms": {
        "threshold": 0.30,
        "impact": "high",
        "title": "Set Interaction Terms More Often",
        "advice": "Tell Claude how to interact: 'Push back if my approach seems wrong', 'Explain your uncertainty'. Only ~30% of users do this.",
        "action": "Add to your CLAUDE.md: 'Always explain trade-offs. Push back if my approach seems suboptimal.'",
        "source": "Anthropic AI Fluency Index (Feb 2026)",
    },
    "checking_facts": {
        "threshold": 0.35,
        "impact": "high",
        "title": "Verify Claims After Code Generation",
        "advice": "When Claude produces code or technical claims, ask: 'Are you sure this API exists in v4?' Fact-checking drops 3.7pp when generating artifacts.",
        "action": "After code generation, ask one verification question before accepting.",
        "source": "Anthropic AI Fluency Index (Feb 2026)",
    },
    "questioning_reasoning": {
        "threshold": 0.40,
        "impact": "medium",
        "title": "Ask 'Why This Approach?'",
        "advice": "Ask 'Why did you choose this approach over X?' — especially for architecture decisions.",
        "action": "Before accepting a design, ask Claude to compare alternatives.",
        "source": "Anthropic AI Fluency Index (Feb 2026)",
    },
    "identifying_missing_context": {
        "threshold": 0.25,
        "impact": "medium",
        "title": "Check for Missing Context",
        "advice": "Ask: 'What assumptions are you making here?' or 'What context would help you do this better?'",
        "action": "At the start of complex tasks, ask Claude what it needs to know.",
        "source": "Anthropic AI Fluency Index (Feb 2026)",
    },
    "providing_examples": {
        "threshold": 0.30,
        "impact": "medium",
        "title": "Show Examples of What You Want",
        "advice": "Paste a code snippet and say 'follow this pattern'. Examples dramatically improve output quality.",
        "action": "When requesting code, include at least one example of the style you want.",
        "source": "Anthropic AI Fluency Index / Best Practices",
    },
}

# Pattern-specific recommendations
PATTERN_RECOMMENDATIONS = {
    "ai_delegation": {
        "impact": "high",
        "title": "You're Delegating Too Much",
        "advice": "You're offloading entire tasks without engaging. Ask 'How does this work?' after code generation. Comprehension scores 86% for conceptual inquiry vs <40% for delegation.",
        "source": "Anthropic Coding Skills Formation Study (Jan 2026)",
    },
    "progressive_ai_reliance": {
        "impact": "high",
        "title": "You Start Engaged But Drift",
        "advice": "You begin sessions asking good questions but gradually let Claude drive. Set a rule: every 3rd prompt should be a comprehension question.",
        "source": "Anthropic Coding Skills Formation Study (Jan 2026)",
    },
    "iterative_ai_debugging": {
        "impact": "medium",
        "title": "Understand Before Debugging",
        "advice": "Before asking Claude to fix a bug, explain what you think is wrong. 'I think the issue is X because Y' forces understanding.",
        "source": "Anthropic Coding Skills Formation Study (Jan 2026)",
    },
}
```

The `/api/recommendations` endpoint (or hardcoded logic) compares the user's aggregate scores against these thresholds and returns applicable recommendations sorted by impact.
