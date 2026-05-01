"""E2E item 1: Tab navigation — all 7 tabs switch correctly, correct panel is visible.

Asserts that clicking each `button.tab` activates the matching `#tab-{name}` panel
and deactivates all others. Uses element IDs and `data-tab` attributes as primary
selectors (stable; immune to button-label drift like the "Run Scoring" -> "Run Analysis"
rename caught by #311).
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

# (data-tab attribute on button, panel id) — order matches webapp/static/index.html nav
TAB_ORDER = [
    ("fluency", "tab-fluency"),
    ("conversations", "tab-conversations"),
    ("recommendations", "tab-recommendations"),
    ("config", "tab-config"),
    ("optimizer", "tab-optimizer"),
    ("quickwins", "tab-quickwins"),
    ("usage", "tab-usage"),
]


@pytest.mark.e2e
def test_all_seven_tabs_present(page: Page):
    """Every tab from the spec is present in the nav."""
    page.goto("/")
    for data_tab, _panel_id in TAB_ORDER:
        expect(page.locator(f'button.tab[data-tab="{data_tab}"]')).to_be_visible()


@pytest.mark.e2e
def test_tab_count_is_seven(page: Page):
    """Guards against drift: catches a missing or accidentally-added tab."""
    page.goto("/")
    expect(page.locator("button.tab")).to_have_count(len(TAB_ORDER))


@pytest.mark.e2e
def test_clicking_each_tab_activates_only_its_panel(page: Page):
    """For each tab, clicking it makes the matching panel active and others inactive.

    Uses compound selectors (`#tab-foo.active`) rather than checking the class
    attribute string — this is what the user actually sees and is robust to
    classes being reordered or extra classes being added.
    """
    page.goto("/")

    for data_tab, panel_id in TAB_ORDER:
        page.locator(f'button.tab[data-tab="{data_tab}"]').click()

        # Active panel for this tab is visible; all other panels are not.
        # `tab-panel.active` is the class combo the app uses to show a panel
        # (panels without `.active` are hidden via CSS, so are non-visible).
        expect(page.locator(f"#{panel_id}.active")).to_be_visible()

        for _other_tab, other_panel_id in TAB_ORDER:
            if other_panel_id == panel_id:
                continue
            expect(page.locator(f"#{other_panel_id}.active")).to_have_count(0)
