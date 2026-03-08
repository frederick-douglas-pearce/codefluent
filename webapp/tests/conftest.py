"""Shared fixtures for webapp tests."""

import json
import sys
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add webapp/ to sys.path so `from extract_prompts import ...` works at import time
WEBAPP_DIR = Path(__file__).resolve().parent.parent
if str(WEBAPP_DIR) not in sys.path:
    sys.path.insert(0, str(WEBAPP_DIR))

# Patch the Anthropic client before importing main (it instantiates at module level)
_mock_anthropic_cls = MagicMock()
_mock_client = MagicMock()
_mock_anthropic_cls.return_value = _mock_client

with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test-key"}):
    with patch("anthropic.Anthropic", _mock_anthropic_cls):
        import main  # noqa: E402


from starlette.testclient import TestClient


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """TestClient with DATA_DIR pointed at a temp directory."""
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(main, "DATA_DIR", data_dir)
    monkeypatch.setattr(main, "CCUSAGE_DIR", data_dir / "ccusage")

    # Clear rate limiter between tests
    main._score_timestamps.clear()

    return TestClient(main.app)


@pytest.fixture()
def mock_anthropic(monkeypatch):
    """Patch main.client with a fresh MagicMock and return it."""
    mock = MagicMock()
    monkeypatch.setattr(main, "client", mock)
    return mock


def _mock_project_encoded() -> str:
    """Return an encoded project path within the user's home directory for tests."""
    home = str(Path.home())  # e.g., /home/fdpearce
    return home.replace("/", "-") + "-testproject"  # e.g., -home-fdpearce-testproject


@pytest.fixture()
def mock_sessions_dir(tmp_path):
    """Create a temp directory with mock JSONL session files."""
    projects_dir = tmp_path / "projects"
    project_encoded = _mock_project_encoded()
    project = projects_dir / project_encoded
    project.mkdir(parents=True)

    home = str(Path.home())
    mock_cwd = f"{home}/testproject"

    session_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    lines = [
        {
            "type": "user",
            "sessionId": session_id,
            "version": "2.1.44",
            "cwd": mock_cwd,
            "message": {"role": "user", "content": "Implement a hello world function"},
            "uuid": "msg-1",
            "timestamp": "2026-03-01T10:00:00.000Z",
        },
        {
            "type": "assistant",
            "message": {
                "model": "claude-sonnet-4-20250514",
                "role": "assistant",
                "content": [{"type": "text", "text": "Here is the implementation..."}],
                "usage": {"input_tokens": 100, "output_tokens": 50},
            },
            "timestamp": "2026-03-01T10:00:05.000Z",
        },
        {
            "type": "user",
            "sessionId": session_id,
            "cwd": mock_cwd,
            "message": {"role": "user", "content": "Add error handling to the function"},
            "uuid": "msg-2",
            "timestamp": "2026-03-01T10:01:00.000Z",
        },
    ]

    jsonl_file = project / f"{session_id}.jsonl"
    with open(jsonl_file, "w") as f:
        for line in lines:
            f.write(json.dumps(line) + "\n")

    return projects_dir


def make_anthropic_response(text: str) -> MagicMock:
    """Create a mock Anthropic API response with the given text content."""
    response = MagicMock()
    block = MagicMock()
    block.type = "text"
    block.text = text
    response.content = [block]
    return response
