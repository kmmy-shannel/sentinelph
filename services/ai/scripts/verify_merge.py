#!/usr/bin/env python3
"""Bulk-verify a merged queue_labeled.csv.

Runs automated checks on ALL reviewed rows, not just 10. Prints a
report. Exits 0 if all checks pass, 1 otherwise.

Usage:
    python scripts/verify_merge.py
    python scripts/verify_merge.py data/labeling/queue_labeled.csv

Checks:
  1. Every reviewed row has a level2_label that's a valid subtype or UNLABELED
  2. Every reviewed row has review_notes starting with "LLM ("
  3. Level 2 subtype belongs to the correct Level 1 tier (parent check)
  4. No reviewed row is missing its uid
  5. No duplicate uids in the file
  6. Prints per-subtype and per-tier counts
"""
from __future__ import annotations

import sys
from collections import Counter
from pathlib import Path

import pandas as pd

# Subtype → parent Level 1 tier mapping (9-subtype scope)
PARENT_OF = {
    "personal_conversational": "legitimate",
    "two_factor_auth": "legitimate",
    "appointment_reminder": "legitimate",
    "delivery_tracking": "legitimate",
    "bank_activity_alert": "legitimate",
    "brand_marketing": "grey_area",
    "phishing_link": "malicious",
    "urgent_fine_toll": "malicious",
    "fake_prize_lottery": "malicious",
}
ALLOWED = set(PARENT_OF.keys()) | {"UNLABELED"}


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 \
        else Path("data/labeling/queue_labeled_test.csv")

    if not path.exists():
        print(f"[error] file not found: {path}")
        return 1

    df = pd.read_csv(path)
    failures = []

    if "human_reviewed" not in df.columns:
        print(f"[error] {path} has no human_reviewed column")
        return 1

    # Pandas reads "True" as bool True and "False" as bool False automatically
    reviewed = df[df["human_reviewed"] == True].copy()

    print("=" * 60)
    print(f"BULK VERIFY: {path.name}")
    print("=" * 60)
    print(f"Total rows in file : {len(df)}")
    print(f"Reviewed rows      : {len(reviewed)}")
    print()

    if len(reviewed) == 0:
        print("[FAIL] no rows reviewed — nothing to verify")
        return 1

    # --- Check 1: valid subtypes ---
    if "level2_label" not in reviewed.columns:
        failures.append("no level2_label column")
    else:
        bad_subtypes = reviewed[~reviewed["level2_label"].isin(ALLOWED)]
        if len(bad_subtypes) > 0:
            failures.append(
                f"{len(bad_subtypes)} rows with invalid level2_label: "
                f"{sorted(bad_subtypes['level2_label'].dropna().unique())}"
            )

    # --- Check 2: review_notes format ---
    if "review_notes" in reviewed.columns:
        notes = reviewed["review_notes"].fillna("").astype(str)
        bad_notes = reviewed[~notes.str.startswith("LLM (")]
        if len(bad_notes) > 0:
            failures.append(
                f"{len(bad_notes)} reviewed rows with malformed review_notes "
                f"(should start with 'LLM (')"
            )
    else:
        failures.append("no review_notes column")

    # --- Check 3: subtype-parent consistency ---
    if "level1_label" in reviewed.columns and "level2_label" in reviewed.columns:
        def parent_mismatch(r):
            l2 = r["level2_label"]
            if l2 == "UNLABELED" or pd.isna(l2):
                return False
            return PARENT_OF.get(l2) != r["level1_label"]

        mismatches = reviewed[reviewed.apply(parent_mismatch, axis=1)]
        if len(mismatches) > 0:
            sample = mismatches[["uid", "level1_label", "level2_label"]] \
                .head(3).to_dict("records")
            failures.append(
                f"{len(mismatches)} subtype-parent mismatches (e.g. {sample})"
            )

    # --- Check 4: missing uid ---
    if "uid" in reviewed.columns:
        missing = reviewed[reviewed["uid"].isna() | (reviewed["uid"] == "")]
        if len(missing) > 0:
            failures.append(f"{len(missing)} rows missing uid")
    else:
        failures.append("no uid column")

    # --- Check 5: duplicate uid ---
    if "uid" in df.columns:
        dupes = [u for u, n in Counter(df["uid"].dropna()).items() if n > 1]
        if dupes:
            failures.append(
                f"{len(dupes)} duplicate uid(s) in file: {dupes[:3]}"
            )

    # --- Summary: reviewed rows by subtype ---
    if "level2_label" in reviewed.columns:
        print("Reviewed rows by subtype:")
        for sub, n in reviewed["level2_label"].value_counts().items():
            print(f"  {sub:<25} {n}")
        print()

    # --- Summary: reviewed rows by Level 1 tier ---
    if "level1_label" in reviewed.columns:
        print("Reviewed rows by Level 1 tier:")
        for tier, n in reviewed["level1_label"].value_counts().items():
            print(f"  {tier:<25} {n}")
        print()

    # --- Summary: confidence distribution from review_notes ---
    if "review_notes" in reviewed.columns:
        notes = reviewed["review_notes"].fillna("").astype(str)
        confs = notes.str.extract(r"LLM \((\w+)\)")[0].dropna()
        if len(confs) > 0:
            print("Confidence distribution (from review_notes):")
            for conf, n in confs.value_counts().items():
                print(f"  {conf:<8} {n}")
            print()

    # --- Final verdict ---
    print("=" * 60)
    if failures:
        print(f"FAIL — {len(failures)} issue(s):")
        for f in failures:
            print(f"  - {f}")
        print("=" * 60)
        return 1

    print(f"PASS — {len(reviewed)} reviewed rows all valid")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    sys.exit(main())