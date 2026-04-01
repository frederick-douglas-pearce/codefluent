# Claude Certified Architect (CCA-F) — Feature Research for CodeFluent

## Purpose

This document analyzes the Anthropic Claude Certified Architect — Foundations (CCA-F) exam to extract feature ideas for CodeFluent. The CCA-F is Anthropic's first official technical certification, launched March 12, 2026. Its 5 competency domains and 6 production scenarios reveal what Anthropic considers "architect-level" Claude usage — a rich source of ideas for expanding CodeFluent's scoring framework beyond the current 11 fluency behaviors.

## 1. Exam Overview

| Attribute | Detail |
|-----------|--------|
| **Full name** | Claude Certified Architect — Foundations (CCA-F) |
| **Launch date** | March 12, 2026 |
| **Platform** | Anthropic Academy (Skilljar) |
| **Questions** | 60 multiple-choice (4 options, 1 correct) |
| **Duration** | 120 minutes, proctored |
| **Scoring** | 100–1000 scale, passing = 720 |
| **Access** | Claude Partner Network members (free to join); first 5,000 partner employees at no cost; GA pricing $99 |
| **Target** | Engineers with 6+ months hands-on production experience with Claude API, Claude Code, and MCP |
| **Retakes** | Mandatory waiting period + new purchase |

**This is not a prompting fundamentals test — it's a systems design exam.** Every question is framed inside one of 6 production scenarios (4 randomly selected per sitting). Wrong answers are designed to represent the exact mistakes engineers make when they understand concepts but haven't thought through production implications.

### The 6 Production Scenarios

1. **Customer Support Resolution Agent** — escalation logic, tool orchestration, error handling
2. **Code Generation with Claude Code** — CLAUDE.md configuration, plan mode, iterative development
3. **Multi-Agent Research System** — hub-and-spoke orchestration, context isolation, synthesis
4. **Developer Productivity with Claude** — workflow optimization, cost management
5. **Claude Code for CI/CD** — headless mode (`-p`), JSON output, session isolation
6. **Structured Data Extraction** — JSON Schema, tool_use, validation loops

### Future Roadmap

Anthropic has confirmed additional certifications targeting sellers, developers, and advanced architects for later in 2026, making CCA-F the entry point of a credential stack.

