"""E2E item 8: Quick Wins — click Generate, results section renders.

The endpoint depends on `gh` CLI auth and a real Anthropic key; in CI both
are unreliable, so the backend returns `{"suggestions": [], "error": ...}`
and the frontend renders the no-suggestions empty-state. We assert the
graceful degradation.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import expect_button_idle, go_to_tab


@pytest.mark.e2e
def test_generate_suggestions_completes_without_crash(page: Page):
    go_to_tab(page, "quickwins")

    btn = page.locator("#load-quickwins-btn")
    btn.click()

    expect_button_idle(btn, "Generate Suggestions")
    expect(page.locator("#quickwins-results")).not_to_be_empty()
