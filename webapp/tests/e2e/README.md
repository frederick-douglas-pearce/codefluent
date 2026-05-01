# Webapp E2E tests

End-to-end Playwright tests that automate the manual smoke checklist from
`CLAUDE.md`. Each test corresponds to one item in the 10-item checklist.

**Status:** Phase A — infrastructure + 3 of 10 items implemented (#312).
Remaining 7 items land in Phase B.

| # | Checklist item | File | Status |
|---|---|---|---|
| 1 | Tab navigation (7 tabs) | `test_tab_navigation.py` | ✅ Phase A |
| 2 | Settings bar visibility per tab | `test_settings_bar.py` | ✅ Phase A |
| 3 | Project dropdown populates | `test_project_dropdown.py` | ✅ Phase A |
| 4 | Fluency scoring | `test_fluency_scoring.py` | Phase B |
| 5 | Conversations tab | `test_conversations.py` | Phase B |
| 6 | Config tab | `test_config.py` | Phase B |
| 7 | Prompt Optimizer | `test_optimizer.py` | Phase B |
| 8 | Quick Wins | `test_quickwins.py` | Phase B |
| 9 | Usage tab | `test_usage.py` | Phase B |
| 10 | Health endpoint | `test_health.py` | Phase B |

## Running locally

From `webapp/`:

```bash
uv sync --extra dev
uv run playwright install chromium    # one-time browser install
uv run pytest tests/e2e/ -m e2e -v
```

E2E tests are excluded from the default `pytest tests/` run (via the
`addopts = "-m 'not live and not e2e'"` config). Opt in explicitly with
`-m e2e` or by passing the directory.

## Server fixture

`conftest.py` starts a real `uvicorn` subprocess pointed at a sandboxed
temp data directory. One server boot per pytest session.

- **Dynamic port** — picked via `socket.bind(0)` to avoid collisions with the
  dev server or parallel CI jobs.
- **Health polling** — polls `GET /health` with 200ms backoff until 200 or 503
  (degraded-but-running). 15s timeout. On timeout or premature exit, the
  fixture prints captured stderr from uvicorn so failures are diagnosable.
- **`atexit` cleanup** — safety net in case of `KeyboardInterrupt` or pytest
  crash. `proc.terminate()` is idempotent on a dead process.

## Data strategy

The webapp reads session JSONL from `CLAUDE_DATA_DIR` (env var, set in
`webapp/main.py:_resolve_data_dir`). The server fixture sets this to a temp
directory containing one mock session, mimicking
`~/.claude/projects/<encoded-path>/<session>.jsonl`.

The encoded project path is built from `$HOME` so server-side path validation
(which requires the dir to be within `$HOME`) passes both locally and in CI.

### Endpoint data coverage

| Endpoint | Respects `CLAUDE_DATA_DIR`? | E2E strategy |
|---|---|---|
| `/api/conversations`, `/api/sessions` | Yes (`_resolve_data_dir`) | Seeded data |
| `/api/scores`, `/api/run-scoring` | Yes | Seeded data + error-path on API call |
| `/api/quickwins` | Yes | Seeded data + error-path on API call |
| `/api/optimize` | N/A (no data lookup) | Error-path on API call |
| `/api/conversation-analytics` | Yes | Seeded data |
| `/api/usage` | **No — uses hardcoded `DATA_DIR`** | Empty-state assertion in Phase B |
| `/api/config-maturity` | **No — scans real `~/.claude/`** | Empty-state assertion in Phase B |
| `/health` | N/A | Direct HTTP assertion in Phase B |

Phase B will treat empty-state rendering as itself a regression target — a
graceful empty-state for `/api/config-maturity` and `/api/usage` is valuable
coverage in its own right.

## Mocking the Anthropic API

**Strategy: error-path testing only (Phase B).** Tests that trigger API calls
(items 4, 7, 8) run with a fake key (`sk-test-e2e-fake-key`) set by the
server fixture. The Anthropic client constructor doesn't validate the key,
but the API call fails. Tests assert the UI shows an error state (e.g., the
results card displays a user-friendly message rather than crashing).

Happy-path mocking (server-side stub or HTTP mock server) is deferred to a
follow-up if value justifies the prod-code surface area. Architect concurred
with this trade-off (#312 review, 2026-05-01).

## Selector strategy

**IDs first, never text.** The webapp HTML is ID-rich
(`#tab-fluency`, `#run-scoring-btn`, `#data-path-group`), and IDs are
stable across button-label changes. The doc-drift fixes that motivated #312
(e.g., "Run Scoring" → "Run Analysis" caught only by PR #311) are exactly
the kind of regression text-based selectors invite.

`data-tab` attributes on tab buttons are an equally stable alternative used
for tab-navigation tests.

`data-testid` attributes are not currently in the HTML; introducing them
would be coordinated with #298 (frontend rendering hardening) and is out
of scope for #312.

## CI

The `e2e` job in `.github/workflows/ci.yml` runs only on PRs touching
`webapp/` or `shared/` paths (filtered via `dorny/paths-filter`). The job
is visible in the PR check list and shows as skipped on docs-only or
extension-only PRs — required-status-checks gates still apply.

Public repo: GitHub Actions Linux minutes are free, so the cost is
wall-clock time on PR feedback, not money. Path filtering keeps that
overhead off PRs that can't affect the webapp.
