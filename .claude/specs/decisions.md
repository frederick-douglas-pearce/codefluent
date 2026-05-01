# Decision Log

## 2026-04-14: v1.2 Scope Decisions

**Context:** PM agent analyzed v1.2 milestone gaps and presented scope options to the human.

### Decision 1: Epic 4 scope is FULL

**Options considered:**
- A) Phased: error recovery + verification only, defer trajectory + normalization
- B) Full: all four sub-features (error recovery, verification, learning trajectory, task-type normalization)

**Decision:** Option B (Full scope)

**Rationale:** Human chose full scope. Task-type normalization is the payoff that makes Epic 2 Phase B valuable beyond classification-for-its-own-sake. Learning trajectory is relatively lightweight once scoring data exists.

**Impact:** Epic 4 grows from Medium to Large. Adds 2 additional story issues. Task-type normalization becomes the last story due to its dependency on LLM task classification.

### Decision 2: v1.1.1 (PR #230) rolls into v1.2

**Options considered:**
- A) Merge PR #230 separately to ship cache fix now
- B) Roll the cache fix into v1.2 release

**Decision:** Option B (Roll into v1.2)

**Rationale:** Human decision. The cache fix (stale score invalidation) is not urgent enough to warrant a separate release cycle. PR #230 stays open and its changes will be included when v1.2 ships.

**Impact:** No separate v1.1.1 tag. Users on v1.1.0 wait for v1.2 to get the cache fix.

### Decision 3: Pull #217, #218, #219 into v1.2 milestone

**Options considered:**
- A) Leave command/skill tracking issues in backlog for later
- B) Pull into v1.2 since they complement the scoring prompt and metrics work

**Decision:** Option B (Pull into v1.2)

**Rationale:** Human decision. #217 (fork investigation) and #218 (adoption metrics) are natural extensions of the v1.1 command tracking work. #219 (commands in scoring) is a cheap add-on to the scoring prompt v2.0 rewrite -- adding one more field to an already-changing prompt is near-zero incremental effort.

**Impact:** #219 is bundled into the scoring prompt v2.0 story (not a separate implementation). #217 and #218 are standalone stories with v1.2 milestone.

### Decision 4: #219 bundles with scoring prompt v2.0

**Context:** #219 (incorporate command/skill usage into scoring prompts) requires a scoring prompt version change. The scoring prompt v2.0 story already exists for #128 fixes + task_type addition.

**Decision:** Bundle #219 into the scoring prompt v2.0 story rather than treating it as a separate implementation.

**Rationale:** One prompt change is cheaper and less risky than two. The `commands_used` signal is a single additional field/instruction in the prompt template. Separate changes would require two eval runs and two cache invalidation cycles.

**Impact:** #219 issue stays open as a tracking reference but its implementation is absorbed into the scoring prompt v2.0 story. The story's acceptance criteria explicitly include the commands_used signal.

### Decision 5: Agent invocation tracking (#239) should capture metadata block

**Context:** Analysis of PM agent JSONL data (April 14) revealed that subagent `tool_result` blocks include a metadata section with `total_tokens`, `tool_uses`, `duration_ms`, and `agentId`. This was not predicted in the original research -- the "Observable vs Hidden" table initially listed token usage as hidden.

**Decision:** Expand #239 scope to capture the metadata block, enabling per-invocation cost and efficiency metrics.

**Rationale:** The metadata provides enough data for meaningful agent analytics without needing Agent SDK internal traces: cost per invocation, efficiency (tokens per tool use), duration trends, and agent continuity tracking. This is low incremental effort (regex parse of a known format) with high analytical value.

**Impact:** #239 scope grows slightly (metadata parsing), but delivers significantly richer agent metrics. No dependency changes -- still v1.3 milestone alongside #238.

## 2026-04-15: Subagent JSONL Trace Discovery -- Roadmap Impact

**Context:** Full subagent session traces discovered at `~/.claude/projects/<project>/<session-uuid>/subagents/agent-<id>.jsonl` (350 files, all with `isSidechain: true`). Previously believed to be hidden/inaccessible. Contains complete tool_use/tool_result sequences with `is_error` flags, per-step token usage, and internal reasoning.

### Decision 6: Subagent trace analysis goes to v1.3, not v1.2

**Options considered:**
- A) Expand v1.2 scope to include subagent trace parsing
- B) Keep v1.2 focused on main conversation quality; add subagent traces to v1.3

**Decision:** Option B (v1.3)

