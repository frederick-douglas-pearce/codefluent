"""E2E item 10: Health endpoint returns status, version, and dependency checks.

Direct HTTP test (no browser needed) — asserts the contract documented in
`webapp/main.py:health()`. The fixture seeds an `ANTHROPIC_API_KEY`, so we
expect status "ok" rather than "degraded".
"""

from __future__ import annotations

import re

import pytest
import requests


@pytest.mark.e2e
def test_health_returns_status_and_version(e2e_server):
    r = requests.get(f"{e2e_server.base_url}/health", timeout=5)
    assert r.status_code == 200

    body = r.json()
    assert body["status"] == "ok"  # fixture sets ANTHROPIC_API_KEY
    assert isinstance(body["version"], str) and body["version"]
    # Sanity-check the version string looks like a real version. Allows
    # semver, semver+suffix, or "unknown" — but rejects empty/typo'd values.
    assert re.match(r"^(\d+\.\d+\.\d+|unknown)", body["version"])


@pytest.mark.e2e
def test_health_reports_dependency_checks(e2e_server):
    r = requests.get(f"{e2e_server.base_url}/health", timeout=5)
    body = r.json()

    checks = body.get("checks")
    assert isinstance(checks, dict)
    assert checks["anthropic_api_key"] == "configured"
    # data_directory may be "accessible" or "not_found" depending on host;
    # we only assert the key is present and reports a known state.
    assert checks["data_directory"] in ("accessible", "not_found")
