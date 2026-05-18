# CodeFluent — UI Specification

> Originally the frontend design plan from PDX Hacks 2026. Now maintained as a concise layout reference. For exact styles and implementation, see `webapp/static/` and `vscode-extension/media/`.

## Design System

### Colors

The webapp uses fixed CSS custom properties. The VS Code extension maps to theme tokens (`--vscode-editor-background`, etc.) for automatic light/dark support.

| Token | Webapp Value | Purpose |
|-------|-------------|---------|
| `--accent` | `#D97706` | Warm amber — primary brand color |
| `--success` | `#059669` | Emerald green — positive signals |
| `--danger` | `#DC2626` | Red — negative signals, warnings |
| `--bg-primary` | `#FAFAF9` | Page background |
| `--bg-card` | `#FFFFFF` | Card/panel background |
| `--text-primary` | `#1C1917` | Main text |
| `--text-secondary` | `#78716C` | Labels, descriptions |

### Typography & Spacing

- **Font:** Inter (webapp), VS Code font family (extension)
- **Spacing:** 8px base unit (multiples: 4, 8, 12, 16, 24, 32, 48)
- **Border radius:** 12px cards, 8px buttons

**Source:** `webapp/static/style.css`, `vscode-extension/media/style.css`

---

## Page Layout

Both interfaces share the same tab structure. The webapp adds a header with settings bar; the extension uses the VS Code sidebar panel.

```
┌─────────────────────────────────────────────────────┐
│  HEADER: Logo + Title                               │
├──────────────────────────────────────────────────────┤
│  SETTINGS BAR (visibility varies by tab)            │
│  [Data Path input]  [Project dropdown ▾]            │
├──────┬────────┬──────┬──────┬──────┬────────────────┤
│Fluency│Convs. │Recomm│Config│Optim.│Quick │Usage │  │
│ Score │       │      │      │      │ Wins │      │  │
├──────┴────────┴──────┴──────┴──────┘                │
│                                                     │
│           ACTIVE TAB CONTENT                        │
│           (scrollable)                              │
│                                                     │
│  FOOTER: "Inspired by Anthropic Research" + links    │
└─────────────────────────────────────────────────────┘
```

### Settings bar visibility

| Tab | Data Path | Project Dropdown |
|-----|-----------|-----------------|
| Fluency Score | Shown | Shown |
| Conversations | Hidden | Shown |
| Recommendations | Hidden | Hidden |
| Config | Hidden | Shown |
| Prompt Optimizer | Hidden | Shown |
| Quick Wins | Hidden | Shown |
| Usage | Hidden | Shown |

**Source:** `webapp/static/app.js` (settings bar toggle), `vscode-extension/media/app.js`

---

## Tab 1: Fluency Score

Scores user prompts against 11 fluency behaviors with benchmark comparisons.

```
┌──────────────────────────────────────────────────┐
│  CONVERSATION SELECTOR                            │
│  Analyze last [5 ▾] conversations [Run Scoring ▶] │
├──────────────────────────────────────────────────┤
│  OVERALL SCORE (SVG ring, animated)              │
│              ┌─────────┐                         │
│              │   72    │  Weekly trend sparkline  │
│              │  /100   │                         │
│              └─────────┘                         │
├──────────────────────────────────────────────────┤
│  FLUENCY BEHAVIORS (11 horizontal bars)          │
│  Each bar shows: your prevalence, benchmark      │
│  marker, color-coded (green/amber/red vs bench)  │
│  Amber "CLAUDE.md" tag on config-boosted ones    │
├──────────────────────────────────────────────────┤
│  CODING PATTERNS (donut chart)                   │
│  High-quality vs low-quality pattern split       │
├──────────────────────────────────────────────────┤
│  CONVERSATION BREAKDOWN (expandable list)        │
└──────────────────────────────────────────────────┘
```

### Behavior bar color logic
- Green (`--success`) if user score >= benchmark
- Amber (`--accent`) if within 15pp below benchmark
- Red (`--danger`) if 15pp+ below benchmark

Benchmark values are loaded from `shared/benchmarks.json`.

