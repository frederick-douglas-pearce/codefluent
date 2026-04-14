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
