"""Tests for the eval runner (shared/eval/)."""

import json
import sys
from io import StringIO
from pathlib import Path
from unittest.mock import MagicMock, patch

import pytest

# Add shared/ to path so we can import eval modules
SHARED_DIR = Path(__file__).parent.parent.parent / "shared"
sys.path.insert(0, str(SHARED_DIR.parent))

from shared.eval.scorer import (
    BEHAVIORS,
    build_filled_prompt,
    fill_template,
    load_pricing,
    load_prompt,
)
from shared.eval.checks import (
    check_agreement,
    check_drift,
    check_regression,
    check_schema,
)
from shared.eval.report import compute_cost, print_summary, save_results
from shared.eval.run_eval import parse_args


# ─── Fixtures ─────────────────────────────────────────────────────────────────

GOLDEN_SET_PATH = SHARED_DIR / "eval" / "golden_set.json"


@pytest.fixture()
def golden_set():
    with open(GOLDEN_SET_PATH) as f:
        return json.load(f)


def _make_behaviors(overrides=None):
    """Create a full behaviors dict, all False unless overridden."""
    fb = {b: False for b in BEHAVIORS}
    if overrides:
        fb.update(overrides)
    return fb


def _make_result(entry_id, section, actual_fb, expected_fb=None, **kwargs):
    """Create a result dict mimicking run_golden_set output."""
    if section == "optimizer":
        actual = {"input_behaviors": actual_fb, "input_score": 9, "one_line_summary": "test"}
        expected = {"input_behaviors": expected_fb or actual_fb, "input_score": 9}
    elif section == "config_scoring":
        actual = {"fluency_behaviors": actual_fb, "one_line_summary": "test"}
        expected = {"fluency_behaviors": expected_fb or actual_fb}
    elif section == "session_scoring":
        actual = {
            "fluency_behaviors": actual_fb, "overall_score": 50,
            "coding_pattern": "ai_delegation", "one_line_summary": "test",
        }
        expected = {"fluency_behaviors": expected_fb or actual_fb}
    else:  # single_scoring
        actual = {"fluency_behaviors": actual_fb, "overall_score": 50, "one_line_summary": "test"}
        expected = {"fluency_behaviors": expected_fb or actual_fb}

    return {
        "id": entry_id,
        "section": section,
        "prompt_version": "test-v1.0",
        "expected": expected,
        "actual": actual,
        "parse_error": None,
        "input_tokens": kwargs.get("input_tokens", 500),
        "output_tokens": kwargs.get("output_tokens", 100),
        **{k: v for k, v in kwargs.items() if k not in ("input_tokens", "output_tokens")},
    }


# ─── scorer.py tests ─────────────────────────────────────────────────────────


class TestLoadPrompt:
    def test_load_from_registry(self):
        result = load_prompt("single_scoring")
        assert "version" in result
        assert "template" in result
        assert "{{PROMPT}}" in result["template"]

    def test_load_all_prompt_types(self):
        for prompt_type in ["scoring", "config", "optimizer", "single_scoring"]:
            result = load_prompt(prompt_type)
            assert result["version"]
            assert len(result["template"]) > 100

    def test_version_override(self):
        result = load_prompt("ignored", version_override="single_scoring/v1.0.md")
        assert result["version"] == "single_scoring/v1.0.md"
        assert "{{PROMPT}}" in result["template"]

    def test_missing_prompt_type(self):
        with pytest.raises(KeyError, match="Unknown prompt type"):
            load_prompt("nonexistent")

    def test_missing_version_override_file(self):
        with pytest.raises(FileNotFoundError):
            load_prompt("ignored", version_override="scoring/v99.0.md")


