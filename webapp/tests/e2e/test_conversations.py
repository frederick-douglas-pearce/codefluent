"""E2E item 5: Conversations tab — summary cards, charts, and conversation list render.

The fixture seeds one mock conversation under `CLAUDE_DATA_DIR`. When the user
navigates to the Conversations tab, the frontend fetches
`/api/conversation-analytics`, hydrates the explorer, and reveals the
previously-hidden summary cards / charts / table containers.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_conversations_tab_renders_summary_and_table(page: Page):
    """After tab switch, summary cards and the list table become visible."""
    page.goto("/")
    page.locator('button.tab[data-tab="conversations"]').click()

    # Loading indicator should clear once the analytics request resolves.
    expect(page.locator("#conversations-loading")).to_be_hidden(timeout=15_000)

    # With seeded data, the summary cards container is revealed and at least
    # one row appears in the conversation list.
    expect(page.locator("#conversations-summary-cards")).to_be_visible()
    expect(page.locator("#conversations-summary-cards .pace-card").first).to_be_visible()

    expect(page.locator("#conversations-table-container")).to_be_visible()
    expect(page.locator("#conversations-list-tbody tr").first).to_be_visible()


@pytest.mark.e2e
def test_conversations_charts_row_renders(page: Page):
    """Charts row is revealed and the task-type doughnut canvas exists."""
    page.goto("/")
    page.locator('button.tab[data-tab="conversations"]').click()

    expect(page.locator("#conversations-loading")).to_be_hidden(timeout=15_000)
    expect(page.locator("#conversations-charts-row")).to_be_visible()

    # Each chart canvas referenced by the spec must exist (item 5: task-type
    # pie chart, conversations-per-week, length/duration/gap distributions).
    for canvas_id in (
        "conv-task-type-chart",
        "conv-per-week-chart",
        "conv-length-chart",
        "conv-duration-chart",
        "conv-avg-length-chart",
        "conv-gap-chart",
    ):
        expect(page.locator(f"#{canvas_id}")).to_be_attached()
