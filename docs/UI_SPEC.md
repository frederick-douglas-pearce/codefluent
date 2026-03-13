# CodeFluent — UI Specification

> **Frontend comfort: Moderate.** This spec is detailed enough to build from without redesigning. Copy-paste the HTML structure, tweak colors/spacing as needed.

---

## Design System

### Colors (CSS Custom Properties)
```css
:root {
  --bg-primary: #FAFAF9;
  --bg-card: #FFFFFF;
  --bg-hover: #F5F5F4;
  --text-primary: #1C1917;
  --text-secondary: #78716C;
  --text-muted: #A8A29E;
  --border: #E7E5E4;
  --accent: #D97706;
  --accent-light: #FEF3C7;
  --accent-dark: #B45309;
  --success: #059669;
  --success-light: #D1FAE5;
  --warning: #D97706;
  --warning-light: #FEF3C7;
  --danger: #DC2626;
  --danger-light: #FEE2E2;
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
  --shadow-md: 0 4px 6px rgba(0,0,0,0.07);
  --shadow-lg: 0 10px 15px rgba(0,0,0,0.1);
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
}
```

### Typography
```css
body {
  font-family: 'Inter', system-ui, -apple-system, sans-serif;
  font-size: 15px;
  line-height: 1.6;
  color: var(--text-primary);
  background: var(--bg-primary);
}
h1 { font-size: 28px; font-weight: 700; }
h2 { font-size: 20px; font-weight: 600; }
h3 { font-size: 16px; font-weight: 600; }
.label { font-size: 13px; font-weight: 500; color: var(--text-secondary); text-transform: uppercase; letter-spacing: 0.5px; }
.stat-number { font-size: 36px; font-weight: 700; font-variant-numeric: tabular-nums; }
```

### Spacing
Base unit: 8px. Use multiples: 4, 8, 12, 16, 24, 32, 48.

---

## Page Layout

```
┌─────────────────────────────────────────────────────┐
│  HEADER: Logo + Title + Plan Badge                  │
├──────┬──────┬──────┬──────┬─────────────────────────┤
│ Usage│Fluency│Quick │Recs  │                         │
│      │ Score │ Wins │      │                         │
├──────┴──────┴──────┴──────┘                         │
│                                                     │
│  ┌─────────────────────────────────────────────┐    │
│  │                                             │    │
│  │           ACTIVE TAB CONTENT                │    │
│  │           (scrollable)                      │    │
│  │                                             │    │
│  └─────────────────────────────────────────────┘    │
│                                                     │
│  FOOTER: "Powered by Anthropic Research" + links    │
└─────────────────────────────────────────────────────┘
```

### HTML Structure
```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>CodeFluent — Claude Code Self-Analyzer</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <link rel="stylesheet" href="/static/style.css">
</head>
<body>
  <div class="app">
    <header class="header">
      <div class="header-left">
        <h1 class="logo">⚡ CodeFluent</h1>
        <span class="subtitle">Claude Code Self-Analyzer</span>
      </div>
      <div class="header-right">
        <span class="plan-badge">Max 5x</span>
      </div>
    </header>

    <nav class="tabs">
      <button class="tab active" data-tab="usage">📊 Usage</button>
      <button class="tab" data-tab="fluency">🧠 Fluency Score</button>
      <button class="tab" data-tab="quickwins">🚀 Quick Wins</button>
      <button class="tab" data-tab="recommendations">💡 Recommendations</button>
    </nav>

    <main class="content">
      <div id="tab-usage" class="tab-panel active">...</div>
      <div id="tab-fluency" class="tab-panel">...</div>
      <div id="tab-quickwins" class="tab-panel">...</div>
      <div id="tab-recommendations" class="tab-panel">...</div>
    </main>

    <footer class="footer">
      Built on <a href="https://www.anthropic.com/research/AI-fluency-index">Anthropic's AI Fluency Research</a>
      · PDX Hacks 2026
    </footer>
  </div>
  <script src="/static/app.js"></script>
</body>
</html>
```

---

## Tab 1: Usage Dashboard

### Data Source
`/api/usage` → returns `{daily, monthly, session, blocks}` from ccusage.

