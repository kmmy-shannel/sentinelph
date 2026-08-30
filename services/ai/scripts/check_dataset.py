"""
services/ai/scripts/check_dataset.py

Validates services/ai/data/processed/combined_dataset.csv before training.
Run after prepare_dataset.py:

    python scripts/check_dataset.py
"""

import csv
import sys
from collections import Counter
from pathlib import Path

AI_ROOT = Path(__file__).resolve().parents[1]
COMBINED_CSV = AI_ROOT / "data" / "processed" / "combined_dataset.csv"

REQUIRED_COLUMNS = {"id", "text", "label", "source"}
VALID_LABELS = {"likely_scam", "likely_legitimate"}

MIN_RECOMMENDED_SAMPLES = 500       # below this, warn it's "suspiciously tiny"
IMBALANCE_WARN_RATIO = 0.35         # if minority class < 35% of total, warn


def fail(msg: str):
    print(f"[FAIL] {msg}")
    print("\nStatus: FAIL")
    sys.exit(1)


def main():
    if not COMBINED_CSV.exists():
        fail(f"{COMBINED_CSV} does not exist. Run prepare_dataset.py first.")

    with open(COMBINED_CSV, "r", encoding="utf-8", newline="") as f:
        reader = csv.DictReader(f)
        if reader.fieldnames is None or not REQUIRED_COLUMNS.issubset(set(reader.fieldnames)):
            fail(f"Missing required columns. Found: {reader.fieldnames}, "
                 f"required: {sorted(REQUIRED_COLUMNS)}")
        rows = list(reader)

    total = len(rows)
    if total == 0:
        fail("Dataset is empty.")

    empty_texts = 0
    invalid_labels = 0
    label_counter = Counter()
    seen_texts = {}
    duplicate_texts = 0

    for row in rows:
        text = (row.get("text") or "").strip()
        label = (row.get("label") or "").strip()

        if not text:
            empty_texts += 1
        if label not in VALID_LABELS:
            invalid_labels += 1
        else:
            label_counter[label] += 1

        key = text.lower()
        if key in seen_texts:
            duplicate_texts += 1
        else:
            seen_texts[key] = row.get("id")

    scam = label_counter.get("likely_scam", 0)
    legit = label_counter.get("likely_legitimate", 0)
    minority = min(scam, legit) if (scam and legit) else 0
    minority_ratio = (minority / total) if total else 0

    print("## Dataset Validation\n")
    print(f"Total samples: {total:,}\n")
    print(f"likely_scam: {scam:,}")
    print(f"likely_legitimate: {legit:,}\n")
    print(f"Duplicate texts: {duplicate_texts}")
    print(f"Empty texts: {empty_texts}")
    print(f"Invalid/unmapped labels: {invalid_labels}\n")

    problems = []

    if empty_texts > 0:
        problems.append(f"{empty_texts} empty text row(s) found.")
    if invalid_labels > 0:
        problems.append(f"{invalid_labels} row(s) have a label outside {VALID_LABELS}.")
    if duplicate_texts > 0:
        problems.append(f"{duplicate_texts} duplicate text row(s) found — "
                         f"re-run prepare_dataset.py, dedup should have caught this.")
    if total < MIN_RECOMMENDED_SAMPLES:
        problems.append(f"Dataset has only {total} samples — this is suspiciously tiny "
                         f"for training a transformer model reliably (recommended minimum: "
                         f"{MIN_RECOMMENDED_SAMPLES}+).")
    if scam == 0 or legit == 0:
        problems.append("One of the two classes has zero samples.")
    elif minority_ratio < IMBALANCE_WARN_RATIO:
        problems.append(f"Class imbalance detected: minority class is only "
                         f"{minority_ratio:.1%} of the dataset (warn threshold: "
                         f"{IMBALANCE_WARN_RATIO:.0%}).")

    balance_status = "GOOD" if (scam and legit and minority_ratio >= IMBALANCE_WARN_RATIO) else "WARNING"
    print(f"Class balance: {balance_status}")

    if problems:
        print("\n[WARNINGS]")
        for p in problems:
            print(f" - {p}")

    hard_fail = empty_texts > 0 or invalid_labels > 0 or duplicate_texts > 0 or scam == 0 or legit == 0

    if hard_fail:
        print("\nStatus: FAIL")
        sys.exit(1)
    else:
        print("\nStatus: PASS" + (" (with warnings — review above)" if problems else ""))


if __name__ == "__main__":
    main()
