"""Tests for FastAPI API endpoints."""

import json
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

import main
from tests.conftest import make_anthropic_response, _mock_project_encoded


class TestGetBenchmarks:
    def test_returns_benchmark_data(self, client):
        resp = client.get("/api/benchmarks")
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)

    def test_contains_expected_keys(self, client):
        resp = client.get("/api/benchmarks")
        data = resp.json()
        expected_keys = [
            "iteration_and_refinement",
            "building_on_responses",
            "clarifying_goals",
        ]
        for key in expected_keys:
            assert key in data, f"Missing benchmark key: {key}"

    def test_values_are_floats(self, client):
        resp = client.get("/api/benchmarks")
        data = resp.json()
        for key, value in data.items():
            assert isinstance(value, (int, float)), f"{key} is not numeric"


class TestGetSessions:
    def test_returns_sessions_from_mock_data(self, client, mock_sessions_dir):
        resp = client.get("/api/sessions", params={"data_path": str(mock_sessions_dir)})
        assert resp.status_code == 200
        data = resp.json()
        assert "sessions" in data
        assert len(data["sessions"]) == 1
        assert data["sessions"][0]["user_prompts"][0] == "Implement a hello world function"

    def test_respects_limit_parameter(self, client, mock_sessions_dir, tmp_path):
        # Create a second session
        project = mock_sessions_dir / _mock_project_encoded()
        home = str(Path.home())
        session2 = {
            "type": "user",
            "sessionId": "11111111-2222-3333-4444-555555555555",
            "cwd": f"{home}/testproject",
            "message": {"role": "user", "content": "Second session prompt"},
            "timestamp": "2026-03-02T10:00:00.000Z",
        }
        with open(project / "11111111-2222-3333-4444-555555555555.jsonl", "w") as f:
            f.write(json.dumps(session2) + "\n")

        resp = client.get("/api/sessions", params={
            "data_path": str(mock_sessions_dir),
            "limit": 1,
        })
        assert resp.status_code == 200
        assert len(resp.json()["sessions"]) == 1

    def test_respects_project_filter(self, client, mock_sessions_dir):
        resp = client.get("/api/sessions", params={
            "data_path": str(mock_sessions_dir),
            "project": "testproject",
        })
        assert resp.status_code == 200
        sessions = resp.json()["sessions"]
        assert len(sessions) == 1
        assert sessions[0]["project"] == "testproject"

    def test_project_filter_no_match(self, client, mock_sessions_dir):
        resp = client.get("/api/sessions", params={
            "data_path": str(mock_sessions_dir),
            "project": "nonexistent",
        })
        assert resp.status_code == 200
        assert len(resp.json()["sessions"]) == 0

    def test_validates_limit_minimum(self, client):
        resp = client.get("/api/sessions", params={"limit": 0})
        assert resp.status_code == 422

    def test_validates_limit_maximum(self, client):
        resp = client.get("/api/sessions", params={"limit": 1001})
        assert resp.status_code == 422

    def test_returns_empty_when_data_path_missing(self, client, tmp_path):
        nonexistent = tmp_path / "does_not_exist"
        resp = client.get("/api/sessions", params={"data_path": str(nonexistent)})
        assert resp.status_code == 400

    def test_returns_empty_for_empty_dir(self, client, tmp_path):
        empty_dir = tmp_path / "empty"
        empty_dir.mkdir()
        resp = client.get("/api/sessions", params={"data_path": str(empty_dir)})
        assert resp.status_code == 200
        assert resp.json()["sessions"] == []

    def test_rejects_relative_data_path(self, client):
        resp = client.get("/api/sessions", params={"data_path": "relative/path"})
        assert resp.status_code == 400
        assert "absolute" in resp.json()["detail"].lower()


