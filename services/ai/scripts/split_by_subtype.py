#!/usr/bin/env python3
"""Stratified train/val/test split of master_training_set.csv by level2_label.

Splits 80/10/10 by default, stratified by level2_label so rare subtypes
appear in all three splits. Writes:

    data/processed/train_l2.csv
    data/processed/val_l2.csv
    data/processed/test_l2.csv

The master set itself (data/processed/master_training_set.csv) is not
modified.

Usage (from services/ai/):
    python scripts/split_by_subtype.py
    python scripts/split_by_subtype.py --dry-run
    python scripts/split_by_subtype.py --min-per-subtype 20

Exit codes:
    0 - success
    1 - setup error
    2 - split error (rare class below min-per-subtype)
"""
import argparse
import sys
from pathlib import Path

import pandas as pd
from sklearn.model_selection import train_test_split

AI_ROOT = Path(__file__).resolve().parent.parent
MASTER = AI_ROOT / "data" / "processed" / "master_training_set.csv"
OUT_DIR = AI_ROOT / "data" / "processed"

SEED = 42


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default=str(MASTER))
    p.add_argument("--out-dir", default=str(OUT_DIR))
    p.add_argument("--seed", type=int, default=SEED)
    p.add_argument("--val-frac", type=float, default=0.10)
    p.add_argument("--test-frac", type=float, default=0.10)
    p.add_argument("--min-per-subtype", type=int, default=20,
                   help="Warn if a subtype has fewer than this many rows.")
    p.add_argument("--dry-run", action="store_true",
                   help="Print summary without writing files.")
    args = p.parse_args()

    input_path = Path(args.input)
    out_dir = Path(args.out_dir)

    if not input_path.exists():
        print(f"[error] input not found: {input_path}", file=sys.stderr)
        return 1

    df = pd.read_csv(input_path)
    print(f"Loaded {len(df)} rows from {input_path.name}")
    print()

    # Shuffle to remove ordering bias
    df = df.sample(frac=1.0, random_state=args.seed).reset_index(drop=True)

    # Check for rare subtypes
    counts = df["level2_label"].value_counts()
    rare = counts[counts < args.min_per_subtype]
    if len(rare) > 0:
        print(f"[warning] {len(rare)} subtype(s) below {args.min_per_subtype} rows:")
        for sub, n in rare.items():
            print(f"  {sub}: {n}")
        print()

    # First split: separate test
    test_size = args.test_frac
    train_val, test = train_test_split(
        df,
        test_size=test_size,
        stratify=df["level2_label"],
        random_state=args.seed,
    )

    # Second split: separate val from train
    # val_frac is relative to the remaining (train_val) set
    val_size_of_trainval = args.val_frac / (1.0 - args.test_frac)
    train, val = train_test_split(
        train_val,
        test_size=val_size_of_trainval,
        stratify=train_val["level2_label"],
        random_state=args.seed,
    )

    print(f"Split sizes: train={len(train)} val={len(val)} test={len(test)}")
    print()

    # Distribution summary
    print("=== Level 2 distribution per split ===")
    for name, sdf in [("train", train), ("val", val), ("test", test)]:
        print(f"\n{name}:")
        for sub, n in sdf["level2_label"].value_counts().items():
            print(f"  {sub:<25} {n:>5}")
    print()

    print("=== Level 1 distribution per split ===")
    for name, sdf in [("train", train), ("val", val), ("test", test)]:
        print(f"\n{name}:")
        for lbl, n in sdf["level1_label"].value_counts().items():
            print(f"  {lbl:<25} {n:>5}")
    print()

    if args.dry_run:
        print("[dry-run] no files written")
        return 0

    out_dir.mkdir(parents=True, exist_ok=True)
    train.to_csv(out_dir / "train_l2.csv", index=False, encoding="utf-8")
    val.to_csv(out_dir / "val_l2.csv", index=False, encoding="utf-8")
    test.to_csv(out_dir / "test_l2.csv", index=False, encoding="utf-8")

    print(f"Wrote {out_dir / 'train_l2.csv'}")
    print(f"Wrote {out_dir / 'val_l2.csv'}")
    print(f"Wrote {out_dir / 'test_l2.csv'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())