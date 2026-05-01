"""E2E item 4: Fluency scoring — Run Analysis triggers scoring and renders gracefully.

The fixture seeds a fake `ANTHROPIC_API_KEY`. Anthropic returns 401 for the
real API call; the backend catches the exception per-conversation and the
frontend ends up rendering an empty-state ("No conversations could be scored.")
rather than crashing. That graceful degradation is exactly what we're
asserting — happy-path scoring requires a real key and is out of scope for
Phase B (see #312 architect review).
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_run_analysis_completes_without_crash(page: Page):
    """Click Run Analysis, wait for the button to re-enable, assert results render.

    The button is only re-enabled inside a `finally` block, so this implicitly
    verifies the request lifecycle completed (no unhandled exception). The
    empty-state message in `#fluency-results` confirms the error path renders
    cleanly.
    """
    page.goto("/")

    btn = page.locator("#run-scoring-btn")
    expect(btn).to_be_visible()
    expect(btn).to_be_enabled()

    btn.click()

    # Button is disabled while scoring runs; wait for it to come back to
    # "Run Analysis" once the request resolves (success or error).
    expect(btn).to_have_text("Run Analysis", timeout=30_000)
    expect(btn).to_be_enabled()

    # With a fake API key, all conversations fail to score → backend returns
    # aggregate without `average_score` → frontend renders the empty-state.
    # Either the empty-state or a real result is acceptable; we just need to
    # see SOMETHING rendered (not a blank panel).
    fluency_results = page.locator("#fluency-results")
    expect(fluency_results).not_to_be_empty()


@pytest.mark.e2e
def test_run_analysis_does_not_leave_disabled_button(page: Page):
    """Regression guard: button must always re-enable, even on error.

    A previous bug class (caught only in manual testing) was the button
    staying disabled after a failed score, leaving the UI unrecoverable
    without a page reload.
    """
    page.goto("/")

    btn = page.locator("#run-scoring-btn")
    btn.click()
    expect(btn).to_be_enabled(timeout=30_000)
