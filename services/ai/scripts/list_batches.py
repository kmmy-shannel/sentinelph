#!/usr/bin/env python3
"""List all batch_*_labeled.csv files and count rows."""
import csv
import glob

files = sorted(glob.glob("batch_p*_labeled.csv"))
if not files:
    print("No batch files found.")
    raise SystemExit(0)

for f in files:
    try:
        with open(f, encoding="utf-8") as fh:
            reader = csv.DictReader(fh)
            fieldnames = reader.fieldnames or []
            rows = list(reader)
        print(f"{f}: {len(rows)} rows, columns={fieldnames}")
    except Exception as e:
        print(f"{f}: ERROR — {e}")