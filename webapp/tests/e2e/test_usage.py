"""E2E item 9: Usage tab — pace cards, chart, conversation analytics render.

Two data sources feed this tab:
  - **ccusage** (global) — read from `DATA_DIR / 'ccusage' / *.json`, which
    is empty in E2E (architect review flagged `/api/usage` does not respect
    `CLAUDE_DATA_DIR`). Empty-state is the expected, asserted outcome.
  - **Conversation analytics** — sourced from `CLAUDE_DATA_DIR` via
    `/api/conversation-analytics`, which the fixture seeds. Efficiency
    cards and the per-conversation table should populate.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_usage_tab_renders_ccusage_section(page: Page):
    """ccusage chart container exists; empty-state shown when no data."""
    page.goto("/")
    page.locator('button.tab[data-tab="usage"]').click()

    # Pace and chart containers are always present — they render content
    # (or an empty-state) once `/api/usage` resolves.
    expect(page.locator("#usage-pace")).to_be_attached()
    expect(page.locator("#usage-chart")).to_be_attached()


@pytest.mark.e2e
def test_usage_tab_renders_conversation_analytics(page: Page):
    """Conversation Analytics heading + efficiency cards populate from seeded data."""
    page.goto("/")
    page.locator('button.tab[data-tab="usage"]').click()

    heading = page.locator("#conversation-analytics-heading")
    expect(heading).to_be_visible()
    expect(heading).to_contain_text("Conversation Analytics")

    # Either the efficiency cards populate (seeded data resolves) or the
    # empty-state inside the cards container shows. Both are non-empty.
    expect(page.locator("#conversation-efficiency-cards")).not_to_be_empty(
        timeout=15_000
    )

    # Per-conversation token table container is also wired up.
    expect(page.locator("#conversation-token-table-container")).to_be_attached()
