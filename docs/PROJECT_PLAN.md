# CodeFluent — Project Plan

## Hackathon: PDX Hacks x AI Collective: Claude Hackathon
**Date:** Saturday, February 28, 2026 | Build window: 10:00 AM – 1:00 PM (2.5 hours)
**Builder:** Solo
**Stack:** Python 3.12.3 (FastAPI) + vanilla JS + Anthropic API
**Package manager:** `uv`
**Data sources:** `ccusage` (token/cost data) + custom JSONL prompt extractor (fluency scoring)

---

## One-Line Pitch

> "CodeFluent scores how well you use Claude Code — based on Anthropic's own AI Fluency research published 5 days ago — and tells you when you're leaving paid tokens on the table."

---

## What It Does

CodeFluent is a personal analytics dashboard for Claude Code power users. It:

1. **Ingests token/cost data** via `ccusage` — a proven community tool that already parses Claude Code session files
2. **Extracts user prompts** from local JSONL session files for AI fluency analysis
3. **Scores your AI fluency** against Anthropic's published 4D AI Fluency Framework (11 observable behaviors) and their 6 coding interaction patterns
4. **Tracks token utilization** across daily, weekly, and monthly windows — alerting when you're underusing your Max plan
5. **Suggests quick wins** from your actual GitHub repos when you have unused token capacity

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                        CodeFluent                            │
│                                                              │
│  ┌─────────────┐  ┌──────────────┐  ┌─────────────────────┐ │
│  │  ccusage     │  │  extract_    │  │  FastAPI Backend    │ │
│  │  (npm)       │  │  prompts.py  │  │  (main.py)          │ │
│  │  daily --json│  │              │  │                     │ │
│  └──────┬───────┘  └──────┬───────┘  └──────┬──────────────┘ │
│         │                 │                  │                │
│         ▼                 ▼                  ▼                │
│  data/ccusage/      data/prompts/     Anthropic API          │
│  ├─ daily.json      └─ sessions.json  (scoring)              │
│  ├─ monthly.json                            │                │
│  └─ session.json                      GitHub CLI             │
│                                       (quick wins)           │
│                                              │                │
│                                     ┌────────▼──────────┐    │
│                                     │  Frontend          │    │
│                                     │  (Vanilla JS/CSS)  │    │
│                                     └───────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Data Pipeline (Two Independent Paths)

**Path 1: Usage Data (zero custom code)**
```bash
npx ccusage daily --json > data/ccusage/daily.json
npx ccusage monthly --json > data/ccusage/monthly.json
npx ccusage session --json > data/ccusage/session.json
npx ccusage blocks --json > data/ccusage/blocks.json
```

**Path 2: Prompt Extraction (lightweight custom script)**
```bash
python extract_prompts.py
# Reads: ~/.claude/projects/*/*.jsonl
# Writes: data/prompts/sessions.json (session IDs + user prompts only)
```

### Component Breakdown

**1. `extract_prompts.py` — Lightweight JSONL Prompt Extractor**
- Reads JSONL files from `~/.claude/projects/`
- Extracts ONLY: session ID, project name, timestamps, user prompt text, tool names used, whether plan mode was used
- Does NOT parse tokens/costs (ccusage handles that)
- Outputs `data/prompts/sessions.json`

**2. FastAPI Backend (`main.py`)**
- `GET /api/usage` — Reads ccusage JSON files directly
- `GET /api/sessions` — Returns extracted prompt data
- `POST /api/score` — Sends selected session prompts to Anthropic API for AI Fluency scoring
- `GET /api/quickwins` — Calls `gh` CLI for repos/issues, sends to Anthropic API for task suggestions
- Serves static frontend files from `static/` directory

**3. Frontend (`static/index.html`, `static/app.js`, `static/style.css`)**
- Single-page app with 4 tab panels
- Tab 1: **Usage Dashboard** — Token consumption charts, cost tracking, model breakdown
- Tab 2: **AI Fluency Score** — Scorecard with 11 behavioral indicators, pattern classification
- Tab 3: **Quick Wins** — GitHub repo list with AI-suggested tasks when underutilizing
- Tab 4: **Recommendations** — Personalized best-practice tips based on scoring results
- Uses Chart.js (CDN) for visualizations
- Clean, Anthropic-inspired light theme

---

## Timeline — 2.5 Hour Build Plan

### Phase 1: Foundation (0:00 – 0:25) — 25 minutes
**Goal: Data pipeline working + FastAPI skeleton**

- [ ] Create project directory, `uv init`, install dependencies
- [ ] Run ccusage exports (4 commands → 4 JSON files)
- [ ] Write `extract_prompts.py` — JSONL prompt extractor
- [ ] Run against real data, verify `data/prompts/sessions.json` output
- [ ] Initialize FastAPI app with static file serving
- [ ] Verify `uvicorn main:app --reload` serves a hello world page

**Milestone check:** `data/` directory has ccusage JSON + extracted prompts ✓

### Phase 2: Backend API (0:25 – 0:50) — 25 minutes
**Goal: All API endpoints working**

