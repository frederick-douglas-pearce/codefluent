"""E2E item 1: Tab navigation — all 7 tabs switch correctly, correct panel is visible.

Asserts that clicking each `button.tab` activates the matching `#tab-{name}` panel
and deactivates all others. Uses element IDs and `data-tab` attributes as primary
selectors (stable; immune to button-label drift like the "Run Scoring" -> "Run Analysis"
rename caught by #311).
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._tabs import TABS


@pytest.mark.e2e
def test_all_seven_tabs_present(page: Page):
    """Every tab from the spec is present in the nav."""
    page.goto("/")
    for tab in TABS:
        expect(page.locator(f'button.tab[data-tab="{tab.data_tab}"]')).to_be_visible()


@pytest.mark.e2e
def test_tab_count_matches_spec(page: Page):
    """Guards against drift: catches a missing or accidentally-added tab."""
    page.goto("/")
    expect(page.locator("button.tab")).to_have_count(len(TABS))


@pytest.mark.e2e
def test_clicking_each_tab_activates_only_its_panel(page: Page):
    """For each tab, clicking it makes the matching panel active and others inactive.

    Uses compound selectors (`#tab-foo.active`) rather than checking the class
    attribute string — this is what the user actually sees and is robust to
    classes being reordered or extra classes being added.
    """
    page.goto("/")

    for tab in TABS:
        page.locator(f'button.tab[data-tab="{tab.data_tab}"]').click()

        expect(page.locator(f"#{tab.panel_id}.active")).to_be_visible()

        for other in TABS:
            if other.panel_id == tab.panel_id:
                continue
            expect(page.locator(f"#{other.panel_id}.active")).to_have_count(0)
