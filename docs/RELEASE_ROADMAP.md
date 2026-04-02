# Release Roadmap

## Overview

CodeFluent v1.0.x established conversation-based analytics, 11 fluency behaviors, config scoring, prompt optimizer, and an eval framework. This roadmap defines the feature expansion plan derived from three research documents:

- [`NEW_METRICS_RESEARCH.md`](./NEW_METRICS_RESEARCH.md) — Agent behavior metrics, GitHub outcome metrics, novel scoring dimensions
- [`TASK_CLASSIFICATION_RESEARCH.md`](./TASK_CLASSIFICATION_RESEARCH.md) — 8-category task taxonomy, heuristic + LLM classification
- [`CCA_FEATURE_RESEARCH.md`](./CCA_FEATURE_RESEARCH.md) — CCA-F exam alignment, 3-category scoring expansion, 14 proposed features

The ~40 proposed features consolidate to ~28 unique capabilities across 7 epics, mapped to 4 releases.

---

## Overlap Consolidation

Features from different research docs that describe the same underlying capability are unified:

| Concept | NEW_METRICS | CCA_FEATURE | Unified Approach |
|---|---|---|---|
| Tool diversity | Phase 1 ratio | Agentic pattern detection | Start as ratio in Epic 1; deepen with patterns in Epic 5 |
| Plan mode | Adoption rate | CCA readiness signal | Compute in Epic 1; feed into radar in Epic 5 |
| Cache utilization | Per-conv metric | Operational discipline | Compute in Epic 1; contextualize in Epic 5 |
| Extended thinking | Utilization rate | ROI analysis | Rate in Epic 1; ROI in Epic 5 |
| Context efficiency | Conversation management | Context efficiency scoring | Unified in Epic 5 under CCA framing |
| Error recovery | Interaction metric | Operational discipline | Unified in Epic 4 as interaction quality |
| Model selection | Deferred | Cost insight | Display-only insight in Epic 5; never scored |
| CLAUDE.md scoring | Implicit in config | Explicit maturity score | Unified in Epic 3 extending existing config scoring |

---

## Epic Definitions

### Epic 1: Conversations Tab + Computed Agent Metrics

**Theme:** Surface conversation-level insights from data we already have.

**Why first:** Issue #133 has been waiting since v1.0. Foundation work (ParsedConversation, analytics, scoring) is complete. Agent metrics are pure computation over existing fields — zero API cost, zero risk.

**Deliverables:**

- **Conversations tab** (6th tab) — #133
  - List view: sortable table (date, project, prompts, tokens, cost, cache%, pattern, score)
  - Detail view: click row to expand (metadata, user prompts, tools used, behavior breakdown)
  - Tier 1 charts: gap distribution histogram, conversations/week, length distribution, duration distribution
  - Tier 2 charts: avg length trend, cross-project comparison
  - Project filtering (same as Usage tab)
- **Agent metrics module** — new `agentMetrics.ts` / `agent_metrics.py`
  - `tool_diversity_index`: unique_tools / tool_use_count (0-1)
  - `plan_mode_adoption_rate`: conversations_with_plan / total (0-1)
  - `avg_cache_hit_rate`: mean per-conversation cache_hit_rate (0-1)
  - `thinking_utilization_rate`: thinking_count / assistant_message_count
  - `prompt_conciseness`: avg user prompt length relative to conversation
  - Display as cards/gauges, weekly trend sparklines
- **API changes:** preserve user_prompts/tools_used in detail responses; new endpoints
- **Both interfaces** (VS Code extension + webapp)

**Size:** Medium

**Dependencies:** None

---

### Epic 2: Task Classification

**Theme:** Foundational capability for normalizing all future metrics.

**Deliverables:**

- **Phase A — Heuristic layer** (zero API cost)
  - New `taskClassification.ts` / `task_classification.py` module
  - Branch name parsing: `feature/*` → `feature`, `fix/*` → `bug_fix`, etc.
  - Keyword regex on first 2-3 user prompts
  - `heuristic_task_type` field on `ParsedConversation`
  - Task type distribution display (chart)
- **Phase B — LLM classification** (near-zero incremental cost)
  - New scoring prompt `scoring/v2.0.md` with `task_type`, `task_type_confidence` fields
  - 3-5 few-shot examples per category
  - Golden set expanded with `expected_task_type` annotations
  - `task_type_agreement` eval check (target Kappa ≥ 0.7)
  - `task_type` cached in `ScoreResult`

**8 categories:** `feature`, `bug_fix`, `refactor`, `debug`, `test`, `docs`, `chore`, `exploration`

**Size:** Medium