- [ ] `GET /api/usage` — serve ccusage JSON data
- [ ] `GET /api/sessions` — serve extracted prompt data
- [ ] `POST /api/score` — Anthropic API integration for fluency scoring
- [ ] `GET /api/quickwins` — GitHub CLI integration
- [ ] Test all endpoints with curl

**Milestone check:** All endpoints return valid JSON ✓

### Phase 3: Frontend — Usage Dashboard (0:50 – 1:15) — 25 minutes
**Goal: Usage tab fully functional and visually polished**

- [ ] HTML structure with tab navigation
- [ ] CSS styling (Anthropic-inspired theme)
- [ ] Token usage line chart (daily trend from ccusage data)
- [ ] Monthly cost and model breakdown
- [ ] Recent sessions table
- [ ] "Underutilization alert" callout component

**Milestone check:** Usage tab looks great and shows real data ✓

### Phase 4: Frontend — AI Fluency Score (1:15 – 1:40) — 25 minutes
**Goal: Scoring tab functional with live API scoring**

- [ ] Session selector (choose N sessions to analyze)
- [ ] "Run Analysis" button → calls `/api/score`
- [ ] Loading state while scoring in progress
- [ ] Scorecard display: 11 behaviors with prevalence bars
- [ ] Interaction pattern classification with descriptions
- [ ] Overall fluency score (composite metric)

**Milestone check:** Can score real sessions and see results ✓

### Phase 5: Quick Wins + Polish (1:40 – 2:10) — 30 minutes
**Goal: Quick Wins tab working, overall polish pass**

- [ ] Quick Wins tab: repo list from GitHub
- [ ] AI-generated task suggestions per repo
- [ ] Recommendations tab: personalized tips
- [ ] Cross-tab polish: consistent styling, loading states, error handling
- [ ] Responsive layout check

**Milestone check:** All 4 tabs functional and polished ✓

### Phase 6: Demo Prep (2:10 – 2:30) — 20 minutes
**Goal: Ready for submission and potential demo**

- [ ] Full end-to-end walkthrough
- [ ] Fix any visual bugs
- [ ] Prepare demo flow (which tabs to show in what order)
- [ ] Take screenshots for submission
- [ ] Write submission description
- [ ] Practice 3-minute pitch once

**Milestone check:** Ready to submit and demo ✓

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| ccusage JSON format changes | We've already verified the exact format tonight; pin version |
| JSONL parsing misses some prompts | Prompt extractor is best-effort; a few missed prompts won't affect scoring |
| Anthropic API slow or rate limited | Pre-score 5+ sessions during build; cache results in `data/scores.json` |
| Frontend takes longer than expected | Usage Dashboard is highest priority — Quick Wins tab can show mock data |
| WiFi issues at venue | Run ccusage + extract_prompts before going; cache API responses |
| API key not working | Have backup plan to use cached/pre-scored data for demo |

## Priority Stack (If Running Behind)

1. **MUST HAVE:** Usage Dashboard with real ccusage data + charts
2. **MUST HAVE:** AI Fluency Scoring for at least 5 sessions
3. **SHOULD HAVE:** Quick Wins with live GitHub data
4. **NICE TO HAVE:** Recommendations tab with best-practices engine
5. **NICE TO HAVE:** Polish animations and transitions

---

## Pre-Hackathon Checklist (Tonight)

- [x] Confirm data directory exists: `~/.claude/projects/` with 2 project subdirectories
- [x] Confirm 117 JSONL session files available
- [x] Verify JSONL schema matches our parser (user prompts, token usage, timestamps)
- [x] Verify `gh` CLI is authenticated
- [x] Verify Python 3.12.3
- [x] Verify Node v22.18.0
- [x] Install and test ccusage: `npx ccusage@latest daily --json`
- [x] Verify `uv` installed
- [ ] Review ccusage daily output for any sensitive project names
- [ ] Run full ccusage exports and spot-check the JSON
- [ ] Create project directory:
  ```bash
  mkdir -p ~/codefluent && cd ~/codefluent
  uv init
  uv add fastapi uvicorn anthropic
  mkdir -p data/ccusage data/prompts static
  ```
- [ ] Copy plan files into project root
- [ ] Pre-generate ccusage data:
  ```bash
  npx ccusage@latest daily --json > data/ccusage/daily.json
  npx ccusage@latest monthly --json > data/ccusage/monthly.json
  npx ccusage@latest session --json -o desc > data/ccusage/session.json
  ```
- [ ] Have the Anthropic AI Fluency Index paper open in a browser tab
- [ ] Charge laptop fully

---

## Post-Hackathon Roadmap (Out of Scope for MVP)

- Swap API scoring for `claude` CLI — Use Max plan tokens instead of API credits
- Continuous monitoring daemon — Background process watching for new sessions
- VS Code extension — Show fluency score and utilization in the status bar
- Team mode — Aggregate and compare scores across a team
- Historical trend tracking — Track fluency score over weeks/months
- Export/share — Generate a PDF report of your fluency analysis