---

## Tab 2: Conversations

Sortable table with expandable detail view, agent metrics cards, and 5 interactive charts.

```
┌──────────────────────────────────────────────────┐
│  SUMMARY CARDS (4 across)                        │
│  Total Convs | Avg Prompts | Avg Duration |      │
│  Avg Score                                       │
├──────────────────────────────────────────────────┤
│  AGENT METRICS CARDS (4 across, auto-fit grid)   │
│  ┌─────────────┐ ┌─────────────┐                 │
│  │ Tool Div.   │ │ Plan Mode   │                 │
│  │  0.62       │ │  28%        │                 │
│  │ ▃▅▇▆▄▅▇   │ │ ▂▃▅▆▇▅▃   │                 │
│  └─────────────┘ └─────────────┘                 │
│  ┌─────────────┐ ┌─────────────┐                 │
│  │ Cache Hit   │ │ Thinking    │                 │
│  │  94%        │ │  45%        │                 │
│  │ ▅▆▇▇▆▇▇   │ │ ▃▄▅▆▇▇▆   │                 │
│  └─────────────┘ └─────────────┘                 │
├──────────────────────────────────────────────────┤
│  CONVERSATIONS TABLE (sortable, paginated)       │
│  Date|Proj|Prompts|Dur|Tokens|Cost|Cache%|Tools|  │
│  Type|Score                                      │
│  [Click row to expand detail view]               │
│  [Show more]                                     │
├──────────────────────────────────────────────────┤
│  DETAIL VIEW (inline, below expanded row)        │
│  Metadata: model, branch, version, plan mode,   │
│    thinking blocks, task type, started, ended    │
│  Tools Used: [Read] [Edit] [Bash] [Grep] ...    │
│  Commands Used: [/rebuild] (if any)              │
│  User Prompts: numbered list (scrollable)        │
├──────────────────────────────────────────────────┤
│  CHARTS (5 stacked)                              │
│  1. Conversations/Week (bar)                     │
│  2. Conversation Length Distribution (histogram)  │
│  3. Duration Distribution (histogram, 6 bins)    │
│  4. Avg Prompts/Week Trend (line)                │
│  5. Inter-Prompt Gap Distribution (histogram)    │
│     + dashed red threshold line                  │
├──────────────────────────────────────────────────┤
│  TASK TYPE DISTRIBUTION (doughnut, 1:1 aspect)   │
│  8 categories + gray for unclassified            │
│  Custom HTML legend with counts/percentages      │
└──────────────────────────────────────────────────┘
```

### Agent metrics
- **Tool diversity index** — unique_tools / tool_use_count (0–1)
- **Plan mode adoption** — conversations_with_plan / total (0–1)
- **Avg cache hit rate** — mean per-conversation cache_hit_rate (0–1)
- **Thinking utilization** — thinking_count / assistant_message_count (0–1)

Each card shows a value and a Chart.js sparkline of weekly data points.

### Task type categories
| Type | Color |
|------|-------|
| feature | `#6366F1` (indigo) |
| bug_fix | `#EF4444` (red) |
| refactor | `#F59E0B` (amber) |
| debug | `#EC4899` (pink) |
| test | `#10B981` (emerald) |
| docs | `#3B82F6` (blue) |
| chore | `#8B5CF6` (violet) |
| exploration | `#14B8A6` (teal) |
| unclassified | `#9CA3AF` (gray) |

---

## Tab 3: Recommendations

Frontend-driven coaching based on scoring results. No backend endpoint — generated entirely from the aggregate scores and benchmark comparisons.

```
┌──────────────────────────────────────────────────┐
│  🎯 HIGH IMPACT                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ Title + advice + action + source         │    │
│  └──────────────────────────────────────────┘    │
│  🎯 MEDIUM IMPACT                                │
│  ┌──────────────────────────────────────────┐    │
│  │ ...                                      │    │
│  └──────────────────────────────────────────┘    │
│  ✅ YOU'RE DOING WELL                            │
│  (behaviors at or above benchmark)               │
│  RESEARCH SOURCES (linked citations)             │
└──────────────────────────────────────────────────┘
```

