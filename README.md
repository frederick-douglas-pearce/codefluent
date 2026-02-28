# CodeFluent

**Personal AI fluency analytics for Claude Code users.**

Millions of developers use AI coding assistants daily, but nobody knows if they're using them *well*. Anthropic's research shows most users exhibit only 3 of 11 key fluency behaviors, and that interaction patterns directly predict whether developers build skills or lose them.

CodeFluent reads your local Claude Code session data, scores your prompting behaviors against [Anthropic's AI Fluency Research](https://www.anthropic.com/research/AI-fluency-index), and gives you actionable recommendations to become a more effective AI collaborator.

Built at **PDX Hacks 2026**.

### How It Compares

Several tools exist for monitoring Claude Code usage — but they all measure *what happened*, not *how well you collaborated*:

| Tool | What it measures | What's missing |
|------|-----------------|----------------|
| [ccusage](https://github.com/ryoppippi/ccusage) | Token counts, costs, model breakdown | No behavioral analysis |
| [Sniffly](https://github.com/chiphuyen/sniffly) (Chip Huyen) | Usage stats, error analysis, message history | Analyzes *Claude's* errors, not user behavior |
| [Claude-Code-Usage-Monitor](https://github.com/Maciek-roboblog/Claude-Code-Usage-Monitor) | Real-time token consumption, rate limit predictions | No quality scoring |
| [Anthropic Official Analytics](https://code.claude.com/docs/en/analytics) | PRs merged, lines committed, team adoption | Org-level metrics, no individual fluency |
| [DX Platform](https://getdx.com/) | Developer velocity, AI adoption rates | Enterprise focus, not behavioral |
| **CodeFluent** | **Fluency behaviors, interaction patterns, personalized coaching** | **The gap everyone else leaves open** |

Anthropic's own AI Fluency Index noted they "plan deeper study into Claude Code" but haven't shipped any behavioral scoring tool. CodeFluent fills that gap today.

### Why This Is Different

- **Research-grounded, not vibes.** Every score maps to Anthropic's AI Fluency Index (Feb 2026) and Coding Skills Formation study (Jan 2026). The benchmark bars are real population data.
- **First to score collaboration quality.** Existing tools count tokens or track errors. CodeFluent is the first to analyze *how* you interact with AI and whether your patterns build or erode skills.
- **AI evaluating AI collaboration.** Claude scores your prompts against the fluency framework, creating a feedback loop: the AI tells you how to work with it more effectively.
- **Completely local and private.** All session data stays on your machine. The only external calls are to the Anthropic API for scoring.
- **Zero infrastructure.** No database, no auth, no build step. One command and you're analyzing your habits.

## Screenshots

| Usage | Fluency Score |
|-------|---------------|
| ![Usage tab](images/demo-usage.png) | ![Fluency tab](images/demo-fluency.png) |

| Quick Wins | Recommendations |
|------------|-----------------|
| ![Quick Wins tab](images/demo-quickwins.png) | ![Recommendations tab](images/demo-recommendations.png) |

## Features

- **Usage Dashboard** — Token consumption, cost tracking, and model breakdown from your Claude Code history via [ccusage](https://github.com/yohasebe/ccusage). Stacked area chart shows cache read/creation/input/output token breakdown.
- **Fluency Score** — Scores your sessions against Anthropic's 11 fluency behaviors and 6 coding interaction patterns using the Anthropic API as a scoring engine. Compares your results to published benchmarks.
- **Quick Wins** — Scans your GitHub repos and open issues, then generates copy-paste-ready Claude Code prompts for high-value tasks you could tackle right now.
- **Recommendations** — Personalized, research-backed suggestions prioritized by impact, with links to the underlying Anthropic research papers.

## How It Works

1. `ccusage` reads your Claude Code session history and exports token/cost data as JSON
2. `extract_prompts.py` parses JSONL session files from `~/.claude/projects/` to extract user prompts and metadata (plan mode usage, tool diversity, thinking count)
3. The FastAPI backend sends prompts to `claude-sonnet-4-20250514` for fluency scoring against the 4D AI Fluency Framework
4. The vanilla JS frontend renders everything with Chart.js — no build step, no framework

Everything runs locally. No data leaves your machine except the API calls to Anthropic for scoring.

## Tech Stack

- **Backend:** Python 3.12 / FastAPI / uvicorn
- **Frontend:** Vanilla HTML/CSS/JS + Chart.js (CDN)
- **Scoring:** Anthropic API (`claude-sonnet-4-20250514`)
- **Usage data:** [ccusage](https://github.com/yohasebe/ccusage) (reads Claude Code sessions)
- **Package manager:** [uv](https://github.com/astral-sh/uv)

## Setup

### Prerequisites

- Python 3.12+
- Node.js (for `npx ccusage`)
- An [Anthropic API key](https://console.anthropic.com/)
- `gh` CLI (optional, for Quick Wins feature)

### Install

```bash
git clone https://github.com/frederick-douglas-pearce/codefluent.git
cd codefluent
uv sync
```

### Configure

Create a `.env` file with your API key:

```
ANTHROPIC_API_KEY=sk-ant-...
```

### Generate Data

```bash
# Export usage data from Claude Code history
mkdir -p data/ccusage data/prompts
npx ccusage@latest daily --json > data/ccusage/daily.json
npx ccusage@latest monthly --json > data/ccusage/monthly.json
npx ccusage@latest session --json -o desc > data/ccusage/session.json

# Extract prompts for fluency scoring
uv run python extract_prompts.py
```

### Run

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open http://localhost:8000

## Project Structure

```
codefluent/
├── main.py                # FastAPI backend (API endpoints + scoring)
├── extract_prompts.py     # JSONL prompt extractor
├── static/
│   ├── index.html         # Single-page app
│   ├── app.js             # Frontend logic + Chart.js rendering
│   └── style.css          # Anthropic-inspired design system
├── data/                  # Generated data (gitignored)
│   ├── ccusage/           # ccusage JSON exports
│   ├── prompts/           # Extracted session prompts
│   └── scores.json        # Cached fluency scores
├── docs/                  # Design docs and specs
├── pyproject.toml
└── CLAUDE.md              # AI coding instructions
```

## Research Foundations

- [Anthropic AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026) — 11 behavioral indicators and population benchmarks
- [Coding Skills Formation with AI](https://www.anthropic.com/research/coding-skill-formation) (Jan 2026) — 6 coding interaction patterns and quality analysis
- [Claude Code Best Practices](https://www.anthropic.com/research/claude-code-best-practices) — Practical guidelines for effective AI collaboration

## License

MIT
