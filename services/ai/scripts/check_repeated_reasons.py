#!/usr/bin/env python3
"""Flag batches where many rows share the exact same reason text.

Handles both headerless and headered CSV files (positional parsing).

Usage:
    python scripts/check_repeated_reasons.py batch_pX_N_labeled.csv
    python scripts/check_repeated_reasons.py data/labeling/queue_labeled.csv
"""
import sys
from collections import Counter
from pathlib import Path


def parse_line(line):
    """Return (uid, subtype, confidence, reason) or None."""
    line = line.strip()
    if not line or line.startswith("#"):
        return None
    if line.lower().startswith("id,"):  # header row — skip
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
    if len(sys.argv) < 2:
        print("Usage: python scripts/check_repeated_reasons.py <csv>")
        return 2

    path = Path(sys.argv[1])
    if not path.exists():
        print(f"[error] not found: {path}")
        return 2

    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        parsed = parse_line(line)
        if parsed:
            rows.append(parsed)

    reasons = Counter(r[3] for r in rows if r[3])
    print(f"{len(rows)} rows, {len(reasons)} unique reasons")
    print()
    print("Top 10 most-repeated reasons:")
    for reason, n in reasons.most_common(10):
        print(f"  {n:>4}  {reason[:80]}")

    if not reasons:
        print()
        print("No reasons found (empty field?)")
        return 0

    top_reason, top_count = reasons.most_common(1)[0]
    threshold = max(5, int(len(rows) * 0.05))
    if top_count > threshold:
        print()
        print(f"WARNING: {top_count} rows share the reason '{top_reason[:60]}'")
        print(f"   That's {top_count / len(rows) * 100:.1f}% of the batch.")
        print(f"   Threshold is {threshold}. Inspect those rows.")
        return 1

    print()
    print("OK - no excessive reason duplication")
    return 0


if __name__ == "__main__":
    sys.exit(main())