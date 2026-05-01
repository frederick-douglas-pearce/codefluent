"""E2E item 2: Settings bar visibility per tab.

Per CLAUDE.md E2E checklist item 2:
- `#data-path-group` (session data path input) visible ONLY on Fluency Score
- `#project-filter-group` (project dropdown) visible on every tab EXCEPT Recommendations
- Settings bar hidden entirely on Recommendations

Visibility rules live in `_tabs.TABS`; this test consumes them.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._tabs import TABS


@pytest.mark.e2e
@pytest.mark.parametrize("tab", TABS, ids=[t.data_tab for t in TABS])
def test_settings_bar_visibility_per_tab(page: Page, tab):
    page.goto("/")
    page.locator(f'button.tab[data-tab="{tab.data_tab}"]').click()

    data_path = page.locator("#data-path-group")
    project_filter = page.locator("#project-filter-group")

    if tab.data_path_visible:
        expect(data_path).to_be_visible()
    else:
        expect(data_path).to_be_hidden()

    if tab.project_filter_visible:
        expect(project_filter).to_be_visible()
    else:
        expect(project_filter).to_be_hidden()
