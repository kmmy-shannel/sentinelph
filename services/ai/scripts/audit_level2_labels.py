#!/usr/bin/env python3
"""Audit the master training set for label quality issues.

Reads data/processed/master_training_set.csv and runs five checks:

  1. Class balance — warn on very thin subtypes (<20 rows)
  2. Duplicate text with conflicting labels
  3. Subtype-parent consistency (level2 must belong to level1's tier)
  4. Suspicious label patterns — phishing_link without URL, etc.
  5. Reason-field consistency (from review_notes)

Writes flags to data/processed/audit_flags.csv.

Usage (from services/ai/):
    python scripts/audit_level2_labels.py

Exit codes:
    0 - success
    1 - setup error
"""
import argparse
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

AI_ROOT = Path(__file__).resolve().parent.parent
MASTER = AI_ROOT / "data" / "processed" / "master_training_set.csv"
FLAGS_OUT = AI_ROOT / "data" / "processed" / "audit_flags.csv"

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

# Patterns that should appear in the corresponding subtype
SUSPICIOUS_PATTERNS = {
    # phishing_link: URL, TLD-like token, link-word, messenger contact, or verify-CTA
    "phishing_link": re.compile(
        r"https?://"
        r"|\.\w{2,10}\b"
        r"|\b\w+\s(?:com|ph|net|org|info|tv|eu|de|uk|ca|bid|buzz|website|digital|online|store|loan|xyz|top|icu|vip|cc|tk|ml|ga|cf|gq)\b"
        r"|\blink\b|\burl\b"
        r"|\b(?:verify|confirm|update|login|sign|click|visit|claim|reactivate|unlock)\b"
        r"|\b(?:telegram|messenger|fb|facebook|whatsapp|viber)\b"
        r"|\bmsg\s+mo\b|\bmessage\s+me\b|\bchat\s+with\b",
        re.IGNORECASE,
    ),
    # two_factor_auth: numeric code with optional spaces/dashes, or code/pin/otp words
    "two_factor_auth": re.compile(
        r"\b\d[\d\s\-]{2,10}\d\b"
        r"|\b(?:code|pin|otp|password|verification|authentication)\b",
        re.IGNORECASE,
    ),
    # delivery_tracking: courier/parcel words
    "delivery_tracking": re.compile(
        r"\b(?:parcel|package|deliver|track|shipment|courier|rider|ninjavan|lbc|j&t|phlpost|2go|flash|spx|palawan)\b",
        re.IGNORECASE,
    ),
}


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default=str(MASTER))
    p.add_argument("--flags-out", default=str(FLAGS_OUT))
    args = p.parse_args()

    input_path = Path(args.input)
    if not input_path.exists():
        print(f"[error] input not found: {input_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} rows from {input_path.name}")
    print()

    flags = []

    # --- Check 1: class balance ---
    print("=== Check 1: Class balance ===")
    dist = df["level2_label"].value_counts()
    for sub, n in dist.items():
        if n < 20:
            print(f"  [THIN] {sub}: {n} rows")
            flags.append({"audit": "thin_class", "uid": "", "text": "",
                          "reason": f"{sub} has only {n} rows"})
        else:
            print(f"  [OK]   {sub}: {n} rows")
    print()

    # --- Check 2: duplicate text with conflicting labels ---
    print("=== Check 2: Duplicate text with conflicting labels ===")
    dupes = df.groupby("text").filter(lambda g: g["level2_label"].nunique() > 1)
    if len(dupes) > 0:
        print(f"  [FLAG] {len(dupes)} rows involved in conflicting duplicates")
        for text in dupes["text"].unique()[:5]:
            labels = dupes[dupes["text"] == text]["level2_label"].unique().tolist()
            flags.append({"audit": "conflicting_duplicate", "uid": "",
                          "text": text[:80], "reason": f"multiple labels: {labels}"})
    else:
        print("  [OK] no conflicting duplicates")
    print()

    # --- Check 3: subtype-parent consistency ---
    print("=== Check 3: Subtype-parent consistency ===")
    mismatches = df[
        df.apply(lambda r: PARENT_OF.get(r["level2_label"]) != r["level1_label"], axis=1)
    ]
    if len(mismatches) > 0:
        print(f"  [FLAG] {len(mismatches)} rows with mismatched parent")
        for _, r in mismatches.head(5).iterrows():
            flags.append({"audit": "subtype_parent_mismatch", "uid": "",
                          "text": r["text"][:80],
                          "reason": f"{r['level2_label']} not under {r['level1_label']}"})
    else:
        print("  [OK] all subtype-parent consistent")
    print()

    # --- Check 4: suspicious label patterns ---
    print("=== Check 4: Suspicious label patterns ===")
    for sub, pattern in SUSPICIOUS_PATTERNS.items():
        rows = df[df["level2_label"] == sub]
        missing = rows[~rows["text"].astype(str).str.contains(pattern, na=False)]
        if len(missing) > 0:
            print(f"  [FLAG] {sub}: {len(missing)} rows missing expected pattern")
            for _, r in missing.head(3).iterrows():
                flags.append({"audit": f"{sub}_missing_pattern", "uid": "",
                              "text": r["text"][:80],
                              "reason": f"{sub} label without expected pattern"})
        else:
            print(f"  [OK]   {sub}: all rows match expected pattern")
    print()

    # --- Check 5: reason field consistency ---
    print("=== Check 5: review_notes format ===")
    if "review_notes" in df.columns:
        notes = df["review_notes"].fillna("").astype(str)
        # Empty notes = auto-labeled (from bootstrap). Only flag non-empty
        # notes that don't start with "LLM (".
        bad = df[(notes != "") & (~notes.str.startswith("LLM ("))]
        if len(bad) > 0:
            print(f"  [FLAG] {len(bad)} rows with review_notes not starting with 'LLM ('")
        else:
            print("  [OK] all review_notes start with 'LLM ('")
    else:
        print("  [SKIP] no review_notes column")
    print()

    # --- Write flags ---
    if flags:
        flag_df = pd.DataFrame(flags)
        Path(args.flags_out).parent.mkdir(parents=True, exist_ok=True)
        flag_df.to_csv(args.flags_out, index=False, encoding="utf-8")
        print(f"Wrote {len(flags)} flags to {args.flags_out}")
    else:
        print("No audit flags — clean!")

    print()
    print("=== Summary ===")
    print(f"Total rows: {len(df)}")
    print(f"Flag count: {len(flags)}")
    print(f"Thin classes: {sum(1 for f in flags if f['audit'] == 'thin_class')}")
    return 0


if __name__ == "__main__":
    sys.exit(main())