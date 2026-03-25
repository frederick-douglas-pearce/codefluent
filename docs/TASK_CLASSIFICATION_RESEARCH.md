# Research: Task Classification for CodeFluent

## Why This Matters

The [New Metrics Research](./NEW_METRICS_RESEARCH.md) repeatedly identifies task context as the missing normalizer. Tool diversity, prompt conciseness, conversation length, error recovery — none of these can be meaningfully scored without knowing what kind of task the user was performing. A 50-prompt debugging conversation is appropriate; a 50-prompt typo fix is not. Task classification is the foundational capability that unlocks the broader metrics effort.

## Problem Statement

CodeFluent currently scores conversations without knowing what type of work they represent. This creates two problems:

1. **Scoring fairness** — A user debugging a complex race condition looks the same as a user writing a README. The behaviors that indicate fluency differ by task type (e.g., `checking_facts` matters more for debugging than for scaffolding).
2. **Metrics normalization** — Phase 1 agent metrics (tool diversity, plan mode adoption, cache utilization) vary systematically by task type. Without classification, we can't distinguish "low tool diversity because the task was simple" from "low tool diversity because the user is unsophisticated."

## Research Foundations

### Academic Taxonomies

Software task classification has been studied since 1976. The taxonomies converge:

**Swanson (1976) — the foundational 3-category model:**
- **Corrective** — fixing defects/bugs
- **Adaptive** — modifying for environmental changes
- **Perfective** — improving quality, performance, maintainability

**ISO/IEC/IEEE 14764:2022 — extended to 4 categories on two dimensions:**

|  | Correction | Enhancement |
|---|---|---|
| **Proactive** | Preventive | Perfective |
| **Reactive** | Corrective | Adaptive |

**Mockus & Votta (2000)** validated that commit message keywords could predict change type with ~60-70% accuracy, and that corrective changes are typically smaller (median ~4 lines) while adaptive changes are larger.

**Hindle et al. (2009)** extended to 7 categories for large commits and showed automated classification via decision trees on commit metadata (lines changed, file types, message text) at ~60% accuracy.

**Hericko et al. (2022)** achieved 75.9% F1-score classifying commits into Swanson categories using Random Forest with word embeddings on 1,793 labeled commits.

**Zeng et al. (ICSE 2025)** — "A First Look at Conventional Commits Classification" — found that the #1 challenge developers face with conventional commits is **type confusion** (which type to use). This validates that classification is hard even for humans, and suggests automated assistance has value.

### Industry Taxonomies

**Conventional Commits / commitlint** (11 types, based on Angular convention):

| Type | Description | Maps to Swanson |
|------|-------------|-----------------|
| `feat` | New feature | Adaptive |
| `fix` | Bug fix | Corrective |
| `docs` | Documentation only | — |
| `style` | Formatting, no code change | Perfective |
| `refactor` | Restructuring, no behavior change | Perfective/Preventive |
| `perf` | Performance improvement | Perfective |
| `test` | Adding/correcting tests | Preventive |
| `build` | Build system or dependencies | Adaptive |
| `ci` | CI configuration | — |
| `chore` | Maintenance tasks | — |
| `revert` | Reverting a previous commit | — |

**Angular** (the original source) uses only 8 types — deliberately excludes `chore` (too vague), `style` (subsumed by `refactor`), and `revert` (handled by commit format).

**DORA / "Four Types of Work"** (from The Phoenix Project):
1. Business projects (features)
2. Internal IT projects (infrastructure, tooling)
3. Changes (deployments, updates)
4. Unplanned work (incidents, firefighting)

**Gitmoji** provides 73 fine-grained activity types but is too granular for classification — it's a vocabulary for describing what happened, not a taxonomy for categorizing why.

### AI-Assisted Coding Task Types

Emerging research on what people use AI coding tools for converges on ~8-10 categories:

