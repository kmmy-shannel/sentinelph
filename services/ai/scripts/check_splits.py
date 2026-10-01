#!/usr/bin/env python3
"""Verify train/val/test splits have no overlapping text."""
import pandas as pd
from pathlib import Path

base = Path("data/processed")
train = pd.read_csv(base / "train_l2.csv")
val = pd.read_csv(base / "val_l2.csv")
test = pd.read_csv(base / "test_l2.csv")

train_text = set(train["text"])
val_text = set(val["text"])
test_text = set(test["text"])

print(f"train: {len(train_text)} unique texts")
print(f"val:   {len(val_text)} unique texts")
print(f"test:  {len(test_text)} unique texts")
print()
print(f"train ∩ val:  {len(train_text & val_text)}")
print(f"train ∩ test: {len(train_text & test_text)}")
print(f"val ∩ test:   {len(val_text & test_text)}")
print()

if train_text & val_text or train_text & test_text or val_text & test_text:
    print("[FAIL] cross-split overlap detected")
    raise SystemExit(1)
print("[PASS] zero cross-split overlap")