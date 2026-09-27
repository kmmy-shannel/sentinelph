#!/usr/bin/env python3
"""Show specific rows from queue_to_label.csv by uid."""
import csv
import sys

if len(sys.argv) < 2:
    print("Usage: python scripts/show_rows.py q_00126 q_00145 ...")
    sys.exit(1)

want = set(sys.argv[1:])
with open("data/labeling/queue_to_label.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        if r["uid"] in want:
            print(f"[{r['uid']}] level1={r['level1_label']}")
            print(f"  text: {r['text']}")
            print()