Recommendations trigger when `behavior_prevalence < BENCHMARKS[behavior]`. Low-quality coding patterns also generate pattern-specific recommendations.

---

## Tab 4: Configuration Maturity

Maturity score ring with tier badge, 8-category checklist, enforcement gap detection, and Configuration Advisor.

```
┌──────────────────────────────────────────────────┐
│  MATURITY SCORE RING + TIER BADGE                │
│              ┌─────────┐                         │
│              │   67    │  [Advanced]              │
│              │  /100   │                         │
│              └─────────┘                         │
├──────────────────────────────────────────────────┤
│  MATURITY CHECKLIST (8 cards, vertical list)     │
│  ┌──────────────────────────────────────────┐    │
│  │ ✅ CLAUDE.md (20/20 pts)                 │    │
│  │   ✓ Present at project root              │    │
│  │   ✓ Multiple locations                   │    │
│  │   ✓ Uses @import directives              │    │
│  ├──────────────────────────────────────────┤    │
│  │ ⚠️ Hooks (10/20 pts)                    │    │
│  │   ✓ Hooks configured                     │    │
│  │   ✓ Multiple events                      │    │
│  │   ✗ File matchers                        │    │
│  └──────────────────────────────────────────┘    │
│  ... (Rules, Commands, MCP, Skills, Permissions, │
│       Enforcement Coverage)                      │
├──────────────────────────────────────────────────┤
│  ENFORCEMENT GAPS                                │
│  Stat cards: X statements | Y gaps | Z% covered  │
│  ┌──────────────────────────────────────────┐    │
│  │ [HIGH] "Always run tests before commit"  │    │
│  │ Suggested: PreToolUse hook               │    │
│  │ [Generate Hook Config ▶]                 │    │
│  ├──────────────────────────────────────────┤    │
│  │ [MED] "Never use string interpolation"   │    │
│  │ Suggested: PostToolUse hook              │    │
│  │ [Generate Hook Config ▶]                 │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  CONFIGURATION ADVISOR (inline, per gap)         │
│  Explanation + JSON code block + instructions    │
│  [Copy JSON 📋]                                 │
└──────────────────────────────────────────────────┘
```

### Maturity tiers
| Tier | Score Range | Badge Color |
|------|------------|-------------|
| Beginner | 0–24 | Red |
| Intermediate | 25–49 | Amber |
| Advanced | 50–74 | Blue |
| Expert | 75–100 | Green |

### Category weights
| Category | Max Points | Criteria |
|----------|-----------|----------|
| CLAUDE.md | 20 | Present (10), multiple locations (5), @import (5) |
| Hooks | 20 | Configured (10), multiple events (5), file matchers (5) |
| Rules | 15 | Has rules (10), path scoping (5) |
| Commands | 10 | Has commands (10) |
| MCP | 10 | Configured (5), multiple servers (5) |
| Skills | 10 | Has skills (5), frontmatter (5) |
| Permissions | 5 | Configured (5) |
| Enforcement | 10 | Proportional to covered/total statements |

---

## Tab 5: Prompt Optimizer

Paste a prompt, get an optimized version back. Config-aware — factors in CLAUDE.md behaviors to avoid redundancy.

```
┌──────────────────────────────────────────────────┐
│  INPUT PROMPT (textarea)                         │
│  [Optimize ▶]                                    │
├──────────────────────────────────────────────────┤
│  SIDE-BY-SIDE COMPARISON                         │
│  ┌─────────────────┐  ┌─────────────────┐       │
│  │ Original        │  │ Optimized       │       │
│  │ Score: 45/100   │  │ Score: 78/100   │       │
│  │ [prompt text]   │  │ [prompt text]   │       │
│  │ [Copy 📋]      │  │ [Copy 📋]      │       │
│  └─────────────────┘  └─────────────────┘       │
├──────────────────────────────────────────────────┤
│  WHAT CHANGED (behavior tags: +added, =kept)     │
└──────────────────────────────────────────────────┘
```

