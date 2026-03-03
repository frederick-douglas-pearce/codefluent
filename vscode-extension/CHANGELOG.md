# Changelog

All notable changes to the CodeFluent extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/),
and this project adheres to [Semantic Versioning](https://semver.org/).

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
