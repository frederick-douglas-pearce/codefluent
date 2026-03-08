# Changelog

All notable changes to the CodeFluent extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.2.0] - 2026-03-07

### Added

- **Prompt Optimizer** — paste any prompt and get an optimized version with missing fluency behaviors added; config-aware (factors in CLAUDE.md so it won't add redundant behaviors)
- **Webapp project scoping** — project dropdown scopes Quick Wins to a specific repo's GitHub issues and CLAUDE.md; settings bar visibility refined per tab
- **Personalized recommendations** — expanded coaching for all 11 fluency behaviors with high/medium impact categories, concrete examples, and research citations
- **CI/CD pipeline** — GitHub Actions for tests, security review, AI code review (`needs-review` label), and automated release with marketplace publishing
- **Dependabot** — automated dependency update PRs for npm, pip, and GitHub Actions
- **npm audit in CI** — high/critical vulnerability check on every PR
- **Version verification** — release workflow verifies `package.json` version matches the git tag

### Changed

- Claude-review workflow triggers on `needs-review` label instead of every push (reduces API costs)
- Empty state messages for Usage tab and ccusage-not-installed error
- Updated all three READMEs with Prompt Optimizer docs and refreshed screenshots

### Fixed

- Prompt optimizer `behaviors_added` computed from actual score diff instead of optimizer self-report
- Webapp optimizer now correctly resolves `project_path_encoded` for CLAUDE.md lookup

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
