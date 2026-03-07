# CodeFluent Web App

**AI fluency analytics for Claude Code users** — standalone web interface as an alternative to the VS Code extension.

CodeFluent parses your local Claude Code session files, scores your prompts against 11 research-backed fluency behaviors, and shows you exactly where to improve. Built with FastAPI (Python) and vanilla HTML/CSS/JS.

## Getting Started

### Prerequisites

- **Python 3.12+** with **[uv](https://docs.astral.sh/uv/)** (Python package manager)
- **Node.js 22+** (for `npx ccusage`)
- **[Anthropic API key](https://console.anthropic.com/settings/keys)** — required for fluency scoring
- **[`gh` CLI](https://cli.github.com/)** authenticated (`gh auth login`) — required for Quick Wins
- **Git** — version control

### Setup

1. **Install dependencies and start the server:**

   **Linux / macOS:**

   ```bash
   cd codefluent/webapp
   uv sync
   uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

   **Windows (PowerShell):**

   ```powershell
   cd codefluent\webapp
   uv sync
   uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
   ```

2. **Open [http://localhost:8000](http://localhost:8000)** in your browser.

3. **Set your API key** — either via environment variable or a `.env` file in `webapp/`:

   ```
   ANTHROPIC_API_KEY=sk-ant-api03-...
   ```

Usage data and session prompts are fetched on demand — no manual export steps needed. Click the **Refresh** button in the Usage tab to pull the latest data.

## Features

### Fluency Scoring

Your prompts are scored (0-100) against 11 behaviors that distinguish effective AI collaborators. Each behavior is scored individually with color-coded bars comparing your results to population benchmarks.

| Fluency Score | Recommendations |
|---------------|-----------------|
| ![Fluency tab](../images/demo-fluency.png) | ![Recommendations tab](../images/demo-recommendations.png) |

### Personalized Recommendations

Tailored coaching based on your weakest fluency behaviors, with high/medium impact categories, concrete prompt examples, and research citations.

### CLAUDE.md Config Scoring

Get credit for fluency behaviors encoded in your project's `CLAUDE.md` file. Behaviors defined as project conventions are merged with your session scores — so good project setup boosts your fluency rating.

### Prompt Optimizer

Paste any prompt and get an optimized version back. The optimizer considers your CLAUDE.md config (scoring it on demand if not cached) so it won't add behaviors already covered by project conventions. Shows a side-by-side comparison with before/after effective scores so you can copy whichever you prefer.

![Prompt Optimizer](../images/demo-optimizer.png)

### Quick Wins

GitHub-repo-scoped task suggestions. Fetches open issues and recent activity, then suggests high-impact tasks with copy-ready Claude Code prompts.

| Quick Wins | Usage |
|------------|-------|
| ![Quick Wins tab](../images/demo-quickwins.png) | ![Usage tab](../images/demo-usage.png) |

### Usage Dashboard

Track daily and monthly token usage, costs, and session history. Powered by [`ccusage`](https://github.com/ryoppippi/ccusage). Click **Refresh** to fetch the latest data on demand.

## How It Works

1. **Session parsing** — Reads JSONL session files from `~/.claude/projects/` to extract your prompts
2. **Fluency scoring** — Sends prompts to Claude Sonnet for behavioral classification against 11 fluency indicators
3. **Config scoring** — Reads your project's `CLAUDE.md` and scores it against the same behaviors
4. **Score aggregation** — Merges session + config scores, caches results to minimize API calls
5. **Prompt optimization** — Analyzes any prompt against the 11 behaviors, factors in CLAUDE.md config behaviors, and generates an improved version that skips behaviors already covered by project conventions
6. **Recommendations** — Identifies your weakest behaviors and generates targeted improvement tips
7. **Usage tracking** — Calls `ccusage` to aggregate token/cost data from Claude Code sessions

All data stays local. No telemetry, no external servers — just your local session files and direct Anthropic API calls for scoring.

## Configuration

### Port

The server runs on port 8000 by default. Change it with the `PORT` environment variable:

```bash
PORT=3000 uv run uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

### CORS

CORS is restricted to localhost origins by default. The allowed origin is determined by the `PORT` environment variable (`http://localhost:{PORT}`). This prevents cross-origin requests from external hosts.

## Session Data

Claude Code stores session transcripts as JSONL files at `~/.claude/projects/`. **Session transcripts are only available from late January 2026 onward** — earlier Claude Code usage was not persisted as full transcripts. Subagent sessions (spawned by Claude's Agent tool) are excluded from scoring because they contain AI-generated prompts, not human input.

| Platform | Path |
|----------|------|
| Linux | `~/.claude/projects/` |
| macOS | `~/.claude/projects/` |
| Windows | `C:\Users\<username>\.claude\projects\` |

See [`docs/SESSION_DATA.md`](../docs/SESSION_DATA.md) for details on data availability, storage format, and scoring scope.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **No sessions found** | Check that `~/.claude/projects/` contains `.jsonl` session files. Claude Code creates these automatically during use. |
| **API key not found** | Set `ANTHROPIC_API_KEY` via environment variable or `.env` file in `webapp/` |
| **ccusage returns no data** | Click the Refresh button in the Usage tab, or run `npx ccusage@latest daily --json` manually to verify output. Ensure you've used Claude Code at least once. |
| **Quick Wins shows no results** | Run `gh auth login` to authenticate the GitHub CLI |

## Development

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The `--reload` flag enables auto-reload on file changes. Edit files in `static/` for the frontend or `main.py` for the backend.

See the root [CONTRIBUTING.md](../CONTRIBUTING.md) for code conventions and security rules.

## Windows Notes

- Use `\` instead of `/` in paths (e.g., `..\data\ccusage\daily.json`)
- Use `$env:ANTHROPIC_API_KEY = "sk-ant-api03-..."` to set environment variables in PowerShell
- Session files are at `C:\Users\<username>\.claude\projects\`

## License

[MIT](../LICENSE)
