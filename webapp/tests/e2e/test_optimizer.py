"""E2E item 7: Prompt Optimizer — type prompt, click Optimize, results render.

With a fake `ANTHROPIC_API_KEY` the backend returns 500 for `/api/optimize`;
the frontend renders an error empty-state. We assert the error path renders
cleanly (no crash, button re-enabled) — see #312 architect review for why
happy-path mocking is out of scope for Phase B.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_optimize_button_disabled_with_empty_input(page: Page):
    """Empty/whitespace input must not crash; renders inline empty-state."""
    page.goto("/")
    page.locator('button.tab[data-tab="optimizer"]').click()

    expect(page.locator("#optimizer-textarea")).to_be_visible()
    page.locator("#optimize-btn").click()

    # Frontend short-circuits and shows an inline message.
    expect(page.locator("#optimizer-results")).to_contain_text(
        "Please enter a prompt to optimize."
    )


@pytest.mark.e2e
def test_optimize_request_completes_without_crash(page: Page):
    """Type a real prompt, click Optimize, wait for completion (success or error)."""
    page.goto("/")
    page.locator('button.tab[data-tab="optimizer"]').click()

    textarea = page.locator("#optimizer-textarea")
    textarea.fill("Help me refactor this function for clarity.")

    btn = page.locator("#optimize-btn")
    btn.click()

    # Re-enable indicates the request lifecycle completed without an
    # unhandled exception (the button is restored inside a `finally`).
    expect(btn).to_have_text("Optimize", timeout=30_000)
    expect(btn).to_be_enabled()

    # Results panel must be non-empty — either an optimized prompt rendered,
    # an "already good" card, or a graceful error message.
    expect(page.locator("#optimizer-results")).not_to_be_empty()


@pytest.mark.e2e
def test_optimizer_char_counter_updates(page: Page):
    """Typing updates the live character counter — sanity check for input wiring."""
    page.goto("/")
    page.locator('button.tab[data-tab="optimizer"]').click()

    counter = page.locator("#optimizer-char-count")
    expect(counter).to_have_text("0 / 10,000")

    page.locator("#optimizer-textarea").fill("hello")
    expect(counter).to_have_text("5 / 10,000")
