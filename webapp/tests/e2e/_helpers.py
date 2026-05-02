"""Shared interaction helpers for E2E tests.

Centralizes two patterns that recurred across files:
- `go_to_tab` so tab-button selectors live in one place
- `expect_button_idle` so the "request lifecycle completed" idiom (button
  label restoration is set inside a `finally`, so re-enable + label-reset
  is our only proxy for "no unhandled exception") is documented once.
"""

from __future__ import annotations

from playwright.sync_api import Locator, Page, expect


def go_to_tab(page: Page, data_tab: str) -> None:
    """Load the SPA and switch to the named tab.

    `data_tab` matches the `data-tab` attribute on the tab button (single
    source of truth in `_tabs.TABS`).
    """
    page.goto("/")
    page.locator(f'button.tab[data-tab="{data_tab}"]').click()


def expect_button_idle(btn: Locator, idle_label: str, timeout: int = 30_000) -> None:
    """Wait for a button to return to its idle label and be enabled.

    Frontend re-enables click buttons inside a `finally`, so this is the
    most reliable signal that the request lifecycle finished cleanly. The
    30s ceiling absorbs CI variance; Playwright resolves the moment the
    condition is met.
    """
    expect(btn).to_have_text(idle_label, timeout=timeout)
    expect(btn).to_be_enabled()
