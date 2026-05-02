"""E2E item 5: Conversations tab — summary cards, charts, and conversation list render."""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect

from ._helpers import go_to_tab


CHART_CANVAS_IDS = (
    "conv-task-type-chart",
    "conv-per-week-chart",
    "conv-length-chart",
    "conv-duration-chart",
    "conv-avg-length-chart",
    "conv-gap-chart",
)


@pytest.mark.e2e
def test_conversations_tab_hydrates_from_seeded_data(page: Page):
    """After tab switch, summary cards / charts row / list table all populate.

    The fixture seeds one conversation; the conversations explorer should
    reveal every previously-hidden container and emit at least one row.
    """
    go_to_tab(page, "conversations")

    expect(page.locator("#conversations-loading")).to_be_hidden(timeout=15_000)

    expect(page.locator("#conversations-summary-cards")).to_be_visible()
    expect(page.locator("#conversations-summary-cards .pace-card")).to_have_count(4)

    expect(page.locator("#conversations-table-container")).to_be_visible()
    expect(page.locator("#conversations-list-tbody tr")).not_to_have_count(0)

    expect(page.locator("#conversations-charts-row")).to_be_visible()
    for canvas_id in CHART_CANVAS_IDS:
        expect(page.locator(f"#{canvas_id}")).to_be_attached()
