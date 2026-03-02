# CodeFluent

**Personal AI fluency analytics for Claude Code users.**

Millions of developers use AI coding assistants daily, but nobody knows if they're using them *well*. Anthropic's research shows most users exhibit only 3 of 11 key fluency behaviors, and that interaction patterns directly predict whether developers build skills or lose them.

CodeFluent is a VS Code extension that reads your local Claude Code session data, scores your prompting behaviors against [Anthropic's AI Fluency Research](https://www.anthropic.com/research/AI-fluency-index), and gives you actionable recommendations to become a more effective AI collaborator.

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
- **Native VS Code integration.** Lives in your sidebar, respects your theme, launches Claude Code sessions directly from suggestions.
- **Completely local and private.** All session data stays on your machine. The only external calls are to the Anthropic API for scoring.
- **Zero infrastructure.** No database, no auth, no build step. Install the `.vsix` and go.

## Screenshots

| Usage | Fluency Score |
|-------|---------------|
| ![Usage tab](images/demo-usage.png) | ![Fluency tab](images/demo-fluency.png) |

| Quick Wins | Recommendations |
|------------|-----------------|
| ![Quick Wins tab](images/demo-quickwins.png) | ![Recommendations tab](images/demo-recommendations.png) |

## Features

- **Fluency Score** — Scores your sessions against Anthropic's 11 fluency behaviors and 6 coding interaction patterns. Compares your results to published population benchmarks with color-coded bar charts.
- **Usage Dashboard** — Token consumption, cost tracking, model breakdown, and usage pace from your Claude Code history via [ccusage](https://github.com/ryoppippi/ccusage). Stacked area charts show cache read/creation/input/output token breakdown.
- **Quick Wins** — Scans your current workspace's GitHub repo (commits, issues, README status) and generates copy-paste-ready Claude Code prompts for high-value tasks. Includes a "Run" button that launches Claude Code in a terminal with the suggested prompt.
- **Recommendations** — Personalized, research-backed coaching prioritized by impact, with copy-ready prompts and links to the underlying Anthropic research papers.
- **Status Bar** — Shows your aggregate fluency score at a glance in the VS Code status bar.
- **VS Code Theming** — Automatically respects your light/dark theme.

## How It Works

1. The extension parses JSONL session files from `~/.claude/projects/` to extract user prompts and metadata (plan mode usage, tool diversity, thinking count)
2. `ccusage` reads your Claude Code session history and exports token/cost data
3. User prompts are sent to `claude-sonnet-4-20250514` for fluency scoring against Anthropic's 4D AI Fluency Framework
4. Results are cached locally in VS Code's extension storage to avoid re-scoring
5. Quick Wins uses the `gh` CLI to pull repo context and open issues, scoped to the current workspace

Everything runs locally. No data leaves your machine except the API calls to Anthropic for scoring.

## Install

### From VSIX (recommended)

```bash
git clone https://github.com/frederick-douglas-pearce/codefluent.git
cd codefluent/vscode-extension
npm install
npm run compile
npx @vscode/vsce package --allow-missing-repository
code --install-extension codefluent-0.1.0.vsix
```

Then reload VS Code. The CodeFluent icon appears in the activity bar.

### Prerequisites

- VS Code 1.85+
- Node.js 22+ (for `npx ccusage`)
- An [Anthropic API key](https://console.anthropic.com/)
- `gh` CLI authenticated (for Quick Wins)

### Configure

The extension looks for your API key in this order:

1. `ANTHROPIC_API_KEY` environment variable
2. `.env` file in the workspace root
3. VS Code secret storage (persisted after first prompt)
4. Interactive prompt (stored in VS Code secrets for next time)

## Tech Stack

- **Extension:** TypeScript / VS Code WebviewViewProvider
- **Frontend:** Vanilla HTML/CSS/JS + Chart.js (bundled locally)
- **Scoring:** Anthropic API (`claude-sonnet-4-20250514`)
- **Usage data:** [ccusage](https://github.com/ryoppippi/ccusage) (reads Claude Code sessions)
- **GitHub integration:** `gh` CLI
- **Testing:** Jest + ts-jest

## Project Structure

```
codefluent/
├── vscode-extension/          # VS Code extension (primary)
│   ├── src/
│   │   ├── extension.ts       # Activation, status bar, command registration
│   │   ├── webviewProvider.ts  # WebviewViewProvider, IPC, terminal launch
│   │   ├── parser.ts          # JSONL session file parsing
│   │   ├── scoring.ts         # Fluency scoring via Anthropic API
│   │   ├── usage.ts           # ccusage CLI bridge
│   │   ├── quickwins.ts       # GitHub integration + task suggestions
│   │   └── cache.ts           # Persistent score caching
│   ├── media/
│   │   ├── index.html         # Webview UI
│   │   ├── app.js             # Frontend logic + Chart.js rendering
│   │   ├── style.css          # VS Code theme-aware design system
│   │   └── icon.svg           # Activity bar icon
│   ├── test/
│   │   ├── unit/              # Unit tests (scoring)
│   │   └── integration/       # Integration tests (extension, webview)
│   ├── package.json
│   └── tsconfig.json
├── webapp/                    # Original FastAPI web app (reference)
│   ├── main.py                # FastAPI backend
│   ├── extract_prompts.py     # Python JSONL prompt extractor
│   └── static/                # Web frontend (HTML/CSS/JS)
├── docs/                      # Design docs and specs
├── images/                    # Demo screenshots
└── CLAUDE.md                  # AI coding instructions
```

## Development

```bash
cd vscode-extension
npm install
npm run watch          # Continuous TypeScript compilation
# Press F5 in VS Code to launch Extension Development Host
```

### Testing

```bash
npm test               # Run all Jest tests (25 unit + integration tests)
```

### Packaging

```bash
npx @vscode/vsce package --allow-missing-repository
```

## Research Foundations

- [Anthropic AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026) — 11 behavioral indicators and population benchmarks
- [Coding Skills Formation with AI](https://www.anthropic.com/research/coding-skill-formation) (Jan 2026) — 6 coding interaction patterns and quality analysis
- [Claude Code Best Practices](https://www.anthropic.com/research/claude-code-best-practices) — Practical guidelines for effective AI collaboration

## License

MIT
