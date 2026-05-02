"""E2E item 9: Usage tab — pace cards, chart, conversation analytics render.

`/api/usage` reads from a hardcoded `DATA_DIR / 'ccusage'` (does not respect
`CLAUDE_DATA_DIR`), so the global ccusage section renders empty-state in
E2E. The conversation-analytics section, in contrast, sources from the
seeded `CLAUDE_DATA_DIR` and should populate.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import go_to_tab


@pytest.mark.e2e
def test_usage_tab_renders_ccusage_section(page: Page):
    go_to_tab(page, "usage")

    expect(page.locator("#usage-pace")).to_be_attached()
    expect(page.locator("#usage-chart")).to_be_attached()


@pytest.mark.e2e
def test_usage_tab_renders_conversation_analytics(page: Page):
    go_to_tab(page, "usage")

    heading = page.locator("#conversation-analytics-heading")
    expect(heading).to_be_visible()
    expect(heading).to_contain_text("Conversation Analytics")

    expect(page.locator("#conversation-efficiency-cards")).not_to_be_empty(timeout=15_000)
    expect(page.locator("#conversation-token-table-container")).to_be_attached()
