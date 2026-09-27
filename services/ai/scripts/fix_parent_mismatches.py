#!/usr/bin/env python3
"""Fix subtype-parent mismatches in queue_labeled.csv.

For each row where level2_label's parent tier doesn't match level1_label,
change level2_label to UNLABELED (the safest neutral value).

This runs on the *labeled* batch CSV, before the merge step, so the
fix is applied to the source batch file and persists through the merge.

Usage:
    python scripts/fix_parent_mismatches.py batch_p4_0_labeled.csv

Or run on the merged file after merge:
    python scripts/fix_parent_mismatches.py data/labeling/queue_labeled_test.csv --merged
"""
import argparse
import csv
import sys
from pathlib import Path

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


def main():
    p = argparse.ArgumentParser()
    p.add_argument("path", help="Path to CSV to fix")
    p.add_argument("--merged", action="store_true",
                   help="Set if this is a merged file (uses uid lookup "
                        "against queue_to_label.csv for level1_label)")
    args = p.parse_args()

    path = Path(args.path)
    if not path.exists():
        print(f"[error] not found: {path}")
        return 2

    # If merged file, we need level1_label from queue_to_label.csv via uid
    level1_by_uid = {}
    if args.merged:
        q2l = Path("data/labeling/queue_to_label.csv")
        if not q2l.exists():
            print(f"[error] {q2l} not found")
            return 2
        with q2l.open(encoding="utf-8") as f:
            for r in csv.DictReader(f):
                level1_by_uid[r["uid"]] = r.get("level1_label", "")

    with path.open(encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
        fieldnames = list(rows[0].keys()) if rows else []

    fixed = 0
    for r in rows:
        l2 = (r.get("level2_label") or r.get("suggested_subtype") or "").strip()
        if l2 in ("UNLABELED", ""):
            continue

        if args.merged:
            l1 = level1_by_uid.get(r.get("uid", ""), "")
        else:
            # Batch file: read level1_label if present; else fall back to
            # the parent-tier assumption (batch files don't always include it)
            l1 = r.get("level1_label", "").strip()
            if not l1:
                # We can't verify without level1, so skip
                continue

        expected_parent = PARENT_OF.get(l2)
        if expected_parent and expected_parent != l1:
            # Mismatch: change level2 to UNLABELED
            key = "level2_label" if "level2_label" in r else "suggested_subtype"
            r[key] = "UNLABELED"
            if "review_notes" in r:
                r["review_notes"] = (
                    f"LLM (manual): {l2} belongs to {expected_parent}, "
                    f"not {l1} -> UNLABELED"
                )
            fixed += 1

    # Write back
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    print(f"Fixed {fixed} mismatched row(s) in {path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())