#!/usr/bin/env python3
"""Show phishing_link rows that don't contain a URL."""
import pandas as pd
import re
from pathlib import Path

df = pd.read_csv(Path("data/processed/master_training_set.csv"))
pattern = re.compile(r"https?://|\.\w{2,4}\b|\blink\b", re.IGNORECASE)

phish = df[df["level2_label"] == "phishing_link"]
missing = phish[~phish["text"].astype(str).str.contains(pattern, na=False)]

print(f"{len(missing)} phishing_link rows without URL pattern")
print()
for _, r in missing.head(30).iterrows():
    print(f"  {r['text'][:150]}")