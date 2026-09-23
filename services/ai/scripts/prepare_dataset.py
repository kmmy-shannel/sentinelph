"""
services/ai/scripts/prepare_dataset.py

Loads the pre-built 3-class dataset (data/processed/combined_dataset_3class.csv)
and produces normalized train/val/test splits for model training.

This script no longer scans raw or custom datasets directly — that work is done
by scripts/build_3class_dataset.py. This script's job is:
  1. Read combined_dataset_3class.csv
  2. Normalize text (via app.utils.text_normalize)
  3. Deduplicate by normalized text hash
  4. Split train/val/test with stratification on the 3 classes
  5. Write data/processed/train.csv, val.csv, test.csv

Classes:
  0 = legitimate
  1 = grey_area
  2 = malicious

Run from services/ai/ with the venv active:
    python scripts/prepare_dataset.py
"""

import csv
import hashlib
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

# --- paths -------------------------------------------------------------
AI_ROOT = Path(__file__).resolve().parents[1]          # services/ai
DATA_DIR = AI_ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
INPUT_CSV = PROCESSED_DIR / "combined_dataset_3class.csv"

TRAIN_CSV = PROCESSED_DIR / "train.csv"
VAL_CSV = PROCESSED_DIR / "val.csv"
TEST_CSV = PROCESSED_DIR / "test.csv"

LABEL_NAMES = {0: "legitimate", 1: "grey_area", 2: "malicious"}

sys.path.insert(0, str(AI_ROOT))
try:
    from app.utils.text_normalize import normalize_text
except ImportError:
    print("[WARN] Could not import app.utils.text_normalize.normalize_text — "
          "falling back to minimal whitespace normalizer.")

    def normalize_text(text: str) -> str:
        return " ".join(str(text).strip().split())


def sha256_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        print(f"[ERROR] Input dataset not found at {path}")
        print("        Run scripts/build_3class_dataset.py first.")
        sys.exit(1)

    df = pd.read_csv(path)
    required = {"text", "label"}
    missing = required - set(df.columns)
    if missing:
        print(f"[ERROR] Missing required columns in {path}: {missing}")
        sys.exit(1)

    df = df[["text", "label"] + ([c for c in ["source", "ocr_used"] if c in df.columns])].copy()
    df["label"] = df["label"].astype(int)

    invalid = df[~df["label"].isin([0, 1, 2])]
    if len(invalid) > 0:
        print(f"[ERROR] Found {len(invalid)} rows with labels outside {{0,1,2}}: "
              f"{sorted(invalid['label'].unique())}")
        sys.exit(1)

    print(f"[INFO] Loaded {len(df)} records from {path.name}")
    print(f"[INFO] Raw class balance:")
    for lbl, count in sorted(df["label"].value_counts().items()):
        print(f"    {lbl} {LABEL_NAMES[lbl]}: {count}")

    return df


def normalize_and_dedup(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df["text"] = df["text"].astype(str).map(normalize_text)

    before = len(df)
    df = df[df["text"].str.strip().str.len() > 0]
    empty_removed = before - len(df)

    df["_hash"] = df["text"].str.strip().str.lower().map(sha256_of)
    before = len(df)
    df = df.drop_duplicates(subset=["_hash"], keep="first").drop(columns=["_hash"])
    dup_removed = before - len(df)

    print(f"[INFO] Empty rows removed:      {empty_removed}")
    print(f"[INFO] Duplicate rows removed:  {dup_removed}")
    print(f"[INFO] Records after cleaning:  {len(df)}")

    return df


def split_and_save(df: pd.DataFrame):
    # 80/10/10 stratified split — class 1 (grey) must appear in all splits.
    train_df, temp_df = train_test_split(
        df, test_size=0.20, random_state=42, stratify=df["label"]
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, random_state=42, stratify=temp_df["label"]
    )

    for name, split_df in [("train", train_df), ("val", val_df), ("test", test_df)]:
        out_path = PROCESSED_DIR / f"{name}.csv"
        split_df = split_df.reset_index(drop=True)
        split_df.insert(0, "id", range(1, len(split_df) + 1))
        split_df.to_csv(out_path, index=False, encoding="utf-8")

        print(f"\n[INFO] {name}: {len(split_df)} rows -> {out_path.name}")
        for lbl, count in sorted(split_df["label"].value_counts().items()):
            pct = 100 * count / len(split_df)
            print(f"    {lbl} {LABEL_NAMES[lbl]}: {count} ({pct:.1f}%)")


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    df = load_dataset(INPUT_CSV)
    df = normalize_and_dedup(df)

    if len(df) == 0:
        print("[ERROR] No records after cleaning. Aborting.")
        sys.exit(1)

    split_and_save(df)

    total = len(df)
    print("\n===== prepare_dataset.py report =====")
    print(f"Total cleaned records:      {total}")
    for lbl in sorted(df["label"].unique()):
        count = (df["label"] == lbl).sum()
        print(f"{LABEL_NAMES[lbl]:<12} ({lbl}):      {count}")
    print(f"Output directory:           {PROCESSED_DIR}")
    print("======================================\n")


if __name__ == "__main__":
    main()