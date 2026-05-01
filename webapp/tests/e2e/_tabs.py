"""Shared tab metadata for E2E tests.

Single source of truth for tab order and per-tab settings-bar visibility.
Order matches `webapp/static/index.html:43-49` (the actual nav).

Update this when the webapp's tab list changes; both `test_tab_navigation.py`
and `test_settings_bar.py` derive from it.
"""

from __future__ import annotations

from typing import NamedTuple


class Tab(NamedTuple):
    data_tab: str
    panel_id: str
    data_path_visible: bool
    project_filter_visible: bool


TABS: list[Tab] = [
    Tab("fluency", "tab-fluency", True, True),
    Tab("conversations", "tab-conversations", False, True),
    Tab("recommendations", "tab-recommendations", False, False),
    Tab("config", "tab-config", False, True),
    Tab("optimizer", "tab-optimizer", False, True),
    Tab("quickwins", "tab-quickwins", False, True),
    Tab("usage", "tab-usage", False, True),
]
