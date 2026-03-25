# Research: Beyond AI Fluency Behaviors — New Scoring Metrics for CodeFluent

## Context

CodeFluent v1.0.0 scores conversations against 11 fluency behaviors (from Anthropic's AI Fluency Index) and 6 coding interaction patterns (from "Coding Skills Formation"). These are general-purpose AI fluency metrics derived from Claude.ai conversations — not specifically designed for coding agents or Claude Code.

This research explores scoring metrics that go deeper into the coding agent use case. The goal is to identify metrics that complement (not replace) the current behavioral scoring, and that leverage the rich signals available in Claude Code session data and GitHub repositories.

Three directions are analyzed: (1) agent behavior metrics from session data, (2) GitHub outcome metrics from the repository, and (3) other novel dimensions.

**Related:** [Task Classification Research](./TASK_CLASSIFICATION_RESEARCH.md) — foundational capability for normalizing these metrics by task type.

## Current Scoring Baseline

**What's scored today:** 11 boolean behaviors + 1 coding pattern per conversation, via LLM-as-judge (Sonnet, temperature=0). Additional signals passed but only used as context: `USED_PLAN_MODE`, `THINKING_COUNT`, `TOOLS_USED`.

**What's extracted but unused for scoring:** tool_use_count, user/assistant message counts, model used, git_branch, all token metrics (input/output/cache), conversation timestamps and duration, session_ids.

**What's available from GitHub (Quick Wins only today):** recent commits, open issues, repo metadata, CLAUDE.md content.

---

## Direction 1: Agent Behavior Metrics

These metrics quantify HOW a user leverages Claude Code's agent capabilities. The insight is that tool use, planning, and conversation management patterns reveal fluency dimensions that the 11 behavioral indicators don't capture.

### 1.1 Tool Use Sophistication

**What it measures:** Whether users leverage the full agent toolkit or rely on a narrow subset. Fluent users tend to use diverse tools appropriate to the task, while less fluent users may over-rely on a single tool (e.g., always asking Claude to edit files rather than reading them first).

**Proposed metrics:**
- **Tool diversity index** — Unique tools used / total tool invocations. High ratio = targeted use; very low ratio = repetitive hammering.
- **Tool appropriateness** — LLM-judged: given the conversation context, were the tools used appropriate? (e.g., using Read before Edit, using Grep for search rather than manual inspection)
- **Tool initiation rate** — How often the user explicitly requests tool use vs. Claude choosing tools autonomously. Users who direct tool use show more understanding of the agent's capabilities.

**Collection:** Tool diversity index and initiation rate are computable from existing JSONL data (tool_use_count, tools_used already extracted). Tool appropriateness would require LLM judgment — either added to the existing scoring prompt or as a separate lightweight assessment.

**Scoring mechanism:** Tool diversity = algorithmic (ratio computation). Tool appropriateness = LLM-judged (add to scoring prompt or separate call). Tool initiation = algorithmic (parse user prompts for tool-directing language).

**Integration complexity:** Low for diversity (data already extracted). Medium for appropriateness (prompt change + eval regression testing). Medium for initiation (new parser logic to detect tool-directing language in prompts).

**Pitfalls:** Tool diversity alone can be misleading — a focused debugging session legitimately uses fewer tools. Need to normalize by task type. Gaming: users could artificially invoke diverse tools. Mitigation: weight by appropriateness, not just diversity.

**Research backing:** Novel for coding agents specifically, but tool use diversity as a fluency signal is consistent with the AI Fluency Index finding that fluent users exhibit more behaviors simultaneously (2.67 additional behaviors per iteration user).

### 1.2 Planning Behavior

**What it measures:** Whether users engage in upfront planning before diving into implementation. Plan Mode is a strong fluency signal — it indicates the user understands task decomposition and wants Claude to think before acting.

**Proposed metrics:**
- **Plan mode adoption rate** — Fraction of conversations where plan mode was used. Currently passed as a boolean but not scored.
- **Plan-to-execution ratio** — In conversations with plan mode, how many prompts occur in planning vs. execution phases? A healthy ratio suggests thoughtful decomposition.
- **Plan adherence** — LLM-judged: did the user follow the plan, or did execution diverge significantly? Divergence isn't necessarily bad (plans should adapt), but complete abandonment may signal poor planning.

**Collection:** Plan mode boolean already extracted. Plan-to-execution ratio requires detecting which prompts are in "planning" vs. "execution" mode — could use the `planContent` field presence on user messages. Plan adherence requires LLM judgment comparing plan content to subsequent prompts.

**Scoring mechanism:** Adoption rate = algorithmic. Plan-to-execution ratio = algorithmic (planContent field parsing). Plan adherence = LLM-judged (expensive, likely a separate scoring pass).

**Integration complexity:** Low for adoption rate (already in template). Medium for ratio (minor parser enhancement). High for adherence (new LLM call, cost considerations).

**Pitfalls:** Not all tasks benefit from plan mode — quick fixes and simple questions shouldn't penalize users for skipping it. Need task-size normalization. Also, plan mode may evolve or be deprecated as Claude Code's UX changes.

**Research backing:** Task decomposition is one of the 11 fluency behaviors (clarifying_goals) but plan mode usage specifically is novel. Anthropic's Claude Code Best Practices recommends upfront planning for complex tasks.

### 1.3 Extended Thinking Utilization

**What it measures:** Whether users enable/leverage extended thinking for complex reasoning tasks. thinking_count is already extracted and passed to scoring but only as context.

**Proposed metrics:**
- **Thinking utilization rate** — thinking_count / assistant_message_count. What fraction of Claude's responses involved extended thinking?
- **Thinking-task alignment** — LLM-judged: was extended thinking used for tasks that genuinely benefited from deeper reasoning (architecture decisions, complex debugging) vs. simple tasks where it was unnecessary?

**Collection:** Already extracted. Alignment requires LLM judgment.

**Scoring mechanism:** Utilization rate = algorithmic. Task alignment = LLM-judged.

**Integration complexity:** Low (data already available). Medium for alignment (prompt modification).

**Pitfalls:** Thinking is often model-controlled, not user-controlled in Claude Code. Users may not have direct control over when thinking activates, making this more of a "conversation complexity" signal than a fluency signal. Important distinction.

### 1.4 Conversation Management

**What it measures:** How effectively users manage long conversations — a critical skill for coding agents where context windows are finite and expensive.

**Proposed metrics:**
- **Prompt conciseness** — Average prompt length relative to task complexity. Fluent users write focused prompts; less fluent users dump entire error logs or ramble.
- **Context reset frequency** — How often a user starts a new conversation for the same project within a short window. Frequent resets may indicate inability to manage context, OR healthy scoping. Ambiguous without additional signals.
- **Turn efficiency** — Prompts required to achieve the apparent goal. Fewer turns for comparable tasks suggests higher fluency. Extremely hard to normalize.
- **Conversation duration distribution** — Very short conversations (1-2 prompts) vs. very long ones (50+ prompts). A healthy mix suggests task-appropriate scoping.

**Collection:** Most computable from existing data (prompt lengths, message counts, timestamps). Goal achievement would require LLM judgment.

**Scoring mechanism:** Mostly algorithmic with optional LLM assessment for goal achievement.

**Integration complexity:** Low to medium. Duration and length stats are trivially computable. Goal achievement is hard.

**Pitfalls:** "Efficiency" is deeply context-dependent. A 50-prompt conversation implementing a complex feature is appropriate; a 50-prompt conversation fixing a typo is not. Normalizing by task complexity is the fundamental challenge. Without it, these metrics may be misleading.

**Research backing:** The AI Fluency Index notes that "artifact creation" changes conversation dynamics (more directive, less evaluative). Conversation management in coding agents is a novel research area.

### 1.5 Model Selection Awareness

**What it measures:** Whether users choose appropriate models for different tasks. Claude Code supports multiple models (Opus for complex reasoning, Sonnet for quick tasks, Haiku for simple operations).

**Proposed metrics:**
- **Model-task alignment** — Do users select higher-capability models for complex tasks and cheaper models for simple ones?
- **Model switching frequency** — Do users change models during a conversation based on task needs?

**Collection:** Model field already extracted per assistant message. Task complexity would require LLM judgment or proxy metrics (prompt length, tool use patterns).

**Scoring mechanism:** Algorithmic (model field analysis) + LLM-judged (task complexity assessment).

**Integration complexity:** Medium. Model data exists. The challenge is defining "appropriate" model selection without being prescriptive.

**Pitfalls:** Many users are on Max plans and always use Opus because it's included. Model selection may reflect subscription tier, not fluency. Also, Anthropic's recommended model may change. High gaming potential (just switch models randomly).

**Research backing:** Novel. No published research on model selection as a fluency signal. Could be interesting but risky to score.

### 1.6 Subagent Awareness

**What it measures:** Currently, subagent (sidechain) sessions are filtered out entirely. But a user who effectively uses Claude Code's Agent tool (spawning subagents for parallel work) is demonstrating advanced fluency.

**Proposed metrics:**
- **Subagent utilization** — Does the user trigger Agent tool use for appropriate parallelizable tasks?
- **Subagent-to-main coherence** — When subagents complete, does the user integrate results effectively?

**Collection:** Would require un-filtering sidechain sessions and correlating them with parent conversations. Parser changes needed.

**Scoring mechanism:** LLM-judged (requires understanding the relationship between parent and child sessions).

**Integration complexity:** High. Significant parser and conversation assembly changes. The current architecture intentionally excludes sidechains.

**Pitfalls:** Subagent spawning is often Claude's decision, not the user's. Hard to attribute fluency to the user when the agent autonomously decides to spawn subagents.

---

## Direction 2: GitHub Outcome Metrics

These metrics measure the RESULTS of AI-assisted coding, not just the interaction quality. The insight is that fluent Claude Code usage should correlate with measurable outcomes in the codebase.

### 2.1 Commit Quality

**What it measures:** Whether AI-assisted work produces clean, well-structured commits.

**Proposed metrics:**
- **Commit message quality** — LLM-judged: are commit messages descriptive, following conventions (conventional commits, etc.)?
- **Commit size distribution** — Average lines changed per commit. Very large commits may indicate poor decomposition; very small ones may indicate excessive granularity.
- **Commit frequency** — Commits per conversation or per day. Regular committing suggests disciplined workflow.

**Collection:** `gh api` or `git log` — similar to what Quick Wins already fetches. Would need to correlate commits with conversation timestamps to attribute them.

**Scoring mechanism:** Commit message quality = LLM-judged. Size and frequency = algorithmic.

**Integration complexity:** Medium. GitHub data fetching exists (Quick Wins). The hard part is temporal correlation — which commits came from which conversation?

**Pitfalls:** Commit patterns are heavily influenced by team norms, CI requirements, and personal workflow preferences. A squash-merge team will have different patterns than a team that preserves individual commits. Also, many Claude Code users let Claude make commits directly, so commit quality may reflect Claude's defaults rather than user fluency.

**Research backing:** Commit patterns are studied in software engineering research (e.g., "Good Commit Messages" studies) but not in the context of AI-assisted coding. Novel application.

### 2.2 PR Metrics

**What it measures:** The quality and efficiency of pull requests produced during AI-assisted coding sessions.

**Proposed metrics:**
- **Commits per PR** — Proxy for task decomposition quality. Many small commits in a PR may indicate iterative Claude-assisted development (potentially good). A single massive commit may indicate delegation without review.
- **PR review cycle time** — Time from PR creation to merge. Shorter cycles may correlate with higher-quality AI-assisted code (fewer review rounds).
- **PR description quality** — LLM-judged: does the PR have a clear description, test plan, and summary?
- **Review comment density** — Comments per PR. Many review comments may indicate lower code quality from the AI-assisted session.
- **First-pass approval rate** — PRs approved without change requests. Higher rate suggests higher-quality output.

**Collection:** `gh api repos/{owner}/{repo}/pulls` — PR data is readily available. Requires temporal correlation with conversations.

**Scoring mechanism:** Most metrics are algorithmic. PR description quality = LLM-judged.

**Integration complexity:** Medium to high. API calls exist but attribution (which PR came from which conversation) is the key challenge. Could use branch name + timestamp matching.

**Pitfalls:** PR metrics are team-dependent (some teams rubber-stamp reviews, others are rigorous). Solo developers have no review data. PRs may span multiple conversations. High variability makes scoring unreliable without significant normalization.

### 2.3 Bug Fix Correlation ("Error Rate")

**What it measures:** Whether AI-assisted features require subsequent bug fixes — a proxy for code quality.

**Proposed metrics:**
- **Fix-after-feature rate** — For commits/PRs tagged as features, how often is a subsequent fix needed within N days?
- **Revert rate** — How often are AI-assisted commits reverted?
- **Bug introduction rate** — Commits that appear in `git blame` for lines later changed in a bug fix commit.

**Collection:** Requires git history analysis — `git log`, `git blame`, commit message parsing (looking for `fix:` conventional commits that reference earlier features). Complex temporal correlation needed.

**Scoring mechanism:** Algorithmic (git history analysis).

**Integration complexity:** High. Requires deep git history analysis, conventional commit parsing, and heuristic attribution. No existing infrastructure for this. Also requires significant historical data — can't score this until the user has weeks/months of history.

**Pitfalls:** This is the most challenging metric to implement reliably:
- **Attribution problem:** Was the bug caused by the user's poor prompt, Claude's incorrect code, or a legitimate edge case?
- **Time horizon:** How long after a feature is a fix still "related"?
- **Confounding factors:** Complex features naturally have more bugs regardless of AI fluency
- **Conventional commit dependency:** Only works if the project uses structured commit messages
- **Gaming:** Users could avoid fixing bugs (or avoid labeling fixes as fixes) to improve their score

**Research backing:** Bug prediction from commit patterns is an active research area in software engineering (e.g., "Predicting Defects" studies), but applying it to AI-assisted coding is novel and largely unvalidated.

### 2.4 Test Coverage Impact

**What it measures:** Whether AI-assisted coding sessions produce or improve test coverage.

**Proposed metrics:**
- **Test-to-code ratio** — In commits from AI-assisted sessions, what fraction of changed lines are test code?
- **Test addition rate** — Do conversations that produce features also produce tests?

**Collection:** File path heuristics (files in `test/`, `tests/`, `__tests__/`, `*.test.*`, `*.spec.*`) applied to commit diffs.

**Scoring mechanism:** Algorithmic (file path analysis on commit diffs).

**Integration complexity:** Medium. Git diff analysis with file classification. The test detection heuristic is straightforward but may miss unconventional test locations.

**Pitfalls:** Test-to-code ratio varies enormously by project, language, and testing philosophy. Some tasks (refactoring, config changes) legitimately don't need tests. Could penalize users working on infrastructure or documentation.

### 2.5 Code Churn

**What it measures:** How stable the code produced during AI-assisted sessions is.

**Proposed metrics:**
- **Rework rate** — Lines changed in a conversation that are changed again within N days.
- **Self-churn vs. other-churn** — Is the same user reworking their own code (potential iteration signal) or are others fixing it (potential quality signal)?

**Collection:** Git blame + temporal analysis. Heavy computation.

**Scoring mechanism:** Algorithmic.

**Integration complexity:** High. Requires cross-referencing git blame across time windows.

**Pitfalls:** Code churn is a well-known flawed metric — high churn can indicate healthy iteration (refactoring, improvement) or poor initial quality. Without understanding intent, the signal is ambiguous.

---

## Direction 3: Other Scoring Dimensions

### 3.1 Prompt Efficiency (Cost-Aware Fluency)

**What it measures:** Whether users achieve their goals with reasonable token expenditure. This bridges the gap between fluency (behavioral quality) and efficiency (resource consumption).

**Proposed metrics:**
- **Cost per goal** — Estimated cost to complete a conversation's apparent objective. Requires goal detection (LLM-judged).
- **Cache utilization** — cache_hit_rate as a fluency signal. Users who structure conversations to leverage caching (building on context rather than restating) are more efficient.
- **Token efficiency ratio** — output_tokens / input_tokens. High ratios suggest Claude is doing significant generation; low ratios suggest heavy context loading. Neither is inherently good/bad, but the ratio relative to task type is informative.
- **Prompt-to-output leverage** — Total useful output (code generated, files modified) relative to prompt investment. Hard to quantify "useful output."

**Collection:** Token metrics already extracted. Cache hit rate already computed. Goal detection requires LLM judgment.

**Scoring mechanism:** Algorithmic (ratios from existing data) + LLM-judged (goal detection).

**Integration complexity:** Low for token ratios (data exists). High for goal-based efficiency (requires defining and detecting goals).

**Pitfalls:** Cost efficiency can conflict with quality. Cheap conversations that produce buggy code aren't "efficient." Need to couple efficiency metrics with quality signals. Also, token costs vary by model — normalizing across Opus/Sonnet/Haiku is needed.

**Research backing:** Novel for coding agents. Anthropic's cost management docs discuss token optimization but not as a fluency signal.

### 3.2 Error Recovery Patterns

**What it measures:** How users respond to failures — a critical fluency dimension for coding agents where errors are frequent (failed tests, compilation errors, runtime crashes).

**Proposed metrics:**
- **Recovery strategy diversity** — When Claude's code fails, does the user try different approaches (debugging, reading logs, asking for explanation) or just repeat "fix it"?
- **Escalation appropriateness** — Does the user appropriately escalate (e.g., switching from "fix this test" to "let's reconsider the approach") when iterative fixes fail?
- **Error context provision** — When reporting errors, does the user include relevant context (error messages, stack traces, what they tried)?
- **Failure-to-resolution turns** — How many prompts does it take to recover from an error? Fewer turns suggests more effective error communication.

**Collection:** Requires detecting error/failure states in conversation flow. Could use heuristics (messages containing "error", "failed", "doesn't work", "try again") or LLM judgment. Error context provision could be partially automated (detecting pasted stack traces vs. vague complaints).

**Scoring mechanism:** Mix of heuristic detection and LLM judgment. Recovery strategy diversity could be a new boolean behavior. Escalation appropriateness requires LLM assessment.

**Integration complexity:** Medium. Error detection heuristics are straightforward. Strategy assessment requires prompt changes.

**Pitfalls:** Error frequency depends heavily on task difficulty, not user fluency. A user tackling a hard problem will have more errors. Need to score recovery QUALITY, not error FREQUENCY.

**Research backing:** Error recovery is implicit in several existing behaviors (adjusting_approach, iteration_and_refinement) but not scored as a distinct dimension. The Coding Skills Formation paper notes that "iterative AI debugging" is a low-quality pattern — error recovery metrics would add nuance to this classification.

### 3.3 Learning Trajectory

**What it measures:** Whether a user's fluency improves over time — the meta-skill of getting better at using AI.

**Proposed metrics:**
- **Score trend** — Already computed (weekly sparkline). Could be formalized as a scored metric.
- **Behavior acquisition curve** — Which new behaviors does the user adopt over time? Rapid acquisition suggests active learning.
- **Recommendation uptake** — After viewing recommendations, do subsequent conversations show improvement in the recommended behaviors? Direct feedback loop measurement.
- **Skill plateau detection** — Identify when a user's scores stabilize and suggest new challenges.

**Collection:** Historical score data already cached. Recommendation uptake requires correlating recommendation views with subsequent scores (would need new event tracking).

**Scoring mechanism:** Algorithmic (trend analysis over cached scores).

**Integration complexity:** Low for trend formalization (data exists). Medium for recommendation uptake (needs event tracking). High for plateau detection (needs sufficient historical data + statistical analysis).

**Pitfalls:** Learning trajectory is inherently slow — weeks/months of data needed. Short-term noise can mask real trends. Also, a user who is already expert won't show improvement — shouldn't be penalized for a flat trajectory at a high level.

**Research backing:** The AI Fluency Index is a snapshot, not a longitudinal study. Learning trajectories in AI-assisted coding are entirely novel.

### 3.4 Verification Behavior

**What it measures:** Whether users verify Claude's output before accepting it — a critical safety and quality behavior for coding agents.

**Proposed metrics:**
- **Test-before-commit rate** — Does the user run tests (detected via tool use: Bash with test commands) before committing code?
- **Review-before-accept rate** — Does the user read files or diffs after Claude makes changes, before moving on?
- **Verification prompt rate** — How often does the user ask Claude to verify its own work ("does this handle edge case X?", "run the tests")?

**Collection:** Tool use sequence analysis (detecting Read/Grep after Edit, Bash with test commands, etc.). Verification prompts detectable via heuristics or LLM judgment.

**Scoring mechanism:** Algorithmic (tool use sequence patterns) + LLM-judged (verification prompt detection).

**Integration complexity:** Medium. Tool use sequences are in the data. Pattern detection requires new analysis logic.

**Pitfalls:** Verification behavior may be influenced by trust level in the AI (which itself changes over time). Over-verification (checking every single change) could indicate low trust rather than high fluency. Also, Claude Code often runs tests automatically — hard to distinguish user-initiated verification from agent-initiated.

**Research backing:** The existing `checking_facts` behavior partially covers this, but verification in coding agents is more specific (test execution, diff review) than general fact-checking. Novel extension of existing research.

### 3.5 Temporal Patterns

**What it measures:** Work rhythm and session management patterns that may correlate with effective AI collaboration.

**Proposed metrics:**
- **Deep work session length** — Duration of uninterrupted coding sessions. Longer focused sessions may correlate with higher-quality output.
- **Break-after-complexity** — Does the user take breaks after complex conversations? Research suggests cognitive breaks improve decision-making.
- **Time-of-day effectiveness** — Do fluency scores vary by time of day? Could provide personalized insights ("your best work happens between 9-11am").

**Collection:** Timestamps already extracted. Gap analysis tool (`analyze_gaps.py`) already exists for inter-prompt timing.

**Scoring mechanism:** Algorithmic (timestamp analysis).

**Integration complexity:** Low (data and analysis tools exist). But should these be scored, or just displayed as insights?

**Pitfalls:** Temporal patterns are deeply personal and influenced by factors outside coding (meetings, family, timezone). Scoring them risks penalizing night owls or people with non-traditional schedules. Better suited as **insights** rather than **scores**.

**Research backing:** Deep work research (Cal Newport) and cognitive fatigue studies support the value of temporal patterns, but applying them to AI-assisted coding is novel.

### 3.6 Context Bridging (Cross-Conversation Coherence)

**What it measures:** Whether users effectively maintain project context across separate conversations — a skill that matters because conversations have finite context windows.

**Proposed metrics:**
- **Context restatement quality** — When starting a new conversation on the same project, does the user provide sufficient context about prior work?
- **Reference to prior decisions** — Does the user mention earlier conversations' decisions or outcomes?
- **CLAUDE.md maintenance** — Does the user keep their CLAUDE.md updated as a persistent context bridge?

**Collection:** Cross-conversation analysis (comparing prompts across conversations in the same project). CLAUDE.md change detection via git history.

**Scoring mechanism:** LLM-judged (context quality assessment) + algorithmic (CLAUDE.md change frequency).

**Integration complexity:** High. Cross-conversation analysis requires comparing across scoring windows. CLAUDE.md change detection needs git integration.

**Pitfalls:** Some users rely on long single conversations rather than multiple shorter ones — different strategy, not necessarily worse. Also, CLAUDE.md maintenance is already partially scored via config scoring.

---

## Metric Prioritization Matrix

| Metric | Fluency Signal Strength | Data Availability | Integration Cost | Gaming Risk | Recommendation |
|--------|------------------------|-------------------|-----------------|-------------|----------------|
| Tool diversity index | Medium | Already extracted | Low | Medium | **Phase 1** |
| Plan mode adoption | Medium | Already extracted | Low | Low | **Phase 1** |
| Cache utilization | Medium | Already extracted | Low | Low | **Phase 1** |
| Error recovery patterns | High | Needs parsing | Medium | Low | **Phase 2** |
| Verification behavior | High | Needs sequence analysis | Medium | Low | **Phase 2** |
| Prompt conciseness | Medium | Already extracted | Low | Medium | **Phase 2** |
| Learning trajectory | High | Historical data exists | Medium | Low | **Phase 2** |
| Commit quality | Medium | Needs GitHub API | Medium | Medium | **Phase 3** |
| Tool appropriateness | High | Needs LLM judgment | Medium | Low | **Phase 3** |
| PR metrics | Medium | Needs GitHub API | High | High | **Defer** |
| Bug fix correlation | High | Needs deep git analysis | High | High | **Defer** |
| Code churn | Low-Medium | Needs git blame analysis | High | High | **Defer** |
| Model selection | Low | Already extracted | Low | High | **Defer** |
| Temporal patterns | Low | Already extracted | Low | N/A | **Insight only** |
| Subagent awareness | Medium | Needs parser changes | High | Medium | **Defer** |
| Context bridging | High | Needs cross-conv analysis | High | Low | **Defer** |

## Key Insight: Two Classes of Metrics

The proposed metrics fall into two fundamentally different classes:

1. **Interaction metrics** (Direction 1 + parts of Direction 3) — Measure HOW the user interacts with the agent. These extend the current behavioral scoring naturally. They use existing data, fit the current LLM-as-judge architecture, and can be validated with the golden eval set approach.

2. **Outcome metrics** (Direction 2) — Measure WHAT the user produces. These are a fundamentally different scoring dimension. They require external data sources (GitHub), complex attribution (which conversation produced which commit?), and face serious normalization challenges (team norms, project maturity, task difficulty).

**Recommendation:** Start with interaction metrics (Phase 1-2). They integrate naturally with the current architecture, use existing data, and have lower risk. Outcome metrics should be researched further before implementation — the attribution and normalization challenges are significant and could produce misleading scores without careful design.

## Integration Architecture

New metrics should integrate via one of three mechanisms:

1. **Extend the scoring prompt** — Add new signals to `scoring/v1.0.md` template and new boolean behaviors to the JSON response. Requires golden eval set expansion and prompt versioning.
2. **Computed metrics layer** — Algorithmic metrics computed from existing parsed data, displayed alongside (but separate from) LLM-judged behavioral scores. No API cost impact.
3. **Separate scoring pass** — For expensive metrics (e.g., cross-conversation analysis, GitHub outcome correlation) that don't fit in the per-conversation scoring call. Higher cost, separate caching.

The computed metrics layer (option 2) is the lowest-risk integration path and should be the default for Phase 1 metrics.

## Phase 1 Implementation Sketch

Phase 1 adds three algorithmic metrics computed from existing `ParsedConversation` data. No API calls, no prompt changes, no eval regression risk.

### Computed Metrics Module

New module (`agentMetrics.ts` / `agent_metrics.py`) that takes `ParsedConversation[]` and returns:

```typescript
interface AgentMetrics {
  tool_diversity_index: number      // unique_tools / tool_use_count (0-1)
  plan_mode_adoption_rate: number   // conversations_with_plan / total_conversations (0-1)
  avg_cache_hit_rate: number        // mean of per-conversation cache_hit_rate (0-1)
}
```

### Display

Add an "Agent Metrics" card/section to the Fluency Score tab (or a new tab), showing:
- Tool diversity gauge (0-100%)
- Plan mode adoption percentage
- Cache efficiency percentage
- Trend sparklines (per-week, reusing existing infrastructure)

### Data Flow

```
ParsedConversation[] → computeAgentMetrics() → AgentMetrics
                                                    ↓
                                            Frontend rendering
```

No caching needed (computation is instant from already-parsed data). Recomputed on each conversation load.