| Category | % of Developer Time (Microsoft Research) |
|----------|----------------------------------------|
| Code maintenance | ~19% |
| Writing new code | ~11% |
| Testing | ~12% |
| Debugging | ~9% |
| Architecture/design | ~6% |
| Code review | ~5% |
| Documentation | ~5% |

**Barke et al. (2023)** identified two meta-modes for AI coding: **acceleration** (clear intent, using AI to go faster) and **exploration** (uncertain intent, using AI to investigate). This maps to a useful high-level split.

---

## Existing Tooling Landscape

### Parsers (extract declared type from conventional commits)

| Tool | What It Does | Language | Maturity |
|------|-------------|----------|----------|
| **`conventional-commits-parser`** | Parses commit message → `{type, scope, subject}` | Node.js (npm, ~4M weekly downloads) | Production-grade |
| **`@commitlint/parse`** | Same parsing, lighter weight | Node.js (npm) | Production-grade |
| **`@conventional-commits/parser`** | Reference implementation, returns AST | Node.js (npm, ~80K weekly downloads) | Stable |
| **`git-cliff`** | Regex-based commit grouping, configurable | Rust with npm wrapper | Production-grade |

**Trade-off:** These extract the *declared* type from commits that already follow conventional commits. They don't infer intent from arbitrary text. For CodeFluent, they're useful for classifying commits (Direction 2 metrics) but not for classifying conversations (Direction 1 metrics).

### ML Models (infer type from text)

| Tool | Taxonomy | Accuracy | Language | Status |
|------|----------|----------|----------|--------|
| **`dev-analyzer/commit-message-model`** (HuggingFace) | 5 categories (adaptive, perfective, corrective, administrative, other) | Unknown (low adoption, ~8 downloads/month) | Python (transformers) | Unproven |
| **Ticket Tagger** (FastText) | 3 categories (bug, enhancement, question) | ~82% F1 | TypeScript | **Archived** (Sept 2025) |

**Trade-off:** No production-grade, well-adopted ML model exists specifically for commit or task classification. The HuggingFace model is interesting but unvalidated. Fine-tuning a small model (DistilBERT) on labeled data would require building a labeled dataset first.

### LLM-as-Judge (classify via prompt)