class TestFillTemplate:
    def test_basic_replacement(self):
        result = fill_template("Hello {{NAME}}!", {"NAME": "World"})
        assert result == "Hello World!"

    def test_multiple_replacements(self):
        template = "{{A}} and {{B}}"
        result = fill_template(template, {"A": "foo", "B": "bar"})
        assert result == "foo and bar"

    def test_missing_placeholder_passthrough(self):
        result = fill_template("Hello {{NAME}} {{MISSING}}", {"NAME": "World"})
        assert result == "Hello World {{MISSING}}"

    def test_empty_variables(self):
        result = fill_template("Hello {{NAME}}", {})
        assert result == "Hello {{NAME}}"

    def test_non_string_value_converted(self):
        result = fill_template("Count: {{N}}", {"N": 42})
        assert result == "Count: 42"


class TestBuildFilledPrompt:
    def test_single_scoring(self):
        entry = {"prompt": "test prompt"}
        result = build_filled_prompt(entry, "single_scoring", "Score: {{PROMPT}}")
        assert result == "Score: test prompt"

    def test_session_scoring(self):
        entry = {
            "prompts": ["p1", "p2"],
            "metadata": {"used_plan_mode": True, "thinking_count": 5, "tools_used": ["Read", "Write"]},
        }
        template = "Plan: {{USED_PLAN_MODE}} Think: {{THINKING_COUNT}} Tools: {{TOOLS_USED}} {{PROMPTS}}"
        result = build_filled_prompt(entry, "session_scoring", template)
        assert "Plan: True" in result
        assert "Think: 5" in result
        assert "Tools: Read, Write" in result
        assert '<user_prompt index="1">p1</user_prompt>' in result
        assert '<user_prompt index="2">p2</user_prompt>' in result

    def test_session_scoring_defaults(self):
        entry = {"prompts": ["p1"], "metadata": {}}
        template = "{{USED_PLAN_MODE}} {{THINKING_COUNT}} {{TOOLS_USED}}"
        result = build_filled_prompt(entry, "session_scoring", template)
        assert "False" in result
        assert "none" in result

    def test_config_scoring(self):
        entry = {"content": "# My Config"}
        result = build_filled_prompt(entry, "config_scoring", "Config: {{CONTENT}}")
        assert result == "Config: # My Config"

    def test_optimizer(self):
        entry = {"prompt": "test", "max_length": 3000, "config_behaviors": ""}
        template = "{{PROMPT}} max={{MAX_LENGTH}} config={{CONFIG_BEHAVIORS}}"
        result = build_filled_prompt(entry, "optimizer", template)
        assert "test" in result
        assert "max=3000" in result

    def test_unknown_section(self):
        with pytest.raises(ValueError, match="Unknown section"):
            build_filled_prompt({}, "unknown", "")


class TestLoadPricing:
    def test_loads_pricing_json(self):
        pricing = load_pricing()
        assert "models" in pricing
        assert "claude-sonnet-4-20250514" in pricing["models"]

    def test_pricing_has_rates(self):
        pricing = load_pricing()
        model = pricing["models"]["claude-sonnet-4-20250514"]
        rates = model[-1]
        assert "input" in rates
        assert "output" in rates
        assert rates["input"] > 0
        assert rates["output"] > 0


# ─── Golden set structure tests ──────────────────────────────────────────────


class TestGoldenSetFilledPrompts:
    """Verify real golden set entries produce correctly structured filled prompts."""

    def test_single_scoring_entries(self, golden_set):
        template = load_prompt("single_scoring")["template"]
        for entry in golden_set["single_scoring"]:
            result = build_filled_prompt(entry, "single_scoring", template)
            assert "{{PROMPT}}" not in result, f"Unfilled placeholder in {entry['id']}"
            assert entry["prompt"] in result

    def test_session_scoring_entries(self, golden_set):
        template = load_prompt("scoring")["template"]
        for entry in golden_set["session_scoring"]:
            result = build_filled_prompt(entry, "session_scoring", template)
            assert "{{PROMPTS}}" not in result, f"Unfilled PROMPTS in {entry['id']}"
            assert "{{USED_PLAN_MODE}}" not in result
            assert "{{THINKING_COUNT}}" not in result
            assert "{{TOOLS_USED}}" not in result

    def test_config_scoring_entries(self, golden_set):
        template = load_prompt("config")["template"]
        for entry in golden_set["config_scoring"]:
            result = build_filled_prompt(entry, "config_scoring", template)
            assert "{{CONTENT}}" not in result, f"Unfilled CONTENT in {entry['id']}"

    def test_optimizer_entries(self, golden_set):
        template = load_prompt("optimizer")["template"]
        for entry in golden_set["optimizer"]:
            result = build_filled_prompt(entry, "optimizer", template)
            assert "{{PROMPT}}" not in result, f"Unfilled PROMPT in {entry['id']}"
            assert "{{MAX_LENGTH}}" not in result
            assert "{{CONFIG_BEHAVIORS}}" not in result


