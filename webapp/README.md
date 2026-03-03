# CodeFluent Web App

Standalone web interface for CodeFluent's AI fluency analytics. This is an alternative to the VS Code extension for users on any editor.

Built with FastAPI (Python) and vanilla HTML/CSS/JS. Provides the same fluency scoring, usage dashboard, quick wins, and recommendations as the VS Code extension.

## Prerequisites

- **Python 3.12+** with **[uv](https://docs.astral.sh/uv/)** (Python package manager)
- **Node.js 22+** (for `npx ccusage`)
- **[`gh` CLI](https://cli.github.com/)** authenticated (`gh auth login`) — required for Quick Wins
- **[Anthropic API key](https://console.anthropic.com/settings/keys)** — required for fluency scoring
- **Git** — version control

## Setup

Run these steps in order from the `webapp/` directory.

### 1. Install Python dependencies

```bash
uv sync
```

### 2. Create data directories

The app expects data files in `../data/` relative to the webapp directory:

**Linux / macOS:**

```bash
mkdir -p ../data/ccusage ../data/prompts
```

**Windows (PowerShell):**

```powershell
New-Item -ItemType Directory -Force -Path ..\data\ccusage, ..\data\prompts
```

### 3. Export usage data

```bash
npx ccusage@latest daily --json > ../data/ccusage/daily.json
```

This reads your Claude Code session history and exports token/cost data. You must have used Claude Code at least once for this to produce output.

### 4. Extract prompts

```bash
uv run python extract_prompts.py
```

This parses JSONL session files from `~/.claude/projects/` and writes prompt data to `../data/prompts/`.

### 5. Set your API key

**Option A — Environment variable:**

```bash
export ANTHROPIC_API_KEY=sk-ant-api03-...
```

**Option B — `.env` file** in the `webapp/` directory:

```
ANTHROPIC_API_KEY=sk-ant-api03-...
```

### 6. Start the server

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Open [http://localhost:8000](http://localhost:8000) in your browser.

## Configuration

### Port

The server runs on port 8000 by default. Change it with the `PORT` environment variable:

```bash
PORT=3000 uv run uvicorn main:app --reload --host 0.0.0.0 --port 3000
```

### CORS

CORS is restricted to localhost origins by default. The allowed origin is determined by the `PORT` environment variable (`http://localhost:{PORT}`). This prevents cross-origin requests from external hosts.

## Refreshing Data

Usage data and prompts are extracted as static files. To update them after new Claude Code sessions:

```bash
npx ccusage@latest daily --json > ../data/ccusage/daily.json
uv run python extract_prompts.py
```

Then reload the web page — no server restart needed.

## Windows Notes

- Use `\` instead of `/` in paths (e.g., `..\data\ccusage\daily.json`)
- Use `$env:ANTHROPIC_API_KEY = "sk-ant-api03-..."` to set environment variables in PowerShell
- Session files are at `C:\Users\<username>\.claude\projects\`

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **`../data/ccusage/daily.json` not found** | Run step 2 to create the data directories first |
| **ccusage returns empty JSON** | Ensure you've used Claude Code at least once. Run `npx ccusage@latest daily --json` manually to check output. |
| **No prompts extracted** | Check that `~/.claude/projects/` contains `.jsonl` session files |
| **API key not found** | Set `ANTHROPIC_API_KEY` via environment variable or `.env` file in `webapp/` |
| **Quick Wins shows no results** | Run `gh auth login` to authenticate the GitHub CLI |

## Development

```bash
uv run uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

The `--reload` flag enables auto-reload on file changes. Edit files in `static/` for the frontend or `main.py` for the backend.

See the root [CONTRIBUTING.md](../CONTRIBUTING.md) for code conventions and security rules.
