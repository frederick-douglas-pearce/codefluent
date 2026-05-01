"""E2E item 8: Quick Wins — click Generate, results section renders.

The endpoint depends on `gh` CLI being authenticated AND on the Anthropic API
returning suggestions. In E2E, both are unreliable: CI may not have `gh`
auth, and the fake API key returns 401. The backend returns
`{"suggestions": [], "error": "..."}` in that case and the frontend renders
the no-suggestions empty-state. We assert that graceful degradation.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_generate_suggestions_completes_without_crash(page: Page):
    page.goto("/")
    page.locator('button.tab[data-tab="quickwins"]').click()

    btn = page.locator("#load-quickwins-btn")
    expect(btn).to_be_visible()
    expect(btn).to_be_enabled()
    btn.click()

    # Re-enable indicates the request lifecycle completed (success or error).
    expect(btn).to_have_text("Generate Suggestions", timeout=30_000)
    expect(btn).to_be_enabled()

    # Results panel must be non-empty — either rendered suggestion cards or
    # a graceful no-suggestions empty-state.
    expect(page.locator("#quickwins-results")).not_to_be_empty()
