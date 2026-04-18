"""Six regression check implementations for the eval runner."""

import time
from collections import Counter

from shared.eval.scorer import (
    BEHAVIORS, _sanitize_error, build_filled_prompt, call_with_retry, load_prompt,
)

# Canonical source: webapp/task_classification.py and vscode-extension/src/taskClassification.ts
TASK_TYPES = ["feature", "bug_fix", "refactor", "debug", "test", "docs", "chore", "exploration"]


def check_schema(results):
    """Validate each result has expected keys per section type.

    Returns:
        dict with total, passed, failed, failures list.
    """
    failures = []

    for r in results:
        errors = []
        section = r["section"]
        actual = r["actual"]

        if r["parse_error"]:
            errors.append(f"JSON parse error: {r['parse_error']}")
            failures.append({"id": r["id"], "section": section, "errors": errors})
            continue

        if actual is None:
            errors.append("No result (API call failed)")
            failures.append({"id": r["id"], "section": section, "errors": errors})
            continue

        # All sections must have fluency_behaviors
        fb_key = "input_behaviors" if section == "optimizer" else "fluency_behaviors"
        fb = actual.get(fb_key)
        if not isinstance(fb, dict):
            errors.append(f"Missing or invalid '{fb_key}' (expected dict)")
        else:
            for b in BEHAVIORS:
                if b not in fb:
                    errors.append(f"Missing behavior key: {b}")
                elif not isinstance(fb[b], bool):
                    errors.append(f"Behavior '{b}' is not bool: {fb[b]}")

        # Section-specific checks
        if section == "single_scoring":
            if "overall_score" not in actual:
                errors.append("Missing 'overall_score'")
            elif not isinstance(actual["overall_score"], (int, float)):
                errors.append(f"'overall_score' is not numeric: {actual['overall_score']}")
            if "one_line_summary" not in actual:
                errors.append("Missing 'one_line_summary'")

        elif section == "session_scoring":
            if "overall_score" not in actual:
                errors.append("Missing 'overall_score'")
            if "coding_pattern" not in actual:
                errors.append("Missing 'coding_pattern'")
            if "one_line_summary" not in actual:
                errors.append("Missing 'one_line_summary'")
            if "task_type" not in actual:
                errors.append("Missing 'task_type'")
            elif actual["task_type"] not in TASK_TYPES:
                errors.append(f"Invalid task_type: {actual['task_type']}")
            if "task_type_confidence" not in actual:
                errors.append("Missing 'task_type_confidence'")
            elif not isinstance(actual["task_type_confidence"], (int, float)):
                errors.append(f"'task_type_confidence' is not numeric: {actual['task_type_confidence']}")

        elif section == "config_scoring":
            if "one_line_summary" not in actual:
                errors.append("Missing 'one_line_summary'")

        elif section == "optimizer":
            if "input_score" not in actual:
                errors.append("Missing 'input_score'")
            if "one_line_summary" not in actual:
                errors.append("Missing 'one_line_summary'")

        if errors:
            failures.append({"id": r["id"], "section": section, "errors": errors})

    return {
        "total": len(results),
        "passed": len(results) - len(failures),
        "failed": len(failures),
        "failures": failures,
    }


