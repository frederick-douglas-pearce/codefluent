"""E2E item 3: Project dropdown populates from session data.

The webapp reads session data from `CLAUDE_DATA_DIR` (server-side env var) on
load. With our seeded test data, the project dropdown should populate with at
least the seeded project beyond the default "All projects" placeholder.

This test verifies the round-trip: server reads JSONL, frontend fetches
projects, dropdown renders options. Catches breakage in any link of that chain.
"""

from __future__ import annotations

import pytest
from playwright.sync_api import Page, expect


@pytest.mark.e2e
def test_project_dropdown_populates_from_seeded_data(page: Page, e2e_server):
    """The seeded project should appear as an option after the page loads."""
    page.goto("/")

    # Default tab is Fluency Score; project dropdown is shown there per the
    # settings-bar spec. The dropdown starts with one placeholder option ("All
    # projects") and gains entries as session data loads from the backend.
    project_filter = page.locator("#project-filter")
    expect(project_filter).to_be_visible()

    # Wait for the seeded project to appear. Playwright auto-waits up to the
    # default timeout for the option to materialize.
    seeded_option = project_filter.locator(
        f'option:has-text("{e2e_server.project_name}")'
    )
    expect(seeded_option).to_have_count(1)


@pytest.mark.e2e
def test_project_dropdown_has_more_than_placeholder(page: Page):
    """Dropdown has >1 option once data loads (placeholder + at least one project).

    Smoke check independent of project name — guards against the load failing
    silently and leaving only the placeholder.
    """
    page.goto("/")
    # Wait for the second option to attach (placeholder is index 0, real project is index 1+).
    expect(page.locator("#project-filter option").nth(1)).to_be_attached()
