# Scoring Methodology

This document describes CodeFluent's scoring methodology, its relationship to published research, the conversation boundary detection approach, and the known limitations of the current framework.

## Relationship to the AI Fluency Index

CodeFluent's scoring is inspired by the [AI Fluency Index](https://www.anthropic.com/research/AI-fluency-index) paper published by Anthropic. The paper defines 11 fluency behaviors that characterize effective human-AI interaction:

1. **clarifying_goals** — Making task objectives explicit
2. **specifying_format** — Defining output format, length, structure
3. **providing_examples** — Giving examples of desired output
4. **providing_feedback** — Evaluating and correcting AI responses
5. **iteration_and_refinement** — Iterating on outputs through follow-ups
6. **adjusting_approach** — Changing strategy when the current one fails
7. **building_on_responses** — Using AI output as input for next steps
8. **setting_interaction_terms** — Establishing rules for the interaction
9. **identifying_missing_context** — Surfacing assumptions and gaps
10. **questioning_reasoning** — Asking for explanations and trade-offs
11. **checking_facts** — Verifying claims and accuracy

### Inspiration, not replication

The AI Fluency Index was designed and validated on **Claude.ai web chat conversations** — a context where conversation boundaries are natural (users explicitly start new chats) and interactions tend to be shorter and more self-contained. The paper explicitly acknowledges:

> *"Claude Code's very different user base and functionality implies that more substantial research is necessary"*

CodeFluent applies these 11 behaviors to Claude Code session data, which is a fundamentally different context:

- **Sessions are long and multi-phase** — a single session file can span multiple days and contain hundreds of messages
- **Tool use is pervasive** — file edits, terminal commands, and web searches are first-class parts of the interaction
- **Context is persistent** — conversation history, plan mode, and project files provide ongoing context that doesn't exist in stateless web chat
- **Behaviors overlap with tooling** — "checking facts" in Claude Code often means running tests, not asking the AI to verify claims

CodeFluent's scores are best understood as a **structured signal about prompting behavior**, not a validated psychometric instrument. The 11-behavior framework provides useful structure for self-reflection, but the scores should not be interpreted with the same confidence as a validated assessment.

## Conversation Boundary Detection

### The problem with sessions

Claude Code stores interactions in `.jsonl` session files at `~/.claude/projects/`. Each file represents a "session" — but session boundaries are opaque and controlled by Claude Code's internal logic. A single session can:

- Span multiple calendar days
- Contain hundreds of messages across unrelated tasks
- Persist across IDE restarts and system reboots

Using session files as the analytics unit produces misleading results: a week-long session gets a single score based on its first 20 prompts, while all subsequent work is ignored.

### Inactivity-gap conversations

CodeFluent defines **conversations** using an inactivity gap threshold: consecutive user messages within a session file are grouped into the same conversation until a gap exceeding the threshold is detected. Each gap triggers a new conversation boundary.

For example, with a 60-minute threshold:
```
10:00  "implement the parser"       ─┐
10:05  "add error handling"          │ Conversation 1
10:12  "now add tests"              ─┘
                                     ← 3-hour gap
13:15  "refactor the scoring module" ─┐
13:20  "also update the tests"      ─┘ Conversation 2
```

### Threshold selection

The default threshold is **60 minutes**, stored in `shared/defaults.json` as `conversation.inactivityGapMinutes`. This value is configurable because:

1. **n=1 data** — The initial analysis was performed on a single developer's session data. Different workflows (frequent short breaks vs. long uninterrupted stretches) would produce different optimal thresholds.
2. **No ground truth** — There is no external signal for "this is where a conversation ended." The threshold is a judgment call informed by gap distribution analysis, not an empirically validated boundary.
3. **Threshold sensitivity** — Small threshold changes meaningfully affect conversation count and scoring:
   - A lower threshold produces more, shorter conversations (higher prompt coverage per conversation, but more single-message conversations)
   - A higher threshold produces fewer, longer conversations (lower prompt coverage, but more contextually coherent units)

### Gap analysis tool

The `shared/tools/analyze_gaps.py` script allows users to analyze their own data and choose an appropriate threshold:

```bash
uv run python shared/tools/analyze_gaps.py                            # default path
uv run python shared/tools/analyze_gaps.py /path/to/claude/projects   # custom path
uv run python shared/tools/analyze_gaps.py --threshold 45             # test specific threshold
uv run python shared/tools/analyze_gaps.py --json                     # machine-readable output
```