Key fields per daily entry:
- `date` (string: "2025-12-28")
- `totalTokens` (int)
- `totalCost` (float, USD)
- `inputTokens`, `outputTokens`, `cacheCreationTokens`, `cacheReadTokens`
- `modelsUsed` (array of model name strings)
- `modelBreakdowns` (array with per-model token/cost)

### Layout
```
┌──────────────────────────────────────────────────┐
│  STAT CARDS ROW (4 across)                       │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │Total │ │Total │ │Days  │ │Models│           │
│  │Tokens│ │Cost  │ │Active│ │Used  │           │
│  │52.3M │ │$48.20│ │  38  │ │  3   │           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
├──────────────────────────────────────────────────┤
│  TOKEN USAGE CHART (line chart, from ccusage)    │
│  X-axis: daily.date                              │
│  Y-axis: daily.totalTokens                       │
│  ┌──────────────────────────────────────────┐    │
│  │  📈                                      │    │
│  │       ·  ·                               │    │
│  │    ·       ·   ·  ·                      │    │
│  │  ·           ·      ·  ·                 │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  COST TREND (bar chart, daily.totalCost)         │
│  ┌──────────────────────────────────────────┐    │
│  │  █  █     █ █                            │    │
│  │  █  █  █  █ █  █                         │    │
│  │  █  █  █  █ █  █  █                      │    │
│  └──────────────────────────────────────────┘    │
├──────────────────────────────────────────────────┤
│  MODEL USAGE BREAKDOWN (horizontal bar)          │
│  Computed from daily.modelBreakdowns aggregated  │
│  claude-opus-4-6      ████████████░░░░  65%      │
│  claude-opus-4-5      ████░░░░░░░░░░░░  25%      │
│  claude-sonnet-4      ██░░░░░░░░░░░░░░  10%      │
└──────────────────────────────────────────────────┘
```

### Chart.js — Daily Token Usage
```javascript
// data.daily is the ccusage daily array
const daily = usageData.daily?.daily || []

const ctx = document.getElementById('usage-chart').getContext('2d')
new Chart(ctx, {
  type: 'line',
  data: {
    labels: daily.map(d => d.date),
    datasets: [{
      label: 'Total Tokens',
      data: daily.map(d => d.totalTokens),
      borderColor: '#D97706',
      backgroundColor: 'rgba(217, 119, 6, 0.1)',
      fill: true,
      tension: 0.3
    }]
  },
  options: {
    responsive: true,
    plugins: {
      legend: { position: 'top' },
      tooltip: {
        callbacks: {
          label: ctx => `${formatTokens(ctx.raw)} tokens`
        }
      }
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: v => formatTokens(v)
        }
      }
    }
  }
})
```

### Chart.js — Daily Cost
```javascript
new Chart(document.getElementById('cost-chart').getContext('2d'), {
  type: 'bar',
  data: {
    labels: daily.map(d => d.date),
    datasets: [{
      label: 'Cost (USD)',
      data: daily.map(d => d.totalCost),
      backgroundColor: '#059669',
      borderRadius: 4,
    }]
  },
  options: {
    responsive: true,
    scales: {
      y: {
        beginAtZero: true,
        ticks: { callback: v => '$' + v.toFixed(2) }
      }
    }
  }
})
```

### Stat Card Component
```html
<div class="stat-card">
  <span class="label">Total Tokens</span>
  <span class="stat-number" id="stat-total-tokens">—</span>
  <span class="stat-detail" id="stat-total-detail">across N days</span>
</div>
```

Compute stats from ccusage daily data:
```javascript
const totalTokens = daily.reduce((sum, d) => sum + d.totalTokens, 0)
const totalCost = daily.reduce((sum, d) => sum + d.totalCost, 0)
const daysActive = daily.length
const allModels = new Set(daily.flatMap(d => d.modelsUsed))
```

---

## Tab 2: AI Fluency Score

### Data Source
`POST /api/score` with `{session_ids: [...]}` → returns scores + aggregate.

