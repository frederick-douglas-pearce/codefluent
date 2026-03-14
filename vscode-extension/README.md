# CodeFluent

**AI fluency analytics for Claude Code users** — track your prompting skills, monitor token usage, and get personalized recommendations to write better prompts.

CodeFluent parses your local Claude Code session files, scores your prompts against 11 research-backed fluency behaviors, and shows you exactly how to improve.

## Getting Started

### Requirements

- **VS Code** 1.85 or later
- **Claude Code** installed and used (session data in `~/.claude/projects/`)
- **Anthropic API key** — for fluency scoring (set `ANTHROPIC_API_KEY` env var, add to workspace `.env`, or enter when prompted)
- **Node.js** 22+ — for `ccusage` usage data (called via `npx`)
- **GitHub CLI (`gh`)** — optional, for Quick Wins repo context and issue suggestions

### Installation

1. Install the `.vsix` package:
   ```
   code --install-extension codefluent-0.2.2.vsix
   ```
2. Open the CodeFluent sidebar by clicking the activity bar icon
3. When prompted, enter your Anthropic API key (stored securely in VS Code SecretStorage)

## Features

### Fluency Scoring

Your prompts are scored (0–100) against 11 behaviors that distinguish effective AI collaborators:

- Specificity, decomposition, context-setting, constraint use
- Iterative refinement, error recovery, verification requests
- And more — each scored individually with actionable feedback

A weekly trend sparkline tracks your score trajectory over time (improving, stable, or declining).

![Fluency Score Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-scoring.png)

![Coding Interaction Patterns and Session Breakdown](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-scoring-2.png)

### Personalized Recommendations

Tailored coaching based on your weakest fluency behaviors, with high/medium impact categories, concrete prompt examples, and research citations.

![Recommendations](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-recommendations.png)

### CLAUDE.md Config Scoring

Get credit for fluency behaviors encoded in your project's `CLAUDE.md` file. Behaviors defined as project conventions are merged with your session scores — so good project setup boosts your fluency rating.

### Prompt Optimizer

Paste any prompt and get an optimized version back. The optimizer considers your workspace CLAUDE.md config (scoring it on demand if not cached) so it won't add behaviors already covered by project conventions. Shows a side-by-side comparison with before/after effective scores so you can copy or run the improved prompt directly.

![Prompt Optimizer](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-optimizer.png)

### Quick Wins

GitHub-repo-scoped task suggestions — CodeFluent detects your current workspace repo, fetches open issues, and suggests high-impact tasks you can launch directly in Claude Code with one click.

![Quick Wins Landing](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins-landing.png)

![Quick Wins Suggestions](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins.png)

### Usage Dashboard

Track daily and monthly token usage, costs, and session history. Powered by [`ccusage`](https://github.com/ryoppippi/ccusage). Session analytics shows per-session efficiency metrics, cost-efficiency scatter charts with fluency score color gradients, and a sortable details table with cost/prompt, cache hit rates, and output/input ratios.

![Usage Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage.png)

![Session Analytics](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-analytics.png)

![Cost Efficiency Charts](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-charts.png)

## How It Works

1. **Session parsing** — Reads JSONL session files from `~/.claude/projects/` to extract your prompts and token usage
2. **Fluency scoring** — Sends prompts (up to 20 per session, max 2000 chars each) to Claude Sonnet for behavioral classification
3. **Config scoring** — Reads your workspace `CLAUDE.md` and scores it against the same behaviors
4. **Score aggregation** — Merges session + config scores, caches results to minimize API calls
5. **Recommendations** — Identifies your weakest behaviors and generates targeted improvement tips
6. **Prompt optimization** — Analyzes any prompt against the 11 behaviors, factors in CLAUDE.md config, and generates an improved version
7. **Usage tracking** — Calls `ccusage` for all-projects token/cost data; computes per-session efficiency metrics from parsed JSONL history

All data stays local. No telemetry, no external servers — just your local session files and direct Anthropic API calls for scoring.

## Session Data

Claude Code stores session transcripts as JSONL files at `~/.claude/projects/`. **Session transcripts are only available from late January 2026 onward** — earlier Claude Code usage was not persisted as full transcripts. Subagent sessions (spawned by Claude's Agent tool) are excluded from scoring because they contain AI-generated prompts, not human input.

See [`docs/SESSION_DATA.md`](../docs/SESSION_DATA.md) for details on data availability, storage format, and scoring scope.

## Extension Settings

CodeFluent uses the following API key resolution order:

1. `ANTHROPIC_API_KEY` environment variable
2. `.env` file in your workspace root
3. VS Code SecretStorage (persisted after first prompt)

## Privacy

All data stays on your machine. CodeFluent reads local session files and makes direct Anthropic API calls for scoring — no telemetry, no external servers, no data collection.

## Troubleshooting

| Problem | Solution |
|---------|----------|
| **No sessions found** | Check that `~/.claude/projects/` contains `.jsonl` session files. Claude Code creates these automatically during use. |
| **API key not found** | The extension checks: env var → workspace `.env` → VS Code secrets → interactive prompt. Make sure `ANTHROPIC_API_KEY` is set in at least one location. |
| **Quick Wins shows no results** | Run `gh auth login` to authenticate the GitHub CLI. |
| **ccusage returns no data** | Click the Refresh button in the Usage tab. Ensure Node.js and npm are on PATH so `npx ccusage` works. |
| **Extension doesn't activate** | Look for the CodeFluent icon in the activity bar. If missing, try reloading the window (`Ctrl+Shift+P` → "Reload Window"). |

## Research Foundations

CodeFluent's scoring framework is grounded in published Anthropic research:

- [AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026) — 11 behavioral indicators and population benchmarks
- [Coding Skills Formation with AI](https://www.anthropic.com/research/coding-skill-formation) (Jan 2026) — 6 coding interaction patterns and quality analysis
- [Claude Code Best Practices](https://www.anthropic.com/research/claude-code-best-practices) — Practical guidelines for effective AI collaboration

## Contributing

CodeFluent is open source and actively looking for contributors! Whether it's bug fixes, new features, or improving the scoring framework — all contributions are welcome. Check out the [open issues](https://github.com/frederick-douglas-pearce/codefluent/issues) for ideas, or see [`CONTRIBUTING.md`](https://github.com/frederick-douglas-pearce/codefluent/blob/main/CONTRIBUTING.md) for dev setup and guidelines.

## License

[MIT](../LICENSE)
