"""E2E item 9: Usage tab — pace cards, chart, conversation analytics render.

`/api/usage` aggregates daily usage from the same JSONL source as the
conversations endpoint (issue #251), so the pace cards and daily chart
now populate from the seeded `CLAUDE_DATA_DIR` test fixture alongside
the conversation analytics section.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import go_to_tab


@pytest.mark.e2e
def test_usage_tab_renders_pace_and_chart(page: Page):
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
