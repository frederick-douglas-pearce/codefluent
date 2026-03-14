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
│Fluency│Recomm.│Optim.│Quick │Usage │                │
│ Score │       │      │ Wins │      │                │
├──────┴────────┴──────┴──────┴──────┘                │
│                                                     │
│           ACTIVE TAB CONTENT                        │
│           (scrollable)                              │
│                                                     │
│  FOOTER: "Powered by Anthropic Research" + links    │
└─────────────────────────────────────────────────────┘
```

### Settings bar visibility

| Tab | Data Path | Project Dropdown |
|-----|-----------|-----------------|
| Fluency Score | Shown | Shown |
| Recommendations | Hidden | Hidden |
| Prompt Optimizer | Hidden | Shown |
| Quick Wins | Hidden | Shown |
| Usage | Hidden | Shown |

**Source:** `webapp/static/app.js` (settings bar toggle), `vscode-extension/media/app.js`

---

## Tab 1: Fluency Score

Scores user prompts against 11 fluency behaviors with benchmark comparisons.

```
┌──────────────────────────────────────────────────┐
│  SESSION SELECTOR                                │
│  Analyze last [5 ▾] sessions    [Run Scoring ▶]  │
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
│  SESSION BREAKDOWN (expandable per-session list) │
└──────────────────────────────────────────────────┘
```

### Behavior bar color logic
- Green (`--success`) if user score >= benchmark
- Amber (`--accent`) if within 15pp below benchmark
- Red (`--danger`) if 15pp+ below benchmark

Benchmark values are loaded from `shared/benchmarks.json`.

---

## Tab 2: Recommendations

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

## Tab 3: Prompt Optimizer

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

## Tab 4: Quick Wins

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

## Tab 5: Usage Dashboard

Two data sources displayed in sequence: ccusage all-projects data, then per-session analytics from JSONL parsing.

### All-Projects Section (ccusage)

```
┌──────────────────────────────────────────────────┐
│  PACE CARDS (today vs 7-day avg vs 30-day avg)   │
│  [Refresh ▶]                                     │
├──────────────────────────────────────────────────┤
│  DAILY TOKEN CHART (stacked bar, log scale)      │
│  4 datasets: output, input, cache create, read   │
└──────────────────────────────────────────────────┘
```

### Session Analytics Section

```
┌──────────────────────────────────────────────────┐
│  SUMMARY CARDS (4 across)                        │
│  Total Cost | Avg Cost/Session | Avg Cost/Prompt │
│  | Most Efficient Session                        │
├──────────────────────────────────────────────────┤
│  SCATTER CHARTS (3 side-by-side)                 │
│  Cost/Prompt vs Cache Hit Rate                   │
│  Cost/Prompt vs Output/Input Ratio               │
│  Fluency Score vs Cost/Prompt                    │
│  (markers colored red→amber→green by score)      │
├──────────────────────────────────────────────────┤
│  SESSION DETAILS TABLE (sortable, paginated)     │
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
| Score ring | SVG circle with animated `stroke-dashoffset` | Fluency Score, Optimizer |
| Behavior bars | Horizontal bar + benchmark marker + color coding | Fluency Score |
| Stat cards | 4-column grid of label + large number + detail | Usage, Session Analytics |
| Task cards | Title, meta, prompt block, copy/run buttons | Quick Wins |
| Spinner | CSS-animated border spinner | All tabs during loading |
| Tab navigation | Horizontal tabs with active indicator | Page layout |

**Source:** `webapp/static/app.js`, `webapp/static/style.css`, `vscode-extension/media/app.js`, `vscode-extension/media/style.css`
