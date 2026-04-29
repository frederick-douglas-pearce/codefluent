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

**Context:** Analysis of PM agent JSONL data (April 14) revealed that subagent `tool_result` blocks include a metadata section with `total_tokens`, `tool_uses`, `duration_ms`, and `agentId`. This was not predicted in the original research — the "Observable vs Hidden" table initially listed token usage as hidden.

**Decision:** Expand #239 scope to capture the metadata block, enabling per-invocation cost and efficiency metrics.

**Rationale:** The metadata provides enough data for meaningful agent analytics without needing Agent SDK internal traces: cost per invocation, efficiency (tokens per tool use), duration trends, and agent continuity tracking. This is low incremental effort (regex parse of a known format) with high analytical value.

**Impact:** #239 scope grows slightly (metadata parsing), but delivers significantly richer agent metrics. No dependency changes — still v1.3 milestone alongside #238.

## 2026-04-15: Subagent JSONL Trace Discovery — Roadmap Impact

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

**Decision:** The trigger for AgentFluent as a separate product is now **audience divergence** — when CodeFluent needs to serve Agent SDK/production users with fundamentally different workflows (CI/CD integration, programmatic prompt versioning, batch analysis) that don't fit the interactive focus.

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
- #248 — Normalize metrics by task type (2-3 days, both interfaces)
- #247 — Learning trajectory + behavior acquisition curve (3-4 days, marquee feature)
- #246 — Verification behaviors via tool sequence analysis (2-3 days, new module)
- #101 — Behavior-token breakdown table (1-2 days, has data-pipeline gap)
- #176 — Epic 4: Interaction Quality Metrics (parent; v1.2 shipped #245 + #218, remaining 4 stories deferred)
- #174 — Epic 2: Task Classification (parent; v1.2 shipped #242, #243, #244, #219, #217; only #248 remains)

**Rationale:**
1. v1.2.0 already delivers substantial user value — scoring quality improvement (v2.1 prompt + Sonnet 4.6), new metrics (error recovery, command adoption), and infrastructure hardening (eval framework, security hooks)
2. The deferred stories total 9-12 days of implementation across both interfaces. Holding the release that long undermines cadence with no user-blocking reason.
3. Option C was considered for #101 (smallest scope) but rejected: its data-pipeline gap (`joinSessionsWithScores` doesn't pass per-behavior flags) makes it larger than the 1-2 day estimate suggests, and implementing on release day is scope-creep.
4. The deferred items cluster naturally with #251 (ccusage phase-out, also v1.3) — several touch the Usage tab analytics surface.
5. No user-facing regression from deferring: all are net-new features, not fixes.

**Epic milestone strategy:** Epics #176 and #174 follow their remaining stories to v1.3. The milestone field tracks "when will this close," not "when did planning start." Both epics had significant v1.2 work shipped (closed issues stay on v1.2 milestone).

**Impact:** v1.2 milestone can be closed after PR #230 merges (0 open issues remaining). v1.3 gains 6 issues (now 23 open). v1.3 has a natural shape: interaction quality completion + ccusage phase-out + subagent analytics.
