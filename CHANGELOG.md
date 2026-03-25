# Changelog

All notable changes to the CodeFluent project will be documented in this file. This covers both the VS Code extension and the web app. For extension-specific changes, see [`vscode-extension/CHANGELOG.md`](vscode-extension/CHANGELOG.md).

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [1.0.1](https://github.com/frederick-douglas-pearce/codefluent/compare/v1.0.0...v1.0.1) (2026-03-25)


### Bug Fixes

* Run Analysis scores stale conversation data instead of latest sessions ([#151](https://github.com/frederick-douglas-pearce/codefluent/issues/151)) ([ffa5d05](https://github.com/frederick-douglas-pearce/codefluent/commit/ffa5d057eeec229570994de6c68628d23209f41e))
* Run Analysis scores stale conversation data instead of latest sessions ([#151](https://github.com/frederick-douglas-pearce/codefluent/issues/151)) ([32fc95b](https://github.com/frederick-douglas-pearce/codefluent/commit/32fc95b64d4f93b9259b0a1e3493537083d70c58))

## [1.0.0](https://github.com/frederick-douglas-pearce/codefluent/compare/v0.3.0...v1.0.0) (2026-03-22)


### ⚠ BREAKING CHANGES

* Sessions replaced by conversations as the primary analytics unit. Conversations are formed by gap-based splitting across session files, producing more meaningful scoring windows and accurate per-day attribution.

### Features

* add automated scoring regression eval runner ([#123](https://github.com/frederick-douglas-pearce/codefluent/issues/123)) ([94ccf2a](https://github.com/frederick-douglas-pearce/codefluent/commit/94ccf2a0a5d25586825af04aa0cb14a78e049f9a))
* add centralized configuration infrastructure ([#132](https://github.com/frederick-douglas-pearce/codefluent/issues/132)) ([#134](https://github.com/frederick-douglas-pearce/codefluent/issues/134)) ([cde6cef](https://github.com/frederick-douglas-pearce/codefluent/commit/cde6cefd60c8b04dde24a6407c55b7b63aa5842e))
* add conversation assembly layer for gap-based analytics ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([967d389](https://github.com/frederick-douglas-pearce/codefluent/commit/967d389f01aa1358385c697d562d19e602b7cccc))
* add golden evaluation set for scoring prompt regression testing ([#110](https://github.com/frederick-douglas-pearce/codefluent/issues/110)) ([#119](https://github.com/frederick-douglas-pearce/codefluent/issues/119)) ([f614c61](https://github.com/frederick-douglas-pearce/codefluent/commit/f614c61689abf677e669a55cedc34f670f43fe2b))
* add inter-message gap analysis tool and methodology docs ([#131](https://github.com/frederick-douglas-pearce/codefluent/issues/131)) ([#135](https://github.com/frederick-douglas-pearce/codefluent/issues/135)) ([6b94705](https://github.com/frederick-douglas-pearce/codefluent/commit/6b9470546d8cec87ae3efc06f726d1fbe709346d))
* conversation-based analytics redesign ([a7e829e](https://github.com/frederick-douglas-pearce/codefluent/commit/a7e829e1c475042866f0b5e3b0b2a50bb0493f4a))
* conversation-based analytics redesign ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([f533290](https://github.com/frederick-douglas-pearce/codefluent/commit/f5332908c655f5ea5d68949a0aaf4e5d97530a3b))
* migrate scoring, analytics, and caching to conversation-based ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([1115dff](https://github.com/frederick-douglas-pearce/codefluent/commit/1115dff92507edc05bd8f96f2be3d56ffb7bbd0f))
* rename session→conversation in frontend terminology and docs ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([8b7a80c](https://github.com/frederick-douglas-pearce/codefluent/commit/8b7a80cc4b5ce759984fa2aaa59cda3488094dde))
* restrict CLAUDE.md config scoring to 3 eligible behaviors ([#118](https://github.com/frederick-douglas-pearce/codefluent/issues/118)) ([#127](https://github.com/frederick-douglas-pearce/codefluent/issues/127)) ([0094ccd](https://github.com/frederick-douglas-pearce/codefluent/commit/0094ccd371d93bfd97f8a56ea5c434094c85fcdc))


### Bug Fixes

* add conversation-named aliases to get_scores aggregate response ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([8240f38](https://github.com/frederick-douglas-pearce/codefluent/commit/8240f38518d8dc5d4c46d4c50e9502998f7738d5))
* add conversation-named keys to webapp analytics aggregates ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([a761efd](https://github.com/frederick-douglas-pearce/codefluent/commit/a761efd937895048da1403b52616a59cb951e279))
* add FORCE_JAVASCRIPT_ACTIONS_TO_NODE24 to release-please workflow ([aa14fc0](https://github.com/frederick-douglas-pearce/codefluent/commit/aa14fc09627e2c74f88346d8202426acd0f076a2))
* add proper cell padding and heading to webapp conversation table ([#137](https://github.com/frederick-douglas-pearce/codefluent/issues/137)) ([3e4c50d](https://github.com/frederick-douglas-pearce/codefluent/commit/3e4c50d316522d37987f67a42df85b5168d7c074))
* conversation table formatting lacks cell padding/spacing ([b4393c4](https://github.com/frederick-douglas-pearce/codefluent/commit/b4393c4a831b4b794dc8648c5f0172deee4fab74))
* prevent stale browser cache and null element crash on Usage tab ([#130](https://github.com/frederick-douglas-pearce/codefluent/issues/130)) ([dbebdd1](https://github.com/frederick-douglas-pearce/codefluent/commit/dbebdd137e171a7757345d70f34b71aa1b1a3d87))
* prompt counts inflated by tool_result messages ([fe86df6](https://github.com/frederick-douglas-pearce/codefluent/commit/fe86df619cf1f468e1a1fea84756b69a7dc4722d))
* prompt counts inflated by tool_result messages counted as user prompts ([#139](https://github.com/frederick-douglas-pearce/codefluent/issues/139)) ([0a59df4](https://github.com/frederick-douglas-pearce/codefluent/commit/0a59df431297a350b45f1201d993c45fadafdf87))
* scoring parity between VS Code extension and webapp Usage tab ([#142](https://github.com/frederick-douglas-pearce/codefluent/issues/142)) ([a7ee5c3](https://github.com/frederick-douglas-pearce/codefluent/commit/a7ee5c382dcd5904f1a4cce74f8e55a797768ff6))

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