def check_agreement(results, threshold=0.85):
    """Compare actual vs expected behaviors per entry.

    Returns:
        dict with overall_agreement, per_behavior, below_threshold, by_section.
    """
    total_comparisons = 0
    total_matches = 0
    per_behavior = {b: {"matches": 0, "total": 0} for b in BEHAVIORS}
    by_section = {}

    for r in results:
        if r["actual"] is None or r["parse_error"]:
            continue

        section = r["section"]
        expected = r["expected"]
        actual = r["actual"]

        # Get behavior dicts
        if section == "optimizer":
            expected_fb = expected.get("input_behaviors", {})
            actual_fb = actual.get("input_behaviors", {})
        else:
            expected_fb = expected.get("fluency_behaviors", {})
            actual_fb = actual.get("fluency_behaviors", {})

        if section not in by_section:
            by_section[section] = {"matches": 0, "total": 0}

        for b in BEHAVIORS:
            exp_val = expected_fb.get(b)
            act_val = actual_fb.get(b)
            if exp_val is None:
                continue
            total_comparisons += 1
            by_section[section]["total"] += 1
            per_behavior[b]["total"] += 1

            if exp_val == act_val:
                total_matches += 1
                by_section[section]["matches"] += 1
                per_behavior[b]["matches"] += 1

    overall = total_matches / total_comparisons if total_comparisons > 0 else 0.0

    # Compute per-behavior agreement rates
    per_behavior_rates = {}
    below_threshold = []
    for b in BEHAVIORS:
        stats = per_behavior[b]
        rate = stats["matches"] / stats["total"] if stats["total"] > 0 else 0.0
        per_behavior_rates[b] = round(rate, 4)
        if rate < threshold:
            below_threshold.append({"behavior": b, "agreement": round(rate, 4)})

    # Compute per-section rates
    section_rates = {}
    for section, stats in by_section.items():
        section_rates[section] = round(
            stats["matches"] / stats["total"] if stats["total"] > 0 else 0.0, 4
        )

    passed = overall >= threshold and len(below_threshold) == 0

    return {
        "overall_agreement": round(overall, 4),
        "per_behavior": per_behavior_rates,
        "below_threshold": below_threshold,
        "by_section": section_rates,
        "threshold": threshold,
        "passed": passed,
    }


def _cohen_kappa(expected, actual, categories):
    """Hand-rolled Cohen's Kappa for nominal categories.

    kappa = (po - pe) / (1 - pe), where po is observed agreement and pe is
    expected agreement by chance (sum of marginal-product across categories).

    If pe == 1 (single-class degenerate case), returns 1.0 if po == 1 else 0.0.
    """
    n = len(expected)
    if n == 0:
        return 0.0
    expected_counts = Counter(expected)
    actual_counts = Counter(actual)
    po = sum(1 for e, a in zip(expected, actual) if e == a) / n
    pe = sum(
        (expected_counts[c] / n) * (actual_counts[c] / n)
        for c in categories
    )
    if pe >= 1.0:
        return 1.0 if po == 1.0 else 0.0
    return (po - pe) / (1 - pe)


def check_task_type_agreement(results, kappa_threshold=0.7, min_precision=0.5):
    """Measure agreement between LLM-assigned and expected task_type.

    Section-aware: filters to entries where expected.task_type is present (any
    section that labels task_type qualifies — not hardcoded to session_scoring).

    Pass gate: kappa >= kappa_threshold AND every category with support >= 1
    has precision >= min_precision. The precision guard catches the Kappa
    prevalence trap, where high scores on common categories mask poor
    performance on rare ones.
    """
    pairs = []
    for r in results:
        if r.get("actual") is None or r.get("parse_error"):
            continue
        expected_tt = r.get("expected", {}).get("task_type")
        actual_tt = r.get("actual", {}).get("task_type")
        if expected_tt is None:
            continue
        pairs.append((expected_tt, actual_tt))

    if not pairs:
        return {
            "n": 0, "kappa": None, "per_category": {}, "confusion_matrix": {},
            "passed": True, "kappa_threshold": kappa_threshold,
            "min_precision_threshold": min_precision,
            "min_precision_category": None, "min_precision_value": None,
            "skipped": True,
        }

    expected_list = [e for e, _ in pairs]
    actual_list = [a for _, a in pairs]
    kappa = _cohen_kappa(expected_list, actual_list, TASK_TYPES)

    # Confusion matrix: rows = expected, cols = actual
    confusion = {e: {a: 0 for a in TASK_TYPES} for e in TASK_TYPES}
    for e, a in pairs:
        if e in confusion and a in confusion[e]:
            confusion[e][a] += 1

    per_category = {}
    min_precision_value = 1.0
    min_precision_cat = None
    for c in TASK_TYPES:
        tp = confusion[c][c]
        support = sum(confusion[c].values())
        predicted = sum(confusion[e][c] for e in TASK_TYPES)
        precision = tp / predicted if predicted > 0 else None
        recall = tp / support if support > 0 else None
        per_category[c] = {
            "precision": round(precision, 4) if precision is not None else None,
            "recall": round(recall, 4) if recall is not None else None,
            "support": support,
        }
        if support > 0 and precision is not None and precision < min_precision_value:
            min_precision_value = precision
            min_precision_cat = c

    precision_pass = all(
        (stats["precision"] is None) or (stats["precision"] >= min_precision)
        for stats in per_category.values() if stats["support"] > 0
    )
    passed = kappa >= kappa_threshold and precision_pass

    return {
        "n": len(pairs),
        "kappa": round(kappa, 4),
        "per_category": per_category,
        "confusion_matrix": confusion,
        "passed": passed,
        "kappa_threshold": kappa_threshold,
        "min_precision_threshold": min_precision,
        "min_precision_category": min_precision_cat,
        "min_precision_value": round(min_precision_value, 4) if min_precision_cat else None,
    }


