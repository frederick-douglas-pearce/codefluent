"""CodeFluent — FastAPI backend for Claude Code analytics dashboard."""

from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pathlib import Path
import json
import subprocess
from anthropic import Anthropic

app = FastAPI(title="CodeFluent")
client = Anthropic()

app.mount("/static", StaticFiles(directory="static"), name="static")


@app.get("/")
async def root():
    return FileResponse("static/index.html")


@app.get("/api/usage")
async def get_usage():
    """Serve ccusage JSON data directly."""
    data = {}
    ccusage_dir = Path("data/ccusage")
    for name in ["daily", "monthly", "session"]:
        path = ccusage_dir / f"{name}.json"
        if path.exists():
            with open(path) as f:
                data[name] = json.load(f)
    return data


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


@app.get("/api/scores")
async def get_scores():
    """Return cached fluency scores if they exist."""
    scores_path = Path("data/scores.json")
    if not scores_path.exists():
        return {"scores": {}, "aggregate": {}}
    with open(scores_path) as f:
        cached = json.load(f)
    scored = [r for r in cached.values() if "fluency_behaviors" in r]
    aggregate = compute_aggregate(scored) if scored else {}
    return {"scores": cached, "aggregate": aggregate}


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

    scores_path = Path("data/scores.json")
    cached = {}
    if scores_path.exists():
        with open(scores_path) as f:
            cached = json.load(f)

    with open("data/prompts/sessions.json") as f:
        all_sessions = {s["id"]: s for s in json.load(f)["sessions"]}

    results = {}
    for sid in session_ids:
        if sid in cached and not force:
            results[sid] = cached[sid]
            continue

        session = all_sessions.get(sid)
        if not session or not session["user_prompts"]:
            continue

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
            if text.startswith("```"):
                text = text.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            score = json.loads(text)
            score["session_id"] = sid
            results[sid] = score
            cached[sid] = score
        except Exception as e:
            results[sid] = {"error": str(e), "session_id": sid}

    with open(scores_path, "w") as f:
        json.dump(cached, f, indent=2)

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


QUICKWINS_PROMPT = """The user has a Claude Code Max plan and is underutilizing their token allocation.

Here are their active GitHub repositories with recent commits and README status:
{repos}

Here are their open issues:
{issues}

Suggest 3-5 quick tasks they could assign to Claude Code right now. Each should be:
- Completable in 15-30 minutes of Claude Code time
- Genuinely useful (not busywork)
- Specific enough to copy-paste as a Claude Code prompt
- NOT duplicating work already done (check recent commits to avoid suggesting completed work)
- NOT suggesting adding a README if one already exists

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


def _get_repo_context(owner: str, repo_name: str) -> dict:
    """Fetch recent commits and README status for a repo."""
    context = {"recent_commits": [], "has_readme": False}
    try:
        commits_result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo_name}/commits",
             "--jq", ".[0:5] | .[] | .commit.message"],
            capture_output=True, text=True, timeout=10,
        )
        if commits_result.returncode == 0:
            messages = [line.split("\n")[0] for line in commits_result.stdout.strip().split("\n") if line]
            context["recent_commits"] = messages
    except Exception:
        pass
    try:
        readme_result = subprocess.run(
            ["gh", "api", f"repos/{owner}/{repo_name}/readme", "--jq", ".name"],
            capture_output=True, text=True, timeout=5,
        )
        context["has_readme"] = readme_result.returncode == 0 and bool(readme_result.stdout.strip())
    except Exception:
        pass
    return context


@app.get("/api/quickwins")
async def get_quickwins():
    """Generate quick win suggestions from GitHub repos."""
    try:
        repos_result = subprocess.run(
            ["gh", "repo", "list", "--json", "name,url,pushedAt,description", "--limit", "20"],
            capture_output=True, text=True, timeout=10,
        )
        repos_list = json.loads(repos_result.stdout) if repos_result.returncode == 0 else []

        # Get the owner from the first repo URL
        owner = ""
        if repos_list:
            owner = repos_list[0]["url"].split("/")[-2]

        # Enrich repos with recent commits and README status (top 10 most recent)
        for repo in repos_list[:10]:
            ctx = _get_repo_context(owner, repo["name"])
            repo["recent_commits"] = ctx["recent_commits"]
            repo["has_readme"] = ctx["has_readme"]

        issues_result = subprocess.run(
            ["gh", "issue", "list", "--json", "title,url,labels,repository", "--state", "open", "--limit", "30"],
            capture_output=True, text=True, timeout=10,
        )
        issues = issues_result.stdout if issues_result.returncode == 0 else "[]"

        prompt = QUICKWINS_PROMPT.format(repos=json.dumps(repos_list, indent=2), issues=issues)
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