Sources:
- [DEV Community: Inside Anthropic's CCA Program](https://dev.to/mcrolly/inside-anthropics-claude-certified-architect-program-what-it-tests-and-who-should-pursue-it-1dk6)
- [Medium: The CCA Is Here](https://medium.com/@reliabledataengineering/the-claude-certified-architect-is-here-and-its-unlike-any-ai-certification-before-it-7abe0fe678d1)
- [LowCode Agency: How to Become a CCA](https://www.lowcode.agency/blog/how-to-become-claude-certified-architect)

---

## 2. The Five Competency Domains

### Domain 1: Agentic Architecture & Orchestration (27% of exam)

**The heaviest-weighted domain.** Covers designing multi-agent systems, managing task decomposition, and implementing hub-and-spoke models.

**Skills tested:**
- **Agentic loop lifecycle** — Messages API, `stop_reason` handling (`"tool_use"` vs `"end_turn"`), tool result appending
- **Multi-agent orchestration** — Hub-and-spoke architecture with coordinator + subagents; context isolation (each subagent receives only task-relevant information, never full coordinator history)
- **Task tool** — Coordinator's `allowedTools` must include "Task" for spawning subagents; multiple Task calls in a single response run simultaneously (parallel execution)
- **Hooks & programmatic enforcement** — PreToolUse and PostToolUse hooks for deterministic enforcement. **"The single most tested concept across the entire exam is programmatic enforcement vs. prompt-based guidance."**
- **Session management** — `--resume` (continues with full context), `fork_session` (independent branches for parallel exploration), named sessions
- **Task decomposition** — Prompt chaining (predictable linear tasks) vs. dynamic adaptive decomposition (unpredictable tasks where intermediate results change approach)
- **Agent SDK hooks** — Intercept tool calls for validation, normalize tool results, custom logging

**Critical anti-patterns tested (common distractors):**
- Parsing natural language output instead of checking `stop_reason`
- Setting arbitrary iteration caps as the primary stopping mechanism
- Sharing full coordinator conversation history with subagents (context pollution)
- Overly narrow task decomposition creating coverage gaps

**Key exam principle:** When a system behavior needs to be guaranteed, the exam consistently rewards the programmatic solution (hooks) over the "add it to the prompt" solution.

### Domain 2: Tool Design & MCP Integration (18% of exam)

**Covers designing MCP servers and managing tool boundaries to prevent reasoning overload.**

**Skills tested:**
- **Three MCP primitives** — Tools (executable functions), Resources (data), Prompts (templates)
- **Tool descriptions** — Primary selection mechanism; must emphasize input formats, examples, and edge cases
- **Structured error responses** — `isError` flag, `errorCategory`, `isRetryable` fields in MCP responses
- **Tool distribution** — 4–5 tools per agent maximum with scoped access to prevent reasoning overload
- **`tool_choice` modes** — `auto` (model decides), `any` (must use some tool), forced specific tool
- **MCP server configuration** — `.mcp.json` (project-level) vs `~/.claude.json` (user-level)
- **Built-in tools** — Read, Write, Edit, Bash, Grep, Glob — understanding contextual usage

**Key exam principle:** Tool descriptions are more important than most people realize. They are the primary mechanism by which the model selects and uses tools correctly.

### Domain 3: Claude Code Configuration & Workflows (20% of exam)

**The most configuration-heavy domain. "Either you know where the files go or you don't."**

**Skills tested:**
- **CLAUDE.md hierarchy:**
  - User-level: `~/.claude/CLAUDE.md` (personal, NOT shared via git)
  - Project-level: `.claude/CLAUDE.md` or root `CLAUDE.md` (shared via git, team standards)
  - Directory-level: scoped to subdirectories
  - Key anti-pattern: "new-team-member trap" — writing shared coding standards in user-level `~/.claude/CLAUDE.md` where new team members cloning the repo will never see them
- **Modular organization** — `@import` syntax for rule composition; `.claude/rules/` directory with YAML frontmatter path-scoping
- **Custom slash commands** — `.claude/commands/` (version-controlled, available on clone)
- **Skills** — `.claude/skills/` with SKILL.md files containing YAML frontmatter (`context: fork`, `allowed-tools`, `argument-hint`)
- **Plan mode vs direct execution** — Decision criteria for when planning mode improves outcome quality
- **Iterative refinement patterns** — Concrete examples, TDD iteration, interview approach
- **CI/CD integration** — `-p` flag for non-interactive/headless mode, `--output-format json`, `--json-schema`; session isolation in CI pipelines (generator vs reviewer patterns)
- **`/compact` and `/memory` commands** — Managing context window and persistent memory
- **Advisory vs deterministic** — CLAUDE.md is advisory (~80% compliance); hooks are deterministic (100%)

**Key exam principle:** If something must happen every time without exception, it must be a hook, not a CLAUDE.md instruction.

### Domain 4: Prompt Engineering & Structured Output (20% of exam)

**"Where the exam gets tricky. Wrong answers sound like good engineering."**

**Skills tested:**
- **Explicit criteria over vague instructions** — Minimizes false positives; disambiguates model decisions
- **Few-shot prompting** — 2–4 examples for ambiguous cases; crafting examples that demonstrate expected patterns
- **Structured output enforcement** — `tool_use` + JSON Schema + `tool_choice` to force a specific tool (correct pattern); NOT "output as JSON" in the prompt (no guarantee) or post-processing with regex (fragile)
- **Validation-retry loops** — Appending specific errors to prompts for self-correction; `detected_pattern` fields for tracking dismissal patterns
- **Batch processing** — Synchronous for blocking operations; Message Batches API for latency-tolerant workflows (50% cost savings, 24-hour processing window)
- **Multi-pass review** — Per-file local analysis followed by cross-file integration pass; self-review limitations (same session retains reasoning context)
- **Extended thinking economics** — Paying 15–20% more in output tokens for explicit reasoning often saves money by reducing iterations

**Key exam principle:** To enforce structured output, use `tool_use` + JSON Schema + `tool_choice` (programmatic). Never rely on "output as JSON" instructions alone.

### Domain 5: Context Management & Reliability (15% of exam)

**"Smallest weighting. But failures here cascade into every other domain."**

**Skills tested:**
- **"Lost in the middle" effect** — Models process beginning and end of long inputs reliably, but middle content gets missed; place key summaries at the beginning and trim verbose tool results
- **Context preservation strategies** — Extract facts into separate blocks; position-aware ordering (recency weighting); scratchpad files for intermediate state; subagent delegation to protect primary context windows
- **Escalation patterns (3 valid triggers):**
  1. Customer explicitly requests a human (honor immediately)
  2. Policy gaps (no rule covers the situation)
  3. Inability to make meaningful progress after multiple attempts
  - **Invalid triggers:** Negative sentiment (does NOT indicate complexity), self-reported model confidence (poorly calibrated)
- **Error propagation** — Subagents return structured error context (failure type, what was attempted, partial results, alternative approaches) — NOT generic failure statuses
- **Context degradation** — Extended sessions cause context staleness; use `/compact`, delegate to subagents
- **Information provenance** — Claim-source mappings, temporal data tracking

**Key exam principle:** Local recovery before coordinator escalation, with partial results reporting. Sentiment is not complexity.

Sources:
- [GitHub: paullarionov/claude-certified-architect guide](https://github.com/paullarionov/claude-certified-architect/blob/main/guide_en.MD)
- [Claude Certifications: Study Guide](https://claudecertifications.com/claude-certified-architect/study-guide)
- [Claude Certifications: Agentic Architecture Domain](https://claudecertifications.com/claude-certified-architect/domains/agentic-architecture)
- [FlashGenius: Ultimate Guide](https://flashgenius.net/blog-article/a-guide-to-the-claude-certified-architect-foundations-certification)
- [Tutorials Dojo: CCA-F Study Guide](https://tutorialsdojo.com/cca-f-claude-certified-architect-foundations-study-guide/)

---

## 3. Study Materials & Preparation Resources

### Official Anthropic Resources

- **Anthropic Academy** (launched March 2, 2026) — 13 free self-paced courses on Skilljar, no paywall
  - [Anthropic Courses Portal](https://anthropic.skilljar.com/)
  - Key courses: "Building with the Claude API" (8.1 hrs), "Claude Code in Action", "Introduction to Model Context Protocol (MCP)", "AI Fluency for Educators"
- **Official Practice Test** — 60 questions, same scenario format as real exam, with explanations after each answer (provided after registration)
- **Official Exam Guide PDF** — [Claude Certified Architect Exam Guide](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor/8lsy243ftffjjy1cx9lm3o2bw/public/1773274827/Claude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf)
- [Anthropic Learn Page](https://www.anthropic.com/learn)
- [Claude Courses](https://claude.com/resources/courses)

### Community Resources

- [GitHub: paullarionov/claude-certified-architect](https://github.com/paullarionov/claude-certified-architect) — Study guide in EN/RU/CN/JP
- [GitHub: SGridworks/claude-certified-architect-training](https://github.com/SGridworks/claude-certified-architect-training) — 12-week program, 110 practice questions
- [GitHub: OlivierAlter/Claude-Certified-Architect-Foundations-Certification-Exam](https://github.com/OlivierAlter/Claude-Certified-Architect-Foundations-Certification-Exam) — 77 scenario-based questions
- [Claude Certifications (free)](https://claudecertifications.com/) — 25 free practice questions, study guides, 12-week plan
- [Towards AI: Complete Guide to Passing](https://pub.towardsai.net/claude-certified-architect-the-complete-guide-to-passing-the-cca-foundations-exam-9665ce7342a8)
- [Medium: Study Guide with Code and Tutor Prompts](https://medium.com/data-science-collective/the-complete-claude-architect-study-guide-with-code-and-tutor-prompts-01f524e95c92)
- [Level Up Coding: SKILL.md Framework](https://levelup.gitconnected.com/i-passed-the-claude-architect-exam-a-guide-to-create-your-own-claude-skill-md-to-get-certified-43d4c3d32ac1)

---

## 4. Coverage Gap Analysis: CCA Domains vs. CodeFluent

| CCA Domain (Weight) | CodeFluent Current Coverage | Gap Assessment |
|---------------------|-----------------------------|----------------|
| **Agentic Architecture (27%)** | Partial: tool diversity counting, extended thinking detection, Plan Mode boolean | No scoring of agentic loop patterns, multi-agent orchestration, hook usage, session management patterns, context isolation |
| **Claude Code Config (20%)** | Strong: CLAUDE.md scored against 3 config-eligible behaviors | No scoring of CLAUDE.md hierarchy quality, slash command usage, skills, rules directory, CI/CD patterns, advisory vs deterministic awareness |
| **Prompt Engineering (20%)** | Strong: all 11 fluency behaviors are prompt quality signals; prompt optimizer with before/after scoring | No scoring of structured output patterns (JSON Schema usage), validation-retry loops, few-shot technique quality, batch API awareness |
| **Tool Design & MCP (18%)** | Minimal: `tool_use` counting only | No MCP integration analysis, tool description quality, error handling patterns, tool distribution analysis |
| **Context & Reliability (15%)** | Partial: conversation analytics track token usage/cost; cache hit rates | No "lost in the middle" detection, escalation pattern analysis, error propagation quality, context degradation scoring |

**Key finding:** CodeFluent's current 11 behaviors are heavily weighted toward prompt engineering quality (Domain 4 — 20%). The CCA reveals that Anthropic considers **architectural competence** (Domains 1, 2, 3, 5) as **80%** of what makes an expert Claude user. This suggests CodeFluent should expand beyond prompt quality to encompass system design patterns, configuration maturity, and context management discipline.

---

## 5. Feature Opportunities

### Tier 1: High Impact, Buildable Now

These features extend existing infrastructure and address the highest-weighted exam domains.

#### 1.1 CLAUDE.md Configuration Maturity Score

**CCA Domain:** Claude Code Configuration (20%)

**What:** Extend the existing config scoring beyond 3 eligible behaviors to assess CLAUDE.md structural quality:
- Does it use project-level placement (`.claude/CLAUDE.md` or root `CLAUDE.md`)? Or is content in user-level `~/.claude/CLAUDE.md` that should be shared?
- Does the project have a `.claude/rules/` directory with path-scoped rules?
- Are custom slash commands defined in `.claude/commands/`?
- Does it define skills (`.claude/skills/` with SKILL.md files)?
- Is the CLAUDE.md modular (uses `@import` for rule composition)?
- Does it distinguish advisory guidelines from hook-enforced rules?

**Why:** The CCA heavily tests CLAUDE.md configuration. CodeFluent already reads and scores CLAUDE.md — extending to structural quality is a natural evolution. The "new-team-member trap" anti-pattern (shared standards in user-level config) is directly testable.

**Implementation:** Extend `scoreWorkspaceClaudeMd()` with a new "Configuration Maturity" dimension. Can be partially algorithmic (file existence checks for `.claude/rules/`, `.claude/commands/`, `.claude/skills/`) and partially LLM-judged (content quality).

**Integration cost:** Low–Medium. File existence checks are trivial. LLM assessment of content quality could piggyback on the existing config scoring API call.

#### 1.2 Programmatic vs Advisory Enforcement Detector

**CCA Domain:** Agentic Architecture (27%)

**What:** Detect conversations where users ask Claude to "always do X" or "never do Y" and flag when these should be hooks instead of prompt instructions. Score whether high-stakes behaviors are enforced programmatically.

**Why:** "The single most tested concept across the entire exam is programmatic enforcement vs. prompt-based guidance." This is a new fluency dimension that's currently unscored.

**Detection approach:**
- Scan user prompts for enforcement language: "always", "never", "must", "required", "every time", "without exception"
- Check if the workspace has `.claude/hooks/` or hook configuration
- LLM-judged: given the enforcement request in the prompt, should this be a hook?

**Implementation:** New behavior for `scoring/v1.0.md` — could be called `preferring_programmatic_enforcement` or incorporated as a sub-signal in the scoring prompt. Alternatively, a computed metric (does the project have hooks configured?) paired with detection of prompt-based enforcement attempts.

**Integration cost:** Medium. Prompt language detection is straightforward. Hook configuration detection requires new file scanning.

#### 1.3 CCA Readiness Assessment / Radar Chart

**CCA Domain:** All 5 domains

**What:** A new tab or section in CodeFluent that maps the user's actual Claude Code usage patterns to CCA competency domains and shows a readiness radar chart:
- **Prompt Engineering** — mapped from existing fluency scores
- **Claude Code Config** — mapped from config scoring + maturity assessment
- **Agentic Architecture** — mapped from tool diversity, plan mode usage, hook adoption
- **Tool Design & MCP** — mapped from MCP configuration presence, tool usage patterns
- **Context Management** — mapped from conversation length distribution, token efficiency, `/compact` usage

**Why:** Directly positions CodeFluent as a CCA prep tool. Users can see "You're strong in Prompt Engineering but weak in Tool Design." Links to relevant Anthropic Academy courses for each weak domain.

**Implementation:** Aggregation layer over existing and new metrics, with a radar chart visualization (Chart.js supports radar charts). Each domain score computed from available signals.

**Integration cost:** Medium. Mostly a presentation layer over existing data. The domain mapping logic needs careful design.

#### 1.4 Structured Output Usage Detection

**CCA Domain:** Prompt Engineering (20%)

**What:** Detect whether conversations use `tool_use` + JSON Schema for structured output (best practice) vs asking "output as JSON" in natural language (anti-pattern). Score this as a fluency signal.

**Why:** The exam explicitly tests this distinction. Detecting it from session data is feasible since `tool_use` blocks are already parsed, and prompt content is already analyzed.

**Detection approach:**
- Scan user prompts for "output as JSON", "respond in JSON format", "return a JSON object" patterns
- Check if the conversation uses `tool_choice` with forced tool selection
- Flag conversations where natural language JSON requests are used without `tool_use` enforcement

**Integration cost:** Low. Pattern detection in existing prompt data.

### Tier 2: Medium Impact, Moderate Effort

#### 2.1 Agentic Pattern Detection

**CCA Domain:** Agentic Architecture (27%)

**What:** Detect agentic coding patterns in conversations:
- Does the user build multi-agent systems? (References to Agent SDK, subagent spawning)
- Does the user use `fork_session`? (Parallel exploration)
- Does the user use `--resume`? (Session continuity)
- Tool diversity at a deeper level — not just counting unique tools, but analyzing orchestration patterns (e.g., Read before Edit, Grep before Write)

**Implementation:** Extends existing `tool_use` detection in `parser.ts`. Session management commands detectable from prompt content.

**Integration cost:** Medium. Parser enhancements needed for session command detection.

#### 2.2 Context Efficiency Scoring

**CCA Domain:** Context Management (15%)

**What:** Analyze conversation token patterns for context management quality:
- Are conversations getting bloated? (Token count growth rate over turns)
- Does the user use `/compact`? (Detectable from session data)
- Are tool results being trimmed? (Compare tool result sizes)
- Score "context hygiene" as a fluency signal

**Why:** The CCA tests "lost in the middle" awareness and context window management. CodeFluent already has token analytics — adding context health scoring is a natural extension.

**Implementation:** Computed metrics from existing token data + new `/compact` usage detection from session data.

**Integration cost:** Medium. Token data exists; growth rate analysis and compact detection are new.

#### 2.3 Cost Optimization Insights

**CCA Domain:** Prompt Engineering (20%) — Batch API, token economics

**What:** Add a "Cost Optimization" section to the Usage tab:
- Prompt caching hit rates with optimization suggestions
- Extended thinking ROI analysis (did thinking tokens reduce total iterations?)
- Model selection efficiency (using Opus for simple tasks vs Sonnet)
- Suggestions for batch-eligible workloads

**Implementation:** Extends existing analytics cost calculations with optimization recommendations.

**Integration cost:** Low–Medium. Data exists; recommendation logic is new.

#### 2.4 Expanded Recommendations Aligned to CCA Domains

**CCA Domain:** All 5 domains

**What:** Map existing recommendations to CCA domains. Add new recommendation categories: "Agentic Architecture", "Tool Design", "Context Management". Each recommendation links to the relevant Anthropic Academy course.

**Implementation:** Extends existing recommendations system with CCA domain tagging and new recommendation content.

**Integration cost:** Low. Recommendation infrastructure exists; content creation is the main effort.

### Tier 3: High Impact, Requires New Infrastructure

#### 3.1 MCP Integration Analysis

**CCA Domain:** Tool Design & MCP (18%)

**What:** Detect MCP server configurations in the workspace (`.mcp.json`, `~/.claude.json`), analyze tool definitions for description quality, flag common anti-patterns (too many tools per agent, missing error handling, vague descriptions).

**Why:** 18% of the exam, currently zero CodeFluent coverage. MCP is a core architectural competency.

**Implementation:** New file parsing beyond JSONL sessions — would need to read and analyze `.mcp.json` and `~/.claude.json` files.

**Integration cost:** High. Entirely new capability requiring new file parsing, MCP schema understanding, and LLM-judged quality assessment of tool descriptions.

#### 3.2 CI/CD Integration Scoring

**CCA Domain:** Claude Code Configuration (20%)

**What:** Detect whether the workspace uses Claude Code in CI/CD:
- Check `.github/workflows/` for `-p` flag usage, `--output-format json`, `--json-schema`
- Detect generator/reviewer patterns (separate sessions for code generation vs code review)
- Score CI/CD maturity relative to CCA best practices

**Implementation:** New capability — would scan workflow YAML files rather than session data.

**Integration cost:** High. New file scanning, YAML parsing, and CI/CD pattern detection.

#### 3.3 Interactive CCA Practice Mode

**CCA Domain:** All 5 domains

**What:** Present scenario-based questions (similar to CCA format) based on the user's actual codebase: "In your project, you have X MCP tools. How would you distribute them across agents?" Use Claude to generate and evaluate answers.

**Implementation:** Would leverage existing Anthropic API integration for a new interactive use case.

**Integration cost:** High. New interaction paradigm, question generation, answer evaluation.

### Tier 4: Strategic / Long-Term

#### 4.1 Team Fluency Dashboard

Aggregate fluency scores across team members. Show team-level CCA readiness. Requires multi-user data aggregation — currently single-user only.

#### 4.2 Anthropic Academy Deep Integration

Link specific fluency gaps to relevant Anthropic Academy courses and modules. "Your context management score is low — take 'Building with the Claude API' Module 7."

---

## 6. Prioritization Matrix

| Feature | CCA Domain Weight | Implementation Cost | Data Available? | Strategic Value | Priority |
|---------|-------------------|--------------------|-----------------|-----------------|---------|
| CLAUDE.md Config Maturity | 20% | Low–Medium | Partially (needs file scanning) | High — extends existing strength | **Phase 1** |
| Programmatic vs Advisory Detection | 27% | Medium | Yes (prompt text) | High — #1 tested CCA concept | **Phase 1** |
| CCA Readiness Radar Chart | All (100%) | Medium | Partially (aggregation needed) | Very High — positions as CCA prep tool | **Phase 1** |
| Structured Output Detection | 20% | Low | Yes (prompt + tool_use data) | Medium — specific anti-pattern | **Phase 1** |
| Agentic Pattern Detection | 27% | Medium | Partially | Medium — complements existing tool diversity | **Phase 2** |
| Context Efficiency Scoring | 15% | Medium | Yes (token data) | Medium — extends analytics | **Phase 2** |
| Cost Optimization Insights | 20% | Low–Medium | Yes (token/cost data) | Medium — usage tab enhancement | **Phase 2** |
| CCA-Aligned Recommendations | All (100%) | Low | N/A (content creation) | Medium — recommendation enhancement | **Phase 2** |
| MCP Integration Analysis | 18% | High | No (new file types) | High — zero current coverage | **Phase 3** |
| CI/CD Integration Scoring | 20% | High | No (new file types) | Medium — niche audience | **Phase 3** |
| Interactive Practice Mode | All (100%) | High | N/A | High — differentiation | **Defer** |
| Team Dashboard | N/A | Very High | No | Medium — different market | **Defer** |
| Academy Integration | N/A | Medium | No | Medium — content partnership | **Defer** |

---

## 7. Key Strategic Insight

The CCA exam reveals a clear hierarchy of what Anthropic considers "architect-level" Claude usage:

1. **Programmatic enforcement > prompt-based guidance** (the #1 tested concept)
2. **Context isolation in multi-agent systems** (heavily tested)
3. **CLAUDE.md hierarchy mastery** (configuration is 20% of the exam)
4. **Structured output via tool_use, not natural language** (anti-pattern detection)
5. **Cost optimization** (Batch API, caching, extended thinking economics)

**CodeFluent's opportunity:** The current 11 behaviors from the AI Fluency Index are heavily weighted toward prompt engineering quality — which is only 20% of what the CCA tests. The CCA reveals that Anthropic considers **architectural competence** (agentic design, tool design, configuration, context management) as **80%** of expert-level Claude usage.

**Recommended strategy:** Expand CodeFluent's scoring rubric in phases:
- **Phase 1:** CLAUDE.md maturity + programmatic enforcement detection + CCA readiness radar + structured output detection. These extend existing infrastructure and address the highest-weighted exam domains.
- **Phase 2:** Agentic patterns + context efficiency + cost optimization + CCA-aligned recommendations. These add depth to existing analytics.
- **Phase 3:** MCP analysis + CI/CD scoring. These require new infrastructure but address significant CCA domain gaps.

The CCA readiness radar chart (Feature 1.3) is the highest strategic-value feature because it directly positions CodeFluent as a CCA preparation tool and creates a new user acquisition channel — anyone studying for the CCA would benefit from seeing their current competency levels mapped to exam domains.

---

## 8. Data Accessibility Analysis: Programmatic Enforcement Signals

*Added 2026-03-31. Research into what Claude Code session data and configuration files actually contain for scoring programmatic enforcement behaviors.*

### 8.1 JSONL Session Data: What's Available but Currently Discarded

The CodeFluent parser (`parser.ts`, `extract_prompts.py`) uses a `SKIP_TYPES` set that blanket-skips several message types containing rich programmatic enforcement signals. Analysis of real session files across the codefluent project reveals:

| Message Type | Count | Contains | Currently |
|-------------|-------|----------|-----------|
| `progress` → `hook_progress` | 4,026 | Hook event, hook name, tool linkage via `parentToolUseID` | **Skipped** |
| `progress` → `agent_progress` | 4,837 | Subagent task execution events | **Skipped** |
| `progress` → `mcp_progress` | 936 | MCP tool server activity | **Skipped** |
| `progress` → `bash_progress` | 1,171 | Command execution output | **Skipped** |
| `system` → `turn_duration` | 475 | Turn timing (efficiency signal) | **Skipped** |
| `system` → `api_error` | 111 | Error handling, retry behavior | **Skipped** |
| `system` → `compact_boundary` | 29 | Context compaction events (`/compact` usage) | **Skipped** |
| `system` → `local_command` | 8 | Slash command invocations (e.g., `/status`) | **Skipped** |
| `queue-operation` | 266 | Task queue events | **Skipped** |

**Key finding:** The parser currently extracts `user`, `assistant`, `tool_use`, and `thinking` messages. All `progress` and `system` messages are discarded. To score programmatic enforcement, the parser would need selective extraction from these skipped types — not full parsing, just the metadata fields relevant to scoring.

#### Hook Progress Message Structure

```json
{
  "type": "progress",
  "data": {
    "type": "hook_progress",
    "hookEvent": "PostToolUse",
    "hookName": "PostToolUse:Read",
    "command": "callback"
  },
  "parentToolUseID": "toolu_...",
  "timestamp": "2026-03-03T08:11:18.513Z"
}
```

Hook events observed in real data (codefluent sessions):
- `PostToolUse:Read` — 1,672 instances (41%)
- `PostToolUse:Edit` — 1,513 instances (38%)
- `PostToolUse:Grep` — 626 instances (16%)
- `PostToolUse:Write` — 179 instances (4%)
- `PostToolUse:Glob` — 36 instances (1%)

### 8.2 Claude Code Hook Configuration: Where It Lives

Hooks are configured in `settings.json` under a `hooks` key (not in separate files):

| Location | Scope | Shared via git? |
|----------|-------|-----------------|
| `~/.claude/settings.json` | User-level (all projects) | No |
| `.claude/settings.json` | Project-level (team) | Yes |
| `.claude/settings.local.json` | Project-level (personal) | No (gitignored) |
| Plugin `settings.json` | Per-plugin | Via plugin install |

**Claude Code supports 22 hook events** across 6 categories:

- **Session lifecycle (4):** `SessionStart`, `InstructionsLoaded`, `UserPromptSubmit`, `SessionEnd`
- **Tool execution (4):** `PreToolUse`, `PostToolUse`, `PostToolUseFailure`, `PermissionRequest`
- **Agent & task (5):** `SubagentStart`, `SubagentStop`, `TeammateIdle`, `TaskCreated`, `TaskCompleted`
- **Execution control (2):** `Stop`, `StopFailure`
- **System events (5):** `Notification`, `ConfigChange`, `CwdChanged`, `FileChanged`, `PreCompact`/`PostCompact`
- **MCP & worktree (2+):** `Elicitation`, `ElicitationResult`, `WorktreeCreate`/`WorktreeRemove`

**4 handler types:** `command` (shell script), `http` (webhook), `prompt` (Claude evaluates), `agent` (spawns full agent for verification)

**Hook control flow (command type):**
- Exit code 0 = allow operation
- Exit code 2 = block operation (PreToolUse only)
- Exit code 1 = error (allow but log)
- Stdin receives JSON with `session_id`, `hook_event_name`, `tool_name`, `tool_input`

### 8.3 Other Configuration Maturity Signals

Beyond hooks, Claude Code's `.claude/` directory structure reveals configuration maturity:

| Artifact | Location | What it indicates |
|----------|----------|-------------------|
| Rules | `.claude/rules/*.md` (YAML frontmatter with path globs) | Path-scoped behavioral rules |
| Custom commands | `.claude/commands/*.md` | Team-shared slash commands |
| Skills | `.claude/skills/` + `SKILL.md` (YAML frontmatter: `context`, `allowed-tools`) | Reusable capability definitions |
| MCP servers | `.mcp.json` (project) or `~/.claude.json` (user) | External tool integrations |
| CLAUDE.md hierarchy | Root `CLAUDE.md` vs `.claude/CLAUDE.md` vs `~/.claude/CLAUDE.md` | Configuration placement maturity |
| `@import` usage | Within CLAUDE.md files | Modular rule composition |
| Permissions | `.claude/settings.local.json` → `permissions.allow` | Tool permission management |

**Current state (codefluent project):** Has CLAUDE.md (root), `.claude/settings.local.json` (permissions), but no rules/, commands/, skills/, hooks, or `.mcp.json`. This is typical — most projects are in the "prompt-only" stage.

### 8.4 Accessibility Summary

| Signal Category | Data Source | Parser Changes Needed? | Scoring Feasibility |
|----------------|-------------|----------------------|-------------------|
| **Hook execution** | JSONL `progress` → `hook_progress` | Yes — selective parse of `progress` | High — data is structured and abundant |
| **Hook configuration** | `settings.json` → `hooks` key | No parser change — new file reader | High — JSON parse + existence check |
| **Rules/commands/skills** | `.claude/rules/`, `.claude/commands/`, `.claude/skills/` | No parser change — file glob | High — file existence + content quality |
| **MCP configuration** | `.mcp.json`, `~/.claude.json` | No parser change — new file reader | Medium — need MCP schema understanding |
| **Agent orchestration** | JSONL `progress` → `agent_progress` | Yes — selective parse of `progress` | Medium — need to define quality signals |
| **Context management** | JSONL `system` → `compact_boundary`, `turn_duration` | Yes — selective parse of `system` | High — countable events |
| **Advisory vs programmatic gap** | Cross-reference CLAUDE.md text + `settings.json` hooks | Both sources already readable | High — the most CCA-aligned signal |

---

## 9. Proposed Scoring Architecture: Three-Category Framework

*Added 2026-03-31. Framework for expanding CodeFluent's scoring beyond prompt fluency to encompass the full CCA competency spectrum.*

### 9.1 Why Three Categories, Not One

The current fluency score measures one dimension: prompt quality. The CCA exam reveals this is 20% of what Anthropic considers expert-level Claude usage. However, the remaining 80% doesn't naturally collapse into a single additional score — it splits into two distinct competencies:

1. **What you set up** (static configuration and architectural decisions)
2. **How you operate** (runtime efficiency, context discipline, resource management)

These are different skills, measured from different data sources, and have different coaching implications. A user might have excellent hooks (architecture) but bloated conversations (operations), or vice versa. Collapsing them loses signal.

Additionally, from a practical standpoint:
- The existing Fluency Score tab is already information-dense — adding architectural and operational metrics would create UX/UI overload
- The current fluency score is grounded in the AI Fluency Index research, which intentionally focuses on prompting behaviors; mixing in architectural metrics would undermine that research foundation
- Most users today would score near zero on architectural maturity, making a combined score feel punitive rather than educational

### 9.2 The Three Scoring Dimensions

#### Category 1: Prompt Fluency (Current)
**"How well do you talk to Claude?"**

Maps to: CCA Domain 4 — Prompt Engineering (20% of exam)

This is the existing 11-behavior fluency score. No changes needed to the current scoring — it remains a standalone, research-backed assessment of prompting quality.

*Current coverage: Strong. 11 behaviors scored via LLM assessment.*

#### Category 2: Architectural Maturity
**"How well do you architect around Claude?"**

Maps to: CCA Domains 1 + 2 + 3 — Agentic Architecture (27%) + Tool Design/MCP (18%) + Claude Code Config (20%) = **65% of exam**

This is the new dimension that captures programmatic enforcement, configuration quality, and system design patterns. Sub-signals:

| Signal | Data Source | Measurement |
|--------|-------------|-------------|
| Hook adoption | `settings.json` hooks key | Configured hook count, event diversity |
| Hook execution | JSONL `hook_progress` | Execution frequency, tool coverage ratio |
| Advisory-to-programmatic gap | CLAUDE.md text vs `settings.json` hooks | "Must/always/never" statements without hooks |
| Rules directory maturity | `.claude/rules/*.md` | File count, path-scoping usage |
| Custom commands | `.claude/commands/` | File count (team workflow automation) |
| Skills definitions | `.claude/skills/` + SKILL.md | File count, frontmatter completeness |
| MCP integration | `.mcp.json` | Server count, tool description quality |
| CLAUDE.md hierarchy | Root vs `.claude/` vs `~/.claude/` placement | Correct hierarchy usage |
| Modular composition | `@import` in CLAUDE.md | Rule modularity |
| Agent orchestration | JSONL `agent_progress` | Subagent usage, parallel execution |
| Session management | JSONL session patterns | `--resume`, fork patterns |

*Current coverage: Minimal. Only CLAUDE.md existence and 3 config-eligible behaviors are scored.*

#### Category 3: Operational Discipline
**"How efficiently do you operate Claude?"**

Maps to: CCA Domain 5 — Context & Reliability (15%) + economics portion of Domain 4

This captures runtime efficiency and resource management — how well users manage context windows, control costs, and handle errors during Claude Code sessions. Sub-signals:

| Signal | Data Source | Measurement |
|--------|-------------|-------------|
| Context management | JSONL `compact_boundary` count | `/compact` usage frequency |
| Conversation bloat | Existing token analytics | Token growth rate per turn, avg conversation length |
| Cache efficiency | Existing analytics | Cache hit rates, cache creation patterns |
| Model selection | Existing analytics | Using appropriate model for task complexity |
| Extended thinking ROI | Existing analytics | Thinking tokens vs iteration reduction |
| Turn efficiency | JSONL `turn_duration` | Time-per-turn distribution |
| Error handling | JSONL `api_error` | Retry patterns, error recovery |
| Cost awareness | Existing cost calculations | Cost per conversation, optimization opportunities |

*Current coverage: Partial. Token analytics, cost calculations, and cache rates exist in the Usage tab but aren't framed as a competency score.*

### 9.3 Toward an Overview Tab

As these categories develop, CodeFluent would benefit from an **Overview tab** that provides a holistic competency view:

- **Composite score** aggregating the three categories (weighted by CCA domain weights or custom weights)
- **Radar chart** showing relative strength across the three dimensions
- **CCA readiness mapping** — each category maps to specific CCA domains with readiness indicators
- **Drill-down navigation** — click a category to go to its detailed tab (Fluency Score, Architectural Maturity, Operational Discipline)
- **Personalized recommendations** — "Your prompt fluency is strong but you have zero hooks configured. Here's why that matters and how to start."

This overview would be the natural home for the CCA Readiness Radar Chart (Feature 1.3 from Section 5), with each spoke of the radar corresponding to a measurable sub-dimension.

### 9.4 The "Gateway Behavior" Hypothesis

The AI Fluency Index research (Anthropic, 2026) identified **Iteration & Refinement** as the key predictor behavior — users who engaged in it were statistically more likely to exhibit all other fluency behaviors. It served as a "gateway" into broader prompting fluency.

**Hypothesis:** Programmatic enforcement adoption (hooks, rules, skills) may serve as the equivalent gateway behavior for architectural maturity. A user who configures their first hook has likely already:
- Read the Claude Code documentation deeply enough to know hooks exist
- Understood the distinction between advisory (CLAUDE.md) and deterministic (hooks) enforcement
- Thought about their workflow at a systems level rather than a conversation level
- Engaged with the `.claude/` directory structure beyond the basics

If this holds, then **hook adoption rate** could be the single most predictive signal for overall architectural maturity — just as Iteration & Refinement predicts overall prompt fluency.

This is a testable hypothesis once CodeFluent collects architectural maturity data across users. Even with single-user data (current state), we can track the correlation between hook adoption and other architectural signals over time as the user matures.

**Research opportunity:** If CodeFluent helps users discover and adopt these behaviors, the tool itself becomes a data source for studying the relationship between prompting fluency and architectural maturity. Does improving prompt quality lead to architectural curiosity? Or does architectural setup lead to better prompting? The directionality question is interesting and could inform future Anthropic research or a follow-up to the AI Fluency Index.

### 9.5 Interactive Feature Ideas: Beyond Scoring

CodeFluent's most engaging features are the ones that don't just measure — they help users improve. The Prompt Optimizer takes a prompt and makes it better. Quick Wins suggests actionable tasks. Extending this pattern to Architectural Maturity and Operational Discipline creates a coaching tool, not just a dashboard.

#### Architectural Maturity Features

**"Configuration Advisor" (analog to Prompt Optimizer)**
- **Input:** The user's CLAUDE.md content + `settings.json` (if any)
- **Process:** LLM identifies enforcement language ("always", "never", "must", "required", "every time") in CLAUDE.md that lacks corresponding hooks. Cross-references with the 22 available hook events to find matches.
- **Output:** Ready-to-paste `settings.json` hook configuration + explanation of what each hook enforces and why programmatic beats advisory. Shows before/after: "This CLAUDE.md rule has ~80% compliance as advisory. As a hook, it has 100%."
- **Why it works:** Same flow as Prompt Optimizer — user provides input, gets actionable output with a clear improvement delta. Directly teaches the #1 CCA concept.

**"Rules Generator" (analog to Prompt Optimizer, variant)**
- **Input:** Informal CLAUDE.md instructions
- **Output:** Properly structured `.claude/rules/*.md` files with YAML frontmatter and path-scoping globs
- **Why it works:** Lowers the barrier to adopting rules. Most users don't know the YAML frontmatter syntax.

**"Architectural Quick Wins" (analog to Quick Wins)**
- Scans the project's `.claude/` directory structure and suggests the highest-impact next step
- Examples: "You have zero hooks but 5 enforcement statements in CLAUDE.md — here's your first hook." / "You have a CLAUDE.md at root but no `.claude/rules/` — splitting into scoped rules would improve precision." / "No custom commands found — creating `.claude/commands/review.md` could standardize your code review workflow."
- Prioritized by CCA domain weight (agentic architecture suggestions first, since 27%)
- Links to relevant Anthropic Academy course module for each suggestion

#### Operational Discipline Features

**"Context Health Check" (analog to Prompt Optimizer for efficiency)**
- **Input:** Recent conversation analytics (token patterns, turn counts, conversation lengths)
- **Process:** Analyzes for context management anti-patterns: bloated conversations (no `/compact` usage), excessive tool result sizes, "lost in the middle" risk indicators
- **Output:** Specific coaching: "Your average conversation is 45 turns with no `/compact` — context quality degrades after ~30 turns. Try compacting at natural breakpoints." / "3 of your last 10 conversations exceeded 150K tokens — consider delegating subtasks to subagents."

**"Cost Optimizer" (analog to Quick Wins for economics)**
- Analyzes token patterns and suggests specific improvements
- "You used Opus for 12 conversations averaging 3 turns — these short tasks would get similar results with Sonnet at 1/5 the cost."
- "Your cache hit rate is 12% — adding a system prompt with project context could increase this to 60%+."
- Links to Anthropic Academy "Building with the Claude API" module on token economics

### 9.6 Educational Material Integration

Anthropic provides free educational resources through Anthropic Academy (13 courses on Skilljar, launched March 2, 2026). Each CodeFluent scoring category maps to specific courses and modules:

| CodeFluent Category | Anthropic Academy Course | Specific Relevance |
|--------------------|--------------------------|--------------------|
| Prompt Fluency | "Building with the Claude API" (8.1 hrs) | Prompt engineering modules, structured output |
| Architectural Maturity | "Claude Code in Action" | CLAUDE.md configuration, hooks, plan mode |
| Architectural Maturity | "Introduction to Model Context Protocol (MCP)" | MCP server design, tool definitions |
| Operational Discipline | "Building with the Claude API" | Token economics, batch API, caching |
| All categories | Official CCA Practice Test (60 questions) | Self-assessment aligned to exam format |

**Integration approach:** Each recommendation, quick win, or coaching suggestion links to the relevant Anthropic Academy course and module. "Your architectural maturity score is low in hook adoption → Take 'Claude Code in Action' Module X on hooks." This positions CodeFluent as a natural companion to the free study materials, creating a feedback loop: study the concept → practice it in your real projects → CodeFluent measures the improvement.

**Strategic value:** Anthropic has confirmed additional certifications for later in 2026 (sellers, developers, advanced architects), making CCA-F the entry point of a credential stack. CodeFluent's educational integration creates a durable value proposition that grows with each new certification tier.

### 9.7 Implementation Phasing

This framework aligns with the existing phase plan but adds clarity on what each phase builds toward:

- **Phase 1 (Current + Near-term):** Extend Category 1 (prompt fluency — already done). Begin Category 2 with static configuration maturity checks (file existence, CLAUDE.md hierarchy, advisory-vs-programmatic gap detection). These require no parser changes.
- **Phase 2:** Add session-based signals to Category 2 (parser extracts `hook_progress`, `agent_progress`). Build Category 3 from existing analytics data (context efficiency scoring, cost optimization insights). Begin Overview tab with radar chart. First interactive features: Configuration Advisor, Architectural Quick Wins.
- **Phase 3:** Deepen Category 2 with MCP analysis, CI/CD detection. Add advanced Category 3 signals (model selection optimization, extended thinking ROI). Full CCA readiness assessment. Interactive features: Context Health Check, Cost Optimizer. Educational material deep linking.

---

## 10. Cross-References

- [New Metrics Research](NEW_METRICS_RESEARCH.md) — Broader scoring metrics research (agent behavior, GitHub outcomes, novel dimensions). Many CCA features align with the "agent behavior metrics" direction identified there.
- [Task Classification Research](TASK_CLASSIFICATION_RESEARCH.md) — Task classification implementation plan. CCA scenarios map to task types: Scenario 2 = feature development, Scenario 5 = CI/CD (chore), etc.
- [Technical Spec](TECHNICAL_SPEC.md) — Current scoring architecture and data flow.
- [References](REFERENCES.md) — Research foundations including AI Fluency Index and Claude Code Best Practices.
- [Session Data](SESSION_DATA.md) — JSONL data format documentation. Section 8 above identifies additional message types (`progress`, `system`) not currently documented there that would need to be added when implementing architectural maturity scoring.

---

## 11. Sources

### Official Anthropic
- [Anthropic Academy (Skilljar)](https://anthropic.skilljar.com/)
- [Anthropic Learn](https://www.anthropic.com/learn)
- [Official Exam Guide PDF](https://everpath-course-content.s3-accelerate.amazonaws.com/instructor/8lsy243ftffjjy1cx9lm3o2bw/public/1773274827/Claude+Certified+Architect+%E2%80%93+Foundations+Certification+Exam+Guide.pdf)

### Community Guides & Analysis
- [DEV Community: Inside Anthropic's CCA Program](https://dev.to/mcrolly/inside-anthropics-claude-certified-architect-program-what-it-tests-and-who-should-pursue-it-1dk6)
- [Medium: The CCA Is Here](https://medium.com/@reliabledataengineering/the-claude-certified-architect-is-here-and-its-unlike-any-ai-certification-before-it-7abe0fe678d1)
- [LowCode Agency: How to Become a CCA](https://www.lowcode.agency/blog/how-to-become-claude-certified-architect)
- [FlashGenius: Ultimate Guide](https://flashgenius.net/blog-article/a-guide-to-the-claude-certified-architect-foundations-certification)
- [Tutorials Dojo: CCA-F Study Guide](https://tutorialsdojo.com/cca-f-claude-certified-architect-foundations-study-guide/)
- [Claude Certifications](https://claudecertifications.com/)
- [GitHub: paullarionov/claude-certified-architect](https://github.com/paullarionov/claude-certified-architect/blob/main/guide_en.MD)
- [GitHub: SGridworks/claude-certified-architect-training](https://github.com/SGridworks/claude-certified-architect-training)
- [Towards AI: Complete Guide to Passing](https://pub.towardsai.net/claude-certified-architect-the-complete-guide-to-passing-the-cca-foundations-exam-9665ce7342a8)
- [Medium: Study Guide with Code](https://medium.com/data-science-collective/the-complete-claude-architect-study-guide-with-code-and-tutor-prompts-01f524e95c92)
- [Level Up Coding: SKILL.md Framework](https://levelup.gitconnected.com/i-passed-the-claude-architect-exam-a-guide-to-create-your-own-claude-skill-md-to-get-certified-43d4c3d32ac1)

### Claude Code Hooks & Configuration
- [Claude Code Hooks Reference](https://code.claude.com/docs/en/hooks) — Official hooks documentation (22 events, 4 handler types)
- [Claude Code settings.json Guide](https://www.eesel.ai/blog/settings-json-claude-code) — Complete configuration reference
- [Claude Code Hooks: Practical Guide](https://www.gend.co/blog/configure-claude-code-hooks-automation) — Hook automation patterns
- [DataCamp: Claude Code Hooks Tutorial](https://www.datacamp.com/tutorial/claude-code-hooks) — Workflow automation with hooks
