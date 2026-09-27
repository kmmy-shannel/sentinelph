#!/usr/bin/env python3
"""Build the master training set from queue_labeled.csv.

Reads data/labeling/queue_labeled.csv (the merged LLM-labeled queue) and
produces data/processed/master_training_set.csv with columns:

    text, level1_label, level2_label, source_file, review_notes

Rows where level2_label == "UNLABELED" are excluded from the training set
(they're still in queue_labeled.csv for future relabeling).

Usage (from services/ai/):
    python scripts/build_master.py

Exit codes:
    0 - success
    1 - setup error (missing input, malformed columns)
"""
import argparse
import sys
from pathlib import Path

import pandas as pd

AI_ROOT = Path(__file__).resolve().parent.parent
QUEUE_LABELED = AI_ROOT / "data" / "labeling" / "queue_labeled.csv"
MASTER_OUT = AI_ROOT / "data" / "processed" / "master_training_set.csv"

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
    p.add_argument("--input", default=str(QUEUE_LABELED))
    p.add_argument("--output", default=str(MASTER_OUT))
    args = p.parse_args()

    input_path = Path(args.input)
    output_path = Path(args.output)

    if not input_path.exists():
        print(f"[error] input not found: {input_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} rows from {input_path.name}")

    required = {"text", "level1_label", "level2_label"}
    missing = required - set(df.columns)
    if missing:
        print(f"[error] missing columns: {sorted(missing)}", file=sys.stderr)
        return 1

    # Drop nulls and rows with empty text
    df = df.dropna(subset=["text", "level1_label", "level2_label"]).copy()
    df = df[df["text"].astype(str).str.strip() != ""]

    # Ensure a source_file column exists
    if "source_file" not in df.columns:
        if "source" in df.columns:
            df["source_file"] = df["source"]
        else:
            df["source_file"] = "unknown"

    # Ensure review_notes exists
    if "review_notes" not in df.columns:
        df["review_notes"] = ""

    before = len(df)

    # Enforce subtype-parent consistency (extra safety; fix_parent_mismatches
    # should already have handled this, but double-check).
    mismatches = df[
        (df["level2_label"] != "UNLABELED")
        & (df.apply(lambda r: PARENT_OF.get(r["level2_label"]) != r["level1_label"], axis=1))
    ]
    if len(mismatches) > 0:
        print(f"[warning] {len(mismatches)} subtype-parent mismatches — downgrading to UNLABELED")
        df.loc[mismatches.index, "level2_label"] = "UNLABELED"

    # Drop UNLABELED
    df = df[df["level2_label"] != "UNLABELED"].copy()

    # Deduplicate by text
    df = df.drop_duplicates(subset=["text"], keep="first")

    print(f"Total after dropping UNLABELED and dedup: {len(df)} (was {before})")
    print()

    # Keep only the columns we need
    keep = ["text", "level1_label", "level2_label", "source_file", "review_notes"]
    for c in keep:
        if c not in df.columns:
            df[c] = ""
    df = df[keep]

    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False, encoding="utf-8")
    print(f"Wrote {len(df)} rows to {output_path}")
    print()

    print("=== Distribution by level1_label ===")
    print(df["level1_label"].value_counts())
    print()

    print("=== Distribution by level2_label ===")
    print(df["level2_label"].value_counts())
    print()

    print("=== Distribution by level1 + level2 ===")
    print(df.groupby(["level1_label", "level2_label"]).size())

    return 0


if __name__ == "__main__":
    sys.exit(main())