def check_consistency(client, golden_set, n_runs=3, subset_size=10, delay=0.5):
    """Run a subset multiple times and measure self-agreement.

    Returns:
        dict with entries_tested, runs_per_entry, self_agreement,
        per_behavior_stability, flaky_entries.
    """
    # Use single_scoring entries for consistency (simplest, cheapest)
    entries = golden_set.get("single_scoring", [])[:subset_size]
    if not entries:
        return {
            "entries_tested": 0, "runs_per_entry": n_runs,
            "self_agreement": 0.0, "per_behavior_stability": {},
            "flaky_entries": [],
        }

    prompt_info = load_prompt("single_scoring")
    template = prompt_info["template"]

    # Collect results per entry across runs
    entry_runs = {e["id"]: [] for e in entries}

    for run_idx in range(n_runs):
        for i, entry in enumerate(entries):
            filled = build_filled_prompt(entry, "single_scoring", template)
            try:
                api_result = call_with_retry(client, filled)
                if api_result["result"] and not api_result["parse_error"]:
                    fb = api_result["result"].get("fluency_behaviors", {})
                    entry_runs[entry["id"]].append(fb)
            except Exception:
                pass  # Skip failed calls
            if delay > 0:
                time.sleep(delay)

    # Compute self-agreement: for each entry, what fraction of behavior values
    # are identical across all runs?
    total_checks = 0
    total_consistent = 0
    per_behavior_consistent = {b: {"consistent": 0, "total": 0} for b in BEHAVIORS}
    flaky_entries = []

    for entry_id, runs in entry_runs.items():
        if len(runs) < 2:
            continue
        entry_flaky_behaviors = []
        for b in BEHAVIORS:
            values = [r.get(b) for r in runs if b in r]
            if len(values) < 2:
                continue
            total_checks += 1
            per_behavior_consistent[b]["total"] += 1
            if all(v == values[0] for v in values):
                total_consistent += 1
                per_behavior_consistent[b]["consistent"] += 1
            else:
                entry_flaky_behaviors.append(b)
        if entry_flaky_behaviors:
            flaky_entries.append({"id": entry_id, "flaky_behaviors": entry_flaky_behaviors})

    self_agreement = total_consistent / total_checks if total_checks > 0 else 0.0
    per_behavior_stability = {}
    for b in BEHAVIORS:
        s = per_behavior_consistent[b]
        per_behavior_stability[b] = round(
            s["consistent"] / s["total"] if s["total"] > 0 else 0.0, 4
        )

    return {
        "entries_tested": len(entries),
        "runs_per_entry": n_runs,
        "self_agreement": round(self_agreement, 4),
        "per_behavior_stability": per_behavior_stability,
        "flaky_entries": flaky_entries,
    }


