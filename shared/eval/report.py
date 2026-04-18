"""JSON and stdout output formatting, cost tracking for eval runner."""

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from shared.eval.scorer import BEHAVIORS, MODEL


def compute_cost(results, pricing):
    """Sum tokens and estimate cost using pricing.json model rates.

    Args:
        results: List of result dicts from run_golden_set.
        pricing: Parsed pricing.json dict.

    Returns:
        dict with total_input_tokens, total_output_tokens, estimated_cost_usd.
    """
    total_input = sum(r.get("input_tokens", 0) for r in results)
    total_output = sum(r.get("output_tokens", 0) for r in results)

    # Look up model pricing
    model_pricing = pricing.get("models", {}).get(MODEL)
    if not model_pricing:
        # Try alias
        alias_model = pricing.get("aliases", {}).get(MODEL)
        if alias_model:
            model_pricing = pricing.get("models", {}).get(alias_model)

    if model_pricing:
        # Use latest pricing entry
        rates = model_pricing[-1]
        input_cost = (total_input / 1_000_000) * rates["input"]
        output_cost = (total_output / 1_000_000) * rates["output"]
        cost = round(input_cost + output_cost, 6)
    else:
        cost = None

    return {
        "total_input_tokens": total_input,
        "total_output_tokens": total_output,
        "estimated_cost_usd": cost,
    }


def save_results(results, checks, metadata, output_dir):
    """Save results and check outputs to a timestamped JSON file.

    Args:
        results: List of result dicts.
        checks: Dict of check_name -> check_result.
        metadata: Dict with run metadata (versions, args, etc.).
        output_dir: Directory to write output.

    Returns:
        Path to the saved file.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H%M%S")
    check_names = "_".join(sorted(checks.keys())) if checks else "run"
    filename = f"{timestamp}_{check_names}.json"

    output = {
        "metadata": {
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "model": MODEL,
            **metadata,
        },
        "results": results,
        "checks": checks,
    }

    filepath = output_dir / filename
    with open(filepath, "w") as f:
        json.dump(output, f, indent=2)

    return filepath


def print_summary(check_name, check_result):
    """Print a human-readable summary of a check result to stdout."""
    print(f"\n{'='*60}")
    print(f"  {check_name.upper()}")
    print(f"{'='*60}")

    if check_name == "schema":
        total = check_result["total"]
        passed = check_result["passed"]
        failed = check_result["failed"]
        icon = "PASS" if failed == 0 else "FAIL"
        print(f"  [{icon}] {passed}/{total} entries have valid schema")
        if check_result["failures"]:
            for f in check_result["failures"][:5]:
                print(f"    - {f['id']} ({f['section']}): {'; '.join(f['errors'][:2])}")
            if len(check_result["failures"]) > 5:
                print(f"    ... and {len(check_result['failures']) - 5} more")

    elif check_name == "agreement":
        overall = check_result["overall_agreement"]
        threshold = check_result["threshold"]
        passed = check_result.get("passed", overall >= threshold)
        icon = "PASS" if passed else "FAIL"
        print(f"  [{icon}] Overall agreement: {overall:.1%} (threshold: {threshold:.0%})")

        if check_result["by_section"]:
            print("  By section:")
            for section, rate in check_result["by_section"].items():
                print(f"    {section}: {rate:.1%}")

        if check_result["below_threshold"]:
            print(f"  [FAIL] Behaviors below {threshold:.0%}:")
            for item in check_result["below_threshold"]:
                print(f"    - {item['behavior']}: {item['agreement']:.1%}")

    elif check_name == "task_type_agreement":
        if check_result.get("skipped"):
            print("  [SKIP] No entries with expected.task_type found")
            return
        kappa = check_result["kappa"]
        kt = check_result["kappa_threshold"]
        passed = check_result["passed"]
        icon = "PASS" if passed else "FAIL"
        print(f"  [{icon}] Cohen's Kappa: {kappa:.3f} (threshold: {kt}) on n={check_result['n']}")

        print("  Per-category precision/recall (support):")
        for cat, stats in check_result["per_category"].items():
            if stats["support"] == 0:
                continue
            p = stats["precision"]
            r = stats["recall"]
            p_str = f"{p:.1%}" if p is not None else "—"
            r_str = f"{r:.1%}" if r is not None else "—"
            print(f"    {cat}: P={p_str} R={r_str} (n={stats['support']})")

        mp_cat = check_result.get("min_precision_category")
        mp_thresh = check_result["min_precision_threshold"]
        if mp_cat and check_result.get("min_precision_value") is not None:
            mp_val = check_result["min_precision_value"]
            if mp_val < mp_thresh:
                print(f"  [FAIL] Lowest precision: {mp_cat} at {mp_val:.1%} (threshold: {mp_thresh:.0%})")

        # Compact confusion matrix: only rows/cols with support
        cm = check_result["confusion_matrix"]
        active = [c for c, stats in check_result["per_category"].items() if stats["support"] > 0]
        if active:
            print("  Confusion (rows=expected, cols=actual):")
            header = "          " + " ".join(f"{c[:6]:>6}" for c in active)
            print(header)
            for e in active:
                row = " ".join(f"{cm[e].get(a, 0):>6}" for a in active)
                print(f"    {e[:8]:<8}{row}")

    elif check_name == "consistency":
        sa = check_result["self_agreement"]
        print(f"  Self-agreement: {sa:.1%} ({check_result['entries_tested']} entries, {check_result['runs_per_entry']} runs)")
        if check_result["flaky_entries"]:
            print(f"  Flaky entries ({len(check_result['flaky_entries'])}):")
            for fe in check_result["flaky_entries"][:5]:
                print(f"    - {fe['id']}: {', '.join(fe['flaky_behaviors'])}")

    elif check_name == "drift":
        drifted = check_result["drifted"]
        icon = "PASS" if not drifted else "WARN"
        print(f"  [{icon}] {len(drifted)} behaviors drifted >15pp")
        for d in drifted:
            direction = "+" if d["diff"] > 0 else ""
            print(f"    - {d['behavior']}: {direction}{d['diff']:.1%}")

    elif check_name == "regression":
        changed = check_result["entries_changed"]
        total = check_result["total_entries"]
        print(f"  {changed}/{total} entries changed between prompt versions")
        if check_result["details"]:
            for d in check_result["details"][:5]:
                if "error" in d:
                    print(f"    - {d['id']}: ERROR - {d['error']}")
                elif "changes" in d:
                    behaviors = ", ".join(d["changes"].keys())
                    print(f"    - {d['id']}: {behaviors}")


def print_cost(cost_info):
    """Print cost summary."""
    print(f"\n{'─'*60}")
    print(f"  Cost: {cost_info['total_input_tokens']:,} input + "
          f"{cost_info['total_output_tokens']:,} output tokens")
    if cost_info["estimated_cost_usd"] is not None:
        print(f"  Estimated: ${cost_info['estimated_cost_usd']:.4f}")
    print(f"{'─'*60}")
