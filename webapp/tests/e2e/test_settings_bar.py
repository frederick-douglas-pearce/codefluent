"""E2E item 2: Settings bar visibility per tab.

Per CLAUDE.md E2E checklist item 2:
- `#data-path-group` (session data path input) visible ONLY on Fluency Score
- `#project-filter-group` (project dropdown) visible on every tab EXCEPT Recommendations
- Settings bar hidden entirely on Recommendations

Drives the test from the spec table to keep the contract explicit and easy to
update when tabs or visibility rules change.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

# Per-tab expected visibility: (data_tab, data_path_visible, project_filter_visible)
VISIBILITY_SPEC = [
    ("fluency", True, True),
    ("conversations", False, True),
    ("recommendations", False, False),
    ("config", False, True),
    ("optimizer", False, True),
    ("quickwins", False, True),
    ("usage", False, True),
]


@pytest.mark.e2e
@pytest.mark.parametrize(
    ("data_tab", "data_path_visible", "project_filter_visible"),
    VISIBILITY_SPEC,
    ids=[s[0] for s in VISIBILITY_SPEC],
)
def test_settings_bar_visibility_per_tab(
    page: Page,
    data_tab: str,
    data_path_visible: bool,
    project_filter_visible: bool,
):
    page.goto("/")
    page.locator(f'button.tab[data-tab="{data_tab}"]').click()

    data_path = page.locator("#data-path-group")
    project_filter = page.locator("#project-filter-group")

    if data_path_visible:
        expect(data_path).to_be_visible()
    else:
        expect(data_path).to_be_hidden()

    if project_filter_visible:
        expect(project_filter).to_be_visible()
    else:
        expect(project_filter).to_be_hidden()
