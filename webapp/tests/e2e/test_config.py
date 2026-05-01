"""E2E item 6: Config tab — maturity score and breakdown render.

`/api/config-maturity` does not respect `CLAUDE_DATA_DIR` (architect review
flagged this in #312). Without a project selected, the scanner runs against
the test runner's home directory and returns a (possibly empty) maturity
result. `renderConfigMaturity` always renders the score ring + checklist
sections regardless of how many checks are populated, so this test is valid
in both seeded and empty environments.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_config_tab_renders_maturity_score_and_breakdown(page: Page):
    page.goto("/")
    page.locator('button.tab[data-tab="config"]').click()

    container = page.locator("#config-maturity-content")
    expect(container).to_be_visible()

    # Score ring renders inside the maturity score section once the request
    # resolves; the loading empty-state is replaced.
    expect(container.locator(".maturity-score-section")).to_be_visible(
        timeout=15_000
    )
    expect(container.locator(".maturity-tier")).to_be_visible()

    # Checklist breakdown exists with at least one category.
    expect(container.locator(".maturity-checklist")).to_be_visible()
    expect(container.locator(".maturity-category").first).to_be_visible()
