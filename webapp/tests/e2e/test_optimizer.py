"""E2E item 7: Prompt Optimizer — type prompt, click Optimize, results render."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import expect_button_idle, go_to_tab


@pytest.mark.e2e
def test_optimize_button_disabled_with_empty_input(page: Page):
    """Empty input short-circuits to an inline message rather than calling the API."""
    go_to_tab(page, "optimizer")

    page.locator("#optimize-btn").click()

    expect(page.locator("#optimizer-results")).to_contain_text(
        "Please enter a prompt to optimize."
    )


@pytest.mark.e2e
def test_optimize_request_completes_without_crash(page: Page):
    go_to_tab(page, "optimizer")

    page.locator("#optimizer-textarea").fill("Help me refactor this function for clarity.")

    btn = page.locator("#optimize-btn")
    btn.click()

    expect_button_idle(btn, "Optimize")
    expect(page.locator("#optimizer-results")).not_to_be_empty()


@pytest.mark.e2e
def test_optimizer_char_counter_updates(page: Page):
    go_to_tab(page, "optimizer")

    counter = page.locator("#optimizer-char-count")
    expect(counter).to_have_text("0 / 10,000")

    page.locator("#optimizer-textarea").fill("hello")
    expect(counter).to_have_text("5 / 10,000")