| Approach | Cost | Accuracy | Integration |
|----------|------|----------|-------------|
| **Zero-shot** (describe categories in prompt) | Lowest | ~60-70% (estimated from literature) | Add field to existing scoring prompt |
| **Few-shot** (3-5 examples per category) | Low | ~80%+ (Cohen's Kappa 0.63→0.81 with examples) | Add examples to scoring prompt |
| **Fine-tuned small model** | High upfront, cheap inference | ~85%+ with sufficient data | Separate model, separate infrastructure |

**Trade-off:** Few-shot LLM classification within the existing scoring prompt is the clear winner for CodeFluent. It's nearly free (the conversation text is already sent), it uses existing infrastructure (Anthropic API, prompt versioning, eval framework), and the accuracy improvement from few-shot examples is well-documented.

### DevEx Platforms (SaaS)

**Swarmia, Jellyfish, LinearB, Faros AI** — all provide task/investment classification features, but none expose usable APIs or libraries for integration. They're full platforms, not composable tools. **Faros AI Community Edition** is open source (TypeScript, GraphQL) but requires deploying Hasura + PostgreSQL + Metabase — massive overhead for just classification.

### GitHub Actions (structural classification)

**`actions/labeler`** auto-labels PRs based on file paths changed (glob patterns). **`github/issue-labeler`** labels issues based on regex matching on body text. Both are useful for structural labeling but not for semantic task classification.

---

## Recommended Approach

After reviewing the landscape, I want to push back on any approach that introduces new external dependencies or infrastructure for classification. Here's why:

### Why NOT a separate ML model or external tool

1. **No production-grade model exists** for this domain. The HuggingFace model has 8 downloads/month. Ticket Tagger is archived. We'd be building on unvalidated foundations.
2. **Infrastructure overhead** — Running a Python ML model from a VS Code extension (Node.js) requires subprocess management, model downloads, and cross-platform concerns. This violates the "no database, no authentication, runs locally" design philosophy.
3. **Taxonomy mismatch** — Academic models classify into Swanson categories (corrective/adaptive/perfective) which don't map cleanly to what CodeFluent users care about. We'd need to remap, losing signal.
4. **The data is already going to the LLM** — Every scored conversation already sends up to 20 prompts to Claude Sonnet. Adding a `task_type` field to the response schema costs zero additional API calls.

### Recommended: Hybrid approach with two layers

**Layer 1: Heuristic pre-classification (free, instant)**

Use `conventional-commits-parser` (already an npm ecosystem tool, aligns with our conventional commits workflow) to extract task type from git branch names and any commit messages visible in the conversation. This provides:
- Branch name parsing: `feature/44-...` → `feature`, `fix/46-...` → `bug_fix`
- Commit type extraction if conventional commits are mentioned in prompts
- Keyword detection in prompts as a secondary signal

This layer is deterministic, instant, and free. It serves as a confidence-boosting signal for the LLM layer and as a standalone fallback when scoring is skipped.

**Layer 2: LLM classification within existing scoring call (marginal cost: ~0)**

Add `task_type` and `task_type_confidence` to the scoring prompt's JSON output schema. The conversation text and tool usage signals are already being sent — classification is an incremental ask, not a new API call.

Use few-shot examples (3-5 per category) to achieve ~80%+ accuracy, validated through the existing eval framework.

### Proposed Taxonomy

Derived from the intersection of conventional commits (already in use), academic software maintenance categories (validated), and AI coding tool usage patterns (practical):

| Task Type | Description | Heuristic Signals | Conventional Commit | Swanson |
|-----------|-------------|-------------------|--------------------|---------|
| `feature` | Building new functionality | Branch: `feature/*`; prompts: "implement", "add", "create", "build" | `feat` | Adaptive |
| `bug_fix` | Diagnosing and fixing defects | Branch: `fix/*`; prompts: "fix", "error", "broken", "doesn't work" | `fix` | Corrective |
| `refactor` | Restructuring without behavior change | Prompts: "refactor", "clean up", "reorganize", "rename", "extract" | `refactor` | Perfective |
| `debug` | Investigation and diagnosis (may not result in a fix) | Prompts: "why", "investigate", "understand why"; Read/Grep-heavy tool use | — | Corrective |
| `test` | Writing or updating tests | Prompts: "test", "coverage"; test file paths in tool output | `test` | Preventive |
| `docs` | Documentation, comments, READMEs | Prompts: "document", "README", "explain" | `docs` | — |
| `chore` | Config, CI, dependencies, setup, build | Prompts: "config", "CI", "dependency", "upgrade", "setup" | `chore`, `ci`, `build` | — |
| `exploration` | Learning, researching, understanding code | Question-heavy prompts; Read/Grep-heavy, low Edit; short conversations | — | — |

**Why 8 categories (not fewer or more):**
- Fewer than 6 loses the distinction between `debug` and `bug_fix` (different fluency implications — debugging is exploratory, bug fixing is corrective) and between `refactor` and `feature` (different tool use patterns).
- More than 10 introduces classification ambiguity. The ICSE 2025 paper confirms developers already struggle with 11 conventional commit types. Our LLM classifier would face the same problem.
- 8 categories map cleanly to both conventional commits (developer familiarity) and Swanson categories (academic validation).

**Notable decisions:**
- `debug` is separate from `bug_fix` because debugging conversations have fundamentally different patterns (more exploration, more Read/Grep, fewer Edits) and different fluency signals (error recovery quality matters more than tool diversity).
- `exploration` captures a category that conventional commits doesn't have but that's significant for AI coding tools — conversations where the user is learning, not producing.
- `perf` and `style` from conventional commits are folded into `refactor` to reduce classification ambiguity. If a conversation is about performance optimization, it's functionally a refactoring task from a fluency perspective.

### Multi-label Consideration

Some conversations genuinely span multiple task types (e.g., "implement feature + write tests"). Two approaches:

1. **Primary + secondary** — `task_type: "feature"`, `secondary_task_type: "test"`. Simple, fits JSON schema.
2. **Dominant type only** — Classify by the predominant activity. Simpler, avoids edge cases.

Recommendation: Start with dominant type only (single label). Multi-label adds complexity to normalization logic and the eval framework. Revisit if single-label proves too lossy.

---

## Implementation Plan

### Phase 1: Heuristic Layer

1. **Parse git branch names** from `ParsedConversation.git_branch` field (already extracted):
   - `feature/*`, `feat/*` → `feature`
   - `fix/*`, `bugfix/*`, `hotfix/*` → `bug_fix`
   - `refactor/*` → `refactor`
   - `test/*` → `test`
   - `docs/*` → `docs`
   - `chore/*`, `ci/*`, `build/*` → `chore`
   - Others → `null` (no heuristic classification)

2. **Keyword detection** in first 2-3 user prompts (lightweight regex, no LLM):
   - Error-related keywords → `bug_fix` or `debug`
   - Question patterns → `exploration`
   - Implementation language → `feature`

3. **Output:** `heuristic_task_type: string | null` added to `ParsedConversation`

**Integration:** New utility module (`taskClassification.ts` / `task_classification.py`). Pure function, no dependencies beyond the conversation data. Both interfaces.

**Cost:** Zero (no API calls, no new dependencies beyond optional `conventional-commits-parser` for robustness).

### Phase 2: LLM Classification

1. **Extend scoring prompt** (`shared/prompts/scoring/v2.0.md`):
   - Add `task_type` field to the JSON output schema
   - Add 3-5 few-shot examples showing conversations of different task types
   - Add `task_type_confidence` (high/medium/low) for quality signaling

2. **Merge with heuristic** — If both LLM and heuristic agree, high confidence. If they disagree, flag for potential review or use LLM result with lower confidence.

3. **Extend eval framework:**
   - Add `expected_task_type` to golden set entries (annotate existing 33 entries + add 10-15 new entries for task type diversity)
   - Add `task_type_agreement` check
   - Target Cohen's Kappa > 0.7

4. **Cache integration** — `task_type` stored alongside `ScoreResult` in existing cache. No separate cache needed.

**Cost:** Near-zero incremental API cost (field added to existing scoring call). Eval framework changes are moderate effort but high value.

### Phase 3: Normalization

Once task types are available, the new metrics from `NEW_METRICS_RESEARCH.md` can be normalized:

- **Tool diversity index** → show per task type (feature: expect high diversity; docs: expect low)
- **Plan mode adoption** → weight by task complexity (features should use plan mode; chores shouldn't be penalized for skipping it)
- **Prompt conciseness** → normalize by task type (debugging prompts are naturally longer due to error context)
- **Conversation length** → expected ranges per task type
- **Error recovery patterns** → only score in `debug` and `bug_fix` conversations

This is where task classification pays off — every metric in the new metrics research benefits from task-type normalization.

---

## Available Signals Summary

Signals available from existing `ParsedConversation` data, ranked by classification utility:

| Signal | Source | Classification Power | Notes |
|--------|--------|---------------------|-------|
| `user_prompts` (text) | JSONL parser | **Highest** — direct natural language | Already sent to scoring prompt |
| `git_branch` | JSONL parser | **High** for conventional branch names | Already extracted, free to parse |
| `tools_used` (names) | JSONL parser | **Medium** — tool mix varies by task type | Already extracted |
| `tool_use_count` | JSONL parser | **Low-Medium** — higher for features | Already extracted |
| `used_plan_mode` | JSONL parser | **Medium** — correlates with feature/refactor | Already extracted |
| `thinking_count` | JSONL parser | **Low** — correlates with task complexity | Already extracted |
| `prompt_count` | Computed | **Low** — longer conversations for complex tasks | Already computed |
| `total_tokens` | JSONL parser | **Low** — proxy for conversation complexity | Already extracted |
| Commit messages | `git log` | **High** if conventional commits | Requires new data fetch |
| Issue labels | GitHub API | **High** if well-labeled | Requires new data fetch |

---

## Validation Strategy

1. **Golden set annotation** — Manually label 50 conversations (the existing 33 golden set entries + 17 new ones) with expected task type. This is the ground truth.
2. **Inter-annotator agreement** — Have 2 people label independently, measure Cohen's Kappa. If < 0.7, the taxonomy needs refinement (categories are ambiguous).
3. **LLM self-consistency** — Classify each golden entry twice, measure agreement. Research shows few-shot prompts achieve ~0.81 Kappa.
4. **Heuristic-LLM agreement** — For conversations where heuristic classification is available (branch name), measure agreement with LLM classification. High agreement validates both layers.
5. **Regression testing** — Add task type checks to the eval CI workflow (`eval.yml`). Same cost structure as existing agreement checks (~$0.15/run).

---

## Open Questions

1. **Should task type influence the fluency score itself?** Or should it only be used for normalization of supplementary metrics? Changing the core score formula is a major decision that affects comparability across versions.
2. **How to handle conversations that genuinely span multiple task types?** The dominant-type approach loses information. The multi-label approach adds complexity. Need to assess how common multi-type conversations actually are in real data before deciding.
3. **Should we display task type distribution as a standalone insight?** (e.g., "This week: 40% features, 30% debugging, 20% chores, 10% exploration"). This is low-effort, high-value even without normalization integration.
4. **Temporal task type patterns** — Does the user's task mix change over time? This could be an interesting learning trajectory signal (moving from `exploration` → `feature` as they become more fluent with a codebase).

## References

### Academic
- Swanson, E.B. (1976). "The Dimensions of Maintenance." ICSE.
- Mockus, A. & Votta, L. (2000). "Identifying Reasons for Software Changes Using Historic Databases." ICSM.
- Hindle et al. (2009). "Automatic Classification of Large Changes into Maintenance Categories." IEEE ICPC.
- Hericko et al. (2022). "Commit Classification Into Maintenance Activities Using Word Embeddings." SQAMIA/CEUR-WS.
- Zeng et al. (2025). "A First Look at Conventional Commits Classification." ICSE.
- Levin & Yehudai (2017). "Boosting Automatic Commit Classification." PROMISE.
- Barke et al. (2023). "Grounded Copilot: How Programmers Interact with Code-Generating Models." UC San Diego.
- Meyer et al. (2014). "Software Developers' Perceptions of Productivity." Microsoft Research.
- Minelli, Mocci & Lanza (2015). "I Know What You Did Last Summer." IEEE ICPC.

### Industry Standards
- [Conventional Commits v1.0.0](https://www.conventionalcommits.org/en/v1.0.0/)
- [Angular Commit Message Guidelines](https://github.com/angular/angular/blob/main/contributing-docs/commit-message-guidelines.md)
- [ISO/IEC/IEEE 14764:2022 Software Maintenance](https://www.iso.org/standard/80710.html)
- [commitlint config-conventional](https://github.com/conventional-changelog/commitlint)

### Tools Evaluated
- [`conventional-commits-parser`](https://www.npmjs.com/package/conventional-commits-parser) (npm, ~4M weekly downloads)
- [`@commitlint/parse`](https://www.npmjs.com/package/@commitlint/parse)
- [`git-cliff`](https://git-cliff.org/) (Rust + npm wrapper)
- [`dev-analyzer/commit-message-model`](https://huggingface.co/dev-analyzer/commit-message-model) (HuggingFace)
- [Faros AI Community Edition](https://github.com/faros-ai/faros-community-edition) (TypeScript, open source)
- [Ticket Tagger](https://github.com/rafaelkallis/ticket-tagger) (archived)