class TestGetScores:
    def test_returns_empty_when_no_scores(self, client):
        resp = client.get("/api/scores")
        assert resp.status_code == 200
        data = resp.json()
        assert data["scores"] == {}
        assert data["aggregate"] == {}

    def test_returns_cached_scores(self, client, tmp_path, monkeypatch):
        data_dir = tmp_path / "data"
        data_dir.mkdir(exist_ok=True)
        monkeypatch.setattr(main, "DATA_DIR", data_dir)

        scores = {
            "session-1": {
                "session_id": "session-1",
                "fluency_behaviors": {b: False for b in main.BEHAVIORS},
                "overall_score": 45,
                "coding_pattern": "conceptual_inquiry",
                "prompt_version": main.SCORING_PROMPT_VERSION,
            }
        }
        (data_dir / "scores.json").write_text(json.dumps(scores))

        # Also write last_scored_ids so scoping works
        (data_dir / "last_scored_ids.json").write_text(json.dumps(["session-1"]))

        resp = client.get("/api/scores")
        assert resp.status_code == 200
        data = resp.json()
        assert "session-1" in data["scores"]


class TestPostScore:
    def test_validates_empty_session_ids(self, client):
        resp = client.post("/api/score", json={"session_ids": []})
        assert resp.status_code == 422

    def test_validates_session_ids_must_be_list(self, client):
        resp = client.post("/api/score", json={"session_ids": "not-a-list"})
        assert resp.status_code == 422

    def test_validates_missing_session_ids(self, client):
        resp = client.post("/api/score", json={})
        assert resp.status_code == 422

    def test_rate_limiter_returns_429(self, client):
        # Fill up the rate limiter
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(main.time())

        resp = client.post("/api/score", json={"session_ids": ["s1"]})
        assert resp.status_code == 429
        assert "rate limit" in resp.json()["detail"].lower()

    def test_scores_sessions_with_mocked_api(
        self, client, mock_anthropic, mock_sessions_dir, monkeypatch
    ):
        session_id = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"

        # Mock _resolve_data_dir to point to our test sessions
        monkeypatch.setattr(
            main, "_resolve_data_dir", lambda data_path=None: mock_sessions_dir
        )

        api_response = {
            "fluency_behaviors": {b: (i % 2 == 0) for i, b in enumerate(main.BEHAVIORS)},
            "overall_score": 55,
            "coding_pattern": "conceptual_inquiry",
            "one_line_summary": "Decent session",
        }
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(api_response)
        )

        resp = client.post("/api/score", json={"session_ids": [session_id]})
        assert resp.status_code == 200
        data = resp.json()
        assert session_id in data["scores"]
        assert data["scores"][session_id]["overall_score"] == 55
        assert "aggregate" in data

    def test_uses_cached_scores(self, client, tmp_path, monkeypatch, mock_anthropic):
        data_dir = tmp_path / "data"
        data_dir.mkdir(exist_ok=True)
        monkeypatch.setattr(main, "DATA_DIR", data_dir)

        cached_score = {
            "session_id": "cached-session",
            "fluency_behaviors": {b: True for b in main.BEHAVIORS},
            "overall_score": 80,
            "coding_pattern": "conceptual_inquiry",
            "prompt_version": main.SCORING_PROMPT_VERSION,
        }
        (data_dir / "scores.json").write_text(json.dumps({"cached-session": cached_score}))

        monkeypatch.setattr(
            main, "_resolve_data_dir", lambda data_path=None: tmp_path / "empty_sessions"
        )
        (tmp_path / "empty_sessions").mkdir()

        resp = client.post("/api/score", json={"session_ids": ["cached-session"]})
        assert resp.status_code == 200
        assert resp.json()["scores"]["cached-session"]["overall_score"] == 80
        # Should NOT have called the API since score was cached
        mock_anthropic.messages.create.assert_not_called()