def check_drift(current_results, baseline_path):
    """Compare activation rates against a baseline, flag >15pp shifts.

    Args:
        current_results: List of result dicts from run_golden_set.
        baseline_path: Path to a previous results JSON file.

    Returns:
        dict with per_behavior rates and drifted list.
    """
    import json as _json
    with open(baseline_path) as f:
        baseline_data = _json.load(f)

    baseline_results = baseline_data.get("results", baseline_data)
    if isinstance(baseline_results, dict):
        baseline_results = baseline_results.get("results", [])

    # Compute activation rates for both
    def _activation_rates(results_list):
        counts = {b: 0 for b in BEHAVIORS}
        totals = {b: 0 for b in BEHAVIORS}
        for r in results_list:
            if r.get("actual") is None:
                continue
            section = r.get("section", "")
            fb_key = "input_behaviors" if section == "optimizer" else "fluency_behaviors"
            fb = r["actual"].get(fb_key, {})
            for b in BEHAVIORS:
                if b in fb:
                    totals[b] += 1
                    if fb[b]:
                        counts[b] += 1
        return {b: counts[b] / totals[b] if totals[b] > 0 else 0.0 for b in BEHAVIORS}

    current_rates = _activation_rates(current_results)
    baseline_rates = _activation_rates(baseline_results)

    per_behavior = {}
    drifted = []
    for b in BEHAVIORS:
        current = round(current_rates[b], 4)
        baseline = round(baseline_rates[b], 4)
        diff = round(current - baseline, 4)
        per_behavior[b] = {"current": current, "baseline": baseline, "diff": diff}
        if abs(diff) > 0.15:
            drifted.append({"behavior": b, "diff": diff})

    return {"per_behavior": per_behavior, "drifted": drifted}


def check_regression(client, golden_set, old_file, new_file, section, delay=0.5):
    """Run a section with both prompt versions and diff results.

    Args:
        client: Anthropic client.
        golden_set: Parsed golden_set.json dict.
        old_file: Path to old prompt file (e.g. 'scoring/v1.0.md').
        new_file: Path to new prompt file (e.g. 'scoring/v1.1.md').
        section: Which section to test.
        delay: Seconds between API calls.

    Returns:
        dict with entries_changed, total_entries, behavior_changes, details.
    """
    entries = golden_set.get(section, [])
    if not entries:
        return {
            "entries_changed": 0, "total_entries": 0,
            "behavior_changes": {}, "details": [],
        }

    old_prompt = load_prompt(None, version_override=old_file)
    new_prompt = load_prompt(None, version_override=new_file)

    # Map section to scoring section for build_filled_prompt
    details = []
    behavior_changes = {b: {"gained": 0, "lost": 0} for b in BEHAVIORS}
    entries_changed = 0

    for entry in entries:
        old_filled = build_filled_prompt(entry, section, old_prompt["template"])
        new_filled = build_filled_prompt(entry, section, new_prompt["template"])

        try:
            old_result = call_with_retry(client, old_filled)
            if delay > 0:
                time.sleep(delay)
            new_result = call_with_retry(client, new_filled)
            if delay > 0:
                time.sleep(delay)
        except Exception as e:
            details.append({"id": entry["id"], "error": _sanitize_error(str(e))})
            continue

        if not old_result["result"] or not new_result["result"]:
            details.append({
                "id": entry["id"],
                "error": "Parse error in one or both results",
            })
            continue

        fb_key = "input_behaviors" if section == "optimizer" else "fluency_behaviors"
        old_fb = old_result["result"].get(fb_key, {})
        new_fb = new_result["result"].get(fb_key, {})

        changes = {}
        for b in BEHAVIORS:
            old_val = old_fb.get(b)
            new_val = new_fb.get(b)
            if old_val != new_val:
                changes[b] = {"old": old_val, "new": new_val}
                if new_val and not old_val:
                    behavior_changes[b]["gained"] += 1
                elif old_val and not new_val:
                    behavior_changes[b]["lost"] += 1

        if changes:
            entries_changed += 1
            details.append({"id": entry["id"], "changes": changes})

    return {
        "entries_changed": entries_changed,
        "total_entries": len(entries),
        "behavior_changes": behavior_changes,
        "details": details,
    }
