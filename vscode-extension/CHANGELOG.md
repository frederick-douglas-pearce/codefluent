# Changelog

Extension-specific changes. For the full project changelog (including webapp and shared components), see the [root CHANGELOG](../CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.1.0] - 2026-04-10

### Added

- **Conversations tab** — sortable list view with per-conversation metrics, expandable detail rows showing individual prompts, duration distribution and average length trend charts (#133, #168, #169)
- **Agent metrics display** — cards with sparklines showing tool usage, thinking events, and agent behavior patterns per conversation and weekly (#166, #167)
- **Configuration maturity** — `.claude/` directory scanner assesses hooks, commands, rules, skills, and MCP server setup; doughnut chart and category breakdown in new Config tab (#158, #172)
- **Configuration advisor** — generates hook recommendations based on maturity gaps, with one-click copy for `settings.json` (#161)
- **Task type distribution** — heuristic classifier detects task types from branch prefixes and prompt keywords; displayed as doughnut chart (#150, #170)
- **Anti-pattern detection** — flags structured output anti-patterns (e.g., requesting JSON without tool use) in user prompts (#171)
- **Advisory-vs-programmatic gap detection** — identifies fluency behaviors stated in CLAUDE.md but not enforced via hooks (#159)
- **Inter-prompt gap histogram** — visualizes time gaps between prompts with configurable conversation boundary threshold line (#186)
- **`/clear` as conversation boundary** — treats `/clear` commands as conversation splits in addition to inactivity gaps (#194)
- **Custom command and skill tracking** — detects usage of custom slash commands and skills as positive conversation signals (#206)
- **Tab reorder** — tabs rearranged for natural user workflow: Fluency Score → Conversations → Usage → Config → Prompt Optimizer → Quick Wins → Recommendations (#198)

### Fixed

- Score cache ID mismatch — now uses content hash for stable cache lookup across conversation boundary changes (#182)
- ISO 8601 week algorithm used local time instead of UTC for chart date keys (#188)
- System commands and slash commands filtered from conversation metrics and prompt counts (#195)
- System-injected messages filtered from user prompts before scoring (#222)
- Config maturity score not detecting hook matchers (#207)
- MCP scanner now checks `~/.claude.json` project-level `mcpServers` (#210)
- Enforcement coverage uses keyword overlap instead of event-only match (#211)
- Doughnut chart aspect ratio and agent metrics card overflow in VS Code sidebar (#202)
- Release pipeline chains build job into release-please workflow (#156)
- Resolved npm audit vulnerabilities in dev dependencies (#162)

### Changed

- Test coverage: 907 tests across 22 suites

## [1.0.1] - 2026-03-25

### Fixed

- Run Analysis now always fetches fresh conversation data instead of using stale cache, ensuring new Claude Code sessions are included in scoring (#151)
- Conversation analytics also fetch fresh data on each request (#151)
- Both VS Code extension and webapp frontends refresh conversations before scoring (#151)

## [1.0.0] - 2026-03-22

### ⚠ BREAKING CHANGES

- Sessions replaced by **conversations** as the primary analytics unit. Conversations are formed by gap-based splitting across all session files per project, producing more meaningful scoring windows and accurate per-day attribution (#130)

### Added

- **Conversation assembly** — all messages per project are pooled, sorted by timestamp, and split into conversations at configurable inactivity gaps between user prompts (default: 60 minutes). Each conversation is the unit of scoring, replacing the previous per-session approach (#130)
- **Centralized configuration** — `shared/defaults.json` as single source of truth, with VS Code settings overlay. Exposes `codefluent.scoring.model`, `codefluent.scoring.maxPromptsPerConversation`, `codefluent.optimizer.alreadyGoodThreshold`, and `codefluent.conversation.inactivityGapMinutes` in VS Code Settings UI (#132, #134)
- **CLAUDE.md config scoring restricted to 3 behaviors** — only `setting_interaction_terms`, `identifying_missing_context`, and `questioning_reasoning` can be credited from config (defense-in-depth with prompt) (#118, #127)
- **Scoring eval framework** — golden set of 50 curated test cases with automated regression checks in CI on prompt changes (#110, #119, #123)
- **Inter-prompt gap analysis tool** — `webapp/analyze_gaps.py` for visualizing gap distributions to tune the inactivity threshold (#131, #135)

### Changed

- All UI terminology: "session analytics" → "conversation analytics" throughout (#130)
- Footer text: "Built on" → "Inspired by" Anthropic research (#130)
- Prompt counts now only count `type: "user"` messages with actual content, excluding `tool_result` messages (#139)
- Test coverage: 617 tests across 16 suites

### Fixed

- Scoring parity between VS Code extension and webapp Usage tab (#142)
- Prompt counts inflated by `tool_result` messages counted as user prompts (#139)
- Conversation table formatting lacks cell padding/spacing (#137)
- Stale browser cache and null element crash on Usage tab (#130)

## [0.3.0] - 2026-03-14

### Added

- **Session token analytics** — per-session token aggregation from JSONL data with cost estimation, cache hit rates, and output/input ratios displayed on the Usage tab (#86, #88, #89)
- **Cost-efficiency scatter charts** — 3 scatter plots with continuous red-amber-green color gradient by fluency score: Cost/Prompt vs Cache Hit Rate, Cost/Prompt vs Output/Input Ratio, Fluency Score vs Cost/Prompt (#90, #102)
- **Per-session cost estimation** — model-specific pricing from `shared/pricing.json` (#91)
- **Session analytics project filtering** — filter analytics by selected project (#104)
- **Sortable session details table** — date, project, prompts, tokens, cost, cost/prompt, cache hit, cache R/C, out/in, score

### Changed

- Daily Token Usage chart switched to log scale (#100)
- Replaced Avg Tokens/Prompt summary card with Avg Cost/Prompt
- Test coverage: 528 tests across 14 suites

### Fixed

- Session analytics OOM crash on large datasets
- Sparkline score history not scoped to current project
- Score chart y-axis clipping above 100

## [0.2.0] - 2026-03-08

### Added

- **Prompt Optimizer** — paste any prompt and get an optimized version with missing fluency behaviors added; config-aware (factors in CLAUDE.md so it won't add redundant behaviors). Available in both VS Code extension and webapp (#54)
- **Webapp project scoping** — project dropdown scopes Fluency Score, Prompt Optimizer, and Quick Wins to a specific repo; settings bar visibility refined per tab (#52, #62)
- **Personalized recommendations** — expanded coaching for all 11 fluency behaviors with high/medium impact categories, concrete examples, and research citations (#44)
- **CI/CD pipeline** — GitHub Actions for tests, security review, AI code review (`needs-review` label), and automated release with marketplace publishing (#55, #66)
- **Security audit** — path traversal fix (`is_relative_to()` instead of `startswith()`), API key redaction on all error paths (`_sanitize_error()`/`sanitizeError()`), security response headers (`X-Content-Type-Options`, `X-Frame-Options`, `X-XSS-Protection`, `Referrer-Policy`) (#68)
- **Health endpoint** — `GET /health` returns status, version, and dependency checks for API key and data directory (#69)
- **PR template** — `.github/PULL_REQUEST_TEMPLATE.md` with E2E smoke test checklist reminder (#69)
- **Webapp test suite** — 193 tests across 5 suites covering API, helpers, security, JSONL parsing, prompt loading, and XSS source-level verification (#67, #79)
- **Dependabot** — automated dependency update PRs for npm, pip, and GitHub Actions
- **Dependency auditing in CI** — `npm audit` (high/critical) and `pip-audit` on every PR (#66, #68)
- **Versioned prompt templates** — shared `shared/prompts/` directory with registry, used by both interfaces
- **Version verification** — release workflow verifies `package.json` version matches the git tag

### Changed

- Claude-review workflow triggers on `needs-review` label instead of every push (reduces API costs)
- Empty state messages for Usage tab and ccusage-not-installed error (#43, #45)
- Research source links open in new tab in webapp (#53)
- Updated all three READMEs with Prompt Optimizer docs and refreshed screenshots (#60)

### Fixed

- Prompt optimizer `behaviors_added` computed from actual score diff instead of optimizer self-report
- Webapp optimizer now correctly resolves `project_path_encoded` for CLAUDE.md lookup
- Path traversal vulnerability in `_decode_project_path()` (#68)
- API keys no longer leak in error messages (#68)

## [0.1.0] - 2026-03-03

### Added

- AI fluency scoring — analyzes your Claude Code prompts against 11 prompting behaviors and gives a 0–100 score
- CLAUDE.md config scoring — get credit for fluency behaviors defined as project conventions
- Usage dashboard — daily/monthly token usage, cost tracking, and session history via `ccusage`
- Weekly score trend tracking with sparkline chart and trajectory text
- Quick Wins — GitHub-repo-scoped task suggestions with one-click Claude Code launch
- Coaching tab — personalized tips based on your weakest fluency behaviors
- Score caching with stale-while-revalidate to reduce API calls and load times
- Nonce-based CSP and XSS-safe HTML rendering
- Shell injection protection for all subprocess calls
- Cross-platform support (Linux, macOS, Windows)
