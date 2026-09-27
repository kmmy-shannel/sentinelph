#!/usr/bin/env python3
"""Find the extra must_not_flip example that should not be locked.

Expected count is 28. If the regression suite has more, this script
lists all locked examples by subtype so you can spot the outlier.
"""
import json
from collections import Counter
from pathlib import Path

SUITE = Path(__file__).resolve().parent.parent / "tests" / "regression_suite.json"
suite = json.loads(SUITE.read_text(encoding="utf-8"))

locked = [ex for ex in suite["examples"] if ex.get("must_not_flip")]

print(f"Total must_not_flip: {len(locked)} (expected 28)")
print()

# Counts by subtype
counts = Counter(ex["expected_level2"] for ex in locked)
print("By subtype:")
for sub, n in sorted(counts.items()):
    print(f"  {sub:<25} {n}")
print()

# All locked examples, sorted by subtype then id
print("All locked examples:")
print(f"  {'id':<10} {'subtype':<25} {'text'}")
print(f"  {'-'*10} {'-'*25} {'-'*60}")
for ex in sorted(locked, key=lambda e: (e["expected_level2"], e["id"])):
    text = ex["text"][:60].replace("\n", " ")
    print(f"  {ex['id']:<10} {ex['expected_level2']:<25} {text}")