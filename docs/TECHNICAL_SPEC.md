# CodeFluent — Technical Specification

> Originally the implementation plan from PDX Hacks 2026. Now maintained as a concise architectural reference. For implementation details, see the source files referenced in each section.

## 1. Data Pipeline Overview

CodeFluent uses two independent data sources, both reading from the same JSONL session files:

| Concern | Source | How it works |
|---------|--------|--------------|
| All-projects token/cost data | [`ccusage`](https://github.com/ryoppippi/ccusage) (npm) | Aggregates daily, monthly, and per-session totals. Webapp stores results in `data/ccusage/`. Extension calls via IPC. |
| Session prompts + per-session token analytics | JSONL parser | Parses `~/.claude/projects/*.jsonl` on demand. Extension: `parser.ts` + `analytics.ts`. Webapp: `extract_prompts.py` → `get_all_sessions()`. |

Both interfaces parse JSONL directly on demand — there is no pre-generated intermediate file.

---

## 2. ccusage Integration

The webapp fetches three ccusage data types on demand via `/api/usage/refresh`:

```
npx ccusage@latest daily --json
npx ccusage@latest monthly --json
npx ccusage@latest session --json -o desc
```

Results are stored in `data/ccusage/{daily,monthly,session}.json` and served directly via `GET /api/usage`. The extension calls `ccusage` through its IPC bridge (`usage.ts`).

### ccusage JSON Schema

Each data type returns arrays with the same structure (grouped by day, month, or session):

| Field | Type | Description |
|-------|------|-------------|
| `inputTokens` | number | Fresh input tokens |
| `outputTokens` | number | Output tokens |
| `cacheCreationTokens` | number | Tokens written to cache |
| `cacheReadTokens` | number | Tokens read from cache |
| `totalTokens` | number | Sum of all token types |
| `totalCost` | number | USD cost estimate |
| `modelsUsed` | string[] | Model IDs used in period |
| `modelBreakdowns` | object[] | Per-model token/cost split |

**Source:** `webapp/main.py` (usage endpoints), `vscode-extension/src/usage.ts`

---

## 3. JSONL Session Parsing

Both interfaces parse Claude Code session files from `~/.claude/projects/`. See [`SESSION_DATA.md`](SESSION_DATA.md) for the full JSONL format, message types, and scoring scope.

### Key parsing decisions

- **Sidechain filtering** — Sessions with `isSidechain: true` are excluded (AI-generated prompts, not human input)
- **Content format** — `message.content` can be a string or array of content blocks; parsers handle both
- **Interrupted prompts** — Messages containing only `[Request interrupted by user for tool use]` are skipped
- **Prompt truncation** — User prompts are capped at 2000 characters for scoring
- **Token aggregation** — Assistant message `usage` blocks are summed per session for cost estimation
- **UUID subdirectories** — Parser handles both flat `.jsonl` files and UUID-based subdirectory structures

**Source:** `webapp/extract_prompts.py`, `vscode-extension/src/parser.ts`, `vscode-extension/src/analytics.ts`

---

## 4. AI Fluency Scoring

### Scoring flow

1. User selects sessions to score
2. Backend loads prompts (up to 20 per session, max 2000 chars each) and session metadata (plan mode, thinking count, tools used)
3. Prompts are sent to Claude Sonnet (`claude-sonnet-4-20250514`) using a versioned scoring prompt template
4. Response is parsed for: 11 boolean fluency behaviors, coding interaction pattern, overall score (0–100), one-line summary
5. Results are cached (keyed by session ID + prompt version) to avoid re-scoring
6. Aggregate metrics are computed across all scored sessions

### Prompt versioning

Scoring prompts are managed as versioned template files under `shared/prompts/` with a registry (`shared/prompts/registry.json`). Both interfaces load prompts from these shared files. Cache entries are stamped with the prompt version and invalidated when the version changes. See [`CLAUDE.md`](../CLAUDE.md) for template syntax and placeholder details.

### CLAUDE.md config scoring

The user's project `CLAUDE.md` is scored separately against the same 11 behaviors. Results are merged via `effective_behavior = session_behavior OR config_behavior`, giving users credit for behaviors encoded as project conventions. Config scores are cached by content hash and invalidated when the file changes.

### Score aggregation

`compute_aggregate()` produces:
- **Behavior prevalence** — fraction of sessions exhibiting each behavior (0–1)
- **Pattern distribution** — count of each coding interaction pattern
- **Average score** — mean of per-session overall scores

**Source:** `vscode-extension/src/scoring.ts`, `webapp/main.py` (scoring endpoints), `shared/prompts/`

---

## 5. Benchmark Values

From Anthropic's [AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) (Feb 2026), population-level prevalence:

| Behavior | Avg Prevalence | Notes |
|----------|---------------|-------|
| iteration_and_refinement | 85.7% | Most common behavior |
| building_on_responses | ~75% | |
| clarifying_goals | ~70% | +14.7pp when creating artifacts |
| adjusting_approach | ~60% | |
| questioning_reasoning | ~40% | -3.1pp when creating artifacts |
| providing_feedback | ~35% | |
| specifying_format | ~30% | |
| checking_facts | ~25% | -3.7pp when creating artifacts |
| setting_interaction_terms | ~30% | Least common |
| providing_examples | ~25% | |
| identifying_missing_context | ~20% | -5.2pp when creating artifacts |

These values are stored in `shared/benchmarks.json` and used in the frontend to render benchmark markers on behavior bars and to trigger recommendations.

---

## 6. Recommendations Engine

Recommendations are generated entirely in the frontend (no backend endpoint). Each behavior and coding pattern has a hardcoded recommendation with impact level (high/medium), title, advice, action, and research citation.

### How recommendations trigger

1. The frontend compares the user's `behavior_prevalence` against the corresponding benchmark value from `shared/benchmarks.json`
2. Behaviors where the user scores **below the benchmark** generate a recommendation
3. Low-quality coding patterns (`ai_delegation`, `progressive_ai_reliance`, `iterative_ai_debugging`) also trigger pattern-specific recommendations
4. Recommendations are sorted by impact (high first) and displayed with coaching advice

### Coding interaction patterns

From Anthropic's [Coding Skills Formation](https://www.anthropic.com/research/coding-skill-formation) study (Jan 2026):

| Pattern | Quality | Description |
|---------|---------|-------------|
| conceptual_inquiry | High (65%+) | Asks conceptual questions, codes manually |
| generation_then_comprehension | High | Generates code, then asks follow-ups to understand |
| hybrid_code_explanation | High | Requests code + explanations simultaneously |
| ai_delegation | Low (<40%) | Entirely delegates with minimal engagement |
| progressive_ai_reliance | Low | Starts engaged, gradually offloads |
| iterative_ai_debugging | Low | Uses AI to debug without understanding |

**Source:** `vscode-extension/media/app.js` (`RECOMMENDATIONS`, `PATTERN_RECOMMENDATIONS`), `webapp/static/app.js` (same objects), `shared/benchmarks.json`

---

## 7. Session Token Analytics

### Overview

The Usage tab includes a **Session Analytics** section that aggregates per-session token usage from parsed JSONL data and provides cost-efficiency insights.

### Data flow

Token data comes from `type: "assistant"` messages in JSONL session files (see [`SESSION_DATA.md`](SESSION_DATA.md#token-usage-data-for-session-analytics)). These are summed per session. Cost estimates use model-specific pricing from `shared/pricing.json`.

| Component | Extension | Webapp |
|-----------|-----------|--------|
| Token aggregation | `analytics.ts` → `getSessionAnalytics()` IPC | `extract_prompts.py` → `get_all_sessions()` |
| Pricing lookup | `pricing.ts` (reads `shared/pricing.json`) | `main.py` (inline, reads `shared/pricing.json`) |
| Frontend rendering | `media/app.js` → `loadSessionAnalytics()` | `static/app.js` → `loadSessionAnalytics()` |

### Derived metrics

For each session:
- **Total tokens** — sum of input + output + cache creation + cache read
- **Estimated cost** — tokens × model-specific rates from `pricing.json`
- **Cache hit rate** — `cache_read / (cache_read + cache_creation + input)` (0–1)
- **Cache R/C ratio** — `cache_read / cache_creation` (higher = better reuse)
- **Output/Input ratio** — `output / input` (higher = more output per fresh input)
- **Cost per prompt** — `estimated_cost / user_message_count`
- **Tokens per prompt** — `total_tokens / user_message_count`

### UI components

1. **Summary cards** — Total cost, avg cost/session, avg cost/prompt, most efficient session
2. **Scatter charts** — 3 Chart.js scatter plots with continuous red → amber → green color gradient based on fluency score:
   - Cost/Prompt vs Cache Hit Rate
   - Cost/Prompt vs Output/Input Ratio
   - Fluency Score vs Cost/Prompt
3. **Session details table** — Sortable columns: date, project, prompts, total tokens, cost, tokens/prompt, cost/prompt, cache hit, cache R/C, out/in, score

### Project filtering

Both interfaces support filtering session analytics by project. The webapp uses the project dropdown; the extension uses the workspace context.

**Source:** `vscode-extension/src/analytics.ts`, `vscode-extension/src/pricing.ts`, `shared/pricing.json`
