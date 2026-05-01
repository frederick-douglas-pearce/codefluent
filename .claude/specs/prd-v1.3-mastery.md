# PRD: v1.3 "Mastery"

**Status:** Approved
**Author:** PM Agent
**Date:** 2026-04-30
**Milestone:** v1.3
**Epics:** #176 (Interaction Quality, completion), #306 (Epic 5a: CCA Radar + Aggregation), #178 (Scoring Quality Infrastructure, partial)

---

## Problem Statement

CodeFluent v1.2 shipped scoring prompt v2.1, error recovery detection, command adoption metrics, and eval framework expansion. Four gaps remain:

1. **Scoring is one-dimensional.** Users get a single Prompt Fluency score. The CCA exam tests across 5 domains (Prompt Engineering, Claude Code Config, Agentic Architecture, Tool Design & MCP, Context Management). CodeFluent cannot assess or coach users across these dimensions.
2. **Interaction quality is incomplete.** v1.2 shipped error recovery (#245) and commands (#218) but deferred verification behaviors (#246), learning trajectory (#247), task-type normalization (#248), and behavior-token breakdown (#101).
3. **Agent analytics are absent.** Subagent JSONL traces exist (discovered 2026-04-15) but are unparsed. Users get no insight into agent utilization, cost, error rates, or optimization opportunities.
4. **Scoring quality has no guardrails.** No confidence calibration, user feedback signal, or cross-model validation. The eval framework exists but doesn't yet support multi-provider comparison.
5. **Usage data depends on ccusage.** Pace/chart data is global, not project-scoped (#251). ccusage has known bugs and is an external dependency. JSONL files contain the same token data natively.

## Theme

**Mastery**: multi-dimensional CCA readiness scoring, completed interaction quality metrics, subagent trace analytics, ccusage removal, and scoring quality infrastructure.

## Success Criteria

| Criterion | Measure |
|-----------|---------|
| CCA readiness radar ships | 5-axis radar chart displayed with aggregated scores from existing + new data |
| Interaction quality complete | All 4 deferred v1.2 stories (#246, #247, #248, #101) shipped |
| Subagent parser works | Subagent JSONL traces parsed with tool breakdown, error rates, token usage |
| Agent config scanning | `.claude/agents/` scanned and reflected in config maturity score |
| Confidence calibration | Scoring output includes per-behavior confidence levels |
| User feedback mechanism | Flag button on behavior scores, local storage, export capability |
| ccusage dependency removed | Usage data sourced entirely from JSONL files; ccusage no longer called |
| Usage tab scoped | Pace cards and chart scoped to selected project |
| Both interfaces | All features in VS Code extension AND webapp |

## Scope

### Epic 4 Completion: Interaction Quality (deferred from v1.2)

| Issue | Title | Priority | Size | Notes |
|-------|-------|----------|------|-------|
| #246 | Verification behaviors via tool sequence analysis | P0 | M | New module, heuristic, no API cost |
| #247 | Learning trajectory + behavior acquisition curve | P0 | M | Computed from cached scores, marquee feature |
| #248 | Task-type normalization with contextual display | P1 | M | Depends on v1.2 LLM task_type. Reassigned from Epic 2 (closed). |
| #101 | Behavior-token breakdown table | P1 | M | Data pipeline gap (fluency_behaviors not in enriched sessions) |
| #255 | Parse subagent JSONL trace files | P1 | L | Foundation for detailed agent analytics. Parser dependency for #239 enrichment. |
| #176 | Epic 4 tracking issue | -- | -- | Close when all stories done |

### Epic 5a: CCA Radar + Aggregation (#306)

| Issue | Title | Priority | Size | Notes |
|-------|-------|----------|------|-------|
| #306 | Epic 5a tracking issue | -- | -- | Split from #177 (Epic 5b, v2.0) |
| TBD | CCA readiness radar chart (5-axis) | P0 | L | Aggregates existing scores + metrics + config maturity. Chart.js radar. |
| #160 | Parser enhancement (progress/system messages) | P1 | L | Unlocks /compact detection, hook execution counting, turn duration. Feeds radar. |
| TBD | CCA-aligned recommendations | P1 | M | Map existing recommendations to CCA domains |

### Agent Trace Analytics (Epic 4 scope)

| Issue | Title | Priority | Size | Notes |
|-------|-------|----------|------|-------|
| #238 | Scan .claude/agents/ for subagent definitions | P0 | S | Extends config scanner. Prerequisite for #239. |
| #239 | Track subagent invocations + metadata | P0 | L | Parser + conversation assembly + agent metrics enrichment |
| #240 | Agent-aware recommendations | P1 | M | Rule-based, no LLM. Depends on #238 + #239. |

### Epic 6 (partial): Scoring Quality Infrastructure

| Issue | Title | Priority | Size | Notes |
|-------|-------|----------|------|-------|
| #115 | Confidence calibration | P1 | M | Scoring prompt change, eval regression test |
| #116 | User feedback signal | P1 | M | UI + local storage + export. Both interfaces. |

### Bug Fixes & Hardening

| Issue | Title | Priority | Size | Notes |
|-------|-------|----------|------|-------|
| #251 | Usage tab project scoping (full ccusage removal) | P0 | L | Replace all ccusage calls with JSONL-derived token aggregation. Removes external dependency. Selling point: more accurate usage tracking. Prior research: PR #261 (closed #260) — message-ID dedup per Anthropic Agent SDK cost-tracking docs, with quantitative ccusage comparison and root-cause analysis of ccusage's first-wins output undercounting + subagent exclusion bugs. Foundational dedup work in PR #253 (closed #252) and subagent inclusion in PR #259 (closed #254). |
| #294 | Update CLAUDE.md E2E checklist | P0 | S | Doc fix, 10 minutes |
| #290 | Fix Jest tsconfig LSP errors | P2 | S | Editor-only, low severity |
| #293 | Prevent Dependabot @types/vscode drift | P0 | S | Pin + ignore rule. Prevents repeat release blockers. |
| #305 | Release-please PAT for CI trigger | P1 | S | One-time setup, prevents manual close/reopen on releases |

---

## Stretch Goals (cut first if velocity slips)

1. **#101 -- Behavior-token breakdown table.** Has a data pipeline gap (need to thread `fluency_behaviors` through enriched session data). Not blocking any other story. Can ship in a v1.3.x patch if needed.

## Defer List (remove from v1.3 milestone)

| Issue | Title | Recommendation | Reason |
|-------|-------|---------------|--------|
| #112 | Multi-provider eval framework | **v2.0** | No second provider exists. Building the framework without a consumer is speculative. |
| #113 | Human review loop | **v2.0** | "Longer term" per its own description. Depends on #112. Golden set is currently maintainer-curated and that works. |
| #114 | Cross-model agreement testing | **v2.0** | Explicitly "becomes relevant when a second LLM provider is integrated." No second provider. |
| #209 | Rules recommendation and generation | **v2.0** | Scope-creep. LLM-powered feature unrelated to v1.3 core themes. |
| #298 | Frontend rendering hardening | **Backlog** | Pattern-level refactor. v1.2.1 shipped the targeted fix. The structural rewrite is valuable but not v1.3-critical. |
| #199 | Multi-level tab layout | **Defer** | Functionality over UI/UX. If 8+ tabs becomes a real UX problem, revisit in v1.3.x or v1.4. |
| #256 | Subagent error recovery | **v2.0 (Epic 5b)** | Depends on #255. Stretch goal that risks pulling scope. Moved to Epic 5b (#177). |
| #174 | Epic 2: Task Classification (tracking) | **Closed** | Phase A shipped v1.1, Phase B shipped v1.2. #248 reassigned to Epic 4. |

### Defer rationale: Epic 6 partial scope

Full Epic 6 has 5 stories (#112-#116). Three depend on multi-provider support that doesn't exist yet. Only #115 (confidence calibration) and #116 (user feedback) deliver standalone value today. Shipping those two gives users scoring transparency and a feedback mechanism; the infrastructure stories (#112, #113, #114) wait for a real consumer.

### Defer rationale: #199 (multi-level tabs)

Human preference: "functionality over UI/UX." The CCA radar adds a 7th tab. If the tab bar proves unusable at that count, it can be addressed in a v1.3.x patch or v1.4. The effort is better spent on analytical features.

## Orphan Triage

Every issue currently on v1.3 that isn't in the scope table above:

| Issue | Title | Current Labels | Recommendation |
|-------|-------|---------------|----------------|
| #298 | Frontend rendering hardening | quality, testing | Defer to backlog (see above) |
| #209 | Rules recommendation/generation | feature | Defer to v2.0 (see above) |
| #199 | Multi-level tab layout | feature | Defer (see above) |
| #294 | CLAUDE.md E2E checklist update | documentation | **Keep in v1.3**, P0, S (trivial doc fix) |
| #293 | Dependabot @types/vscode drift | quality, dependencies | **Keep in v1.3**, P0, S (prevents release blockers) |
| #290 | Jest tsconfig LSP fix | (no labels) | **Keep in v1.3**, P2, S (editor annoyance, easy fix) |
| #305 | Release-please PAT | quality, dependencies | **Keep in v1.3**, P1, S (one-time CI fix) |

## Dependencies and Sequencing

```
Phase 1 -- Quick wins (Week 1-2)
  #294, #293, #305, #290          (doc + CI fixes, unblock future releases)
  #238                             (agent config scanning, S, unblocks #239)
  #246                             (verification behaviors, independent)

Phase 2 -- Core analytics (Week 3-5)
  #251                             (ccusage removal, unblocks scoped usage)
  #239                             (agent invocations, depends on #238)
  #247                             (learning trajectory, independent)
  #160                             (parser enhancement, unblocks CCA radar data)
  #115                             (confidence calibration)

Phase 3 -- CCA + Agent depth (Week 5-7)
  CCA radar chart                  (aggregates #238 + #160 + existing metrics)
  #248                             (task-type normalization)
  #255                             (subagent parser, L)
  #240                             (agent recommendations, depends on #238 + #239)
  #116                             (user feedback, independent)
  CCA-aligned recommendations

Phase 4 -- Stretch (Week 7-8, if velocity allows)
  #101                             (behavior-token breakdown)
```

### Critical path

```
#238 --> #239 --> #240
                  |
#160 ----------> CCA radar chart
                  |
#255 ----------> (enriches #239, #240; #256 deferred to v2.0)
```

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Epic 5 is XL -- scope creep | Release drags past 6 weeks | Only 5a (radar + aggregation) is in scope (#306). 5b (deeper detection, cost insights) is explicitly v2.0 (#177). |
| #255 (subagent parser) is complex | Delays agent analytics enrichment | #239 captures metadata from parent session tool_results without needing #255. Ship #239 first; #255 is P1 and enriches but doesn't block. |
| Scoring prompt change for #115 | Eval regression risk | Run full eval suite. Keep v2.1 prompt as rollback. Confidence field is additive (doesn't change behavior scoring). |
| #251 ccusage removal is marquee technical change | Data gaps, regression in usage metrics | Research already done — see PR #261 comparison table: ccusage's input-token overcounting and output-token undercounting (first-wins bug) are documented; JSONL message-ID dedup is the canonical approach per Anthropic docs. Build aggregation functions with unit tests pinning expected category-level totals. |
| 20+ issues for solo maintainer | Overload | Aggressive stretch goal cuts. P2 items can slip to v1.3.x patches. #101 is stretch, #256 is deferred. |

## Resolved Questions

**Q1 -- Epic 2 (#174) closure.** Approved. #174 closed with comment. All Phase A and Phase B stories shipped. #248 reassigned to Epic 4, retains `epic:task-classification` label for traceability.

**Q2 -- Epic 4 vs Epic 5 placement for #255 and #256.** #255 placed in Epic 4 (parsing subagent data is a dependency for other Epic 4 agent analytics stories). #256 moved to Epic 5b / v2.0 (feeds Agentic Architecture radar axis more than interaction quality; depends on #255 which is already complex; stretch goal risk eliminated by deferring).

**Q3 -- Multi-level tabs #199.** Deferred. Human preference: "functionality over UI/UX." Revisit if 8+ tabs becomes a real problem.

**Q4 -- Epic 5 split.** Split into Epic 5a (#306, v1.3: radar + aggregation + recommendations + parser #160) and Epic 5b (#177 narrowed, v2.0: deeper detection + cost insights + #256). No Epic 5c needed -- agent trace stories stay under Epic 4.

**Q5 -- #251 ccusage scope.** Full removal committed. JSONL files contain native token data that is more accurate than ccusage. Prior research confirms data availability. This is a selling point for v1.3: "more accurate token usage tracking."