class TestPostOptimize:
    def test_validates_empty_prompt(self, client):
        resp = client.post("/api/optimize", json={"prompt": ""})
        assert resp.status_code == 422

    def test_validates_prompt_too_long(self, client):
        resp = client.post("/api/optimize", json={"prompt": "x" * 10001})
        assert resp.status_code == 422

    def test_validates_missing_prompt(self, client):
        resp = client.post("/api/optimize", json={})
        assert resp.status_code == 422

    def test_returns_optimized_prompt(self, client, mock_anthropic, monkeypatch):
        monkeypatch.setattr(main, "_get_or_score_config_behaviors", lambda p: {})

        # Call 1: optimizer response
        optimizer_response = {
            "input_behaviors": {b: False for b in main.BEHAVIORS},
            "input_score": 20,
            "optimized_prompt": "Improved prompt with context and examples",
            "behaviors_added": ["clarifying_goals", "providing_examples"],
            "explanation": "Added clarity and examples",
            "one_line_summary": "Basic prompt",
        }
        # Call 2: single scoring response
        single_score_response = {
            "fluency_behaviors": {
                b: (b in ["clarifying_goals", "providing_examples"])
                for b in main.BEHAVIORS
            },
            "overall_score": 45,
            "one_line_summary": "Improved prompt",
        }

        mock_anthropic.messages.create.side_effect = [
            make_anthropic_response(json.dumps(optimizer_response)),
            make_anthropic_response(json.dumps(single_score_response)),
        ]

        resp = client.post("/api/optimize", json={"prompt": "Write hello world"})
        assert resp.status_code == 200
        data = resp.json()
        assert "optimized_prompt" in data
        assert data["optimized_prompt"] == "Improved prompt with context and examples"

    def test_returns_already_good_for_high_score(self, client, mock_anthropic, monkeypatch):
        monkeypatch.setattr(main, "_get_or_score_config_behaviors", lambda p: {})

        # Optimizer returns high score
        optimizer_response = {
            "input_behaviors": {b: True for b in main.BEHAVIORS},
            "input_score": 95,
            "optimized_prompt": None,
            "behaviors_added": [],
            "explanation": "Already excellent",
            "one_line_summary": "Great prompt",
        }
        mock_anthropic.messages.create.return_value = make_anthropic_response(
            json.dumps(optimizer_response)
        )

        resp = client.post("/api/optimize", json={"prompt": "A very detailed prompt"})
        assert resp.status_code == 200
        data = resp.json()
        assert data["already_good"] is True

    def test_rate_limiter_applies(self, client):
        for _ in range(main.RATE_LIMIT):
            main._score_timestamps.append(main.time())

        resp = client.post("/api/optimize", json={"prompt": "test prompt"})
        assert resp.status_code == 429


