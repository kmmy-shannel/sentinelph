"""build_3class_dataset.py — merge all SentinelPH sources into 3-class."""
import json
from pathlib import Path
import pandas as pd

CUSTOM = Path("data/custom")
OUT = Path("data/processed/combined_dataset_3class.csv")
TWO_CLASS_MAP = {"likely_legitimate": 0, "likely_scam": 2}
frames = []

# 1. New 3-class CSVs
for f in ["ph_spam_marketing_labeled.csv", "tagalog_sms_labeled.csv"]:
    df = pd.read_csv(CUSTOM / f)[["text", "label"]].copy()
    df["label"] = df["label"].astype(int)
    df["source"] = f.replace("_labeled.csv", "")
    frames.append(df)
    print(f"[1] {f}: {len(df)} rows")

# 2. Old 2-class JSONs
for f, src in [("ph_bank_phishing.json", "ph_bank_phishing"),
               ("custom_scam_dataset.json", "sentinelph_manual")]:
    with open(CUSTOM / f, encoding="utf-8") as fh:
        d = json.load(fh)
    df = pd.DataFrame(d)[["text", "label"]]
    df["label"] = df["label"].map(TWO_CLASS_MAP)
    df["source"] = src
    frames.append(df)
    print(f"[2] {f}: {len(df)} rows")

# 3. Old combined, drop UCI
old = pd.read_csv("data/processed/combined_dataset.csv")
before = len(old)
old = old[old["source"] != "sms_spam_collection"].copy()
print(f"[3] Dropped {before - len(old)} UCI rows, kept {len(old)}")
old = old[["text", "label", "source"]]
old["label"] = old["label"].map(TWO_CLASS_MAP)
frames.append(old)

# 4. Merge + dedup (new labels win)
merged = pd.concat(frames, ignore_index=True)
before = len(merged)
merged = merged.drop_duplicates(subset=["text"], keep="first")
print(f"\n[4] Before dedup: {before}, after: {len(merged)}")

# 5. Schema normalization
merged["ocr_used"] = False
merged = merged[["text", "label", "source", "ocr_used"]]

# 6. Report
print("\n=== Final class balance ===")
print(merged["label"].value_counts().sort_index().rename(
    {0: "0 legitimate", 1: "1 grey_area", 2: "2 malicious"}))
print("\n=== By source + label ===")
print(merged.groupby(["source", "label"]).size())

merged.to_csv(OUT, index=False, encoding="utf-8")
print(f"\nWrote {len(merged)} rows -> {OUT}")