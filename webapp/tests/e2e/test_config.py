"""E2E item 6: Config tab — maturity score and breakdown render.

`/api/config-maturity` runs against the host's `~/.claude/` (the endpoint
does not respect `CLAUDE_DATA_DIR`), but `computeMaturityScore` always
emits all 9 breakdown categories regardless of the host's state, so this
test is environment-independent.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import go_to_tab

EXPECTED_CATEGORY_COUNT = 9  # CLAUDE.md, Hooks, Rules, Commands, MCP, Skills, Agents, Permissions, Enforcement


@pytest.mark.e2e
def test_config_tab_renders_maturity_score_and_breakdown(page: Page):
    go_to_tab(page, "config")

    container = page.locator("#config-maturity-content")
    expect(container).to_be_visible()

    expect(container.locator(".maturity-score-section")).to_be_visible(timeout=15_000)
    expect(container.locator(".maturity-tier")).to_be_visible()

    expect(container.locator(".maturity-checklist")).to_be_visible()
    expect(container.locator(".maturity-category")).to_have_count(EXPECTED_CATEGORY_COUNT)
