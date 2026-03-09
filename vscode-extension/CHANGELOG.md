# Changelog

All notable changes to the CodeFluent extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
