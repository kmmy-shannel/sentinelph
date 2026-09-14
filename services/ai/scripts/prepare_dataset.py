"""
services/ai/scripts/prepare_dataset.py

Builds services/ai/data/processed/combined_dataset.csv from:
  - services/ai/data/sms_spam_collection.tsv   (existing baseline)
  - services/ai/data/raw/public/*.csv|*.tsv|*.json  (public datasets you downloaded)
  - services/ai/data/custom/*.json (All custom datasets including ph_bank_phishing.json)

Raw files are NEVER modified. This script only reads from data/raw and data/custom
and writes to data/processed.

Run from services/ai/ with the venv active:
    python scripts/prepare_dataset.py
"""

import csv
import hashlib
import json
import sys
from pathlib import Path

# --- paths -------------------------------------------------------------
AI_ROOT = Path(__file__).resolve().parents[1]          # services/ai
DATA_DIR = AI_ROOT / "data"
RAW_PUBLIC_DIR = DATA_DIR / "raw" / "public"
CUSTOM_DIR = DATA_DIR / "custom"
PROCESSED_DIR = DATA_DIR / "processed"
BASELINE_TSV = DATA_DIR / "sms_spam_collection.tsv"
OUTPUT_CSV = PROCESSED_DIR / "combined_dataset.csv"

sys.path.insert(0, str(AI_ROOT))
try:
    from app.utils.text_normalize import normalize_text  # your existing normalizer
except ImportError:
    print("[WARN] Could not import app.utils.text_normalize.normalize_text — "
          "falling back to a minimal built-in normalizer. Fix the import path "
          "if this is unexpected.")

    def normalize_text(text: str) -> str:
        return " ".join(text.strip().split())

# Label mapping approximation — see dataset_manifest.json for caveats.
LABEL_MAP = {
    "spam": "likely_scam",
    "phishing": "likely_scam",
    "fraud": "likely_scam",
    "scam": "likely_scam",
    "smishing": "likely_scam",
    "1": "likely_scam",
    "ham": "likely_legitimate",
    "legitimate": "likely_legitimate",
    "normal": "likely_legitimate",
    "not_spam": "likely_legitimate",
    "0": "likely_legitimate",
    "likely_scam": "likely_scam",
    "likely_legitimate": "likely_legitimate",
}


def map_label(raw_label: str):
    if raw_label is None:
        return None
    key = str(raw_label).strip().lower()
    return LABEL_MAP.get(key)