class TestGetQuickwins:
    def test_returns_suggestions(self, client, mock_anthropic):
        suggestions = [
            {
                "repo": "myrepo",
                "task": "Add tests",
                "prompt": "Write unit tests for utils.py",
                "estimated_minutes": 15,
                "category": "testing",
                "fluency_behaviors_modeled": ["clarifying_goals"],
            }
        ]

        with patch("main.subprocess") as mock_subprocess:
            # Mock gh repo list
            mock_repo_result = MagicMock()
            mock_repo_result.returncode = 0
            mock_repo_result.stdout = json.dumps([
                {"name": "myrepo", "url": "https://github.com/testuser/myrepo", "pushedAt": "2026-03-01", "description": "A repo"}
            ])

            # Mock gh api commits
            mock_commits_result = MagicMock()
            mock_commits_result.returncode = 0
            mock_commits_result.stdout = "Initial commit"

            # Mock gh api readme
            mock_readme_result = MagicMock()
            mock_readme_result.returncode = 0
            mock_readme_result.stdout = "README.md"

            # Mock gh issue list
            mock_issues_result = MagicMock()
            mock_issues_result.returncode = 0
            mock_issues_result.stdout = "[]"

            mock_subprocess.run.side_effect = [
                mock_repo_result,      # gh repo list
                mock_commits_result,   # gh api commits
                mock_readme_result,    # gh api readme
                mock_issues_result,    # gh issue list
            ]

            mock_anthropic.messages.create.return_value = make_anthropic_response(
                json.dumps(suggestions)
            )

            resp = client.get("/api/quickwins")
            assert resp.status_code == 200
            data = resp.json()
            assert "suggestions" in data
            assert len(data["suggestions"]) == 1
            assert data["suggestions"][0]["repo"] == "myrepo"

    def test_with_project_parameter(self, client, mock_anthropic):
        suggestions = [{"repo": "myrepo", "task": "test", "prompt": "test", "estimated_minutes": 15, "category": "testing", "fluency_behaviors_modeled": []}]

        with patch("main.subprocess") as mock_subprocess:
            # Mock _detect_project_repo -> returns a repo
            mock_git_result = MagicMock()
            mock_git_result.returncode = 0
            mock_git_result.stdout = "https://github.com/testuser/myrepo.git"

            mock_repo_view = MagicMock()
            mock_repo_view.returncode = 0
            mock_repo_view.stdout = json.dumps({"name": "myrepo", "url": "https://github.com/testuser/myrepo", "pushedAt": "2026-03-01", "description": "test"})

            mock_commits = MagicMock()
            mock_commits.returncode = 0
            mock_commits.stdout = "commit msg"

            mock_readme = MagicMock()
            mock_readme.returncode = 0
            mock_readme.stdout = "README.md"

            mock_issues = MagicMock()
            mock_issues.returncode = 0
            mock_issues.stdout = "[]"

            mock_subprocess.run.side_effect = [
                mock_git_result,    # git remote get-url origin
                mock_repo_view,     # gh repo view
                mock_commits,       # gh api commits
                mock_readme,        # gh api readme
                mock_issues,        # gh issue list
            ]

            mock_anthropic.messages.create.return_value = make_anthropic_response(
                json.dumps(suggestions)
            )

            resp = client.get("/api/quickwins", params={"project": "-home-user-myrepo"})
            assert resp.status_code == 200
            data = resp.json()
            assert "suggestions" in data

    def test_returns_empty_on_error(self, client, mock_anthropic):
        with patch("main.subprocess") as mock_subprocess:
            mock_subprocess.run.side_effect = Exception("gh not found")
            mock_anthropic.messages.create.side_effect = Exception("API error")

            resp = client.get("/api/quickwins")
            assert resp.status_code == 200
            data = resp.json()
            assert data["suggestions"] == []
            assert "error" in data


class TestGetUsage:
    def test_returns_empty_when_no_data(self, client):
        resp = client.get("/api/usage")
        assert resp.status_code == 200
        assert resp.json() == {}

    def test_returns_data_when_files_exist(self, client, tmp_path, monkeypatch):
        ccusage_dir = tmp_path / "data" / "ccusage"
        ccusage_dir.mkdir(parents=True)
        monkeypatch.setattr(main, "CCUSAGE_DIR", ccusage_dir)

        daily_data = [{"date": "2026-03-01", "tokens": 1000}]
        (ccusage_dir / "daily.json").write_text(json.dumps(daily_data))

        resp = client.get("/api/usage")
        assert resp.status_code == 200
        data = resp.json()
        assert "daily" in data
        assert data["daily"][0]["tokens"] == 1000

    def test_returns_partial_data(self, client, tmp_path, monkeypatch):
        ccusage_dir = tmp_path / "data" / "ccusage"
        ccusage_dir.mkdir(parents=True)
        monkeypatch.setattr(main, "CCUSAGE_DIR", ccusage_dir)

        (ccusage_dir / "monthly.json").write_text(json.dumps([{"month": "2026-03"}]))

        resp = client.get("/api/usage")
        data = resp.json()
        assert "monthly" in data
        assert "daily" not in data
