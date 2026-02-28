# CodeFluent — References

All research, documentation, and tools that inform CodeFluent's design and scoring.

---

## Primary Research Papers

### 1. AI Fluency Index
- **Published:** February 23, 2026
- **URL:** https://www.anthropic.com/research/AI-fluency-index
- **Used for:** The core 11-behavior scoring framework
- **Key data:** 9,830 Claude.ai conversations analyzed (Jan 20–26, 2026)
- **Key findings:**
  - 11 observable fluency behaviors identified
  - Iteration most common (85.7%), setting interaction terms least common (~30%)
  - Users who iterate show 2.67 additional fluency behaviors
  - Artifact creation makes users more directive but less evaluative

### 2. AI Assistance and Coding Skills Formation
- **Published:** January 29, 2026
- **URL:** https://www.anthropic.com/research/AI-assistance-coding-skills
- **Used for:** The 6 coding interaction pattern classifications
- **Key data:** 52 participants learning unfamiliar Python library
- **Key findings:**
  - AI-assisted group scored 17% lower on comprehension (50% vs 67%)
  - Conceptual Inquiry pattern: 86% comprehension
  - AI Delegation pattern: <40% comprehension

---

## Official Documentation

### 3. Claude Code Best Practices
- **URL:** https://code.claude.com/docs/en/best-practices
- **Used for:** Recommendations engine

### 4. Claude Code Cost Management
- **URL:** https://code.claude.com/docs/en/costs
- **Used for:** Plan tier context

### 5. Claude Code Data Usage
- **URL:** https://code.claude.com/docs/en/data-usage
- **Used for:** Privacy assurances

---

## Tools

### 6. ccusage
- **GitHub:** https://github.com/ryoppippi/ccusage
- **Role in CodeFluent:** Primary source for all token/cost data
- **Verified commands:**
  ```bash
  npx ccusage@latest daily --json > data/ccusage/daily.json
  npx ccusage@latest monthly --json > data/ccusage/monthly.json
  npx ccusage@latest session --json -o desc > data/ccusage/session.json
  npx ccusage@latest blocks --json > data/ccusage/blocks.json
  ```

### 7. Community Resources
- https://rosmur.github.io/claudecode-best-practices/
- https://claudelog.com/

---

## Verified Local Data

| Item | Value |
|------|-------|
| Session data path | `~/.claude/projects/` |
| Projects | 2 active repos |
| Total sessions | 117 JSONL files |
| Claude Code version | 2.1.44 |
| Models in use | claude-opus-4-6, claude-opus-4-5-20251101 |
| Date range | Dec 28, 2025 – Feb 27, 2026 (2 months) |
| Python | 3.12.3 |
| Node | v22.18.0 |
| Package manager | uv |
| GitHub CLI | authenticated |

---

## Verified JSONL Schema

**User messages:** `type: "user"` → `message.content` (string or array of `{type: "text", text: "..."}`)

**Token usage:** `type: "assistant"` → `message.usage.{input_tokens, output_tokens, cache_creation_input_tokens, cache_read_input_tokens}`

**Model:** `type: "assistant"` → `message.model`

**Plan Mode signal:** `type: "user"` → `planContent` field (present when Plan Mode used)

**Message types in data:** user (96), assistant (129), tool_use (86), tool_result (86), progress (81), thinking (4), system (4), file-history-snapshot (22), plus streaming types

## ccusage JSON Schema

```json
{
  "daily": [{
    "date": "2025-12-28",
    "inputTokens": 102,
    "outputTokens": 36,
    "cacheCreationTokens": 95593,
    "cacheReadTokens": 390211,
    "totalTokens": 485942,
    "totalCost": 0.79397175,
    "modelsUsed": ["claude-opus-4-5-20251101"],
    "modelBreakdowns": [{
      "modelName": "claude-opus-4-5-20251101",
      "inputTokens": 102,
      "outputTokens": 36,
      "cacheCreationTokens": 95593,
      "cacheReadTokens": 390211,
      "cost": 0.79397175
    }]
  }]
}
```
