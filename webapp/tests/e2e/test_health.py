"""E2E item 10: /health returns status, version, and dependency checks.

Direct HTTP — the fixture seeds `ANTHROPIC_API_KEY`, so status is "ok".
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
    assert body["status"] == "ok"
    assert isinstance(body["version"], str) and body["version"]
    # Reject empty / typo'd version strings; allow semver, semver+suffix, or "unknown".
    assert re.match(r"^(\d+\.\d+\.\d+|unknown)", body["version"])


@pytest.mark.e2e
def test_health_reports_dependency_checks(e2e_server):
    r = requests.get(f"{e2e_server.base_url}/health", timeout=5)
    body = r.json()

    checks = body.get("checks")
    assert isinstance(checks, dict)
    assert checks["anthropic_api_key"] == "configured"
    # data_directory is host-dependent — assert only that a known state is reported.
    assert checks["data_directory"] in ("accessible", "not_found")
