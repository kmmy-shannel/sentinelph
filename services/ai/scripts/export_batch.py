#!/usr/bin/env python3
"""Export a batch of rows from queue_to_label.csv for LLM labeling.

Uses a stable `uid` column (q_00000, q_00001, ...) so merge_batch.py
can reliably match labels back to source rows regardless of filtering.
"""
import argparse
import csv
import sys

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")


def priority_of(r):
    l1, l2 = r.get("level1_label", ""), r.get("level2_label", "")
    if l1 == "malicious" and l2 in ("urgent_fine_toll", "fake_prize_lottery"):
        return "P1"
    if l1 == "malicious" and l2 == "phishing_link":
        return "P2"
    if l1 == "grey_area":
        return "P3"
    if l1 == "legitimate" and l2 in ("personal_conversational", "appointment_reminder"):
        return "P4"
    return "P5"


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--input", default="data/labeling/queue_to_label.csv")
    p.add_argument("--batch-size", type=int, default=50)
    p.add_argument("--batch-num", type=int, default=0)
    p.add_argument("--priority", default=None, choices=["P1", "P2", "P3", "P4", "P5"])
    p.add_argument("--output", default=None)
    args = p.parse_args()

    with open(args.input, newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        if "uid" not in (reader.fieldnames or []):
            for i, r in enumerate(rows):
                r["uid"] = f"q_{i:05d}"

    if args.priority:
        rows = [r for r in rows if priority_of(r) == args.priority]

    seen = set()
    unique = []
    for r in rows:
        if r["text"] not in seen:
            seen.add(r["text"])
            unique.append(r)

    start = args.batch_num * args.batch_size
    end = start + args.batch_size
    batch = unique[start:end]

    if not batch:
        print(f"[error] no rows for batch {args.batch_num} "
              f"(total unique matching filter: {len(unique)})", file=sys.stderr)
        sys.exit(1)

    lines = [f"# Batch {args.batch_num} ({len(batch)} rows, "
             f"total unique matching filter: {len(unique)})"]
    for i, r in enumerate(batch):
        lines.append(
            f"{i + 1}. id={r['uid']} "
            f"level1={r.get('level1_label', '')} "
            f"ai_guess={r.get('level2_label', '')} "
            f"text: {r.get('text', '')}"
        )

    output = "\n".join(lines) + "\n"
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(output)
        print(f"Wrote {len(batch)} rows to {args.output}")
    else:
        sys.stdout.write(output)


if __name__ == "__main__":
    main()