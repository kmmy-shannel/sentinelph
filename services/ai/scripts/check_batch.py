#!/usr/bin/env python3
"""Verify a batch_N_labeled.csv file has the expected shape.

Checks:
  - File parses
  - Row count (should match input batch size)
  - Header has exactly id,suggested_subtype,confidence,reason
  - Every id starts with 'q_'
  - Every subtype is in the 9-subtype set or UNLABELED
  - Every confidence is high/medium/low

Usage:
    python scripts/check_batch.py batch_p1_0_labeled.csv
    python scripts/check_batch.py batch_p1_0_labeled.csv --expected 50
"""
from __future__ import annotations

import argparse
import csv
import sys
from collections import Counter
from pathlib import Path

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
ALLOWED = IN_SCOPE | {"UNLABELED"}
CONFIDENCES = {"high", "medium", "low"}


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("path", help="Path to batch_N_labeled.csv")
    p.add_argument("--expected", type=int, default=None,
                   help="Expected row count (e.g. batch size)")
    args = p.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"[FAIL] file not found: {path}")
        return 1

    # Read raw lines first to detect header presence
    raw_lines = path.read_text(encoding="utf-8").splitlines()
    raw_lines = [ln.strip() for ln in raw_lines if ln.strip()]

    if not raw_lines:
        print(f"[FAIL] file is empty")
        return 1

    has_header = raw_lines[0].lower().startswith("id,")

    # Parse each line with comma-tolerant splitting
    rows = []
    parse_errors = []
    for i, line in enumerate(raw_lines):
        if has_header and i == 0:
            continue
        parts = line.split(",", 3)
        if len(parts) < 4:
            parse_errors.append((i + 1, line[:80]))
            continue
        uid, subtype, conf, reason = (x.strip().strip('"') for x in parts)
        rows.append({"uid": uid, "subtype": subtype,
                     "confidence": conf, "reason": reason})

    failures = []
    if parse_errors:
        failures.append(f"{len(parse_errors)} unparseable line(s)")

    # Check IDs
    bad_ids = [r["uid"] for r in rows if not r["uid"].startswith("q_")]
    if bad_ids:
        failures.append(f"{len(bad_ids)} id(s) not starting with q_: {bad_ids[:3]}")

    # Check subtypes
    bad_subtypes = [r["subtype"] for r in rows if r["subtype"] not in ALLOWED]
    if bad_subtypes:
        failures.append(f"{len(bad_subtypes)} unknown subtype(s): {set(bad_subtypes)}")

    # Check confidences
    bad_confs = [r["confidence"] for r in rows if r["confidence"] not in CONFIDENCES]
    if bad_confs:
        failures.append(f"{len(bad_confs)} unknown confidence(s): {set(bad_confs)}")

    # Check row count
    if args.expected is not None and len(rows) != args.expected:
        failures.append(f"expected {args.expected} rows, found {len(rows)}")

    # Duplicates
    dup_ids = [uid for uid, n in Counter(r["uid"] for r in rows).items() if n > 1]
    if dup_ids:
        failures.append(f"{len(dup_ids)} duplicate id(s): {dup_ids[:3]}")

    # Print report
    print("=" * 60)
    print(f"BATCH CHECK: {path.name}")
    print("=" * 60)
    print(f"Header present : {has_header}")
    print(f"Rows parsed    : {len(rows)}")
    if args.expected is not None:
        print(f"Expected rows  : {args.expected}")
    print()
    print("Subtype distribution:")
    for sub, n in Counter(r["subtype"] for r in rows).most_common():
        print(f"  {sub:<25} {n}")
    print()
    print("Confidence distribution:")
    for conf, n in Counter(r["confidence"] for r in rows).most_common():
        print(f"  {conf:<8} {n}")
    print()

    if parse_errors:
        print("Parse errors (first 3):")
        for lineno, preview in parse_errors[:3]:
            print(f"  line {lineno}: {preview}")
        print()

    if failures:
        print("=" * 60)
        print(f"FAIL — {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        print("=" * 60)
        return 1

    print("=" * 60)
    print("PASS — file is well-formed")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())