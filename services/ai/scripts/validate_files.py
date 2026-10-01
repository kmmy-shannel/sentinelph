#!/usr/bin/env python3
"""Validate the Phase 2 files: regression_suite.json + bootstrap output.

Run after saving any Phase 2 file. Prints PASS/FAIL per check.
Exit code 0 = all pass, 1 = any fail.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parent.parent
SUITE = AI_ROOT / "tests" / "regression_suite.json"
BOOTSTRAPPED = AI_ROOT / "data" / "labeling" / "bootstrapped.csv"
QUEUE = AI_ROOT / "data" / "labeling" / "queue_to_label.csv"

DROPPED = {
    "wrong_number_baiting",
    "impersonation_family",
    "political_campaign",
    "charity_appeal",
}

IN_SCOPE = {
    "personal_conversational",
    "two_factor_auth",
    "appointment_reminder",
    "delivery_tracking",
    "bank_activity_alert",
    "brand_marketing",
    "phishing_link",
    "urgent_fine_toll",
    "fake_prize_lottery",
}

failures = []


def check(name: str, condition: bool, detail: str = "") -> None:
    status = "PASS" if condition else "FAIL"
    print(f"[{status}] {name}" + (f" — {detail}" if detail else ""))
    if not condition:
        failures.append(name)


def main() -> int:
    print("=" * 70)
    print("PHASE 2 FILE VALIDATION")
    print("=" * 70)
    print()

    # --- regression_suite.json ---
    print("--- tests/regression_suite.json ---")
    if not SUITE.exists():
        check("regression_suite.json exists", False, str(SUITE))
        return 1

    try:
        suite = json.loads(SUITE.read_text(encoding="utf-8"))
    except json.JSONDecodeError as e:
        check("regression_suite.json parses", False, str(e))
        return 1

    check("regression_suite.json parses", True)

    examples = suite.get("examples", [])
    check("examples is a list", isinstance(examples, list), f"{len(examples)} items")
    check("100 examples", len(examples) == 100, f"found {len(examples)}")

    version = suite.get("version")
    check("version is 1.1", version == "1.1", f"found {version}")

    mnf = sum(1 for ex in examples if ex.get("must_not_flip"))
    check("must_not_flip count is 28", mnf == 28, f"found {mnf}")

    # Every dropped-subtype example must NOT be must_not_flip
    still_locked = [
        ex["id"] for ex in examples
        if ex.get("expected_level2") in DROPPED and ex.get("must_not_flip")
    ]
    check(
        "no dropped-subtype example is must_not_flip",
        len(still_locked) == 0,
        f"violations: {still_locked}" if still_locked else "clean",
    )

    # Every must_not_flip example is in-scope
    out_of_scope_locked = [
        ex["id"] for ex in examples
        if ex.get("must_not_flip") and ex.get("expected_level2") not in IN_SCOPE
    ]
    check(
        "every must_not_flip example is in-scope",
        len(out_of_scope_locked) == 0,
        f"violations: {out_of_scope_locked}" if out_of_scope_locked else "clean",
    )

    # Every expected_level2 is in-scope or dropped
    unknown = {
        ex.get("expected_level2") for ex in examples
        if ex.get("expected_level2") not in IN_SCOPE
        and ex.get("expected_level2") not in DROPPED
    }
    check(
        "all expected_level2 values are known",
        len(unknown) == 0,
        f"unknown: {unknown}" if unknown else "clean",
    )
    print()

    # --- bootstrap outputs ---
    print("--- data/labeling/ ---")
    if BOOTSTRAPPED.exists():
        import csv
        with BOOTSTRAPPED.open(newline="", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            rows = list(reader)
        check("bootstrapped.csv exists", True, f"{len(rows)} rows")

        # No dropped subtypes in the output
        dropped_rows = [
            r for r in rows
            if r.get("level2_label") in DROPPED
        ]
        check(
            "no dropped subtypes in bootstrapped.csv",
            len(dropped_rows) == 0,
            f"{len(dropped_rows)} rows" if dropped_rows else "clean",
        )

        # Every level2_label is either UNLABELED or in-scope
        bad_labels = {
            r.get("level2_label") for r in rows
            if r.get("level2_label") != "UNLABELED"
            and r.get("level2_label") not in IN_SCOPE
        }
        check(
            "all level2_label values are UNLABELED or in-scope",
            len(bad_labels) == 0,
            f"bad: {bad_labels}" if bad_labels else "clean",
        )
    else:
        check("bootstrapped.csv exists", False, str(BOOTSTRAPPED))

    if QUEUE.exists():
        import csv
        with QUEUE.open(newline="", encoding="utf-8") as f:
            qrows = list(csv.DictReader(f))
        check("queue_to_label.csv exists", True, f"{len(qrows)} rows")
    else:
        check("queue_to_label.csv exists", False, str(QUEUE))

    print()
    print("=" * 70)
    if failures:
        print(f"FAILED — {len(failures)} check(s): {', '.join(failures)}")
        return 1
    print("ALL CHECKS PASSED")
    return 0


if __name__ == "__main__":
    sys.exit(main())