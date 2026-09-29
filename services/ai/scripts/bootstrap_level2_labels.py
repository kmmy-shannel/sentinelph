#!/usr/bin/env python3
"""Bootstrap Level 2 subtype labels for SentinelPH training data.

Reads the pre-dedup combined dataset, applies ordered regex rules to
auto-label the obvious cases, and writes:

  data/labeling/bootstrapped.csv    -- all rows with auto-labels + confidence
  data/labeling/queue_to_label.csv  -- rows needing human review
  data/labeling/bootstrap_summary.txt -- readable summary

Scope: 9 Level 2 subtypes across 3 Level 1 tiers.

  legitimate : personal_conversational, two_factor_auth,
               appointment_reminder, delivery_tracking, bank_activity_alert
  grey_area  : brand_marketing
  malicious  : phishing_link, urgent_fine_toll, fake_prize_lottery

Four subtypes from an earlier iteration (wrong_number_baiting,
impersonation_family, political_campaign, charity_appeal) were dropped
because the training data contains no examples of these patterns.

Rows where no rule fires get level2_label = "UNLABELED" and go to the
human review queue. Rows where a rule fires with only one match get
"medium" confidence and also go to the queue. Rows with 2+ rule matches
get "high" confidence and skip human review (still audited in Step 2.4).

Usage (from services/ai/):
    python scripts/bootstrap_level2_labels.py
    python scripts/bootstrap_level2_labels.py --input data/processed/combined_dataset_3class.csv

Exit codes:
    0 - success
    1 - setup error (missing input, malformed columns)
"""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import pandas as pd

AI_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INPUT = AI_ROOT / "data" / "processed" / "combined_dataset_3class.csv"
LABELING_DIR = AI_ROOT / "data" / "labeling"

LEVEL1_MAP = {0: "legitimate", 1: "grey_area", 2: "malicious"}

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

# Rules are (level2_label, parent_level1, [patterns], min_matches).
# Order matters: most specific first. A row that matches both a
# phishing_link rule and a delivery_tracking rule gets phishing_link.
RULES = [
    # --- MALICIOUS (highest priority) ---
    ("phishing_link", "malicious", [
        r"\.(life|xyz|top|icu|info|click|link|online|site|tw|cc|tk|ml|ga|cf|gq|vip)\b",
        r"\b\w+-(secure|verify|update|login|track|confirm|alert|care|support|help)\b",
        r"\b(bit\.ly|tinyurl|t\.co|is\.gd|ow\.ly|goo\.gl|rebrand\.ly)\b",
        r"\b(verify|confirm|update|login|sign[- ]?in|click|visit|claim|activate)\b.{0,60}https?://",
    ], 1),

    ("urgent_fine_toll", "malicious", [
        r"\b(unpaid|violation|fine|toll|penalty|summon|arrest|warrant|suspension|delinquen)\w*\b",
        r"\b(lto|mmda|ltfrb|nlex|slex|bir|nbi|pnp|police|meralco)\b",
        r"\b(within 24 hours|immediately|final notice|legal action|court|huli|multa)\b",
    ], 1),

    ("fake_prize_lottery", "malicious", [
        r"\b(won|winner|prize|raffle|lottery|congratulation|congrats|claim)\w*\b",
        r"\b(processing fee|shipping fee|claim fee|send.{0,30}(gcash|maya|load))\b",
        r"\b(nanalo|premyo|panalo)\b",
    ], 1),

    # --- LEGITIMATE ---
       ("two_factor_auth", "legitimate", [
        r"\b(otp|one[- ]time (pin|password|code)|authentication code|verification code)\b",
        r"\bdo not share|never share|don'?t share\b",
        r"\b\d{4,8}\b.{0,40}\b(code|pin|password|otp)\b",
    ], 1),   # was 2

    ("delivery_tracking", "legitimate", [
        r"\b(tracking|parcel|package|delivery|out for delivery|shipment|courier)\b",
        r"\b(lazada|shopee|phlpost|lbc|j&t|jnt|ninjavan|2go|flash express|spx|grab express)\b",
        r"\b(shipped|delivered|arrived|on the way|out for delivery)\b",
    ], 1),   # was 2

    ("bank_activity_alert", "legitimate", [
        r"\b(debited|credited|transaction|balance|account ending|sent PHP|received PHP|cashed in)\b",
        r"\b(bdo|bpi|metrobank|landbank|gcash|maya|unionbank|rcbc|security bank|chinabank|gotyme)\b",
    ], 1),   # was 2

    ("appointment_reminder", "legitimate", [
        r"\b(appointment|schedule[d]?|reminder|reschedule|cancel)\b",
        r"\b(dr\.?|doctor|dentist|clinic|hospital|salon|repair|checkup|check[- ]?up)\b",
    ], 1),   # was 2
    ("personal_conversational", "legitimate", [
        r"^(hi|hello|hey|kumusta|kamusta|uy|oi|hoy)\b",
        r"\b(kita|kits|see you|ingat|ingatz|miss na kita|musta|kumain ka na)\b",
    ], 1),

    # --- GREY AREA ---
    ("brand_marketing", "grey_area", [
        r"\b(promo|discount|off|sale|cashback|voucher|coupon|code|deal|enroll|avail)\b",
        r"\b(grab|shopee|lazada|bdo|bpi|gcash|maya|smart|globe|tnt|jollibee|sm|robinsons|gomo)\b",
        r"\b(limited time|exclusive|offer|promo)\b",
    ], 1),
]