### Layout
```
┌──────────────────────────────────────────────────┐
│  SESSION SELECTOR                                │
│  ┌────────────────────────────────┐              │
│  │ Analyze last [5 ▾] sessions   │  [Run ▶]     │
│  └────────────────────────────────┘              │
├──────────────────────────────────────────────────┤
│  OVERALL SCORE (large, centered)                 │
│                                                  │
│              ┌─────────┐                         │
│              │   72    │                         │
│              │  /100   │                         │
│              │ "Good"  │                         │
│              └─────────┘                         │
│                                                  │
├──────────────────────────────────────────────────┤
│  FLUENCY BEHAVIORS (11 horizontal bars)          │
│                                                  │
│  Iteration & Refinement    ██████████████░  85%  │
│  Building on Responses     ████████████░░░  75%  │
│  Clarifying Goals          ██████████░░░░░  70%  │
│  (etc — all 11 behaviors with benchmark marks)   │
│                                                  │
│  Legend: ■ Your Score  ▪ Avg (Anthropic Data)    │
├──────────────────────────────────────────────────┤
│  CODING PATTERNS (donut chart)                   │
│                                                  │
│  Your Pattern Distribution:                      │
│  ┌─────────┐  Hybrid Code+Explanation  4 (40%)  │
│  │  🍩    │  Gen-Then-Comprehension   3 (30%)  │
│  │ chart  │  Conceptual Inquiry       2 (20%)  │
│  │        │  AI Delegation            1 (10%)  │
│  └─────────┘                                     │
│                                                  │
│  ✅ 90% high-quality interaction patterns        │
├──────────────────────────────────────────────────┤
│  SESSION BREAKDOWN (expandable list)             │
│  ▸ Session abc123 (Feb 27) — Score: 82          │
│  ▸ Session def456 (Feb 26) — Score: 65          │
└──────────────────────────────────────────────────┘
```

### Score Ring Component
```html
<div class="score-ring">
  <svg viewBox="0 0 120 120" class="score-svg">
    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--border)" stroke-width="8"/>
    <circle cx="60" cy="60" r="52" fill="none" stroke="var(--accent)" stroke-width="8"
      stroke-dasharray="326.73" stroke-dashoffset="91.48" stroke-linecap="round"
      transform="rotate(-90 60 60)" id="score-arc"/>
  </svg>
  <div class="score-text">
    <span class="score-value" id="score-number">—</span>
    <span class="score-label">/ 100</span>
  </div>
</div>
```

Dynamic offset:
```javascript
const circumference = 2 * Math.PI * 52 // 326.73
const offset = circumference * (1 - score / 100)
document.getElementById('score-arc').style.strokeDashoffset = offset
```

### Behavior Bar Component
```html
<div class="behavior-bar">
  <div class="behavior-label">
    <span class="behavior-name">Iteration & Refinement</span>
    <span class="behavior-pct">85%</span>
  </div>
  <div class="bar-track">
    <div class="bar-fill" style="width: 85%"></div>
    <div class="bar-benchmark" style="left: 85.7%" title="Anthropic avg: 85.7%"></div>
  </div>
</div>
```

Color coding:
- Green (`var(--success)`) if your score >= benchmark
- Amber (`var(--warning)`) if within 15pp
- Red (`var(--danger)`) if below benchmark by 15pp+

### Anthropic Benchmarks (for bar markers)
```javascript
const BENCHMARKS = {
  iteration_and_refinement: 0.857,
  building_on_responses: 0.75,
  clarifying_goals: 0.70,
  adjusting_approach: 0.60,
  questioning_reasoning: 0.40,
  providing_feedback: 0.35,
  specifying_format: 0.30,
  setting_interaction_terms: 0.30,
  checking_facts: 0.25,
  providing_examples: 0.25,
  identifying_missing_context: 0.20,
}
```

---

## Tab 3: Quick Wins

### Data Source
`GET /api/quickwins` → returns `{suggestions: [...]}`.

### Layout
```
┌──────────────────────────────────────────────────┐
│  [Generate Suggestions ▶]                        │
├──────────────────────────────────────────────────┤
│  SUGGESTED TASKS                                 │
│                                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ 🧪 Add unit tests to auth module         │    │
│  │ Repo: my-api-project                     │    │
│  │ Est: ~15 min | Category: Testing         │    │
│  │                                          │    │
│  │ Prompt:                                  │    │
│  │ ┌────────────────────────────────────┐   │    │
│  │ │ Write comprehensive unit tests for │   │    │
│  │ │ the auth module in src/auth/...    │   │    │
│  │ └────────────────────────────────────┘   │    │
│  │ [Copy Prompt 📋]                         │    │
│  └──────────────────────────────────────────┘    │
│  (repeat for each suggestion)                    │
└──────────────────────────────────────────────────┘
```