**Rationale:** v1.2 is already in progress with a well-defined scope (scoring prompt v2.0, error recovery for main sessions, verification, learning trajectory, task-type normalization). Adding subagent parsing would expand scope significantly and create a new dependency chain (#254 -> #255 -> #256). The subagent parser (#255) also depends on #254 (token counting fix) which needs its own resolution first.

**Impact:** Two new issues created for v1.3: #255 (subagent JSONL parser) and #256 (subagent error recovery). v1.2 error recovery (#245) targets main conversation flow only. v1.3 gains a coherent subagent analytics track: #254 -> #255 -> #256, enriching #239 and #240.

### Decision 7: "Subagent awareness" removed from Deferred Features

**Context:** The Deferred Features table listed "Subagent awareness" with reason "Requires un-filtering sidechains; ambiguous attribution." The discovery of full subagent traces with `agentId` linking eliminates both blockers.

**Decision:** Remove from deferred list. Track as active v1.3 work via #255 and #256.

**Rationale:** The original deferral reasons no longer apply: (1) subagent JSONL files are separate from main session files, so no un-filtering needed; (2) `agentId` field on all messages provides unambiguous attribution back to parent session invocations.

**Impact:** Roadmap deferred features table updated. New dependency chain added to dependency graph.

### Decision 8: AgentFluent trigger shifts from data availability to audience divergence

**Context:** The AgentFluent bootstrap strategy previously assumed data availability (hidden internal traces) was the trigger for a separate product. Full subagent traces eliminate this barrier.

**Decision:** The trigger for AgentFluent as a separate product is now **audience divergence** -- when CodeFluent needs to serve Agent SDK/production users with fundamentally different workflows (CI/CD integration, programmatic prompt versioning, batch analysis) that don't fit the interactive focus.

**Rationale:** All features previously thought to require Agent SDK (prompt-to-behavior correlation, detailed error analysis, internal reasoning analysis) are available from existing Claude Code subagent data. The remaining Agent SDK-only needs (programmatic prompt version management, CI/CD hooks, custom instrumentation) serve a different user persona than CodeFluent's interactive Claude Code users.

**Impact:** No immediate product change. CodeFluent absorbs more agent analytics than originally planned (v1.3 subagent traces). AgentFluent becomes a product decision driven by market signal, not a technical necessity driven by data gaps. Bootstrap strategy updated in `docs/AGENT_ANALYTICS_RESEARCH.md`.

## 2026-04-29: v1.2.0 Release Scope Cut

**Context:** v1.2.0 release PR #230 is ready to merge. Six issues remain open on the v1.2 milestone: 4 stories (#248, #247, #246, #101) and 2 epic parents (#176, #174). None have implementation work started. The release already contains 9 features, 8 bug fixes, and substantial doc updates. Developer agent recommended deferring all 6 to v1.3; PM agent reviewed and concurred.

### Decision 9: Defer remaining v1.2 Interaction Quality + Task Classification stories to v1.3

**Options considered:**
- A) Hold the release and implement remaining stories (est. 1-2 weeks additional)
- B) Ship v1.2.0 as-is; move all 6 open issues to v1.3
- C) Keep one small story (#101, behavior-token breakdown, est. 1-2 days) in v1.2

**Decision:** Option B (Ship as-is, defer all 6)

**What v1.2.0 ships (release narrative: "Scoring quality + model migration + observability infrastructure"):**
- Scoring prompt v2.0 then v2.1 with task_type, tightened definitions (#242, #274, #285)
- Sonnet 4.6 migration (#280, #286)
- Error recovery detection + UI (#245, #249, #257, #258)
- Command/skill adoption rate metric (#218)
- Eval framework: golden set expansion to 46 entries (#243), task_type_agreement check with Cohen's Kappa (#244), per-behavior threshold enforcement (#266)
- Secret-handling hooks + SECURITY.md (#270, #272)
- 8 bug fixes (cache hash, conversation dedup, hook cwd drift, token dedup, etc.)
- Doc updates bringing READMEs and CLAUDE.md to v1.2.0 accuracy (#289)

**What moves to v1.3:**
- #248 -- Normalize metrics by task type (2-3 days, both interfaces)
- #247 -- Learning trajectory + behavior acquisition curve (3-4 days, marquee feature)
- #246 -- Verification behaviors via tool sequence analysis (2-3 days, new module)
- #101 -- Behavior-token breakdown table (1-2 days, has data-pipeline gap)
- #176 -- Epic 4: Interaction Quality Metrics (parent; v1.2 shipped #245 + #218, remaining 4 stories deferred)
- #174 -- Epic 2: Task Classification (parent; v1.2 shipped #242, #243, #244, #219, #217; only #248 remains)

**Rationale:**
1. v1.2.0 already delivers substantial user value -- scoring quality improvement (v2.1 prompt + Sonnet 4.6), new metrics (error recovery, command adoption), and infrastructure hardening (eval framework, security hooks)
2. The deferred stories total 9-12 days of implementation across both interfaces. Holding the release that long undermines cadence with no user-blocking reason.
3. Option C was considered for #101 (smallest scope) but rejected: its data-pipeline gap (`joinSessionsWithScores` doesn't pass per-behavior flags) makes it larger than the 1-2 day estimate suggests, and implementing on release day is scope-creep.
4. The deferred items cluster naturally with #251 (ccusage phase-out, also v1.3) -- several touch the Usage tab analytics surface.
5. No user-facing regression from deferring: all are net-new features, not fixes.

**Epic milestone strategy:** Epics #176 and #174 follow their remaining stories to v1.3. The milestone field tracks "when will this close," not "when did planning start." Both epics had significant v1.2 work shipped (closed issues stay on v1.2 milestone).

**Impact:** v1.2 milestone can be closed after PR #230 merges (0 open issues remaining). v1.3 gains 6 issues (now 23 open). v1.3 has a natural shape: interaction quality completion + ccusage phase-out + subagent analytics.

## 2026-04-30: v1.3 Scope Decisions

**Context:** PM agent scoped v1.3 "Mastery" release. 27 issues on the milestone, no PRD. Solo maintainer; target ~6 weeks of work (matching v1.2 cadence).

### Decision 10: Epic 5 scoped to 5a only (radar + aggregation)

**Options considered:**
- A) Full Epic 5 (XL) -- radar, agentic patterns, context efficiency, cost insights, CCA recommendations, parser enhancement
- B) Epic 5a only (L) -- radar chart + aggregation + CCA-aligned recommendations + parser enhancement (#160)
- C) Skip Epic 5 entirely, focus on completing deferred v1.2 stories + agent analytics

**Decision:** Option B (5a only)

**Rationale:** Full Epic 5 is XL and would consume the entire release budget. 5a delivers the marquee feature (CCA radar) by aggregating data already computed by Epics 1-4. Deeper detection (agentic patterns, context efficiency) and cost insights are deferred to v2.0 as part of 5b. The parser enhancement (#160) is pulled in because it feeds data to the radar (compact_count, hook execution stats).

**Impact:** v1.3 includes CCA radar chart, CCA-aligned recommendations, and parser enhancement (#160). Deeper Epic 5 features (token bloat detection, cost ROI, advanced agentic patterns) move to v2.0.

### Decision 11: Epic 6 partial -- only #115 and #116

**Options considered:**
- A) Full Epic 6 (all 5 stories: #112-#116)
- B) #115 (confidence) + #116 (user feedback) only
- C) Defer all of Epic 6

**Decision:** Option B (#115 + #116 only)

**Rationale:** #112 (multi-provider eval), #113 (human review loop), and #114 (cross-model agreement) all depend on having a second LLM provider integrated, which doesn't exist. Building infrastructure without a consumer is speculative engineering. #115 and #116 deliver standalone value: confidence calibration improves scoring transparency, user feedback enables golden set growth from real users.

**Impact:** Three stories (#112, #113, #114) defer to v2.0. Epic 6 tracking issue (#178) stays open -- it closes when all 5 stories ship. v1.3 ships two scoring quality improvements that are immediately useful.

### Decision 12: Defer #209 (rules generation) and #298 (frontend hardening)

**Context:** Both are on v1.3 milestone but don't belong to any v1.3 epic. #209 is a new LLM-powered feature; #298 is a pattern-level refactor prompted by a v1.2.1 bug fix.

**Decision:** #209 to v2.0; #298 to backlog.

**Rationale:** #209 (rules generation) is scope-creep -- it's an LLM-powered config generation feature unrelated to the v1.3 themes (CCA radar, interaction quality, agent analytics). It also depends on #199 (multi-level tabs) for UI placement. #298 (frontend rendering hardening) is good hygiene but the targeted fix already shipped in v1.2.1; the structural rewrite can happen incrementally as render functions are added or modified.

**Impact:** v1.3 milestone shrinks by 2 issues. Both remain tracked for future work.

### Decision 13: #256 (subagent error recovery) is a stretch goal

**Context:** #256 depends on #255 (subagent parser), which is itself a Large story. If #255 completes late in the release, #256 may not fit.

**Decision:** Mark #256 as stretch. If #255 completes by Week 6, implement #256. Otherwise defer to v1.3.x or v2.0.

**Rationale:** #256 reuses the error recovery algorithm from #245 -- the implementation is modest. But its dependency (#255) is the risk. Declaring it stretch up front prevents pressure to rush #255 and lets the team ship without it if needed.

**Impact:** No issue changes. PRD documents the stretch designation. #256 is the first thing cut if velocity slips.

### Decision 14: Close Epic 2 (#174)

**Context:** Epic 2 (Task Classification) had two phases. Phase A (heuristic) shipped v1.1. Phase B (LLM) shipped v1.2. The only remaining child issue is #248 (task-type normalization), which is labeled `epic:task-classification` + `epic:interaction-quality` and is functionally an Epic 4 completion story.

**Decision:** Close #174. #248's primary value is normalizing interaction quality metrics -- it belongs to Epic 4.

**Rationale:** Keeping #174 open for a single cross-labeled story creates tracking confusion. The epic's deliverables (heuristic classification, LLM classification, golden set expansion, eval check) are all complete.

**Impact:** #174 closed 2026-04-30. #248 tracked solely under Epic 4 (#176). Retains `epic:task-classification` label for traceability.

### Decision 15: v1.3 PRD finalized (2026-04-30)

**Context:** Human answered 5 open questions from the draft PRD. All resolutions applied.

**Resolutions:**

- **Q1 (Epic 2 closure):** #174 closed. All children shipped; #248 reassigned to Epic 4.
- **Q2 (#255/#256 placement):** #255 placed in Epic 4 (subagent parsing is a dependency for Epic 4 agent analytics stories #239, #240). #256 moved to Epic 5b / v2.0 (feeds Agentic Architecture radar axis; stretch goal risk eliminated by deferring).
- **Q3 (#199 multi-level tabs):** Deferred. Human: "functionality over UI/UX." Revisit if 8+ tabs becomes a real UX problem.
- **Q4 (Epic 5 split):** Epic 5a (#306) created for v1.3: radar chart + aggregation + recommendations + parser #160. #177 narrowed to Epic 5b for v2.0: deeper detection + cost insights + #256. No Epic 5c needed.
- **Q5 (#251 ccusage removal):** Full removal committed. JSONL token data is more accurate. Prior research exists. Marquee technical improvement for v1.3.

**Impact:** PRD status changed from Draft to Approved. Epic 5a tracking issue #306 created. #177 scope narrowed via comment. #256 deferred from v1.3 stretch to v2.0/Epic 5b.

## 2026-05-01: v1.3 Expanded -- E2E Automation

### Decision 16: Add E2E smoke test automation (#312) to v1.3

**Context:** Three doc-drift fixes in two releases (#294, plus two prior mismatches post-v1.2.0) exposed that the manual Playwright MCP checklist is fragile. Human explicitly approved v1.3 inclusion, citing it as "a constant pain point" that "would help streamline our workflow" and "may have caught a number of issues earlier."

**Options considered:**
- A) Add to v1.3 Phase 1 and cut something to compensate
- B) Add to v1.3 Phase 1 and accept the overload (no cuts)
- C) Mark as stretch goal (cut first if velocity slips)
- D) Defer to v1.4 or backlog

**Decision:** Option B (Add to Phase 1, accept overload, no cuts)

**Rationale:**
1. **Value-to-cost ratio is high.** M-sized work (1-2 days) that eliminates a per-PR manual testing bottleneck across the remaining 6+ weeks of v1.3 development. The time saved on manual smoke testing during Phases 2-4 likely exceeds the upfront investment.
2. **Early placement maximizes ROI.** Phase 1 placement means automated regression catch is active before the riskiest UI changes land (#251 ccusage removal in Phase 2, CCA radar in Phase 3). This is the whole point -- catching regressions in the changes that follow.
3. **No cuts needed.** The existing stretch goal (#101) and aggressive Phase 4 buffer already provide velocity slack. #312 at M-size fits within Phase 1 alongside the existing S-sized quick wins and M-sized #246. Phase 1 grows from ~1.5 weeks to ~2 weeks, which stays within the "Week 1-2" window.
4. **Standalone story, no epic.** This is quality infrastructure, not scoring quality (#178/Epic 6). It has no epic parent and doesn't need one -- it's a self-contained CI improvement comparable to #293 (Dependabot drift) and #305 (release-please PAT) in the Bug Fixes & Hardening section.

**Sequencing:** Phase 1, after #294 (doc fix that refreshes the checklist being automated) and alongside #246 (verification behaviors). No dependency on any other v1.3 work. No items on the critical path.

**Scope-risk assessment:** v1.3 already carries 20+ issues with an "overload" risk flag. Adding one M-sized story to Phase 1 increases the total by ~5%. The overload risk mitigation remains unchanged: #101 is stretch, #256 is deferred, P2 items can slip to patches. The key difference from a generic scope add is that #312 *reduces* per-PR overhead for the remainder of the release, partially offsetting its own cost.

**Coordination with #298:** Both touch webapp test infrastructure. #312 (E2E via Playwright) and #298 (frontend unit tests via JSDOM or Playwright) are complementary, not overlapping. #312 should land first -- it's smaller and unblocked. If #298 later chooses Playwright for its webapp test infra, the server fixture and dependency from #312 can be reused.

**Impact:** New "Quality Infrastructure" section added to PRD scope tables. Phase 1 updated to include #312. Risk table updated to note the M-sized addition and its time-saving payback. Success criteria updated to include E2E automation.
