#!/usr/bin/env python3
"""Merge the thin urgent_fine_toll class into phishing_link.

3 examples cannot train a classifier. This script relabels them as
phishing_link so the malicious tier becomes a clean 3-class problem
(phishing_link, fake_prize_lottery, and dropped-urgent_fine_toll).

Update docs/label_taxonomy.md and tests/regression_suite.json after
running this to reflect the 8-subtype scope.
"""
import pandas as pd
from pathlib import Path

MASTER = Path("data/processed/master_training_set.csv")

if not MASTER.exists():
    print(f"[error] not found: {MASTER}")
    raise SystemExit(1)

df = pd.read_csv(MASTER)
before = (df["level2_label"] == "urgent_fine_toll").sum()

if before == 0:
    print("No urgent_fine_toll rows — nothing to merge")
    raise SystemExit(0)

df.loc[df["level2_label"] == "urgent_fine_toll", "level2_label"] = "phishing_link"
df.to_csv(MASTER, index=False, encoding="utf-8")

print(f"Merged {before} urgent_fine_toll row(s) into phishing_link")
print()
print(df["level2_label"].value_counts())