---

## Tab 6: Quick Wins

Project-scoped GitHub task suggestions with copy-ready prompts.

```
┌──────────────────────────────────────────────────┐
│  [Generate Suggestions ▶]                        │
├──────────────────────────────────────────────────┤
│  TASK CARDS (one per suggestion)                 │
│  ┌──────────────────────────────────────────┐    │
│  │ 🧪 Task title                            │    │
│  │ Repo: owner/repo | ~15 min | Testing     │    │
│  │ ┌────────────────────────────────────┐   │    │
│  │ │ Copy-ready Claude Code prompt      │   │    │
│  │ └────────────────────────────────────┘   │    │
│  │ [Copy 📋]  [Run ▶] (extension only)     │    │
│  └──────────────────────────────────────────┘    │
└──────────────────────────────────────────────────┘
```

### Category colors
| Category | Background | Text |
|----------|-----------|------|
| Testing | `#DBEAFE` | `#1D4ED8` |
| Docs | `#D1FAE5` | `#065F46` |
| Refactor | `#FEF3C7` | `#92400E` |
| Bugfix | `#FEE2E2` | `#991B1B` |
| Feature | `#EDE9FE` | `#5B21B6` |

---

## Tab 7: Usage Dashboard

Two complementary views of the same JSONL-derived data, displayed in sequence: project-scoped usage pace and daily chart, then per-conversation analytics.

### Project Usage Section

```
┌──────────────────────────────────────────────────┐
│  PACE CARDS (today vs 7-day avg vs 30-day avg)   │
│  [Refresh ▶]                                     │
├──────────────────────────────────────────────────┤
│  DAILY TOKEN CHART (stacked bar, log scale)      │
│  4 datasets: output, input, cache create, read   │
└──────────────────────────────────────────────────┘
```

### Conversation Analytics Section

```
┌──────────────────────────────────────────────────┐
│  SUMMARY CARDS (4 across)                        │
│  Total Cost | Avg Cost/Conv | Avg Cost/Prompt    │
│  | Most Efficient Conversation                   │
├──────────────────────────────────────────────────┤
│  SCATTER CHARTS (3 side-by-side)                 │
│  Cost/Prompt vs Cache Hit Rate                   │
│  Cost/Prompt vs Output/Input Ratio               │
│  Fluency Score vs Cost/Prompt                    │
│  (markers colored red→amber→green by score)      │
├──────────────────────────────────────────────────┤
│  CONVERSATION DETAILS TABLE (sortable, paginated)│
│  Date | Project | Prompts | Tokens | Cost |      │
│  Tokens/Prompt | Cost/Prompt | Cache Hit |       │
│  Cache R/C | Out/In | Score                      │
│  [Show more]                                     │
└──────────────────────────────────────────────────┘
```

### Scatter chart color gradient

Markers use a continuous color gradient based on fluency score:
- **0–50**: Red (#DC2626) → Amber (#D97706)
- **50–100**: Amber (#D97706) → Green (#059669)

Implemented as `scoreColor(score)` — linear interpolation between three color stops.

---

## Shared UI Components

| Component | Description | Used in |
|-----------|-------------|---------|
| Score ring | SVG circle with animated `stroke-dashoffset` | Fluency Score, Optimizer, Config |
| Behavior bars | Horizontal bar + benchmark marker + color coding | Fluency Score |
| Stat cards | 4-column grid of label + large number + detail | Usage, Conversations, Config |
| Sparkline cards | Value + small Chart.js line chart (weekly data) | Conversations (agent metrics) |
| Maturity checklist | Weighted category cards with check/cross items | Config |
| Doughnut chart | Chart.js doughnut with HTML legend | Conversations (task types) |
| Task cards | Title, meta, prompt block, copy/run buttons | Quick Wins |
| Spinner | CSS-animated border spinner | All tabs during loading |
| Tab navigation | Horizontal tabs with active indicator | Page layout |

**Source:** `webapp/static/app.js`, `webapp/static/style.css`, `vscode-extension/media/app.js`, `vscode-extension/media/style.css`