### Task Card
```html
<div class="task-card">
  <div class="task-header">
    <span class="task-icon">🧪</span>
    <span class="task-title">Add unit tests to auth module</span>
  </div>
  <div class="task-meta">
    <span class="task-repo">📂 my-api-project</span>
    <span class="task-time">⏱ ~15 min</span>
    <span class="task-category category-testing">Testing</span>
  </div>
  <div class="task-prompt">
    <pre class="prompt-text">Write comprehensive unit tests...</pre>
    <button class="copy-btn" onclick="copyPrompt(this)">📋 Copy</button>
  </div>
</div>
```

### Category Colors
```css
.category-testing { background: #DBEAFE; color: #1D4ED8; }
.category-docs { background: #D1FAE5; color: #065F46; }
.category-refactor { background: #FEF3C7; color: #92400E; }
.category-bugfix { background: #FEE2E2; color: #991B1B; }
.category-feature { background: #EDE9FE; color: #5B21B6; }
```

---

## Tab 4: Recommendations

### Layout
```
┌──────────────────────────────────────────────────┐
│  🎯 HIGH IMPACT                                  │
│  ┌──────────────────────────────────────────┐    │
│  │ Set Interaction Terms More Often          │    │
│  │ Only 15% of your sessions include...     │    │
│  │ 💡 Try: Add to CLAUDE.md...              │    │
│  │ Source: AI Fluency Index                  │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  🎯 MEDIUM IMPACT                                │
│  ┌──────────────────────────────────────────┐    │
│  │ Verify Claims After Code Generation       │    │
│  │ ...                                      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  ✅ YOU'RE DOING WELL                            │
│  ┌──────────────────────────────────────────┐    │
│  │ ✅ Iteration (85%) — above average       │    │
│  │ ✅ Building on responses (75%)           │    │
│  │ ✅ 90% high-quality coding patterns      │    │
│  └──────────────────────────────────────────┘    │
│                                                  │
│  RESEARCH SOURCES                                │
│  📄 AI Fluency Index (Feb 23, 2026)             │
│  📄 Coding Skills Formation (Jan 29, 2026)      │
│  📄 Claude Code Best Practices                   │
└──────────────────────────────────────────────────┘
```

Recommendations are generated from the scoring aggregate by comparing `behavior_prevalence` against the thresholds in TECHNICAL_SPEC.md.

---

## Tab 5: Usage Dashboard — Session Analytics (v0.3.0)

Below the ccusage token chart, the Usage tab includes a **Session Analytics** section that visualizes per-session token efficiency from parsed JSONL data.

### Layout
```
┌──────────────────────────────────────────────────┐
│  SESSION ANALYTICS HEADER                        │
├──────────────────────────────────────────────────┤
│  SUMMARY CARDS ROW (4 across)                    │
│  ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐           │
│  │Total │ │ Avg  │ │ Avg  │ │Most  │           │
│  │Cost  │ │Cost/ │ │Cost/ │ │Effic.│           │
│  │$48.20│ │Sess. │ │Prompt│ │Session│           │
│  └──────┘ └──────┘ └──────┘ └──────┘           │
├──────────────────────────────────────────────────┤
│  SCATTER CHARTS (3 side-by-side)                 │
│  ┌─────────────┐ ┌─────────────┐ ┌────────────┐│
│  │Cost/Prompt  │ │Cost/Prompt  │ │Fluency     ││
│  │vs Cache Hit │ │vs Out/In %  │ │vs Cost/    ││
│  │  ·  ·      │ │   ·   ·    │ │Prompt      ││
│  │ · ·  ·     │ │  ·  ·  ·   │ │ ·  ·  ·    ││
│  └─────────────┘ └─────────────┘ └────────────┘│
│  (markers colored red→amber→green by score)      │
├──────────────────────────────────────────────────┤
│  SESSION DETAILS TABLE (sortable)                │
│  Date | Project | Prompts | Tokens | Cost | ...  │
│  ─────┼─────────┼─────────┼────────┼──────┼───── │
│  3/12 │ myproj  │    15   │  250K  │$2.10 │ ...  │
│  3/11 │ other   │     8   │  120K  │$0.95 │ ...  │
│  [Show more]                                     │
└──────────────────────────────────────────────────┘
```