# ─── checks.py tests ─────────────────────────────────────────────────────────


class TestCheckSchema:
    def test_valid_single_scoring(self):
        results = [_make_result("s1", "single_scoring", _make_behaviors())]
        check = check_schema(results)
        assert check["passed"] == 1
        assert check["failed"] == 0

    def test_valid_session_scoring(self):
        results = [_make_result("s1", "session_scoring", _make_behaviors())]
        check = check_schema(results)
        assert check["passed"] == 1

    def test_valid_config_scoring(self):
        results = [_make_result("c1", "config_scoring", _make_behaviors())]
        check = check_schema(results)
        assert check["passed"] == 1

    def test_valid_optimizer(self):
        results = [_make_result("o1", "optimizer", _make_behaviors())]
        check = check_schema(results)
        assert check["passed"] == 1

    def test_parse_error_fails(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        result["parse_error"] = "Unexpected token"
        check = check_schema([result])
        assert check["failed"] == 1
        assert "parse error" in check["failures"][0]["errors"][0].lower()

    def test_missing_behaviors_key(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        result["actual"] = {"overall_score": 50, "one_line_summary": "test"}
        check = check_schema([result])
        assert check["failed"] == 1

    def test_non_bool_behavior(self):
        fb = _make_behaviors()
        fb["clarifying_goals"] = "yes"
        result = _make_result("s1", "single_scoring", fb)
        check = check_schema([result])
        assert check["failed"] == 1
        assert any("not bool" in e for e in check["failures"][0]["errors"])

    def test_missing_behavior_key(self):
        fb = _make_behaviors()
        del fb["clarifying_goals"]
        result = _make_result("s1", "single_scoring", fb)
        check = check_schema([result])
        assert check["failed"] == 1

    def test_missing_overall_score_single(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        del result["actual"]["overall_score"]
        check = check_schema([result])
        assert check["failed"] == 1

    def test_missing_coding_pattern_session(self):
        result = _make_result("s1", "session_scoring", _make_behaviors())
        del result["actual"]["coding_pattern"]
        check = check_schema([result])
        assert check["failed"] == 1

    def test_null_actual_fails(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        result["actual"] = None
        check = check_schema([result])
        assert check["failed"] == 1

    def test_multiple_results_mixed(self):
        good = _make_result("s1", "single_scoring", _make_behaviors())
        bad = _make_result("s2", "single_scoring", _make_behaviors())
        bad["parse_error"] = "error"
        check = check_schema([good, bad])
        assert check["passed"] == 1
        assert check["failed"] == 1
        assert check["total"] == 2


class TestCheckAgreement:
    def test_perfect_agreement(self):
        fb = _make_behaviors({"clarifying_goals": True})
        results = [_make_result("s1", "single_scoring", fb, fb)]
        check = check_agreement(results)
        assert check["overall_agreement"] == 1.0
        assert len(check["below_threshold"]) == 0

    def test_zero_agreement(self):
        actual_fb = _make_behaviors({b: True for b in BEHAVIORS})
        expected_fb = _make_behaviors()
        results = [_make_result("s1", "single_scoring", actual_fb, expected_fb)]
        check = check_agreement(results)
        assert check["overall_agreement"] == 0.0

    def test_partial_agreement(self):
        actual_fb = _make_behaviors({"clarifying_goals": True})
        expected_fb = _make_behaviors()  # all False
        results = [_make_result("s1", "single_scoring", actual_fb, expected_fb)]
        check = check_agreement(results)
        # 10/11 match (only clarifying_goals differs)
        assert abs(check["overall_agreement"] - 10 / 11) < 0.01

    def test_threshold_flagging(self):
        # Create results where one behavior always disagrees
        actual_fb = _make_behaviors({"clarifying_goals": True})
        expected_fb = _make_behaviors()
        results = [_make_result(f"s{i}", "single_scoring", actual_fb, expected_fb) for i in range(5)]
        check = check_agreement(results, threshold=0.95)
        assert any(b["behavior"] == "clarifying_goals" for b in check["below_threshold"])

    def test_by_section_breakdown(self):
        fb = _make_behaviors()
        results = [
            _make_result("s1", "single_scoring", fb, fb),
            _make_result("c1", "config_scoring", fb, fb),
        ]
        check = check_agreement(results)
        assert "single_scoring" in check["by_section"]
        assert "config_scoring" in check["by_section"]

    def test_optimizer_uses_input_behaviors(self):
        fb = _make_behaviors({"clarifying_goals": True})
        results = [_make_result("o1", "optimizer", fb, fb)]
        check = check_agreement(results)
        assert check["overall_agreement"] == 1.0

    def test_skips_failed_results(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        result["actual"] = None
        check = check_agreement([result])
        assert check["overall_agreement"] == 0.0

    def test_skips_parse_error_results(self):
        result = _make_result("s1", "single_scoring", _make_behaviors())
        result["parse_error"] = "error"
        check = check_agreement([result])
        assert check["overall_agreement"] == 0.0


class TestCheckDrift:
    def test_no_drift(self, tmp_path):
        fb = _make_behaviors({"clarifying_goals": True})
        results = [_make_result("s1", "single_scoring", fb)]

        baseline_path = tmp_path / "baseline.json"
        baseline_path.write_text(json.dumps({"results": [_make_result("s1", "single_scoring", fb)]}))

        check = check_drift(results, str(baseline_path))
        assert len(check["drifted"]) == 0

    def test_large_drift_flagged(self, tmp_path):
        # Current: clarifying_goals always True
        current_fb = _make_behaviors({"clarifying_goals": True})
        current_results = [_make_result(f"s{i}", "single_scoring", current_fb) for i in range(5)]

        # Baseline: clarifying_goals always False
        baseline_fb = _make_behaviors()
        baseline_results = [_make_result(f"s{i}", "single_scoring", baseline_fb) for i in range(5)]

        baseline_path = tmp_path / "baseline.json"
        baseline_path.write_text(json.dumps({"results": baseline_results}))

        check = check_drift(current_results, str(baseline_path))
        assert len(check["drifted"]) > 0
        assert any(d["behavior"] == "clarifying_goals" for d in check["drifted"])

    def test_small_drift_not_flagged(self, tmp_path):
        # 10% diff (below 15pp threshold)
        current_results = []
        baseline_results = []
        for i in range(10):
            fb_current = _make_behaviors({"clarifying_goals": i < 6})
            fb_baseline = _make_behaviors({"clarifying_goals": i < 5})
            current_results.append(_make_result(f"s{i}", "single_scoring", fb_current))
            baseline_results.append(_make_result(f"s{i}", "single_scoring", fb_baseline))

        baseline_path = tmp_path / "baseline.json"
        baseline_path.write_text(json.dumps({"results": baseline_results}))

        check = check_drift(current_results, str(baseline_path))
        clarifying = check["per_behavior"]["clarifying_goals"]
        assert abs(clarifying["diff"]) <= 0.15


class TestCheckRegression:
    def test_no_changes(self):
        golden = {
            "single_scoring": [{"id": "s1", "prompt": "test prompt"}],
        }
        fb = _make_behaviors()
        api_result = {
            "result": {"fluency_behaviors": fb, "overall_score": 0, "one_line_summary": "t"},
            "input_tokens": 100, "output_tokens": 50,
            "parse_error": None, "raw_text": "{}",
        }
        mock_client = MagicMock()
        with patch("shared.eval.checks.call_with_retry", return_value=api_result):
            with patch("shared.eval.checks.load_prompt") as mock_load:
                mock_load.return_value = {"version": "v1.0", "template": "{{PROMPT}}"}
                check = check_regression(
                    mock_client, golden, "scoring/v1.0.md", "scoring/v1.1.md",
                    "single_scoring", delay=0,
                )
        assert check["entries_changed"] == 0
        assert check["total_entries"] == 1

    def test_behavior_change_detected(self):
        golden = {
            "single_scoring": [{"id": "s1", "prompt": "test prompt"}],
        }
        fb_old = _make_behaviors()
        fb_new = _make_behaviors({"clarifying_goals": True})

        call_count = {"n": 0}

        def mock_call(*args, **kwargs):
            call_count["n"] += 1
            fb = fb_old if call_count["n"] % 2 == 1 else fb_new
            return {
                "result": {"fluency_behaviors": fb, "overall_score": 0, "one_line_summary": "t"},
                "input_tokens": 100, "output_tokens": 50,
                "parse_error": None, "raw_text": "{}",
            }

        mock_client = MagicMock()
        with patch("shared.eval.checks.call_with_retry", side_effect=mock_call):
            with patch("shared.eval.checks.load_prompt") as mock_load:
                mock_load.return_value = {"version": "v1.0", "template": "{{PROMPT}}"}
                check = check_regression(
                    mock_client, golden, "scoring/v1.0.md", "scoring/v1.1.md",
                    "single_scoring", delay=0,
                )
        assert check["entries_changed"] == 1
        assert check["behavior_changes"]["clarifying_goals"]["gained"] == 1

    def test_empty_section(self):
        golden = {"single_scoring": []}
        mock_client = MagicMock()
        check = check_regression(
            mock_client, golden, "old.md", "new.md", "single_scoring", delay=0,
        )
        assert check["total_entries"] == 0


# ─── report.py tests ─────────────────────────────────────────────────────────


class TestComputeCost:
    def test_basic_cost(self):
        results = [
            {"input_tokens": 1000, "output_tokens": 200},
            {"input_tokens": 500, "output_tokens": 100},
        ]
        pricing = load_pricing()
        cost = compute_cost(results, pricing)
        assert cost["total_input_tokens"] == 1500
        assert cost["total_output_tokens"] == 300
        assert cost["estimated_cost_usd"] is not None
        assert cost["estimated_cost_usd"] > 0

    def test_zero_tokens(self):
        cost = compute_cost([], load_pricing())
        assert cost["total_input_tokens"] == 0
        assert cost["total_output_tokens"] == 0

    def test_unknown_model(self):
        results = [{"input_tokens": 100, "output_tokens": 50}]
        pricing = {"models": {}, "aliases": {}}
        cost = compute_cost(results, pricing)
        assert cost["estimated_cost_usd"] is None


class TestSaveResults:
    def test_saves_valid_json(self, tmp_path):
        results = [_make_result("s1", "single_scoring", _make_behaviors())]
        checks = {"schema": {"total": 1, "passed": 1, "failed": 0, "failures": []}}
        metadata = {"check": "all"}

        filepath = save_results(results, checks, metadata, str(tmp_path))
        assert filepath.exists()

        with open(filepath) as f:
            data = json.load(f)
        assert "metadata" in data
        assert "results" in data
        assert "checks" in data
        assert data["checks"]["schema"]["passed"] == 1

    def test_creates_output_dir(self, tmp_path):
        output_dir = tmp_path / "new" / "dir"
        results = [_make_result("s1", "single_scoring", _make_behaviors())]
        filepath = save_results(results, {}, {}, str(output_dir))
        assert filepath.exists()

    def test_filename_format(self, tmp_path):
        filepath = save_results([], {"schema": {}, "agreement": {}}, {}, str(tmp_path))
        assert "agreement_schema" in filepath.name  # sorted check names
        assert filepath.suffix == ".json"


class TestPrintSummary:
    def test_schema_pass(self, capsys):
        print_summary("schema", {"total": 5, "passed": 5, "failed": 0, "failures": []})
        out = capsys.readouterr().out
        assert "PASS" in out
        assert "5/5" in out

    def test_schema_fail(self, capsys):
        print_summary("schema", {
            "total": 5, "passed": 4, "failed": 1,
            "failures": [{"id": "s1", "section": "single_scoring", "errors": ["missing key"]}],
        })
        out = capsys.readouterr().out
        assert "FAIL" in out
        assert "s1" in out

    def test_agreement_pass(self, capsys):
        print_summary("agreement", {
            "overall_agreement": 0.92, "threshold": 0.85,
            "per_behavior": {}, "below_threshold": [], "by_section": {},
        })
        out = capsys.readouterr().out
        assert "PASS" in out
        assert "92" in out

    def test_agreement_fail(self, capsys):
        print_summary("agreement", {
            "overall_agreement": 0.75, "threshold": 0.85,
            "per_behavior": {},
            "below_threshold": [{"behavior": "clarifying_goals", "agreement": 0.5}],
            "by_section": {"single_scoring": 0.75},
        })
        out = capsys.readouterr().out
        assert "FAIL" in out
        assert "clarifying_goals" in out

    def test_drift_pass(self, capsys):
        print_summary("drift", {"per_behavior": {}, "drifted": []})
        out = capsys.readouterr().out
        assert "PASS" in out

    def test_drift_warn(self, capsys):
        print_summary("drift", {
            "per_behavior": {},
            "drifted": [{"behavior": "clarifying_goals", "diff": 0.20}],
        })
        out = capsys.readouterr().out
        assert "WARN" in out

    def test_consistency(self, capsys):
        print_summary("consistency", {
            "entries_tested": 10, "runs_per_entry": 3,
            "self_agreement": 0.95, "per_behavior_stability": {},
            "flaky_entries": [],
        })
        out = capsys.readouterr().out
        assert "95" in out

    def test_regression(self, capsys):
        print_summary("regression", {
            "entries_changed": 2, "total_entries": 10,
            "behavior_changes": {},
            "details": [{"id": "s1", "changes": {"clarifying_goals": {"old": False, "new": True}}}],
        })
        out = capsys.readouterr().out
        assert "2/10" in out
        assert "clarifying_goals" in out


# ─── run_eval.py tests ───────────────────────────────────────────────────────


class TestParseArgs:
    def test_defaults(self):
        args = parse_args([])
        assert args.check == "all"
        assert args.threshold == 0.85
        assert args.delay == 0.5
        assert args.runs == 3
        assert args.subset == 10
        assert args.dry_run is False
        assert args.verbose is False

    def test_check_flag(self):
        args = parse_args(["--check", "agreement"])
        assert args.check == "agreement"

    def test_threshold(self):
        args = parse_args(["--threshold", "0.9"])
        assert args.threshold == 0.9

    def test_sections(self):
        args = parse_args(["--sections", "single_scoring,config_scoring"])
        assert args.sections == "single_scoring,config_scoring"

    def test_dry_run(self):
        args = parse_args(["--dry-run"])
        assert args.dry_run is True

    def test_verbose(self):
        args = parse_args(["--verbose"])
        assert args.verbose is True

    def test_consistency_args(self):
        args = parse_args(["--runs", "5", "--subset", "20"])
        assert args.runs == 5
        assert args.subset == 20

    def test_drift_args(self):
        args = parse_args(["--check", "drift", "--baseline", "path/to/baseline.json"])
        assert args.check == "drift"
        assert args.baseline == "path/to/baseline.json"

    def test_regression_args(self):
        args = parse_args([
            "--check", "regression",
            "--old-version", "scoring/v1.0.md",
            "--new-version", "scoring/v1.1.md",
            "--regression-section", "single_scoring",
        ])
        assert args.old_version == "scoring/v1.0.md"
        assert args.new_version == "scoring/v1.1.md"
        assert args.regression_section == "single_scoring"

    def test_output_dir(self):
        args = parse_args(["--output", "/tmp/results"])
        assert args.output == "/tmp/results"


class TestDryRun:
    def test_dry_run_prints_plan(self, capsys, golden_set):
        """Dry run should print plan without making API calls."""
        with patch("shared.eval.run_eval.GOLDEN_SET_PATH", GOLDEN_SET_PATH):
            from shared.eval.run_eval import main
            main(["--dry-run"])
        out = capsys.readouterr().out
        assert "DRY RUN" in out
        assert "schema" in out.lower()
        assert "agreement" in out.lower()

    def test_dry_run_with_sections(self, capsys):
        with patch("shared.eval.run_eval.GOLDEN_SET_PATH", GOLDEN_SET_PATH):
            from shared.eval.run_eval import main
            main(["--dry-run", "--sections", "single_scoring"])
        out = capsys.readouterr().out
        assert "single_scoring" in out

    def test_dry_run_consistency(self, capsys):
        with patch("shared.eval.run_eval.GOLDEN_SET_PATH", GOLDEN_SET_PATH):
            from shared.eval.run_eval import main
            main(["--dry-run", "--check", "consistency"])
        out = capsys.readouterr().out
        assert "3 runs" in out


class TestSectionsFiltering:
    def test_unknown_section_raises(self):
        from shared.eval.scorer import run_golden_set
        with pytest.raises(ValueError, match="Unknown section"):
            run_golden_set(MagicMock(), {}, sections=["unknown_section"])


class TestCheckRouting:
    def test_missing_baseline_exits(self, capsys):
        with patch("shared.eval.run_eval.GOLDEN_SET_PATH", GOLDEN_SET_PATH):
            from shared.eval.run_eval import main
            with pytest.raises(SystemExit):
                main(["--check", "drift"])

    def test_missing_regression_args_exits(self, capsys):
        with patch("shared.eval.run_eval.GOLDEN_SET_PATH", GOLDEN_SET_PATH):
            from shared.eval.run_eval import main
            with pytest.raises(SystemExit):
                main(["--check", "regression"])


# ─── Mock-based integration test ──────────────────────────────────────────────


class TestFullPipelineMocked:
    def test_end_to_end_schema_agreement(self, tmp_path, golden_set):
        """Full pipeline: load golden set → fill templates → mock API → checks → save."""
        from shared.eval.scorer import build_filled_prompt, load_prompt

        # Build mock API responses that match expected
        mock_responses = {}
        for section in ["single_scoring", "session_scoring", "config_scoring", "optimizer"]:
            prompt_type_map = {
                "single_scoring": "single_scoring",
                "session_scoring": "scoring",
                "config_scoring": "config",
                "optimizer": "optimizer",
            }
            template = load_prompt(prompt_type_map[section])["template"]
            for entry in golden_set.get(section, []):
                # Verify template fills without error
                filled = build_filled_prompt(entry, section, template)
                assert len(filled) > 50, f"Template too short for {entry['id']}"

                # Build expected response
                expected = entry["expected"]
                if section == "optimizer":
                    response = {
                        "input_behaviors": expected.get("input_behaviors", _make_behaviors()),
                        "input_score": expected.get("input_score", 0),
                        "one_line_summary": "test",
                    }
                    if expected.get("should_optimize", True):
                        response["optimized_prompt"] = "optimized"
                        response["behaviors_added"] = []
                        response["explanation"] = "test"
                elif section == "session_scoring":
                    response = {
                        "fluency_behaviors": expected.get("fluency_behaviors", _make_behaviors()),
                        "overall_score": 50,
                        "coding_pattern": expected.get("coding_pattern", "ai_delegation"),
                        "one_line_summary": "test",
                    }
                elif section == "config_scoring":
                    response = {
                        "fluency_behaviors": expected.get("fluency_behaviors", _make_behaviors()),
                        "one_line_summary": "test",
                    }
                else:
                    response = {
                        "fluency_behaviors": expected.get("fluency_behaviors", _make_behaviors()),
                        "overall_score": expected.get("overall_score", 0),
                        "one_line_summary": "test",
                    }
                mock_responses[entry["id"]] = response

        # Build results as if API returned expected values
        results = []
        for section in ["single_scoring", "session_scoring", "config_scoring", "optimizer"]:
            prompt_type_map = {
                "single_scoring": "single_scoring",
                "session_scoring": "scoring",
                "config_scoring": "config",
                "optimizer": "optimizer",
            }
            version = load_prompt(prompt_type_map[section])["version"]
            for entry in golden_set.get(section, []):
                results.append({
                    "id": entry["id"],
                    "section": section,
                    "prompt_version": version,
                    "expected": entry["expected"],
                    "actual": mock_responses[entry["id"]],
                    "parse_error": None,
                    "input_tokens": 500,
                    "output_tokens": 100,
                })

        # Run checks
        schema_result = check_schema(results)
        agreement_result = check_agreement(results)

        assert schema_result["failed"] == 0, f"Schema failures: {schema_result['failures']}"
        assert agreement_result["overall_agreement"] == 1.0

        # Save results
        filepath = save_results(
            results,
            {"schema": schema_result, "agreement": agreement_result},
            {"check": "all", "golden_set_version": golden_set["version"]},
            str(tmp_path),
        )
        assert filepath.exists()
        with open(filepath) as f:
            saved = json.load(f)
        assert saved["checks"]["schema"]["passed"] == len(results)


# ─── Live API tests ──────────────────────────────────────────────────────────


@pytest.mark.live
class TestLiveAPI:
    """Live API tests — skipped in CI, run with: uv run pytest -m live"""

    def test_single_scoring_live(self, golden_set):
        from shared.eval.scorer import (
            build_filled_prompt,
            call_with_retry,
            create_client,
            load_prompt,
        )

        client = create_client()
        entry = golden_set["single_scoring"][0]
        template = load_prompt("single_scoring")["template"]
        filled = build_filled_prompt(entry, "single_scoring", template)

        result = call_with_retry(client, filled)
        assert result["parse_error"] is None
        assert result["result"] is not None
        assert "fluency_behaviors" in result["result"]
        assert "overall_score" in result["result"]

    def test_config_scoring_live(self, golden_set):
        from shared.eval.scorer import (
            build_filled_prompt,
            call_with_retry,
            create_client,
            load_prompt,
        )

        client = create_client()
        entry = golden_set["config_scoring"][0]
        template = load_prompt("config")["template"]
        filled = build_filled_prompt(entry, "config_scoring", template)

        result = call_with_retry(client, filled)
        assert result["parse_error"] is None
        assert result["result"] is not None
        assert "fluency_behaviors" in result["result"]

    def test_optimizer_live(self, golden_set):
        from shared.eval.scorer import (
            build_filled_prompt,
            call_with_retry,
            create_client,
            load_prompt,
        )

        client = create_client()
        entry = golden_set["optimizer"][0]
        template = load_prompt("optimizer")["template"]
        filled = build_filled_prompt(entry, "optimizer", template)

        result = call_with_retry(client, filled)
        assert result["parse_error"] is None
        assert result["result"] is not None
        assert "input_behaviors" in result["result"] or "input_score" in result["result"]