def sha256_of(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def load_baseline_tsv(path: Path):
    records = []
    if not path.exists():
        print(f"[WARN] Baseline dataset not found at {path}, skipping.")
        return records
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        reader = csv.reader(f, delimiter="\t")
        for row in reader:
            if len(row) < 2:
                continue
            raw_label, text = row[0], row[1]
            mapped = map_label(raw_label)
            if mapped is None:
                continue
            records.append({"text": text, "label": mapped, "source": "sms_spam_collection"})
    return records


def load_public_csv_or_tsv(path: Path):
    records = []
    delimiter = "\t" if path.suffix.lower() == ".tsv" else ","
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        sample = f.read(4096)
        f.seek(0)
        reader = csv.DictReader(f, delimiter=delimiter)
        if reader.fieldnames is None:
            return records
        # Try to find plausible text/label columns (case-insensitive).
        fields_lower = {name.lower(): name for name in reader.fieldnames}
        text_col = next((fields_lower[c] for c in ("text", "message", "sms", "content", "body")
                          if c in fields_lower), None)
        label_col = next((fields_lower[c] for c in ("label", "category", "class", "type")
                           if c in fields_lower), None)
        if not text_col or not label_col:
            print(f"[WARN] Could not detect text/label columns in {path.name} "
                  f"(found columns: {reader.fieldnames}). Skipping file.")
            return records
        for row in reader:
            text = row.get(text_col, "")
            mapped = map_label(row.get(label_col))
            if not text or mapped is None:
                continue
            records.append({"text": text, "label": mapped, "source": path.stem})
    return records


def load_public_json(path: Path):
    records = []
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        data = json.load(f)
    items = data if isinstance(data, list) else data.get("data", [])
    for item in items:
        text = item.get("text") or item.get("message")
        mapped = map_label(item.get("label") or item.get("category"))
        if not text or mapped is None:
            continue
        records.append({"text": text, "label": mapped, "source": path.stem})
    return records


def load_public_datasets(dir_path: Path):
    records = []
    if not dir_path.exists():
        print(f"[INFO] {dir_path} does not exist yet — no public datasets loaded. "
              f"This is normal if you haven't downloaded any yet.")
        return records
    for path in sorted(dir_path.iterdir()):
        if path.suffix.lower() in (".csv", ".tsv"):
            recs = load_public_csv_or_tsv(path)
        elif path.suffix.lower() == ".json":
            recs = load_public_json(path)
        else:
            continue
        print(f"[INFO] Loaded {len(recs)} records from {path.name}")
        records.extend(recs)
    return records


def load_custom_dataset(path: Path):
    records = []
    if not path.exists():
        print(f"[INFO] No custom dataset found at {path} yet.")
        return records
    with open(path, "r", encoding="utf-8", errors="replace") as f:
        items = json.load(f)
    for item in items:
        text = item.get("text")
        mapped = map_label(item.get("label"))
        if not text or mapped is None:
            continue
        records.append({"text": text, "label": mapped, "source": item.get("source", "sentinelph_manual")})
    return records


def load_all_custom_datasets(dir_path: Path):
    """Scans services/ai/data/custom/ for ALL .json files."""
    records = []
    if not dir_path.exists():
        print(f"[INFO] Custom directory {dir_path} does not exist yet.")
        return records
    for json_file in sorted(dir_path.glob("*.json")):
        recs = load_custom_dataset(json_file)
        print(f"[INFO] Loaded {len(recs)} records from custom dataset: {json_file.name}")
        records.extend(recs)
    return records


def main():
    PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

    all_records = []
    all_records.extend(load_baseline_tsv(BASELINE_TSV))
    all_records.extend(load_public_datasets(RAW_PUBLIC_DIR))
    all_records.extend(load_all_custom_datasets(CUSTOM_DIR))  # Loads ph_bank_phishing.json & any other custom JSONs

    total_raw = len(all_records)

    cleaned = []
    seen_hashes = set()
    empty_count = 0
    dup_count = 0

    for rec in all_records:
        norm_text = normalize_text(rec["text"])
        if not norm_text or not norm_text.strip():
            empty_count += 1
            continue
        h = sha256_of(norm_text.strip().lower())
        if h in seen_hashes:
            dup_count += 1
            continue
        seen_hashes.add(h)
        cleaned.append({"text": norm_text, "label": rec["label"], "source": rec["source"]})

    total_cleaned = len(cleaned)
    scam_count = sum(1 for r in cleaned if r["label"] == "likely_scam")
    legit_count = sum(1 for r in cleaned if r["label"] == "likely_legitimate")

    with open(OUTPUT_CSV, "w", newline="", encoding="utf-8") as f:
        writer = csv.writer(f)
        writer.writerow(["id", "text", "label", "source"])
        for idx, rec in enumerate(cleaned, start=1):
            writer.writerow([idx, rec["text"], rec["label"], rec["source"]])

    ratio = f"{scam_count}:{legit_count}" if legit_count else "N/A"

    print("\n===== prepare_dataset.py report =====")
    print(f"Total raw records loaded:   {total_raw}")
    print(f"Empty records removed:      {empty_count}")
    print(f"Duplicate records removed:  {dup_count}")
    print(f"Total cleaned records:      {total_cleaned}")
    print(f"likely_scam count:          {scam_count}")
    print(f"likely_legitimate count:    {legit_count}")
    print(f"Class ratio (scam:legit):   {ratio}")
    print(f"Output written to:          {OUTPUT_CSV}")
    print("======================================\n")

    if total_cleaned == 0:
        print("[ERROR] No records produced. Check that your baseline TSV, custom JSONs, or "
              "raw/public datasets exist and are readable.")
        sys.exit(1)


if __name__ == "__main__":
    main()