The script outputs:
- Gap distribution statistics (min, median, mean, p75, p90, p95, p99, max)
- Conversation count and characteristics for each candidate threshold (15m, 30m, 45m, 60m, 90m, 2h)
- A heuristic recommendation balancing conversation granularity against over-splitting

### Configuration

The threshold is configurable per-interface:

- **VS Code extension:** `codefluent.conversation.inactivityGapMinutes` in VS Code settings
- **Webapp:** `CODEFLUENT_CONVERSATION_INACTIVITYGAPMINUTES` environment variable, or `conversation.inactivityGapMinutes` in `webapp/config.json`
- **Default:** 60 minutes (in `shared/defaults.json`)

## CLAUDE.md Config Scoring

CodeFluent also scores workspace `CLAUDE.md` files against the fluency behaviors. Only **3 of 11 behaviors** are eligible for config scoring — those that represent meta-interaction rules a config file can genuinely establish:

- **setting_interaction_terms** — "Push back if wrong", "ask before changing"
- **identifying_missing_context** — "Flag assumptions you're making"
- **questioning_reasoning** — "Explain rationale", "compare alternatives"

The remaining 8 behaviors are task-specific and cannot be established by a project-level configuration file. See issue #118 for the detailed rationale.

Config-detected behaviors are merged with session-detected behaviors via OR logic: `effective = session_behavior OR (config_eligible AND config_behavior)`. This means a CLAUDE.md can boost your score for these 3 behaviors, but cannot substitute for demonstrating them in actual prompts.

## Known Limitations

### Scoring accuracy

- **LLM-as-judge** — Behavior detection is performed by Claude Sonnet, which introduces model-dependent variance. Different model versions may score the same prompts differently.
- **Context truncation** — Only the first 20 prompts per conversation are scored (configurable via `scoring.maxPromptsPerConversation`). Behaviors demonstrated later in a conversation are missed.
- **Prompt-only analysis** — Only user messages are scored. The assistant's responses, which provide essential context for behaviors like `providing_feedback` and `building_on_responses`, are not included in the scoring input.
- **Binary behavior detection** — Each behavior is scored as present/absent. There is no gradation between a weak demonstration and a strong one.

### Conversation boundaries

- **Inactivity ≠ intent** — A 30-minute gap might be a coffee break within the same task, or it might be a genuine context switch. The threshold cannot distinguish these cases.
- **Cross-session continuity** — Users may continue the same logical conversation across multiple session files. The current approach does not attempt to link conversations across files.
- **Score discontinuity** — Moving from session-based to conversation-based scoring changes scores even if user behavior is unchanged. Historical scores become incomparable (the measurement changed, not the behavior).
- **Coverage bias** — Shorter conversations mean the 20-prompt scoring window covers a higher percentage of prompts. This improves measurement quality but is a confound for before/after comparisons.

### Data limitations

- **Single-user validation** — The initial threshold and scoring behavior were validated against one developer's data
- **No inter-rater reliability** — Behavior labels have not been validated by multiple human raters
- **Selection bias** — Users who install CodeFluent are likely already interested in improving their AI interactions, which skews the baseline

## Future Research Directions

The conversation-splitting work positions CodeFluent as infrastructure for analyzing Claude Code interactions at a granularity not available to server-side research. Several directions are enabled by this tooling:

### Conversation structure as a fluency signal

Beyond *what* you say, *how* you engage may matter: sustained deep work vs. shallow drive-by prompts, engagement duration, prompt density over time, and conversation depth are potential fluency dimensions the AI Fluency Index doesn't address.

### Conversation shape analysis

With conversation boundaries, shape becomes analyzable — does prompt complexity escalate or taper? Does the user circle back to earlier topics? Are there distinct phases (exploration → implementation → debugging)?

### Cross-project conversation patterns

Even a single user working across repositories provides within-user variance that controls for individual style and isolates how project type affects conversation structure.

### Unique data advantage

Claude Code session files contain timestamps, tool usage, file edits, git branch context, plan mode usage, and thinking blocks — a much richer behavioral signal than web chat transcripts. This data is uniquely available to tools that parse local session files and is not accessible to server-side research.

## References

- Anthropic. (2025). *AI Fluency Index: Measuring How Effectively Humans Communicate with AI.* https://www.anthropic.com/research/AI-fluency-index
- CodeFluent issue #118: Restrict CLAUDE.md config scoring to project-level behaviors only
- CodeFluent issue #130: Conversation-based analytics redesign
- CodeFluent issue #131: Analyze inter-message gap distribution
