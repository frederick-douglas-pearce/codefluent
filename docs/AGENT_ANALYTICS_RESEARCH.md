# Agent Analytics Research

Research into the opportunity for analyzing AI agent sessions — both Claude Code subagents and Agent SDK-based programmatic agents. Conducted April 2026 to inform CodeFluent's agent features roadmap and evaluate whether a separate agent analytics product is warranted.

## Table of Contents

1. [Anthropic's Agent Ecosystem](#anthropics-agent-ecosystem)
2. [Agent Observability Market Landscape](#agent-observability-market-landscape)
3. [The Gap: Agent Quality Analysis](#the-gap-agent-quality-analysis)
4. [CodeFluent Agent Features (v1.3 Roadmap)](#codefluent-agent-features-v13-roadmap)
5. [Separate Product Opportunity: Agent Prompt Diagnostics](#separate-product-opportunity-agent-prompt-diagnostics)
6. [Technical Feasibility](#technical-feasibility)
7. [Sources](#sources)

---

## Anthropic's Agent Ecosystem

As of April 2026, Anthropic offers three distinct agent systems:

### Claude Code Subagents (Interactive)

Custom subagents defined as Markdown files with YAML frontmatter. Run locally within Claude Code CLI sessions.

- **Scope:** `.claude/agents/` (project), `~/.claude/agents/` (user), managed settings (org), CLI flags (session)
- **Built-in agents:** Explore (Haiku, read-only), Plan (read-only), general-purpose (all tools)
- **Config:** model, tools, disallowedTools, memory, isolation (worktree), color
- **Key constraint:** One level of delegation only — subagents cannot spawn sub-subagents
- **Data:** Sessions written to `~/.claude/projects/` as JSONL (same format as main sessions)
- **Relevance to CodeFluent:** Direct — these are interactive sessions with human fluency signals

### Claude Agent SDK (Programmatic)

Claude Code as a library for Python and TypeScript. Same tools, agent loop, and context management as the CLI, but programmable for production apps and CI/CD.

- **Same JSONL format:** SDK agents write to `~/.claude/projects/` just like CLI sessions
- **Same config system:** Supports `.claude/` settings, skills, commands, CLAUDE.md when `settingSources: ['project']`
- **Same subagent system:** `agents` parameter with `AgentDefinition` shape
- **SDK-specific features:** Programmatic hooks (callbacks, not shell commands), sessions (resume/fork), MCP integration
- **Key difference:** Prompts are hardcoded in application code, not typed by a human
- **Relevance to CodeFluent:** Indirect — same data format but different evaluation criteria needed

### Claude Managed Agents (Cloud API)

Pre-built agent harness running in Anthropic's managed infrastructure. Completely separate from Claude Code.

- **API-based:** `/v1/agents`, `/v1/sessions`, `/v1/environments`
- **Cloud containers:** Pre-installed packages, network access, persistent filesystems
- **Multi-agent:** Coordinator pattern with threads (research preview)
- **Beta:** `managed-agents-2026-04-01` header required
- **Data:** Server-side event streams, not local JSONL
- **Relevance to CodeFluent:** None — different system, different data format, different users

### Key Distinction

| Feature | Claude Code Subagents | Agent SDK | Managed Agents |
|---|---|---|---|
| Where it runs | Local CLI | Local (your app) | Anthropic cloud |
| Session data | Local JSONL | Local JSONL | Server-side events |
| Prompts | Human-typed | Hardcoded in code | API-defined |
| Multi-agent | 1 level deep | 1 level deep | Coordinator threads |
| Config | `.claude/agents/*.md` | `AgentDefinition` objects | API JSON payloads |

---

## Agent Observability Market Landscape

### Tier 1: Enterprise Agent Observability Platforms

Major platforms focused on production agent monitoring via tracing and instrumentation:

| Platform | Focus | Key Strength | Limitation |
|---|---|---|---|
| **LangSmith** | LangChain ecosystem tracing | Deep framework integration, low overhead | Tightly coupled to LangChain/LangGraph |
| **Langfuse** | Open-source LLM observability | Self-hostable, Claude Agent SDK integration via OpenTelemetry | Requires instrumentation code |
| **Arize / Phoenix** | Enterprise monitoring + open-source | Drift detection, embedding analysis, compliance certs | Complex setup for small teams |
| **Braintrust** | Quality management + evaluation | Trace-to-test pipeline, CI/CD native | Opinionated workflow |
| **Datadog LLM** | Infrastructure-level monitoring | Token usage, latency, error rates, prompt injection detection | Heavyweight, expensive |

**What they do well:** Trace execution, measure latency, track cost, detect errors.
**What they don't do:** Evaluate agent *quality* or *effectiveness*. They answer "is it running?" not "is it running well?"

Langfuse has a specific Claude Agent SDK integration that instruments every tool call and model completion via OpenTelemetry spans.

### Tier 2: Agent Evaluation Frameworks

Platforms that score agent outputs against rubrics:

| Platform | Approach | Best For |
|---|---|---|
| **DeepEval** | LLM-as-judge, trajectory metrics | Automated eval pipelines |
| **Galileo** | Rubric-based scoring, guardrails | Enterprise quality gates |
| **Braintrust Evals** | Trace-to-test, automated optimization | CI/CD quality regression |
| **Maxim** | Multi-dimension scoring | Broad evaluation coverage |

**What they do well:** Score task completion, measure accuracy, detect regressions.
**What they don't do:** Analyze local session data, diagnose prompt-level issues, work without cloud infrastructure.

### Tier 3: Claude Code Local Analytics

Growing ecosystem of local-first tools parsing Claude Code JSONL files:

| Tool | Focus | Key Feature |
|---|---|---|
| **claude-view** | Real-time dashboard | Rust SIMD-accelerated parsing, zero telemetry |
| **claude-code-analytics** | Session archiving + analysis | Hook-based capture, 300+ model support |
| **agents-observe** | Multi-agent observability | Live subagent execution trees, parent-child tracking |
| **claude-code-otel** | OpenTelemetry bridge | Exports Claude Code sessions to OTel-compatible platforms |
| **clauditor** | Session state management | Handoff notes, structured state injection |
| **Observagent** | Hook-based observability | Zero-config setup, subagent lifecycle events |

**What they do well:** Monitor usage, track cost, visualize sessions — all locally.
**What they don't do:** Evaluate quality, score effectiveness, provide actionable recommendations for improvement.

### Market Data

- 57% of organizations have agents in production (LangChain 2026 State of AI Agents)
- Quality cited as top barrier to deployment by 32% of respondents
- Enterprise agents achieve ~60% success on single runs, dropping to ~25% across eight runs
- Agent SDK launched April 2026 — ecosystem still forming

---

## The Gap: Agent Quality Analysis

**Nobody is evaluating agent quality from local session data.**

- Tier 1 traces execution but doesn't score effectiveness
- Tier 2 evaluates outputs but requires instrumentation and cloud infrastructure
- Tier 3 monitors usage and cost but doesn't assess how well the agent performed

The question "my Agent SDK agent ran 500 sessions last week — were they any good?" has no answer today. Specifically:

1. **No prompt-to-behavior diagnostics.** When an agent misbehaves, developers iterate on prompts blind — they see the agent retrying or erroring but can't diagnose whether the system prompt is the root cause.
2. **No local-first quality scoring.** All quality evaluation requires cloud infrastructure or framework instrumentation.
3. **No agent-specific recommendations.** Existing tools report what happened; none suggest what to change.

---

## CodeFluent Agent Features (v1.3 Roadmap)

These features serve CodeFluent's existing audience (Claude Code interactive users) and are tracked in the GitHub backlog:

| Issue | Feature | Milestone |
|---|---|---|
| #238 | Scan `.claude/agents/` for subagent definitions in config maturity | v1.3 |
| #239 | Track custom subagent invocations in conversation metrics | v1.3 |
| #240 | Agent-aware recommendations for adoption and optimization | v1.3 |
| #241 | Agent advisor — suggest agents from conversation patterns (LLM-powered) | v2.0 |

These focus on **interactive subagent usage** — measuring whether Claude Code users effectively leverage custom agents for task decomposition, and coaching them to improve.

---

## Separate Product Opportunity: Agent Prompt Diagnostics

### The Insight

Assessing prompt quality matters *more* for hardcoded agent prompts than for interactive human prompts, because:

1. **No real-time feedback loop.** A human typing prompts gets immediate feedback and can course-correct. A hardcoded prompt runs the same flawed way every time — at scale.
2. **The "guessing game" problem.** Developers iterate on agent prompts blind. They see the agent misbehaving (retries, wrong tool choices, hallucinated outputs) but can't diagnose whether the prompt phrasing is the root cause or whether the issue is environmental.
3. **Prompt quality drives agent quality.** The 60% → 25% success rate drop across runs often traces back to prompt brittleness — missing edge case handling, ambiguous instructions, or insufficient constraint specification.

### Product Concept

A local-first agent analytics tool that reads Agent SDK session JSONL files and provides:

#### Agent Execution Analytics (reuse from CodeFluent)
- Token usage, cost tracking, cache efficiency (reuse `analytics.ts`)
- Tool call patterns, error rates, retry frequency
- Session duration, completion rates
- Cost-per-task and cost trend analysis

#### Agent Prompt Diagnostics (novel)
- **Prompt scoring against agent best practices** — Does the system prompt specify clear success criteria? Does it handle error cases? Does it constrain tool usage appropriately? Are there missing guardrails?
- **Behavior-to-prompt correlation** — "Your agent retries Bash commands 40% of the time. The system prompt doesn't specify error handling behavior — adding 'If a command fails, read the error output before retrying' could reduce retries."
- **Prompt regression detection** — Compare agent behavior across prompt versions. Did the prompt change improve or degrade task completion rate?
- **Prompt optimization** — Generate improved prompt variants with specific behavioral fixes, similar to CodeFluent's Prompt Optimizer but targeting agent system prompts.

#### Agent Configuration Assessment (reuse from CodeFluent)
- Tool access audit — principle of least privilege violations
- Model selection analysis — cost vs capability tradeoffs
- Hook coverage assessment
- MCP server configuration review

#### Agent-Specific Recommendations
- "Your agent uses 12 tools but only 4 account for 95% of invocations — restrict the tool list to reduce confusion and cost"
- "Session traces show the agent reads files before every edit, but the system prompt doesn't mention this pattern — codify it to make it reliable"
- "Error recovery takes an average of 3.2 turns — add explicit error handling instructions to the system prompt"

### What Transfers from CodeFluent

| Component | Reusability | Notes |
|---|---|---|
| JSONL parser (`parser.ts`) | High | Same session format |
| Token analytics (`analytics.ts`) | High | Same metrics apply |
| Config scanner (`configScanner.ts`) | Medium | Agent-specific categories needed |
| Prompt scoring framework | Medium | Different scoring rubric needed for agent prompts |
| Prompt optimizer | Medium | Same template approach, different optimization targets |
| Conversation assembly | High | Same gap-based splitting |
| Pricing lookup (`pricing.ts`) | High | Identical |
| Cache infrastructure | High | Same pattern |

### What's New (Requires Building)

- Agent behavior metrics: task completion rate, tool error rate, retry patterns, stuck detection
- Prompt-to-behavior correlation engine
- Agent-specific scoring rubric and prompt template
- Prompt version tracking and regression analysis
- Agent-optimized recommendations engine

### Competitive Positioning

| Tool | Monitors | Evaluates Quality | Local-First | Prompt Diagnostics |
|---|---|---|---|---|
| LangSmith | Yes | Partial (evals) | No | No |
| Langfuse | Yes | Partial (scores) | Self-host | No |
| agents-observe | Yes | No | Yes | No |
| claude-view | Yes | No | Yes | No |
| **This product** | Yes | Yes | Yes | **Yes** |

The unique angle is **prompt diagnostics** — connecting observed agent behavior to specific prompt improvements. No existing tool does this.

---

## Technical Feasibility

### Data Availability

Agent SDK sessions use the same JSONL format as Claude Code CLI sessions. The key fields are:
- `type: "user"` — the programmatic prompt (system prompt + user message)
- `type: "assistant"` — model responses with tool_use blocks
- `type: "tool_result"` — tool execution results (including errors)
- Token usage on assistant messages
- Timestamps for all events

Error patterns, retry sequences, and tool call failures are all visible in the JSONL data.

### Architecture Options

1. **Standalone tool** — New project repo, shares code with CodeFluent via extracted packages or copy
2. **Monorepo sibling** — Lives alongside CodeFluent in the same repo, shares parser/analytics modules
3. **Plugin architecture** — CodeFluent core with swappable "lenses" (interactive fluency vs agent diagnostics)

Option 1 is cleanest for different audiences. Option 3 is most ambitious but risks scope creep.

### Estimated Effort

- **MVP (monitoring + basic scoring):** 2-3 weeks leveraging CodeFluent's parser/analytics
- **Prompt diagnostics (novel feature):** 3-4 weeks for scoring rubric, prompt templates, behavior correlation
- **Full product:** 6-8 weeks total

---

## Sources

### Anthropic Documentation
- [Claude Code Subagents](https://code.claude.com/docs/en/sub-agents)
- [Agent SDK Overview](https://code.claude.com/docs/en/agent-sdk/overview)
- [Managed Agents Overview](https://platform.claude.com/docs/en/managed-agents/overview)
- [Managed Agents Multi-Agent](https://platform.claude.com/docs/en/managed-agents/multi-agent)

### Agent Observability Platforms
- [LangSmith Observability](https://www.langchain.com/langsmith/observability)
- [Langfuse Claude Agent SDK Integration](https://langfuse.com/integrations/frameworks/claude-agent-sdk)
- [Braintrust AI Observability Buyer's Guide 2026](https://www.braintrust.dev/articles/best-ai-observability-tools-2026)
- [15 AI Agent Observability Tools in 2026](https://aimultiple.com/agentic-monitoring)

### Agent Evaluation
- [Galileo Agent Evaluation Framework](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks)
- [DeepEval AI Agent Evaluation](https://deepeval.com/guides/guides-ai-agent-evaluation)
- [Microsoft AI Agent Performance Measurement](https://www.microsoft.com/en-us/dynamics-365/blog/it-professional/2026/02/04/ai-agent-performance-measurement/)

### Claude Code Local Analytics
- [claude-view: Mission Control Dashboard](https://recca0120.github.io/en/2026/04/07/claude-view-mission-control/)
- [agents-observe: Real-time Claude Code Observability](https://github.com/simple10/agents-observe)
- [claude-code-analytics](https://github.com/sujankapadia/claude-code-analytics)
- [claude-code-otel: OpenTelemetry for Claude Code](https://github.com/ColeMurray/claude-code-otel)
- [awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
