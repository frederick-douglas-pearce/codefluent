#!/usr/bin/env python3
"""CLI entry point for the CodeFluent eval runner.

Usage:
    uv run python shared/eval/run_eval.py [OPTIONS]

Run from the webapp/ directory or project root with ANTHROPIC_API_KEY set.
"""

import argparse
import json
import sys
from pathlib import Path

# Ensure shared/ parent is on sys.path for both direct and package execution
_PROJECT_ROOT = Path(__file__).parent.parent.parent
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))

EVAL_DIR = Path(__file__).parent
GOLDEN_SET_PATH = EVAL_DIR / "golden_set.json"
DEFAULT_OUTPUT_DIR = EVAL_DIR / "results"


def parse_args(argv=None):
    parser = argparse.ArgumentParser(
        description="CodeFluent scoring prompt regression checker",
    )
    parser.add_argument(
        "--check",
        choices=["all", "schema", "agreement", "consistency", "drift", "regression"],
        default="all",
        help="Which check to run (default: all = schema + agreement)",
    )
    parser.add_argument(
        "--threshold", type=float, default=0.85,
        help="Agreement threshold (default: 0.85)",
    )
    parser.add_argument(
        "--sections",
        help="Comma-separated sections to run (default: all)",
    )
    parser.add_argument(
        "--delay", type=float, default=0.5,
        help="Seconds between API calls (default: 0.5)",
    )
    parser.add_argument(
        "--runs", type=int, default=3,
        help="Number of consistency runs (default: 3)",
    )
    parser.add_argument(
        "--subset", type=int, default=10,
        help="Consistency subset size (default: 10)",
    )
    parser.add_argument(
        "--baseline",
        help="Path to baseline results JSON (for drift check)",
    )
    parser.add_argument(
        "--old-version",
        help="Old prompt file for regression (e.g., scoring/v1.0.md)",
    )
    parser.add_argument(
        "--new-version",
        help="New prompt file for regression (e.g., scoring/v1.1.md)",
    )
    parser.add_argument(
        "--regression-section",
        help="Which section for regression check",
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT_DIR),
        help=f"Output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    parser.add_argument(
        "--dry-run", action="store_true",
        help="Show what would run, no API calls",
    )
    parser.add_argument(
        "--verbose", action="store_true",
        help="Print each API call",
    )
    return parser.parse_args(argv)


def main(argv=None):
    args = parse_args(argv)

    # Parse sections
    sections = None
    if args.sections:
        sections = [s.strip() for s in args.sections.split(",")]

    # Load golden set
    with open(GOLDEN_SET_PATH) as f:
        golden_set = json.load(f)

    # Determine which checks to run
    check = args.check
    if check == "all":
        checks_to_run = ["schema", "agreement"]
    else:
        checks_to_run = [check]

    # Validate required args for specific checks
    if "drift" in checks_to_run and not args.baseline:
        print("Error: --baseline required for drift check")
        sys.exit(1)
    if "regression" in checks_to_run:
        if not args.old_version or not args.new_version or not args.regression_section:
            print("Error: --old-version, --new-version, and --regression-section required for regression check")
            sys.exit(1)

    # Dry run
    if args.dry_run:
        all_sections = ["single_scoring", "session_scoring", "config_scoring", "optimizer"]
        run_sections = sections or all_sections
        total = sum(len(golden_set.get(s, [])) for s in run_sections)
        print("DRY RUN — no API calls will be made\n")
        print(f"Checks: {', '.join(checks_to_run)}")
        print(f"Sections: {', '.join(run_sections)}")
        print(f"Total entries: {total}")
        print(f"Threshold: {args.threshold}")
        print(f"Delay: {args.delay}s")
        if "consistency" in checks_to_run:
            print(f"Consistency: {args.runs} runs × {args.subset} entries")
        if "drift" in checks_to_run:
            print(f"Baseline: {args.baseline}")
        if "regression" in checks_to_run:
            print(f"Regression: {args.old_version} → {args.new_version} ({args.regression_section})")
        print(f"Output: {args.output}")
        return

    # Import here so --dry-run and --help work without API key
    from shared.eval.scorer import create_client, load_pricing, run_golden_set
    from shared.eval.checks import (
        check_agreement, check_consistency, check_drift,
        check_regression, check_schema,
    )
    from shared.eval.report import compute_cost, print_cost, print_summary, save_results

    # Create client
    client = create_client()

    results = []
    check_results = {}

    try:
        # Run golden set through API (needed for schema, agreement, drift)
        needs_run = bool({"schema", "agreement", "drift"} & set(checks_to_run))
        if needs_run:
            print(f"Running golden set ({', '.join(sections or ['all sections'])})")
            results = run_golden_set(
                client, golden_set, sections=sections,
                delay=args.delay, verbose=args.verbose,
            )
            print(f"  Scored {len(results)} entries")

        # Run checks
        if "schema" in checks_to_run:
            check_results["schema"] = check_schema(results)
            print_summary("schema", check_results["schema"])

        if "agreement" in checks_to_run:
            check_results["agreement"] = check_agreement(results, threshold=args.threshold)
            print_summary("agreement", check_results["agreement"])

        if "consistency" in checks_to_run:
            print(f"Running consistency check ({args.runs} runs × {args.subset} entries)")
            check_results["consistency"] = check_consistency(
                client, golden_set, n_runs=args.runs,
                subset_size=args.subset, delay=args.delay,
            )
            print_summary("consistency", check_results["consistency"])

        if "drift" in checks_to_run:
            check_results["drift"] = check_drift(results, args.baseline)
            print_summary("drift", check_results["drift"])

        if "regression" in checks_to_run:
            print(f"Running regression check ({args.old_version} → {args.new_version})")
            check_results["regression"] = check_regression(
                client, golden_set, args.old_version, args.new_version,
                args.regression_section, delay=args.delay,
            )
            print_summary("regression", check_results["regression"])

    except KeyboardInterrupt:
        print("\n\nInterrupted — saving partial results...")

    # Cost summary
    if results:
        pricing = load_pricing()
        cost_info = compute_cost(results, pricing)
        print_cost(cost_info)
        metadata = {"cost": cost_info}
    else:
        metadata = {}

    metadata.update({
        "check": args.check,
        "sections": sections,
        "threshold": args.threshold,
        "golden_set_version": golden_set.get("version"),
    })

    # Save results
    if results or check_results:
        filepath = save_results(results, check_results, metadata, args.output)
        print(f"\nResults saved to: {filepath}")

    # Exit non-zero if any check failed
    any_failed = False
    for name, result in check_results.items():
        if name == "schema" and result.get("failed", 0) > 0:
            any_failed = True
        elif name == "agreement" and not result.get("passed", True):
            any_failed = True
    if any_failed:
        sys.exit(1)


if __name__ == "__main__":
    main()
