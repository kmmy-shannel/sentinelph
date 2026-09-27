#!/usr/bin/env python3
"""Verify that a merge output has labels applied to the CORRECT rows.

Reads data/labeling/queue_labeled_test.csv (or a path you pass),
prints the first 5 reviewed rows with uid, text, and level2_label.

You should see the texts from the batch you just labeled — NOT
unrelated rows. If you see unrelated rows, the id-matching is broken.

Usage:
    python scripts/check_merge.py
    python scripts/check_merge.py data/labeling/queue_labeled.csv
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas as pd


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 \
        else Path("data/labeling/queue_labeled_test.csv")

    if not path.exists():
        print(f"[error] file not found: {path}")
        return 1

    df = pd.read_csv(path)
    if "human_reviewed" not in df.columns:
        print(f"[error] {path} has no human_reviewed column")
        return 1

    reviewed = df[df["human_reviewed"] == True]
    print(f"Total rows in file : {len(df)}")
    print(f"Rows reviewed      : {len(reviewed)}")
    print()

    if len(reviewed) == 0:
        print("[FAIL] no rows reviewed — merge didn't apply any labels")
        return 1

    # Show first 10 reviewed rows
    cols = [c for c in ["uid", "text", "level2_label", "review_notes"]
            if c in reviewed.columns]
    preview = reviewed[cols].head(10)
    for _, r in preview.iterrows():
        text = str(r["text"])[:100] + ("..." if len(str(r["text"])) > 100 else "")
        print(f"[{r.get('uid', '?')}] {r.get('level2_label', '?')}")
        print(f"  text: {text}")
        print(f"  note: {r.get('review_notes', '')[:80]}")
        print()

    return 0


if __name__ == "__main__":
    sys.exit(main())