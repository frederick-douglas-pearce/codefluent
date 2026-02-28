# CLAUDE.md — CodeFluent

## Project Overview
CodeFluent is a personal analytics dashboard for Claude Code users. It uses `ccusage` for token/cost data, a lightweight JSONL prompt extractor for AI fluency scoring, and the Anthropic API as a scoring engine. Everything runs locally.

**THIS IS A HACKATHON PROJECT. You have ~2.5 hours. Prioritize working code over perfect code. Ship fast, polish later.**

## Tech Stack
- **Runtime:** Python 3.12.3, Node v22.18.0
- **Package manager:** `uv` (always use `uv` instead of `pip`)
- **Backend:** FastAPI + uvicorn
- **Frontend:** Vanilla HTML/CSS/JS (NO frameworks, NO build step, NO npm for frontend)
- **Charts:** Chart.js loaded from CDN (https://cdn.jsdelivr.net/npm/chart.js)
- **API:** Anthropic Python SDK (`anthropic` package)
- **Usage data:** `ccusage` (installed globally via npx, reads Claude Code sessions)
- **GitHub:** `gh` CLI tool (already installed and authenticated)
- **Data:** Local JSONL files from `~/.claude/projects/`

## Project Structure
```
codefluent/
├── CLAUDE.md                  # This file
├── PROJECT_PLAN.md            # Master plan (read for context)
├── TECHNICAL_SPEC.md          # Detailed implementation spec
├── UI_SPEC.md                 # Frontend design spec
├── REFERENCES.md              # Research papers and docs links
├── DEMO_SCRIPT.md             # 3-minute demo script
├── extract_prompts.py         # Lightweight JSONL prompt extractor
├── main.py                    # FastAPI backend
├── pyproject.toml             # Project config (uv)
├── data/                      # All data files (gitignored)
│   ├── ccusage/               # ccusage JSON exports
│   │   ├── daily.json
│   │   ├── monthly.json
│   │   ├── session.json
│   │   └── blocks.json
│   ├── prompts/               # Extracted user prompts
│   │   └── sessions.json
│   └── scores.json            # Cached AI scoring results
└── static/                    # Frontend files served by FastAPI
    ├── index.html
    ├── app.js
    └── style.css
```

## Key Commands
```bash
# Setup (one time)
uv init
uv add fastapi uvicorn anthropic
mkdir -p data/ccusage data/prompts static

# Generate usage data (run before starting web app)
npx ccusage@latest daily --json > data/ccusage/daily.json
npx ccusage@latest monthly --json > data/ccusage/monthly.json
npx ccusage@latest session --json -o desc > data/ccusage/session.json
npx ccusage@latest blocks --json > data/ccusage/blocks.json

# Extract prompts for scoring
uv run python extract_prompts.py

# Start dev server
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000

# Open in browser
# http://localhost:8000
```

## Code Style & Conventions
- Python: Type hints, f-strings, pathlib for file paths
- JavaScript: ES6+, no semicolons, fetch() for API calls, async/await
- CSS: CSS custom properties for theming, BEM-ish class naming
- Keep files small: if a file exceeds 300 lines, consider splitting
- Use descriptive variable names over comments
- Error handling: always wrap API calls in try/except, show user-friendly errors in UI

## JSONL Data Format (VERIFIED against real data)

Claude Code stores sessions at: `~/.claude/projects/`

Directory structure:
```
~/.claude/projects/
├── -home-fdpearce-Documents-project-name/
│   ├── session-uuid-1.jsonl
│   ├── session-uuid-2.jsonl
│   └── ...
└── -home-fdpearce-Documents-other-project/
    └── ...
```

### Verified Message Types (from real data)
Each JSONL file has one JSON object per line. These are the types we care about:

**`type: "user"` — User prompts (EXTRACT THESE)**
```json
{
  "type": "user",
  "sessionId": "uuid",
  "version": "2.1.44",
  "gitBranch": "main",
  "cwd": "/path/to/project",
  "message": {
    "role": "user",
    "content": "plain string"
  },
  "uuid": "msg-uuid",
  "timestamp": "2026-02-27T01:10:20.969Z",
  "planContent": "optional — present when Plan Mode was used"
}
```
**NOTE:** `message.content` can be either:
- A plain string: `"content": "Implement the following plan..."`
- An array of blocks: `"content": [{"type": "text", "text": "..."}]`
The parser MUST handle both.

**`type: "assistant"` — Claude responses (token usage here)**
```json
{
  "type": "assistant",
  "message": {
    "model": "claude-opus-4-6",
    "role": "assistant",
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

**Types to SKIP:**
- `file-history-snapshot` — metadata
- `tool_use` — top-level tool invocations (count for stats but don't extract content)
- `tool_result` — tool output
- `progress`, `hook_progress`, `bash_progress` — streaming events
- `thinking` — extended thinking (count as a signal but skip content)
- `system` — system messages
- `create` — file creation events

### Signals to Detect for Fluency Scoring
- `planContent` field on user messages → Plan Mode usage (positive fluency signal)
- `type: "thinking"` lines → Extended thinking usage
- `type: "tool_use"` → Tool diversity (count unique tool names)
- Content of user prompts → Behavioral analysis

## ccusage JSON Format (VERIFIED)
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

## Anthropic API Usage
- Model for scoring: `claude-sonnet-4-20250514` (fast, cheap, good for classification)
- API key via environment variable: `ANTHROPIC_API_KEY`
- Keep prompts concise — send only user prompt text, not full assistant responses
- Cache scoring results to `data/scores.json` to avoid re-scoring on refresh

## Design System (Anthropic-Inspired)
- **Primary/accent:** `#D97706` (warm amber)
- **Background:** `#FAFAF9` (warm off-white)
- **Card background:** `#FFFFFF` with subtle shadow
- **Text primary:** `#1C1917`
- **Text secondary:** `#78716C`
- **Success:** `#059669` (emerald green)
- **Warning:** `#D97706` (amber)
- **Danger:** `#DC2626` (red)
- **Font:** Inter (Google Fonts CDN) or system-ui fallback
- **Border radius:** 12px cards, 8px buttons
- **Spacing:** 8px base unit

## Critical Constraints
1. **NO npm for frontend** — Load libraries from CDN only
2. **NO database** — All data is JSON files on disk
3. **NO authentication** — Runs locally, no login
4. **NO build step** — HTML/CSS/JS served directly by FastAPI
5. **Use `uv` for all Python tooling** — never `pip` directly
6. **Time is everything** — If something takes >15 minutes to debug, simplify or skip

## When Stuck
- If ccusage output is unexpected, use `--debug` flag to see details
- If prompt extraction misses messages, add the missing `type` to the parser
- If Anthropic API is slow, pre-score 5 sessions and cache them
- If a frontend component is ugly, get data flowing first, then style
- If GitHub integration breaks, hardcode mock data and move on

## Testing
```bash
# Test data pipeline
npx ccusage@latest daily --json | python3 -m json.tool | head -20
uv run python extract_prompts.py && cat data/prompts/sessions.json | python3 -m json.tool | head -50

# Test API
curl http://localhost:8000/api/usage | python3 -m json.tool
curl http://localhost:8000/api/sessions | python3 -m json.tool

# Test scoring (once API key is set)
curl -X POST http://localhost:8000/api/score \
  -H "Content-Type: application/json" \
  -d '{"session_ids": ["first-session-id"]}' | python3 -m json.tool
```
