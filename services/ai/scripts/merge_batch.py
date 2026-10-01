#!/usr/bin/env python3
"""Merge LLM-labeled batches into queue_labeled.csv.

Matches by `uid` (q_00000, ...), not by positional index. This ensures
that filtering during export (P1/P2/etc.) doesn't scramble the mapping.

Handles batch CSVs that:
  - Have or lack a header row
  - Quote or don't quote fields
  - Contain commas inside the reason field
"""
import argparse
import csv
import glob
from pathlib import Path


def parse_batch_line(line: str):
    """Return (uid, subtype, confidence, reason) or None."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if line.startswith("id,"):
        return None
    parts = line.split(",", 3)
    if len(parts) < 4:
        return None
    uid = parts[0].strip().strip('"')
    if not uid.startswith("q_"):
        return None
    return (
        uid,
        parts[1].strip().strip('"'),
        parts[2].strip().strip('"'),
        parts[3].strip().strip('"'),
    )


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--source", required=True)
    p.add_argument("--batches", nargs="+", required=True)
    p.add_argument("--output", default="data/labeling/queue_labeled.csv")
    args = p.parse_args()

    with open(args.source, newline="", encoding="utf-8") as f:
        source = list(csv.DictReader(f))

    for i, r in enumerate(source):
        r.setdefault("uid", f"q_{i:05d}")
        r.setdefault("human_reviewed", "False")
        r.setdefault("review_notes", "")

    by_uid = {r["uid"]: r for r in source}

       # Expand any shell-style globs in the batch arguments
    # (PowerShell doesn't do this automatically).
    expanded = []
    for pattern in args.batches:
        matches = glob.glob(pattern)
        if matches:
            expanded.extend(sorted(matches))
        else:
            expanded.append(pattern)  # keep as-is so the error is clear

    if not expanded:
        print("[error] no batch files matched")
        return 1

    print(f"Expanded to {len(expanded)} file(s):")
    for f in expanded:
        print(f"  {f}")

    merged = 0
    skipped = 0
    unknown = 0
    for bp in expanded:
        with open(bp, newline="", encoding="utf-8") as f:
            for line in f:
                parsed = parse_batch_line(line)
                if not parsed:
                    s = line.strip()
                    if s and not s.startswith("#") and not s.startswith("id,"):
                        skipped += 1
                    continue
                uid, subtype, confidence, reason = parsed
                if uid not in by_uid:
                    unknown += 1
                    continue
                r = by_uid[uid]
                r["level2_label"] = subtype
                r["human_reviewed"] = "True"
                r["review_notes"] = f"LLM ({confidence}): {reason}"
                merged += 1

    base_fields = list(source[0].keys()) if source else []
    for col in ["human_reviewed", "review_notes"]:
        if col not in base_fields:
            base_fields.append(col)

    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    with out.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=base_fields)
        w.writeheader()
        for r in source:
            w.writerow({k: r.get(k, "") for k in base_fields})

    print(f"Merged {merged} labeled rows into {args.output}")
    if skipped:
        print(f"Skipped {skipped} unparseable lines")
    if unknown:
        print(f"WARNING: {unknown} labels had unknown uid (source out of sync?)")


if __name__ == "__main__":
    main()