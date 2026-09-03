"""
scripts/upload_to_hf.py

Uploads trained model artifacts in services/ai/models/transformer/ to a Hugging Face
Model Hub repository so the FastAPI service can load weights dynamically from the Hub.
"""

import argparse
import json
import sys
from pathlib import Path

from huggingface_hub import HfApi, create_repo, upload_folder

AI_ROOT = Path(__file__).resolve().parents[1]  # services/ai
TRANSFORMER_DIR = AI_ROOT / "models" / "transformer"
METADATA_PATH = AI_ROOT / "models" / "model_metadata.json"

REQUIRED_FILES = [
    "model.safetensors",
    "config.json",
    "tokenizer.json",
]


def parse_args():
    p = argparse.ArgumentParser(description="Upload SentinelPH model artifacts to Hugging Face Hub")
    p.add_argument(
        "--repo_id",
        required=True,
        help="Target Hugging Face repository ID (e.g., yourusername/sentinelph-distilbert-v001)",
    )
    p.add_argument(
        "--private",
        action="store_true",
        help="Create/keep the repo private (recommended during initial development)",
    )
    p.add_argument("--commit_message", default=None, help="Custom commit message")
    return p.parse_args()


def main():
    args = parse_args()

    # Verify that all mandatory model components exist in models/transformer/
    missing = [f for f in REQUIRED_FILES if not (TRANSFORMER_DIR / f).exists()]
    if missing:
        print(f"[ERROR] Missing required model file(s) in {TRANSFORMER_DIR}: {missing}")
        print("        Ensure training/export is complete before running this script.")
        sys.exit(1)

    model_version = "unknown"
    if METADATA_PATH.exists():
        with open(METADATA_PATH, "r", encoding="utf-8") as f:
            meta = json.load(f)
        model_version = meta.get("model_version", "unknown")
        test_acc = meta.get("test_accuracy")
        print(
            f"[INFO] Uploading model_version='{model_version}' "
            f"(test_accuracy={test_acc}) to {args.repo_id}"
        )
    else:
        print(f"[WARN] {METADATA_PATH} not found — uploading without metadata version check.")

    api = HfApi()

    print(f"[INFO] Ensuring target repository exists: {args.repo_id} (private={args.private})")
    create_repo(
        repo_id=args.repo_id,
        repo_type="model",
        private=args.private,
        exist_ok=True,
    )

    commit_message = args.commit_message or f"Upload model artifact: {model_version}"

    print(f"[INFO] Uploading artifacts from {TRANSFORMER_DIR} -> {args.repo_id} ...")
    upload_folder(
        repo_id=args.repo_id,
        repo_type="model",
        folder_path=str(TRANSFORMER_DIR),
        commit_message=commit_message,
    )

    print(f"\n[DONE] Model successfully uploaded to: https://huggingface.co/{args.repo_id}")
    print(
        "       Save this repo_id; you will set it as AI_HF_MODEL_REPO in your Space's environment variables."
    )


if __name__ == "__main__":
    main()