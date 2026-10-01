#!/usr/bin/env python3
"""Report uids in batch files that don't exist in queue_to_label.csv."""
import csv
import glob
from pathlib import Path


def load_source_uids(path="data/labeling/queue_to_label.csv"):
    uids = set()
    with open(path, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            uids.add(r["uid"])
    return uids


def main():
    source_uids = load_source_uids()
    print(f"Source has {len(source_uids)} uids")
    print()

    for path in sorted(glob.glob("batch_p*_labeled.csv")):
        unknown = []
        with open(path, encoding="utf-8") as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith("#") or line.lower().startswith("id,"):
                    continue
                parts = line.split(",", 3)
                if len(parts) < 4:
                    continue
                uid = parts[0].strip().strip('"')
                if uid.startswith("q_") and uid not in source_uids:
                    unknown.append(uid)
        if unknown:
            print(f"{path}: {len(unknown)} unknown uid(s)")
            for u in unknown:
                print(f"  {u}")


if __name__ == "__main__":
    main()