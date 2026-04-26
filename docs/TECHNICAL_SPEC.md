# CodeFluent — Technical Specification

> Originally the implementation plan from PDX Hacks 2026. Now maintained as a concise architectural reference. For implementation details, see the source files referenced in each section.

## 1. Data Pipeline Overview

CodeFluent uses two independent data sources, both reading from the same JSONL session files:

| Concern | Source | How it works |
|---------|--------|--------------|
| All-projects token/cost data | [`ccusage`](https://github.com/ryoppippi/ccusage) (npm) | Aggregates daily, monthly, and per-session totals. Webapp stores results in `data/ccusage/`. Extension calls via IPC. **Planned for removal** (#251) — has known dedup bugs; being replaced by JSONL-derived data. |
| Per-conversation prompts + token analytics | JSONL parser + conversation assembly | Parses `~/.claude/projects/*.jsonl`, assembles conversations via gap-based splitting. Extension: `parser.ts` + `conversation.ts` + `analytics.ts`. Webapp: `extract_prompts.py` + `conversations.py`. |
| Agent behavior metrics | Computed from parsed conversations | Tool diversity, plan mode adoption, cache hit rate, thinking utilization. Extension: `agentMetrics.ts`. Webapp: `agent_metrics.py`. |
| Task classification | Heuristic (branch prefix + keyword regex) | Classifies conversations into 8 categories. Extension: `taskClassification.ts`. Webapp: `task_classification.py`. |
| Configuration maturity | .claude/ directory scanner | Scans hooks, rules, commands, skills, MCP, CLAUDE.md, permissions. Extension: `configScanner.ts`. Webapp: `config_scanner.py`. |
| Enforcement gaps | CLAUDE.md + hook cross-reference | Detects advisory-vs-programmatic gaps. Extension: `enforcementGaps.ts`. Webapp: `enforcement_gaps.py`. |

Both interfaces parse JSONL directly on demand — there is no pre-generated intermediate file.

---

## 2. ccusage Integration (Deprecated — Planned Removal)

> **Status:** Planned for removal in v1.2 (#251). ccusage has known token counting bugs (see below) and doesn't support project-level scoping. Being replaced by JSONL-derived data using the same parser as Conversation Analytics.

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

### Known ccusage issues (as of April 2026)

| Issue | Impact | Source |
|-------|--------|--------|
| First-wins dedup | Under-reports `output_tokens` by ~2.7x — keeps first streaming snapshot (partial count) instead of last (final count) | ryoppippi/ccusage#938 |
| No subagent filtering | Over-counts by ~2x when `/btw` sidechains re-log conversation history | ryoppippi/ccusage#913, #806 |
| No project scoping | Reports across all projects — can't filter to current workspace | #251 |
| No `isSidechain` handling | Schema ignores the `isSidechain` flag entirely | Source code review |

These bugs partially cancel out, but the net result is unreliable totals.

**Source:** `webapp/main.py` (usage endpoints), `vscode-extension/src/usage.ts`

---

## 3. JSONL Session Parsing

Both interfaces parse Claude Code session files from `~/.claude/projects/`. See [`SESSION_DATA.md`](SESSION_DATA.md) for the full JSONL format, message types, and scoring scope.

### Key parsing decisions

- **Sidechain filtering** — Sessions with `isSidechain: true` are excluded (AI-generated prompts, not human input)
- **Content format** — `message.content` can be a string or array of content blocks; parsers handle both
- **System command filtering** — All slash commands (`<command-name>/...`) are filtered from user prompts and message counts. `/clear` forces a conversation boundary.
- **Custom command tracking** — Custom commands/skills (e.g., `/rebuild`, `/review-labels`) are tracked in `commands_used` on each conversation, separate from system commands (`/clear`, `/compact`, etc.)
- **Interrupted prompts** — Messages containing only `[Request interrupted by user for tool use]` are skipped
- **Prompt truncation** — User prompts are capped at 2000 characters for scoring
- **Token deduplication** — Assistant messages are deduplicated by `message.id` (streaming snapshots share the same ID). Highest `output_tokens` per ID is kept. See [`SESSION_DATA.md`](SESSION_DATA.md#streaming-deduplication-critical) for details.
- **Subagent token inclusion** — Subagent sessions (`isSidechain: true`) are excluded from behavioral metrics but their token usage is scanned separately and attributed to the parent conversation via `sessionId` linkage
- **UUID subdirectories** — Parser handles both flat `.jsonl` files and UUID-based subdirectory structures
- **Anti-pattern detection** — Structured output anti-pattern (e.g., "output as JSON") is detected via 9 regex patterns and flagged on each conversation

**Source:** `webapp/extract_prompts.py`, `vscode-extension/src/parser.ts`, `vscode-extension/src/analytics.ts`

---

## 4. AI Fluency Scoring

### Scoring flow

1. User selects conversations to score
2. Backend loads prompts (up to 20 per conversation, max 2000 chars each) and conversation metadata (plan mode, thinking count, tools used)
3. Prompts are sent to Claude Sonnet (`claude-sonnet-4-6`, `temperature: 0`) using a versioned scoring prompt template
4. Response is parsed for: 11 boolean fluency behaviors, coding interaction pattern, overall score (0–100), one-line summary
5. Results are cached (keyed by conversation ID + prompt version) to avoid re-scoring
6. Aggregate metrics are computed across all scored conversations

### Prompt versioning

Scoring prompts are managed as versioned template files under `shared/prompts/` with a registry (`shared/prompts/registry.json`). Both interfaces load prompts from these shared files. Cache entries are stamped with the prompt version and invalidated when the version changes. See [`CLAUDE.md`](../CLAUDE.md) for template syntax and placeholder details.

### CLAUDE.md config scoring

The user's project `CLAUDE.md` is scored against 3 eligible meta-interaction behaviors (`setting_interaction_terms`, `identifying_missing_context`, `questioning_reasoning`). The remaining 8 task-specific behaviors are always `false` for config. Results are merged via `effective_behavior = session_behavior OR (config_eligible AND config_behavior)`, enforced by a `CONFIG_ELIGIBLE_BEHAVIORS` constant in both TypeScript and Python (defense-in-depth with the prompt). Config scores are cached by content hash and invalidated when the file or prompt version changes.

### Score aggregation

`compute_aggregate()` produces:
- **Behavior prevalence** — fraction of conversations exhibiting each behavior (0–1)
- **Pattern distribution** — count of each coding interaction pattern
- **Average score** — mean of per-conversation overall scores

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

## 7. Conversation Token Analytics

### Overview

The Usage tab includes a **Conversation Analytics** section that aggregates per-conversation token usage from parsed JSONL data and provides cost-efficiency insights. Conversations are assembled via gap-based splitting (see `conversation.ts` / `conversations.py`).

### Data flow

Token data comes from `type: "assistant"` messages in JSONL session files (see [`SESSION_DATA.md`](SESSION_DATA.md#token-usage-data-for-conversation-analytics)). Messages are **deduplicated by `message.id`** (streaming snapshots share the same ID; highest `output_tokens` wins) then summed per conversation. Subagent tokens from `<session-uuid>/subagents/` are scanned separately and added to parent conversations. Cost estimates use model-specific pricing from `shared/pricing.json`.

| Component | Extension | Webapp |
|-----------|-----------|--------|
| Token aggregation | `analytics.ts` → `getConversationAnalytics()` IPC | `conversations.py` → `assemble_conversations()` |
| Pricing lookup | `pricing.ts` (reads `shared/pricing.json`) | `main.py` (inline, reads `shared/pricing.json`) |
| Frontend rendering | `media/app.js` → `loadConversationAnalytics()` | `static/app.js` → `loadConversationAnalytics()` |

### Derived metrics

For each conversation:
- **Total tokens** — sum of input + output + cache creation + cache read
- **Estimated cost** — tokens × model-specific rates from `pricing.json`
- **Cache hit rate** — `cache_read / (cache_read + cache_creation + input)` (0–1)
- **Cache R/C ratio** — `cache_read / cache_creation` (higher = better reuse)
- **Output/Input ratio** — `output / input` (higher = more output per fresh input)
- **Cost per prompt** — `estimated_cost / prompt_count`
- **Tokens per prompt** — `total_tokens / prompt_count`

Note: `prompt_count` counts only `type: "user"` messages with actual prompt content, excluding `tool_result` messages that Claude Code auto-generates.

### UI components

1. **Summary cards** — Total cost, avg cost/conversation, avg cost/prompt, most efficient conversation
2. **Scatter charts** — 3 Chart.js scatter plots with continuous red → amber → green color gradient based on fluency score:
   - Cost/Prompt vs Cache Hit Rate
   - Cost/Prompt vs Output/Input Ratio
   - Fluency Score vs Cost/Prompt
3. **Conversation details table** — Sortable columns: date, project, prompts, total tokens, cost, tokens/prompt, cost/prompt, cache hit, cache R/C, out/in, score

### Project filtering

Both interfaces support filtering conversation analytics by project. The webapp uses the project dropdown; the extension uses the workspace context.

**Source:** `vscode-extension/src/analytics.ts`, `vscode-extension/src/pricing.ts`, `shared/pricing.json`

---

## 8. Agent Behavior Metrics

Computed metrics derived from conversation metadata — zero API cost, pure aggregation.

### Metric definitions

| Metric | Formula | Range |
|--------|---------|-------|
| Tool diversity index | unique_tools / tool_use_count | 0–1 |
| Plan mode adoption rate | conversations_with_plan / total_conversations | 0–1 |
| Avg cache hit rate | mean(per-conversation cache_hit_rate) | 0–1 |
| Thinking utilization rate | thinking_count / assistant_message_count | 0–1 |

### Weekly aggregation

Metrics are computed per ISO week for sparkline trend visualization. Weekly data points enable the frontend to render 4 Chart.js sparkline charts showing metric trends over time.

**Source:** `vscode-extension/src/agentMetrics.ts`, `webapp/agent_metrics.py`

---

## 8b. Error Recovery Detection

Heuristic detection of error-recovery patterns within conversations. Analyzes tool_use/tool_result message sequences to identify when errors occur and how effectively they are resolved.

### How it works

1. **Error detection** — `tool_result` blocks (embedded in `user`-type messages) with `is_error: true` are identified. The `tool_use_id` field links each error back to the originating tool via the assistant message's `tool_use` block IDs.
2. **Resolution scanning** — For each error, scan forward up to 20 messages for the next successful `tool_result` (one without `is_error`).
3. **Strategy categorization** — Each recovery is classified:
   - `retry_same_tool` — the successful result uses the same tool name as the error
   - `switch_tool` — a different tool succeeds
   - `user_intervention` — a user message with content appears between the error and resolution

### Metrics

| Metric | Scope | Description |
|--------|-------|-------------|
| `error_count` | Per-conversation | Total tool errors detected |
| `recovery_count` | Per-conversation | Errors followed by successful resolution within window |
| `avg_failure_to_resolution_turns` | Per-conversation | Mean messages between error and resolution |
| `recovery_strategy_diversity` | Per-conversation | Unique strategies / recovery count (0–1) |
| `error_tools` | Per-conversation | Tool names that produced errors |
| `recovery_rate` | Aggregate | Total recoveries / total errors across conversations |
| `insufficient_data` | Aggregate | Boolean hint when fewer than 5 conversations have errors |

### Aggregate and weekly

Aggregate metrics (`computeErrorRecoveryMetrics`) sum across conversations. Weekly breakdown (`computeWeeklyErrorRecovery`) groups by ISO week. The `insufficient_data` flag is a frontend hint — metrics are always computed and returned regardless.

**Source:** `vscode-extension/src/errorRecovery.ts`, `webapp/error_recovery.py`

---

## 9. Task Classification (Heuristic)

Conversations are classified into 8 task types using a two-layer heuristic approach.

### Classification priority

1. **Branch prefix mapping** (highest priority) — matches `feature/*`, `fix/*`, `refactor/*`, `test/*`, `docs/*`, `chore/*`, `debug/*`, `explore/*` to their respective categories
2. **Keyword regex** (fallback) — scans the first 3 user prompts for category-specific keywords

### Categories

`feature`, `bug_fix`, `refactor`, `debug`, `test`, `docs`, `chore`, `exploration`

The `heuristic_task_type` field is set on each `ParsedConversation`. When neither branch prefix nor keywords match, the value is `null` (displayed as "Unclassified" in the UI).

**Source:** `vscode-extension/src/taskClassification.ts`, `webapp/task_classification.py`

---

## 10. Configuration Maturity Scanner

Scans the `.claude/` directory hierarchy for configuration artifacts and computes a maturity score.

### Scan targets

| Category | Points | What it checks |
|----------|--------|---------------|
| CLAUDE.md | 20 | Present at project root, `.claude/`, or `~/.claude/`; multiple locations; `@import` usage |
| Hooks | 20 | `settings.json` hooks configured; multiple event types; file matchers |
| Rules | 15 | `.claude/rules/*.md` file count; path scoping via `globs` frontmatter |
| Commands | 10 | `.claude/commands/*.md` file count |
| MCP | 10 | `.mcp.json`, `~/.claude.json` top-level mcpServers, `~/.claude.json` project-level mcpServers |
| Skills | 10 | `.claude/skills/` subdirectory count; frontmatter detection |
| Permissions | 5 | `settings.local.json` permissions key |
| Enforcement | 10 | Proportional to enforcement gap coverage (see §11) |

### Tier thresholds

| Tier | Score Range |
|------|------------|
| Beginner | 0–24 |
| Intermediate | 25–49 |
| Advanced | 50–74 |
| Expert | 75–100 |

**Source:** `vscode-extension/src/configScanner.ts`, `webapp/config_scanner.py`

---

## 11. Enforcement Gap Detection

Cross-references CLAUDE.md enforcement language against hook configuration to identify rules that lack programmatic enforcement.

### Algorithm

1. **Extract enforcement statements** — scan CLAUDE.md for sentences containing enforcement keywords (always, never, must, required, shall, etc.)
2. **Extract hook commands** — collect `command` and `prompt` text from all configured hooks in `settings.json`
3. **Keyword overlap matching** — for each enforcement statement, extract meaningful keywords (stop-word removal + basic stemming), then check if any hook command shares 2+ keywords (1 for statements with ≤3 keywords)
4. **Coverage scoring** — `covered_statements / total_statements` feeds into the maturity score's Enforcement category (10 pts)

### Severity assignment

- **High** — enforcement language with strong imperative (must, always, never, required)
- **Medium** — softer enforcement (should, prefer, recommend)

**Source:** `vscode-extension/src/enforcementGaps.ts`, `webapp/enforcement_gaps.py`

---

## 12. Configuration Advisor

LLM-generated hook configurations from enforcement gaps.

### Flow

1. User clicks "Generate Hook Config" on an enforcement gap
2. Backend sends the enforcement statement + suggested hook event to Claude via the `config_advisor/v1.0.md` prompt template
3. Claude returns: explanation of why the hook helps, JSON hook configuration, and apply instructions
4. Response is cached by statement + event + prompt version
5. Frontend renders the result inline with a "Copy JSON" button

Rate-limited alongside scoring/optimizer endpoints (10 req/min).

**Source:** `shared/prompts/config_advisor/v1.0.md`, `vscode-extension/src/cache.ts`, `webapp/main.py`
