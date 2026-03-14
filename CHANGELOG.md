# Changelog

All notable changes to the CodeFluent project will be documented in this file. This covers both the VS Code extension and the web app. For extension-specific changes, see [`vscode-extension/CHANGELOG.md`](vscode-extension/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.3.1](https://github.com/frederick-douglas-pearce/codefluent/compare/v0.3.0...v0.3.1) (2026-03-14)


### Bug Fixes

* add FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to release-please workflow ([aa14fc0](https://github.com/frederick-douglas-pearce/codefluent/commit/aa14fc09627e2c74f88346d8202426acd0f076a2))

## [0.3.0] - 2026-03-14

### Added

- **Session token analytics** — per-session token aggregation from JSONL data with cost estimation, cache efficiency ratios, and output/input ratios. Available in both VS Code extension and webapp Usage tabs (#86, #87, #88, #89)
- **Cost-efficiency scatter charts** — 3 Chart.js scatter plots (Cost/Prompt vs Cache Hit Rate, Cost/Prompt vs Output/Input Ratio, Fluency Score vs Cost/Prompt) with continuous red-amber-green color gradient by fluency score (#90, #102)
- **Per-session cost estimation** — model-specific pricing from `shared/pricing.json` applied to token counts (#91)
- **Session analytics project filtering** — filter analytics by project in both interfaces (#104)
- **Shared pricing data** — `shared/pricing.json` with time-aware model pricing for cost calculations

### Changed

- Daily Token Usage chart switched to log scale for better visualization across varying usage levels (#100)
- Replaced Avg Tokens/Prompt summary card with Avg Cost/Prompt; added Cost/Prompt column to session details table
- Documentation overhaul: rewrote TECHNICAL_SPEC.md and UI_SPEC.md (removed stale code blocks, fixed inaccuracies), updated all READMEs, expanded CONTRIBUTING.md for both interfaces (#95)
- Test coverage: 528 extension tests (14 suites), 241 webapp tests (5 suites) — 769 total

### Fixed

- Session analytics OOM crash on large datasets
- Sparkline score history not scoped to current project
- Repo detection for dotted names (e.g., `.github.io`)
- Score chart y-axis clipping above 100
- Security review workflow checkout authentication

## [0.2.0] - 2026-03-08

### Added

- **Prompt Optimizer** — paste any prompt and get an optimized version with missing fluency behaviors added; config-aware so it won't add behaviors already covered by CLAUDE.md (#54)
- **Webapp project scoping** — project dropdown scopes Fluency Score, Prompt Optimizer, and Quick Wins to a specific repo; settings bar visibility refined per tab (#52, #62)
- **Personalized recommendations** — expanded coaching for all 11 fluency behaviors with high/medium impact categories, concrete examples, and research citations (#44)
- **CI/CD pipeline** — GitHub Actions for tests, security review, AI code review, and automated release with Marketplace publishing (#55, #66)
- **Security hardening** — path traversal fix, API key redaction on all error paths, security response headers (#68)
- **Health endpoint** — `GET /health` returns status, version, and dependency checks (#69)
- **Webapp test suite** — 193 tests across 5 suites (#67, #79)
- **Versioned prompt templates** — shared `shared/prompts/` directory with registry, used by both interfaces
- **Dependency auditing** — `npm audit` and `pip-audit` in CI (#66, #68)
- **Dependabot** — automated dependency update PRs

### Changed

- Claude-review workflow triggers on `needs-review` label instead of every push
- Empty state messages for Usage tab and ccusage-not-installed error (#43, #45)

### Fixed

- Prompt optimizer `behaviors_added` computed from actual score diff instead of self-report
- Webapp optimizer project path resolution for CLAUDE.md lookup
- Path traversal vulnerability in `_decode_project_path()` (#68)
- API key leakage in error messages (#68)

## [0.1.0] - 2026-03-03

### Added

- AI fluency scoring — analyzes Claude Code prompts against 11 research-backed behaviors (0–100 score)
- CLAUDE.md config scoring — credit for fluency behaviors defined as project conventions
- Usage dashboard — daily/monthly token usage, cost tracking, session history via `ccusage`
- Weekly score trend tracking with sparkline chart
- Quick Wins — GitHub-repo-scoped task suggestions with one-click Claude Code launch
- Coaching tab — personalized tips based on weakest fluency behaviors
- Score caching with stale-while-revalidate
- Nonce-based CSP and XSS-safe HTML rendering
- Shell injection protection for all subprocess calls
- Cross-platform support (Linux, macOS, Windows)
- Web app — standalone FastAPI + vanilla JS alternative to the VS Code extension