### Chart Color Gradient

Scatter chart markers use a continuous color gradient based on fluency score:
- **0–50%**: Red (#DC2626) → Amber (#D97706)
- **50–100%**: Amber (#D97706) → Green (#059669)

This maps to a function `scoreColor(score)` that interpolates between the three stops.

### Table Columns

| Column | Data | Sortable |
|--------|------|----------|
| Date | Session start date | Yes (default desc) |
| Project | Project short name | Yes |
| Prompts | User message count | Yes |
| Total Tokens | Sum of all token types | Yes |
| Cost | Estimated cost (USD) | Yes |
| Tokens/Prompt | total_tokens / prompts | Yes |
| Cost/Prompt | estimated_cost / prompts | Yes |
| Cache Hit | cache_read / (cache_read + cache_creation + input) | Yes |
| Cache R/C | cache_read / cache_creation ratio | Yes |
| Out/In | output / input ratio (shown as %) | Yes |
| Score | Fluency score (if scored) | Yes |

---

## Global CSS Components

### Tab Navigation
```css
.tabs {
  display: flex;
  gap: 4px;
  border-bottom: 2px solid var(--border);
  padding: 0 24px;
  background: var(--bg-card);
}
.tab {
  padding: 12px 20px;
  border: none;
  background: none;
  font-size: 14px;
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  transition: all 0.2s;
}
.tab:hover { color: var(--text-primary); background: var(--bg-hover); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
```

### Stat Cards Grid
```css
.stat-cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}
.stat-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  padding: 20px;
  box-shadow: var(--shadow-sm);
}
```

### Buttons
```css
.btn {
  padding: 10px 20px;
  border-radius: var(--radius-sm);
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
}
.btn-primary { background: var(--accent); color: white; }
.btn-primary:hover { background: var(--accent-dark); }
.btn-secondary {
  background: var(--bg-card);
  color: var(--text-primary);
  border: 1px solid var(--border);
}
```

### Spinner
```css
.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  margin: 0 auto;
}
@keyframes spin { to { transform: rotate(360deg); } }
```

### App Container
```css
.app {
  max-width: 1200px;
  margin: 0 auto;
  min-height: 100vh;
}
.content { padding: 24px; }
```

---

## JavaScript Architecture (`app.js`)

```javascript
// State
let state = {
  usage: null,
  sessions: null,
  scores: null,
  quickwins: null,
  activeTab: 'usage'
}

// Tab switching
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => switchTab(tab.dataset.tab))
})

function switchTab(tabName) {
  state.activeTab = tabName
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'))
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'))
  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active')
  document.getElementById(`tab-${tabName}`).classList.add('active')
}

// Data loading
async function loadData() {
  const [usage, sessions] = await Promise.all([
    fetch('/api/usage').then(r => r.json()),
    fetch('/api/sessions').then(r => r.json()),
  ])
  state.usage = usage
  state.sessions = sessions
  renderUsageDashboard()
}

// Scoring
async function runScoring(count) {
  showLoader('fluency')
  const ids = state.sessions.sessions.slice(0, count).map(s => s.id)
  const res = await fetch('/api/score', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ session_ids: ids })
  })
  state.scores = await res.json()
  renderFluencyScore()
}

// Quick Wins
async function loadQuickWins() {
  showLoader('quickwins')
  const res = await fetch('/api/quickwins')
  state.quickwins = await res.json()
  renderQuickWins()
}

// Helpers
function formatTokens(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M'
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'K'
  return n.toString()
}

function formatCost(n) {
  return '$' + n.toFixed(2)
}

function copyPrompt(btn) {
  const text = btn.previousElementSibling.textContent
  navigator.clipboard.writeText(text)
  btn.textContent = '✅ Copied!'
  setTimeout(() => btn.textContent = '📋 Copy', 2000)
}

function showLoader(tab) {
  document.getElementById(`tab-${tab}`).innerHTML =
    '<div class="scoring-loader"><div class="spinner"></div><p>Loading...</p></div>'
}

// Init
document.addEventListener('DOMContentLoaded', loadData)
```
