# PRD: v1.2 "Intelligence"

**Status:** Draft
**Author:** PM Agent
**Date:** 2026-04-14
**Milestone:** v1.2
**Epics:** #174 (Task Classification Phase B), #176 (Interaction Quality Metrics)

---

## Problem Statement

CodeFluent v1.1 shipped heuristic-only task classification and conversation-level analytics. Four gaps remain:

1. **Scoring accuracy is stale.** The scoring prompt (v1.0) has known definition precision issues (`questioning_reasoning` at 74% agreement, `clarifying_goals` at 80%) identified in #128. No prompt change has shipped since launch.
2. **No interaction quality analysis.** Users get behavior flags and token stats but no insight into *how well* they interact -- error recovery, verification discipline, learning over time, or how their metrics compare to task-type norms.
3. **Task classification is incomplete.** Heuristic-only classification misses conversations with no branch name or ambiguous keywords. LLM classification fills this gap at near-zero incremental cost (piggybacks on existing scoring API call).
4. **Command/skill adoption is display-only.** v1.1 tracks commands_used but does not feed this signal into scoring or surface adoption metrics.

## Success Criteria

| Criterion | Measure |
|-----------|---------|
| Scoring prompt v2.0 ships | All 11 behaviors at >=85% agreement on expanded golden set |
| LLM task classification works | `task_type_agreement` Kappa >= 0.7 on golden set |
| Error recovery detection | Heuristic identifies error-recovery patterns in real conversations |
| Verification behavior detection | Tool sequence analysis produces `test_before_commit_rate` |
| Learning trajectory | Score trend computable and displayable per user |
| Task-type normalization | Per-task-type expected ranges displayed for key metrics |
| Command adoption metric | `command_adoption_rate` card in agent metrics section |
| Command/skill signal in scoring | `commands_used` included in scoring prompt v2.0 |
| Both interfaces | All features in VS Code extension AND webapp |

## Scope

### In Scope

#### Epic 2 Phase B: LLM Task Classification

| Story | Description | Issue |
|-------|-------------|-------|
| Scoring prompt v2.0 | Rewrite scoring prompt with tightened behavior definitions, `task_type` + `task_type_confidence` fields, `commands_used` signal, few-shot examples. Bundles #128 fixes + #219. | TBD |
| Golden set expansion | Add `expected_task_type` annotations, new test cases for tightened definitions, expand to ~75 entries. | TBD |
| Eval check: task_type_agreement | New eval check measuring classification Kappa. Target >= 0.7. | TBD |
| Cache migration for prompt v2.0 | Existing cached scores auto-invalidate via `prompt_version` mismatch. Verify no edge cases. | Part of scoring prompt story |

#### Epic 4: Interaction Quality Metrics (Full)

| Story | Description | Issue |
|-------|-------------|-------|
| Error recovery pattern detection | Heuristic detection of error/failure states in conversation flow. Recovery strategy diversity score. `failure_to_resolution_turns` metric. | TBD |
| Verification behavior detection | Tool sequence analysis: Read/Grep after Edit, Bash test commands before commit. `test_before_commit_rate`, `review_before_accept_rate`. | TBD |
| Learning trajectory formalization | Score trend formalized as computed metric. Behavior acquisition curve (which behaviors appear over time). | TBD |
| Task-type normalization | Per-task-type expected ranges for Epic 1 metrics. Contextual display showing user vs. task-type norms. Depends on Epic 2 Phase B. | TBD |
| Behavior-token breakdown table | Average tokens per prompt with vs. without each behavior. Delta display sorted by impact. | #101 |

#### Command/Skill Tracking (pulled from backlog)

| Story | Description | Issue |
|-------|-------------|-------|
| Handle complex skills with context:fork | Investigate and handle JSONL patterns from forked subagent skills. | #217 |
| Command adoption rate metric | `command_adoption_rate`, `unique_commands_used`, top commands by frequency. Agent metrics cards. | #218 |
| Command/skill usage in scoring prompt | Bundle with scoring prompt v2.0. `commands_used` as fluency signal. | #219 (bundled into scoring prompt v2.0 story) |

### Out of Scope (deferred)

| Item | Reason |
|------|--------|
| v1.1.1 separate release (PR #230) | Rolling cache fix into v1.2 release instead of shipping separately. |
| Agentic pattern detection (deeper) | Epic 5 scope (v1.3) |
| CCA readiness radar | Epic 5 scope (v1.3) |
| Scoring quality infrastructure | Epic 6 scope (v1.3) |
| Outcome metrics | Epic 7 scope (v2.0) |

## Architecture Notes (non-prescriptive)

- **Scoring prompt v2.0** is the critical path. It touches the eval framework, golden set, cache invalidation, and is a prerequisite for task-type normalization. Ship and validate this first.
- **Error recovery + verification detection** are heuristic-only (no API cost). They analyze tool_use/tool_result sequences in existing parsed conversation data. Can parallelize with scoring prompt work.
- **Learning trajectory** depends on having multiple scored conversations per user. Works with existing score cache data.
- **Task-type normalization** depends on both Epic 2 Phase B (LLM task types) and Epic 1 metrics (values to normalize). This is the last story to implement.
- **#101 (behavior-token breakdown)** is independent -- requires scored conversations + analytics data joined. Can parallelize.
- **#219 (commands in scoring)** is bundled INTO the scoring prompt v2.0 story -- not a separate implementation task.

## Dependencies

```
#128 (scoring prompt review) -----+
#219 (commands in scoring) -------+
                                  +---> Scoring Prompt v2.0 ---> Golden Set Expansion ---> Eval Check
                                  |                                                          |
#217 (fork investigation) ---> #218 (adoption metrics)                                      |
                                                                                             v
Error Recovery Detection --+                                                    Task-Type Normalization
Verification Detection ----+ (parallel, no dependencies)
Learning Trajectory -------+
#101 (behavior-token) ---- (independent, parallel)
```

## Sequencing (suggested implementation order)

1. **#217** -- Investigation story, unblocks confidence in command tracking
2. **Scoring prompt v2.0** (absorbs #128 + #219) -- Critical path
3. **Golden set expansion** -- Validates prompt v2.0
4. **Eval check: task_type_agreement** -- Gates prompt v2.0 merge
5. **#218** -- Command adoption metrics (parallel with 2-4)
6. **Error recovery detection** (parallel with 2-4)
7. **Verification behavior detection** (parallel with 2-4)
8. **#101 Behavior-token breakdown** (parallel with 2-4)
9. **Learning trajectory** (needs scored conversations)
10. **Task-type normalization** (last -- needs LLM task types + metrics)

## Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Scoring prompt v2.0 regresses existing behavior agreement | Blocks release | Run full eval suite before merge. Keep v1.0 prompt file for rollback. |
| Task type Kappa < 0.7 | Classification unreliable for normalization | Iterate on few-shot examples. Fall back to heuristic-only if needed. |
| Complex skills (context:fork) produce unexpected JSONL | Command tracking breaks | #217 is an investigation-first story. Scope handling to what's actually observed. |
| Insufficient scored conversations for learning trajectory | Feature shows empty state | Require minimum 10 scored conversations. Display "not enough data" otherwise. |
