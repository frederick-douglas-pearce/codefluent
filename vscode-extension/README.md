# CodeFluent

**AI fluency analytics for Claude Code users** — track your prompting skills, monitor token usage, and get personalized coaching to write better prompts.

CodeFluent parses your local Claude Code session files, scores your prompts against 11 research-backed fluency behaviors, and shows you exactly where to improve.

## Features

### Fluency Scoring

Your prompts are scored (0–100) against 11 behaviors that distinguish effective AI collaborators:

- Specificity, decomposition, context-setting, constraint use
- Iterative refinement, error recovery, verification requests
- And more — each scored individually with actionable feedback

![Fluency Score Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-scoring.png)

### CLAUDE.md Config Scoring

Get credit for fluency behaviors encoded in your project's `CLAUDE.md` file. Behaviors defined as project conventions are merged with your session scores — so good project setup boosts your fluency rating.

### Usage Dashboard

Track daily and monthly token usage, costs, and session history. Powered by [`ccusage`](https://github.com/ryoppippi/ccusage).

![Usage Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage.png)

### Weekly Trend Tracking

See your fluency score trend over time with a sparkline chart and trajectory text (improving, stable, or declining).

### Quick Wins

GitHub-repo-scoped task suggestions — CodeFluent detects your current workspace repo, fetches open issues, and suggests high-impact tasks you can launch directly in Claude Code with one click.

![Quick Wins](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins.png)

### Coaching

Personalized tips based on your weakest fluency behaviors. Each coaching suggestion targets a specific behavior with concrete examples.

## Requirements

- **VS Code** 1.85 or later
- **Claude Code** installed and used (session data in `~/.claude/projects/`)
- **Anthropic API key** — for fluency scoring (set `ANTHROPIC_API_KEY` env var, add to workspace `.env`, or enter when prompted)
- **Node.js** 18+ — for `ccusage` usage data (called via `npx`)
- **GitHub CLI (`gh`)** — optional, for Quick Wins repo context and issue suggestions

## How It Works

1. **Session parsing** — Reads JSONL session files from `~/.claude/projects/` to extract your prompts
2. **Fluency scoring** — Sends prompts (up to 20 per session, max 2000 chars each) to Claude Sonnet for behavioral classification
3. **Config scoring** — Reads your workspace `CLAUDE.md` and scores it against the same behaviors
4. **Score aggregation** — Merges session + config scores, caches results to minimize API calls
5. **Coaching** — Identifies your weakest behaviors and generates targeted improvement tips
6. **Usage tracking** — Calls `ccusage` to aggregate token/cost data from Claude Code sessions

All data stays local. No telemetry, no external servers — just your local session files and direct Anthropic API calls for scoring.

## Session Data

Claude Code stores session transcripts as JSONL files at `~/.claude/projects/`. **Session transcripts are only available from late January 2026 onward** — earlier Claude Code usage was not persisted as full transcripts. Subagent sessions (spawned by Claude's Agent tool) are excluded from scoring because they contain AI-generated prompts, not human input.

See [`docs/SESSION_DATA.md`](../docs/SESSION_DATA.md) for details on data availability, storage format, and scoring scope.

## Extension Settings

CodeFluent uses the following API key resolution order:

1. `ANTHROPIC_API_KEY` environment variable
2. `.env` file in your workspace root
3. VS Code SecretStorage (persisted after first prompt)

## Known Issues

- Screenshots are placeholders until the first marketplace release
- `ccusage` must be available via `npx` (requires Node.js and npm on PATH)
- Quick Wins requires `gh` CLI to be installed and authenticated

## License

[MIT](LICENSE)