def apply_rules(text: str, level1_name: str) -> tuple:
    """Return (level2_label, confidence, matched_rules).

    Confidence:
        high   -> 2+ distinct patterns matched
        medium -> exactly 1 pattern matched
        none   -> no rule fired (level2_label = UNLABELED)
    """
    if not isinstance(text, str) or not text.strip():
        return ("UNLABELED", "none", [])

    t = text.lower()

    for label, parent, patterns, min_matches in RULES:
        if parent != level1_name:
            continue
        hits = [p for p in patterns if re.search(p, t, re.IGNORECASE)]
        if len(hits) >= min_matches:
            if len(hits) >= 2:
                confidence = "high"
            else:
                confidence = "medium"
            return (label, confidence, hits)

    return ("UNLABELED", "none", [])


def parse_args() -> argparse.Namespace:
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--input", default=str(DEFAULT_INPUT),
                   help="Pre-dedup combined dataset CSV.")
    p.add_argument("--output-dir", default=str(LABELING_DIR),
                   help="Directory to write bootstrapped + queue CSVs.")
    return p.parse_args()


def main() -> int:
    args = parse_args()
    input_path = Path(args.input)
    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)

    if not input_path.exists():
        print(f"[error] input not found: {input_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(input_path)
    required = {"text", "label"}
    missing = required - set(df.columns)
    if missing:
        print(f"[error] input missing columns: {sorted(missing)}", file=sys.stderr)
        return 1

    print(f"Loaded {len(df)} rows from {input_path.name}")

    df["level1_label"] = df["label"].map(LEVEL1_MAP)

    print("Applying rules...")
    results = df.apply(
        lambda r: apply_rules(r["text"], r["level1_label"]), axis=1
    )
    df["level2_label"] = [r[0] for r in results]
    df["bootstrap_confidence"] = [r[1] for r in results]
    df["matched_rules"] = [str(r[2])[:200] for r in results]

    # Subtype-parent consistency: if the rule somehow gave a level2 whose
    # parent doesn't match level1, downgrade to UNLABELED.
    mismatches = df.apply(
        lambda r: (
            r["level2_label"] != "UNLABELED"
            and PARENT_OF.get(r["level2_label"]) != r["level1_label"]
        ),
        axis=1,
    )
    if mismatches.any():
        n = int(mismatches.sum())
        print(f"[warning] {n} subtype-parent mismatches — downgraded to UNLABELED")
        df.loc[mismatches, "level2_label"] = "UNLABELED"
        df.loc[mismatches, "bootstrap_confidence"] = "none"

    # Write outputs
    boot_path = out_dir / "bootstrapped.csv"
    queue_path = out_dir / "queue_to_label.csv"
    summary_path = out_dir / "bootstrap_summary.txt"

    df.to_csv(boot_path, index=False, encoding="utf-8")
    queue = df[df["bootstrap_confidence"] != "high"].copy()
    queue.to_csv(queue_path, index=False, encoding="utf-8")

    # Summary
    lines = []
    lines.append(f"Total rows: {len(df)}")
    lines.append("")
    lines.append("=== By confidence ===")
    for conf in ["high", "medium", "none"]:
        n = int((df["bootstrap_confidence"] == conf).sum())
        pct = n / len(df) * 100
        lines.append(f"  {conf:<8} {n:>6} ({pct:5.1f}%)")
    lines.append("")
    lines.append("=== By level2_label ===")
    for label, n in df["level2_label"].value_counts().items():
        lines.append(f"  {label:<25} {n:>6}")
    lines.append("")
    lines.append(f"Human review queue: {len(queue)} rows -> {queue_path.name}")

    summary = "\n".join(lines)
    summary_path.write_text(summary, encoding="utf-8")
    print()
    print(summary)
    print(f"\nWrote: {boot_path}")
    print(f"Wrote: {queue_path}")
    print(f"Wrote: {summary_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())