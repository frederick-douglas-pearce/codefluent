"""Pytest fixtures for E2E tests.

Server fixture starts a real uvicorn subprocess pointed at a sandboxed temp
data directory (via CLAUDE_DATA_DIR env var) and yields a base URL. Tests
interact via Playwright against this server.

Design notes:
- Session-scope server (one boot per pytest session — fast)
- Dynamic port (avoids collisions with dev server / other CI jobs)
- /health polling with backoff (avoids race on startup)
- Stderr captured to a temp file; printed on test failure for debuggability
- atexit cleanup (safety net for KeyboardInterrupt or pytest crash)
"""

from __future__ import annotations

import atexit
import json
import os
import socket
import subprocess
import sys
import time
from collections import namedtuple
from pathlib import Path

import pytest
import requests

E2E_API_KEY = "sk-test-e2e-fake-key"  # noqa: S105 — fake key, never used for a real call
HEALTH_TIMEOUT_SECONDS = 15
HEALTH_POLL_INTERVAL = 0.2

ServerInfo = namedtuple("ServerInfo", ["base_url", "data_dir", "project_name"])


def _pick_free_port() -> int:
    """Bind to port 0 to let the kernel assign a free port, then close and return it.

    Race-prone in theory, but fine in practice for local/CI use — the OS will not
    immediately reuse the port for another listener within the brief window before
    uvicorn binds it.
    """
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def _seed_data_dir(root: Path) -> str:
    """Populate a temp dir with mock JSONL session data and return the project name.

    Mirrors the structure of `~/.claude/projects/` so the parser sees a real-looking
    project. The encoded project name uses `$HOME` so server-side path validation
    (which requires data dir to be within $HOME) passes.
    """
    home = str(Path.home())
    project_encoded = home.replace("/", "-") + "-e2e-test-project"
    project_short = "e2e-test-project"
    project = root / project_encoded
    project.mkdir(parents=True, exist_ok=True)

    session_id = "e2e0aaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    mock_cwd = f"{home}/e2e-test-project"

    lines = [
        {
            "type": "user",
            "sessionId": session_id,
            "version": "2.1.44",
            "gitBranch": "main",
            "cwd": mock_cwd,
            "message": {"role": "user", "content": "E2E smoke test prompt"},
            "uuid": "e2e-msg-1",
            "timestamp": "2026-04-01T10:00:00.000Z",
        },
        {
            "type": "assistant",
            "message": {
                "model": "claude-sonnet-4-6",
                "role": "assistant",
                "content": [{"type": "text", "text": "E2E smoke test response."}],
                "usage": {
                    "input_tokens": 10,
                    "output_tokens": 5,
                    "cache_creation_input_tokens": 0,
                    "cache_read_input_tokens": 0,
                },
            },
            "timestamp": "2026-04-01T10:00:02.000Z",
        },
    ]

    jsonl_file = project / f"{session_id}.jsonl"
    with jsonl_file.open("w") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")

    return project_short


@pytest.fixture(scope="session")
def e2e_server(tmp_path_factory) -> ServerInfo:
    """Start uvicorn pointed at a seeded temp data dir; yield ServerInfo.

    Session-scoped so all e2e tests share one server boot. Tests must not
    mutate server-side state in ways that affect later tests.
    """
    data_dir = tmp_path_factory.mktemp("e2e-data")
    project_name = _seed_data_dir(data_dir)
    port = _pick_free_port()
    base_url = f"http://127.0.0.1:{port}"

    stderr_log = tmp_path_factory.mktemp("e2e-logs") / "uvicorn.stderr"
    stderr_fp = stderr_log.open("wb")

    env = {
        **os.environ,
        "CLAUDE_DATA_DIR": str(data_dir),
        "ANTHROPIC_API_KEY": E2E_API_KEY,
    }

    webapp_dir = Path(__file__).resolve().parent.parent.parent  # tests/e2e -> tests -> webapp
    proc = subprocess.Popen(  # noqa: S603 — args list, not shell
        [
            sys.executable,
            "-m",
            "uvicorn",
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=str(webapp_dir),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=stderr_fp,
    )

    # atexit safety net — fires on KeyboardInterrupt, sys.exit, or normal pytest
    # teardown. Idempotent: terminate() on an already-dead process is a no-op.
    def _cleanup():
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=5)
            except subprocess.TimeoutExpired:
                proc.kill()
        stderr_fp.close()

    atexit.register(_cleanup)

    # Poll /health with backoff
    deadline = time.monotonic() + HEALTH_TIMEOUT_SECONDS
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        if proc.poll() is not None:
            stderr_fp.flush()
            stderr = stderr_log.read_text(errors="replace")
            pytest.fail(
                f"uvicorn exited before /health was ready (returncode={proc.returncode}).\n"
                f"stderr:\n{stderr}"
            )
        try:
            r = requests.get(f"{base_url}/health", timeout=1)
            if r.status_code in (200, 503):
                # 503 is "degraded" (e.g., missing API key) — server is up regardless
                break
        except requests.RequestException as e:
            last_error = e
        time.sleep(HEALTH_POLL_INTERVAL)
    else:
        stderr_fp.flush()
        stderr = stderr_log.read_text(errors="replace")
        _cleanup()
        pytest.fail(
            f"uvicorn /health did not become ready within {HEALTH_TIMEOUT_SECONDS}s "
            f"(last error: {last_error}).\nstderr:\n{stderr}"
        )

    yield ServerInfo(base_url=base_url, data_dir=data_dir, project_name=project_name)

    _cleanup()


@pytest.fixture(scope="session")
def base_url(e2e_server) -> str:
    """Override pytest-base-url's base_url so `page.goto('/')` hits our server."""
    return e2e_server.base_url


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    """Disable PR-flaky animations and use a stable viewport."""
    return {
        **browser_context_args,
        "viewport": {"width": 1280, "height": 800},
    }
