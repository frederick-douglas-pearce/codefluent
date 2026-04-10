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
   code --install-extension codefluent-*.vsix
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

Get credit for 3 meta-interaction behaviors that can be established as project conventions: *setting interaction terms*, *identifying missing context*, and *questioning reasoning*. If your `CLAUDE.md` defines these (e.g., "push back if wrong"), they boost your effective score via `conversation OR config` logic, with a "CLAUDE.md" attribution tag in the UI.

### Prompt Optimizer

Paste any prompt and get an optimized version back. The optimizer considers your workspace CLAUDE.md config (scoring it on demand if not cached) so it won't add behaviors already covered by project conventions. Shows a side-by-side comparison with before/after effective scores so you can copy or run the improved prompt directly.

![Prompt Optimizer](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-optimizer.png)

### Quick Wins

GitHub-repo-scoped task suggestions — CodeFluent detects your current workspace repo, fetches open issues, and suggests high-impact tasks you can launch directly in Claude Code with one click.

![Quick Wins Landing](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins-landing.png)

![Quick Wins Suggestions](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-quickwins.png)

### Conversations Tab

Sortable table of all conversations with date, project, prompts, duration, tokens, cost, cache%, tools, and score. Click any row to expand a detail view showing metadata, tools used, custom commands/skills invoked, and full user prompts. Five interactive charts visualize conversation patterns: conversations/week, length distribution, duration distribution, average prompts/week trend, and inter-prompt gap distribution. Agent metrics cards with weekly sparklines track tool diversity, plan mode adoption, cache hit rate, and thinking utilization. A task type doughnut chart classifies conversations across 8 categories.

Claude Code stores session data as JSONL files, but these files don't correspond to meaningful work units — a single file can span 8+ days of intermittent use. CodeFluent assembles **conversations** by pooling all messages per project, sorting by timestamp, and splitting into conversations whenever a gap between user prompts exceeds a configurable inactivity threshold (default: 60 minutes). `/clear` commands force a conversation boundary. Each conversation represents one focused interaction — the same unit of analysis used by Anthropic's AI Fluency Index.

The inactivity threshold is configurable via the `codefluent.conversation.inactivityGapMinutes` VS Code setting.

![Conversations Tab](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations.png)

![Conversations Charts](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations-charts.png)

![Conversations Detail View](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-conversations-detail.png)

### Configuration Maturity

**The first tool to assess your Claude Code project configuration maturity — no known equivalent exists.** Scans your `.claude/` directory and scores your setup (0–100) across 8 weighted categories: CLAUDE.md (20 pts), Hooks (20 pts), Rules (15 pts), Commands (10 pts), MCP (10 pts), Skills (10 pts), Permissions (5 pts), and Enforcement Coverage (10 pts). A tier badge (Beginner / Intermediate / Advanced / Expert) summarizes your maturity level.

Enforcement gap detection identifies rules in your CLAUDE.md that lack programmatic enforcement via hooks. The Configuration Advisor generates ready-to-use hook configurations from enforcement gaps using Claude, with one-click copy to clipboard.

Covers the same configuration competencies tested in the [Claude Certified Architect (CCA)](https://www.anthropic.com/news/claude-certified-architect) exam. This is the foundation for the CCA readiness radar and interaction quality metrics planned for future releases.

![Configuration Maturity](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-config.png)

![Configuration Gaps & Advisor](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-config-gaps.png)

### Usage Dashboard

Track daily and monthly token usage, costs, and conversation history. Powered by [`ccusage`](https://github.com/ryoppippi/ccusage). Conversation analytics shows per-conversation efficiency metrics, cost-efficiency scatter charts with fluency score color gradients, and a sortable details table with cost/prompt, cache hit rates, and output/input ratios.

![Usage Dashboard](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage.png)

![Conversation Analytics](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-analytics.png)

![Cost Efficiency Charts](https://raw.githubusercontent.com/frederick-douglas-pearce/codefluent/main/images/vscode-usage-charts.png)

## How It Works

1. **Parse & assemble** — JSONL session files are parsed and all messages per project are assembled into conversations by splitting at inactivity gaps between user prompts (`codefluent.conversation.inactivityGapMinutes`, default: 60 minutes)
2. **Score** — User prompts (up to 20 per conversation, max 2000 chars each) are sent to the scoring model (`codefluent.scoring.model`, default: `claude-sonnet-4-20250514`) with `temperature: 0` for fluency scoring
3. **Config scoring** — Your workspace `CLAUDE.md` is scored against 3 config-eligible meta-interaction behaviors and merged via `effective = conversation OR config`
4. **Cache** — Results are cached locally by conversation ID, content hash, and prompt version to avoid re-scoring
5. **Usage analytics** — `ccusage` provides all-projects token/cost data; per-conversation efficiency metrics are computed from parsed JSONL token data

All data stays local. No telemetry, no external servers — just your local session files and direct Anthropic API calls for scoring.

## Session Data

Claude Code stores session transcripts as JSONL files at `~/.claude/projects/` by default. If your session data is in a non-default location, set `codefluent.sessionDataPath` in VS Code settings. **Session transcripts are only available from late January 2026 onward** — earlier Claude Code usage was not persisted as full transcripts. Subagent sessions (spawned by Claude's Agent tool) are excluded from scoring because they contain AI-generated prompts, not human input.

CodeFluent assembles these raw session files into conversations (see [Conversations](#conversations) above) before scoring.

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

## Roadmap

**Coming in v1.2:**
- **LLM-powered task classification** — upgrade heuristic classification with few-shot LLM classification and golden set validation
- **Interaction quality metrics** — error recovery patterns, verification behavior, learning trajectory

**Planned (v1.3+):**
- **CCA readiness radar** — 5-axis radar chart mapping your usage to Claude Certified Architect competency domains
- **Scoring quality infrastructure** — confidence calibration, user feedback signals, cross-model agreement testing
- **Outcome metrics** — commit quality analysis, MCP integration assessment

See the [Release Roadmap](https://github.com/frederick-douglas-pearce/codefluent/blob/main/docs/RELEASE_ROADMAP.md) for details, or browse [open milestones](https://github.com/frederick-douglas-pearce/codefluent/milestones) on GitHub.

## Research Foundations

CodeFluent's scoring framework is grounded in published Anthropic research:

- [AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026) — 11 behavioral indicators and population benchmarks
- [Coding Skills Formation with AI](https://www.anthropic.com/research/coding-skill-formation) (Jan 2026) — 6 coding interaction patterns and quality analysis
- [Claude Code Best Practices](https://www.anthropic.com/research/claude-code-best-practices) — Practical guidelines for effective AI collaboration

## Contributing

CodeFluent is open source and actively looking for contributors! Whether it's bug fixes, new features, or improving the scoring framework — all contributions are welcome. Check out the [open issues](https://github.com/frederick-douglas-pearce/codefluent/issues) for ideas, or see [`CONTRIBUTING.md`](https://github.com/frederick-douglas-pearce/codefluent/blob/main/CONTRIBUTING.md) for dev setup and guidelines.

## License

[MIT](../LICENSE)
