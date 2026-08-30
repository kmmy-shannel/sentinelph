"""
tools/dataset_labeler.py

Local, offline, single-user tool for manually building SentinelPH-specific
training examples. Supports TXT files, CSV files, and screenshot images
(with OCR via Tesseract, and manual correction of the OCR text).

Only use this on:
  - publicly available scam examples
  - examples explicitly provided for research/training
  - synthetic messages you write yourself for testing
  - messages from datasets whose license permits reuse
Never load private messages belonging to real people.

Usage:
    python tools/dataset_labeler.py --input_dir path/to/raw_examples

Requires:
    pip install pillow pytesseract
    (and Tesseract OCR installed separately — see services/ai/data/README.md)

Controls (terminal-based, no GUI dependency required):
    [Enter]   accept current text as-is
    e         edit the text before saving
    s         set label to likely_scam
    l         set label to likely_legitimate
    n         next file (skip without saving)
    p         previous file
    q         quit and save progress
"""

import argparse
import csv
import json
from pathlib import Path

OUTPUT_PATH = Path("services/ai/data/custom/custom_scam_dataset.json")


def try_ocr(image_path: Path) -> str:
    try:
        from PIL import Image
        import pytesseract
    except ImportError:
        print("[WARN] pillow/pytesseract not installed. Run: "
              "pip install pillow pytesseract  (and install the Tesseract binary).")
        return ""
    try:
        img = Image.open(image_path)
        return pytesseract.image_to_string(img).strip()
    except Exception as e:
        print(f"[WARN] OCR failed for {image_path.name}: {e}")
        return ""


def load_candidates(input_dir: Path):
    """Returns list of dicts: {path, kind: 'text'|'image'|'csv_row', text, source}"""
    candidates = []
    for path in sorted(input_dir.rglob("*")):
        if path.is_dir():
            continue
        suffix = path.suffix.lower()
        if suffix == ".txt":
            text = path.read_text(encoding="utf-8", errors="replace").strip()
            candidates.append({"path": str(path), "kind": "text", "text": text,
                                "source": "sentinelph_manual", "ocr_used": False})
        elif suffix in (".png", ".jpg", ".jpeg", ".webp"):
            candidates.append({"path": str(path), "kind": "image", "text": None,
                                "source": "sentinelph_screenshot", "ocr_used": True})
        elif suffix == ".csv":
            with open(path, "r", encoding="utf-8", errors="replace") as f:
                reader = csv.DictReader(f)
                for row in reader:
                    text = row.get("text") or row.get("message")
                    if text:
                        candidates.append({"path": str(path), "kind": "csv_row", "text": text,
                                            "source": "sentinelph_manual", "ocr_used": False})
    return candidates


def load_existing_output():
    if OUTPUT_PATH.exists():
        with open(OUTPUT_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return []


def save_output(records):
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(records, f, indent=2, ensure_ascii=False)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input_dir", required=True,
                         help="Folder containing .txt / .csv / screenshot files to label")
    args = parser.parse_args()

    input_dir = Path(args.input_dir)
    if not input_dir.exists():
        print(f"[ERROR] Input directory not found: {input_dir}")
        return

    candidates = load_candidates(input_dir)
    if not candidates:
        print(f"[INFO] No .txt/.csv/image files found in {input_dir}.")
        return

    records = load_existing_output()
    print(f"[INFO] {len(candidates)} candidate item(s) found. "
          f"{len(records)} already-saved record(s) in {OUTPUT_PATH}.")

    idx = 0
    while 0 <= idx < len(candidates):
        item = candidates[idx]
        print(f"\n--- [{idx + 1}/{len(candidates)}] ---")
        print(f"Filename: {item['path']}")
        print(f"Source:   {item['source']}")

        if item["kind"] == "image" and item["text"] is None:
            print("[INFO] Running OCR...")
            item["text"] = try_ocr(Path(item["path"]))

        print(f"Extracted text: {item['text']!r}")

        cmd = input(
            "[Enter=accept] [e=edit] [s=label scam] [l=label legit] "
            "[n=next w/o saving] [p=previous] [q=quit]: "
        ).strip().lower()

        if cmd == "q":
            break
        elif cmd == "n":
            idx += 1
            continue
        elif cmd == "p":
            idx = max(0, idx - 1)
            continue
        elif cmd == "e":
            new_text = input("Enter corrected text: ").strip()
            if new_text:
                item["text"] = new_text
            continue  # re-prompt for label on this same item
        elif cmd in ("s", "l"):
            label = "likely_scam" if cmd == "s" else "likely_legitimate"
            if not item["text"]:
                print("[WARN] No text to save — skipping.")
                idx += 1
                continue
            records.append({
                "text": item["text"],
                "label": label,
                "source": item["source"],
                "ocr_used": bool(item.get("ocr_used", False)),
            })
            save_output(records)
            print(f"[SAVED] {len(records)} total records in {OUTPUT_PATH}. "
                  f"Progress: {idx + 1}/{len(candidates)}")
            idx += 1
        else:
            print("[INFO] Unrecognized input, try again.")

    save_output(records)
    print(f"\n[DONE] {len(records)} total labeled records saved to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
