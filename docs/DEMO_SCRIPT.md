# CodeFluent — Demo Script (3 Minutes)

---

## Setup Before Demo
- Browser open to `http://localhost:8000`
- ccusage data already exported to `data/ccusage/`
- Prompts already extracted via `uv run python extract_prompts.py`
- At least 5 sessions pre-scored (results cached in `data/scores.json`)
- Terminal ready but minimized

---

## Opening (0:00 – 0:30) — The Hook

> "How many of you use Claude Code?"
> *pause for hands*
>
> "How many of you know if you're actually *good* at it?"
>
> "Five days ago, Anthropic published the AI Fluency Index — a framework for measuring how effectively people interact with AI. They identified 11 specific behaviors that separate fluent AI users from everyone else."
>
> "I built CodeFluent. It reads your Claude Code session history, scores you against Anthropic's own research, and tells you exactly where to improve."

---

## Usage Dashboard (0:30 – 1:00) — The Data

> "Let's start with the basics. This is my real Claude Code usage — 117 sessions over 2 months."

**Actions:**
1. Point to stat cards: "I've used [X] million tokens at a cost of [Y] dollars."
2. Point to daily chart: "You can see the pattern — heavy build days, quiet days."
3. Point to model breakdown: "Mostly Opus for complex work, some Sonnet for quick tasks."

> "All of this comes from ccusage, a community tool that reads your local session files. Zero custom parsing needed for the usage data."

---

## AI Fluency Score (1:00 – 2:00) — The Core Feature

> "Now the interesting part. I scored my recent sessions against Anthropic's framework."

**Actions:**
1. Click "Fluency Score" tab
2. Point to the overall score: "I got a [72] out of 100."
3. Walk down the behavior bars:
   - "Iteration — 85%. I'm good at building on Claude's responses rather than accepting the first answer."
   - "But look — Setting Interaction Terms, only 15%. I almost never tell Claude *how* to work with me."
   - "Checking Facts — 25%. I'm trusting Claude's output without verifying. And Anthropic's research shows this actually gets *worse* when you're generating code."
4. Point to coding pattern chart: "Anthropic studied 6 coding interaction patterns. Users who ask conceptual questions scored 86% on comprehension. Users who just delegate? Under 40%. Most of my sessions use high-quality patterns, but I've got a few delegation sessions."

> "These aren't made-up metrics. The scoring rubric comes directly from two Anthropic research papers published in the last five weeks."

---

## Quick Wins (2:00 – 2:30) — The Action

> "So I know my weak spots. But CodeFluent also looks at my GitHub repos and suggests concrete tasks."

**Actions:**
1. Click "Quick Wins" tab
2. Show 2 suggested tasks: "Here's one — 'Add tests to the experiment bridge module.' It even wrote the Claude Code prompt for me — just copy and paste."

> "Each suggestion is a real task from my real repos, completable in 15-30 minutes."

---

## Close (2:30 – 3:00) — The Why

> "Every Claude Code user has the same problem: they've built habits, and they don't know which habits are helping and which are limiting them."
>
> "CodeFluent fixes that. It runs entirely locally — your session data stays on your machine. The only external call is the scoring API."

**Action:** Briefly flash Recommendations tab.

> "Every recommendation links back to a specific Anthropic research paper. This isn't guesswork — it's self-improvement grounded in real data."
>
> "CodeFluent. Score your AI fluency. Get better at the one tool that multiplies everything else you do."

---

## Likely Questions & Answers

**Q: Where does the session data come from?**
A: Claude Code stores sessions locally as JSONL files in `~/.claude/projects/`. CodeFluent reads those directly — no special setup.

**Q: How does the scoring work?**
A: I send just the user prompts to the Anthropic API with a scoring rubric based on the AI Fluency Index. Claude-as-judge returns a structured assessment of 11 behaviors and classifies the coding pattern.

**Q: How accurate is the fluency score?**
A: The behaviors are well-defined by Anthropic's study of 9,830 conversations. Claude is good at classifying them. But it's a tool for self-reflection, not a certification.

**Q: Can this work for a team?**
A: That's the post-hackathon vision — aggregate scores across a team, identify team-wide skill gaps.

**Q: Privacy concerns?**
A: Everything runs locally. The only external call is to the Anthropic API for scoring, and that's just your prompts, not full responses.

---

## Disaster Recovery

**API down/slow:** Pre-scored results are cached. Say "I pre-scored these earlier" and demo from cache. Usage tab needs no API at all.

**Frontend visual bug:** Keep talking, don't draw attention. Move to the next tab.

**Running long:** Skip Quick Wins. Core demo is: Hook → Usage → Fluency Score → Close.

**Question stumps you:** "That's a great direction for the post-hackathon version."