**Dependencies:** None (but enables Epic 4's normalization)

---

### Epic 3: Configuration Maturity (.claude/ Scanner)

**Theme:** Extend config scoring to match CCA's emphasis on architectural configuration.

**Deliverables:**

- **.claude/ directory scanner** — #158
  - Detect: `rules/`, `commands/`, `skills/` (counts, frontmatter, path-scoping)
  - Detect: hook configuration in `settings.json` (count, event types, handler types)
  - Detect: CLAUDE.md placement, `@import` usage
  - Output: `ConfigurationMaturity` structured assessment
- **Advisory-vs-programmatic gap detection** — #159
  - Scan CLAUDE.md + user prompts for enforcement language
  - Cross-reference against hook configuration
- **Configuration maturity display** — maturity score/checklist with actionable suggestions
- **Simplified Configuration Advisor** — #161 (Phase 1: display gaps + explanations)
- **Structured output anti-pattern detection** — detect "output as JSON" in prompts

**Size:** Medium

**Dependencies:** None

---

### Epic 4: Interaction Quality Metrics

**Theme:** Deeper interaction patterns via heuristics + LLM judgment.

**Deliverables:**

- **Error recovery pattern detection**
  - Heuristic: detect error/failure states in conversation flow
  - Recovery strategy diversity scoring
  - `failure_to_resolution_turns` metric
- **Verification behavior detection**
  - Tool sequence analysis: Read/Grep after Edit, Bash test commands before commit
  - `test_before_commit_rate`, `review_before_accept_rate`
- **Learning trajectory formalization**
  - Score trend formalized as computed metric
  - Behavior acquisition curve
- **Task-type normalization**
  - Per-task-type expected ranges for Epic 1 metrics
  - Contextual display showing user vs. task-type norms

**Size:** Large

**Dependencies:** Epic 1 (metrics to normalize), Epic 2 (task types for normalization)

---

### Epic 5: CCA Scoring Dimensions

**Theme:** Expand from 1 scoring dimension to 3, with CCA readiness visualization.

**Deliverables:**

- **CCA Readiness Radar Chart**
  - 5-axis: Prompt Engineering, Claude Code Config, Agentic Architecture, Tool Design & MCP, Context Management
  - Aggregation mapping existing scores + Epic 1 metrics + Epic 3 maturity
  - Chart.js radar chart
- **Agentic pattern detection** (deeper than Epic 1)
  - Tool orchestration patterns (Read before Edit, Grep before Write)
  - Session management detection (--resume, fork_session)
- **Context efficiency scoring**
  - Token growth rate per turn (bloat detection)
  - `/compact` usage detection (parser enhancement #160)
- **Cost optimization insights** — thinking ROI, cache suggestions, model selection (display only)
- **CCA-aligned recommendations** — map to domains, link to Academy courses
- **Parser enhancement** — #160: selective extraction from progress/system messages

**Size:** Extra Large (consider splitting into 5a: radar + aggregation, 5b: detection + parser)

**Dependencies:** Epic 1 (agent metrics feed radar), Epic 3 (config maturity feeds radar)

---

### Epic 6: Scoring Quality Infrastructure

**Theme:** Improve reliability and trustworthiness of all scoring.

**Deliverables:**

- Confidence calibration — #115
- User feedback signal for scoring corrections — #116
- Human review loop for golden set expansion — #113
- Cross-model agreement testing — #114
- Multi-provider evaluation framework — #112

**Size:** Large

**Dependencies:** Should follow Epic 2 (task classification changes scoring schema)

---

### Epic 7: Outcome Metrics & External Integrations

**Theme:** Measure what users produce, not just how they interact.

**Deliverables:**

- Commit quality metrics (message quality, size distribution, frequency)
- Conversation-to-commit attribution (branch + timestamp matching)
- MCP integration analysis (.mcp.json parsing, tool definition quality) — CCA Feature 3.1
- CI/CD integration scoring (workflow YAML scanning) — CCA Feature 3.2
- Full interactive Configuration Advisor — #161 (full scope)

**Size:** Extra Large

**Dependencies:** Epic 2 (task classification for correlation), Epic 3 (config maturity for MCP)

---

## Release Mapping

### v1.1 — "Conversations & Foundations"

| Epic | Scope | Size |
|------|-------|------|
| Epic 1: Conversations Tab + Agent Metrics | Full | M |
| Epic 2: Task Classification | Phase A (heuristic only) | S |
| Epic 3: Configuration Maturity | Full | M |

**Key properties:** Zero or near-zero API cost. All three epics ship independently. No scoring prompt changes = no eval regression risk.

### v1.2 — "Intelligence"

| Epic | Scope | Size |
|------|-------|------|
| Epic 2: Task Classification | Phase B (LLM layer) | M |
| Epic 4: Interaction Quality Metrics | Full | L |

**Key properties:** First scoring prompt change (v1.0 → v2.0). Bundles all prompt-dependent features. LLM task classification enables normalization of Epic 1 metrics.

### v1.3 — "Mastery"

| Epic | Scope | Size |
|------|-------|------|
| Epic 5: CCA Scoring Dimensions | Full | XL |
| Epic 6: Scoring Quality | Full | L |

**Key properties:** Establishes multi-dimensional scoring. Parser enhancement unlocks /compact and hook data. Scoring quality improvements after dimensions stabilize.

### v2.0 — "Outcomes"

| Epic | Scope | Size |
|------|-------|------|
| Epic 7: Outcome Metrics | Full | XL |

**Key properties:** Major version bump — fundamentally changes CodeFluent from interaction scorer to comprehensive coding fluency platform.

---

## Dependency Graph

```
Epic 1 (Conversations + Metrics) ─────────────────┐
                                                    ├──→ Epic 5 (CCA Radar + Dimensions)
Epic 3 (Config Maturity) ──────────────────────────┘            │
                                                                v
Epic 2a (Heuristic Classification) ──→ Epic 2b (LLM) ──→ Epic 4 (Interaction Quality)
                                            │                    │
                                            v                    v
                                     Epic 6 (Scoring Quality)  [parallel]
                                            │
                                            v
                                     Epic 7 (Outcomes)
```

---

## Deferred Features

| Feature | Source | Reason |
|---------|--------|--------|
| PR metrics | NEW_METRICS | Attribution problem unsolved; team-norm confounds |
| Bug fix correlation | NEW_METRICS | Deep git analysis; requires months of history |
| Code churn | NEW_METRICS | Ambiguous signal (healthy iteration vs poor quality) |
| Model selection scoring | NEW_METRICS + CCA | Subscription-tier confound; high gaming risk |
| Subagent awareness | NEW_METRICS | Requires un-filtering sidechains; ambiguous attribution |
| Context bridging | NEW_METRICS | High-effort cross-conversation analysis |
| Temporal pattern scoring | NEW_METRICS | Personal/lifestyle factors; insight-only, not scored |
| Interactive CCA practice mode | CCA | Different interaction paradigm entirely |
| Team fluency dashboard | CCA | Requires multi-user architecture |
| Academy deep integration | CCA | Requires partnership |

---

## Issue Map

### Epic tracking issues

| Issue | Epic | Milestone |
|-------|------|-----------|
| #173 | Epic 1: Conversations Tab + Agent Metrics | v1.1 |
| #174 | Epic 2: Task Classification | v1.1 / v1.2 |
| #175 | Epic 3: Configuration Maturity | v1.1 |
| #176 | Epic 4: Interaction Quality Metrics | v1.2 |
| #177 | Epic 5: CCA Scoring Dimensions | v1.3 |
| #178 | Epic 6: Scoring Quality Infrastructure | v1.3 |
| #179 | Epic 7: Outcome Metrics & External Integrations | v2.0 |

### All issues by epic

| Issue | Title | Epic | Milestone |
|-------|-------|------|-----------|
| #133 | Conversations tab | Epic 1 | v1.1 |
| #166 | Agent metrics computation module | Epic 1 | v1.1 |
| #167 | Agent metrics display cards and sparklines | Epic 1 | v1.1 |
| #168 | Conversation detail view with expandable rows | Epic 1 | v1.1 |
| #169 | Conversations tab charts | Epic 1 | v1.1 |
| #150 | Task classification | Epic 2 | v1.1 (Phase A), v1.2 (Phase B) |
| #170 | Task type distribution display | Epic 2 | v1.1 |
| #158 | .claude/ directory scanner | Epic 3 | v1.1 |
| #159 | Advisory-vs-programmatic gap | Epic 3 | v1.1 |
| #161 | Configuration Advisor | Epic 3 (simplified) / Epic 7 (full) | v1.1 / v2.0 |
| #171 | Structured output anti-pattern detection | Epic 3 | v1.1 |
| #172 | Configuration maturity display and scoring UI | Epic 3 | v1.1 |
| #128 | Review scoring prompt definitions | Epic 4 | v1.2 |
| #101 | Behavior-token breakdown | Epic 4 | v1.2 |
| #160 | Parser enhancement (progress messages) | Epic 5 | v1.3 |
| #112 | Multi-provider eval framework | Epic 6 | v1.3 |
| #113 | Human review loop | Epic 6 | v1.3 |
| #114 | Cross-model agreement | Epic 6 | v1.3 |
| #115 | Confidence calibration | Epic 6 | v1.3 |
| #116 | User feedback signal | Epic 6 | v1.3 |

---

## References

- [NEW_METRICS_RESEARCH.md](./NEW_METRICS_RESEARCH.md) — Full analysis of agent behavior, GitHub outcome, and novel scoring metrics
- [TASK_CLASSIFICATION_RESEARCH.md](./TASK_CLASSIFICATION_RESEARCH.md) — Task classification taxonomy, tooling landscape, validation strategy
- [CCA_FEATURE_RESEARCH.md](./CCA_FEATURE_RESEARCH.md) — CCA-F exam analysis, 14 features, three-category scoring expansion
