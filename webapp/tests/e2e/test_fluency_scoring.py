"""E2E item 4: Fluency scoring renders gracefully under a fake API key.

Happy-path scoring needs a real Anthropic key; here we assert the error
path degrades cleanly — button re-enables, results panel is non-empty.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import expect_button_idle, go_to_tab


@pytest.mark.e2e
def test_run_analysis_completes_without_crash(page: Page):
    go_to_tab(page, "fluency")

    btn = page.locator("#run-scoring-btn")
    btn.click()

    expect_button_idle(btn, "Run Analysis")
    expect(page.locator("#fluency-results")).not_to_be_empty()
