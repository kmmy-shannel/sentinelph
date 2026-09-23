"""
services/ai/scripts/train_gpu.py

Fine-tunes DistilBERT as a 3-class advisory classifier on the pre-split
dataset produced by prepare_dataset.py:
    data/processed/train.csv
    data/processed/val.csv
    data/processed/test.csv

Classes:
    0 = legitimate
    1 = grey_area   (promos, borderline marketing, ambiguous notices)
    2 = malicious   (phishing, fake alerts, job scams, etc.)

Quality gates before saving the model:
    f1_macro   >= 0.75
    f1_grey_area >= 0.55   (the noisy, hard-to-learn class)

Windows PowerShell usage (from services/ai/, with venv active):

    python scripts\\train_gpu.py `
        --model_name distilbert-base-uncased `
        --epochs 4 `
        --batch_size 8 `
        --max_length 256
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)

AI_ROOT = Path(__file__).resolve().parents[1]
PROCESSED_DIR = AI_ROOT / "data" / "processed"
TRAIN_CSV = PROCESSED_DIR / "train.csv"
VAL_CSV = PROCESSED_DIR / "val.csv"
TEST_CSV = PROCESSED_DIR / "test.csv"
TRANSFORMER_OUT_DIR = AI_ROOT / "models" / "transformer"
METADATA_PATH = AI_ROOT / "models" / "model_metadata.json"

# === 3-CLASS CHANGE ===
LABEL2ID = {"legitimate": 0, "grey_area": 1, "malicious": 2}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}
LABEL_NAMES = ["legitimate", "grey_area", "malicious"]

MIN_F1_MACRO = 0.75
MIN_F1_GREY_AREA = 0.55


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model_name", default="distilbert-base-uncased")
    p.add_argument("--epochs", type=int, default=4)
    p.add_argument("--batch_size", type=int, default=8)
    p.add_argument("--max_length", type=int, default=256)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_split(path: Path, name: str) -> pd.DataFrame:
    if not path.exists():
        print(f"[ERROR] {path} not found. Run prepare_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(path)
    df = df.dropna(subset=["text", "label"])
    df["label"] = df["label"].astype(int)
    invalid = df[~df["label"].isin([0, 1, 2])]
    if len(invalid) > 0:
        print(f"[ERROR] {name} contains labels outside {{0,1,2}}: "
              f"{sorted(invalid['label'].unique())}")
        sys.exit(1)
    df = df.reset_index(drop=True)
    print(f"[INFO] {name}: {len(df)} rows")
    return df


def print_class_balance(name: str, df: pd.DataFrame):
    print(f"  {name} class balance:")
    for lbl in sorted(df["label"].unique()):
        count = int((df["label"] == lbl).sum())
        pct = 100.0 * count / len(df)
        print(f"    {lbl} {LABEL_NAMES[lbl]}: {count} ({pct:.1f}%)")


def check_no_overlap(train_df, val_df, test_df):
    train_set = set(train_df["text"].str.strip().str.lower())
    val_set = set(val_df["text"].str.strip().str.lower())
    test_set = set(test_df["text"].str.strip().str.lower())
    overlaps = {
        "train_val": train_set & val_set,
        "train_test": train_set & test_set,
        "val_test": val_set & test_set,
    }
    any_overlap = False
    for name, ov in overlaps.items():
        if ov:
            any_overlap = True
            print(f"[ERROR] Leakage: {len(ov)} duplicate text(s) in {name}.")
    if any_overlap:
        print("[ERROR] Fix duplicates in prepare_dataset.py before training. Aborting.")
        sys.exit(1)
    print("[OK] No exact text overlap between splits.")


def main():
    args = parse_args()

    try:
        import torch
        from torch.utils.data import Dataset
        from transformers import (
            AutoTokenizer,
            AutoModelForSequenceClassification,
            TrainingArguments,
            Trainer,
        )
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}. "
              f"Run: pip install torch transformers scikit-learn pandas")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Device: {device}")
    if device == "cuda":
        print(f"[INFO] GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("[WARN] CUDA not available — CPU training will be slow.")

    train_df = load_split(TRAIN_CSV, "TRAIN")
    val_df = load_split(VAL_CSV, "VALIDATION")
    test_df = load_split(TEST_CSV, "TEST")

    print("\n===== Split report =====")
    print_class_balance("TRAIN", train_df)
    print_class_balance("VALIDATION", val_df)
    print_class_balance("TEST", test_df)
    print("=========================\n")

    check_no_overlap(train_df, val_df, test_df)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)

    class ScamDataset(Dataset):
        def __init__(self, texts, labels):
            self.encodings = tokenizer(
                list(texts), truncation=True, padding=True,
                max_length=args.max_length,
            )
            self.labels = [int(x) for x in labels]

        def __len__(self):
            return len(self.labels)

        def __getitem__(self, idx):
            item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
            item["labels"] = torch.tensor(self.labels[idx])
            return item

    train_ds = ScamDataset(train_df["text"], train_df["label"])
    val_ds = ScamDataset(val_df["text"], val_df["label"])
    test_ds = ScamDataset(test_df["text"], test_df["label"])

    # === 3-CLASS CHANGE: num_labels=3, id2label/label2id from LABEL2ID ===
    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name,
        num_labels=3,
        id2label=ID2LABEL,
        label2id=LABEL2ID,
    ).to(device)

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        report = classification_report(
            labels, preds,
            labels=[0, 1, 2],
            target_names=LABEL_NAMES,
            output_dict=True,
            zero_division=0,
        )
        return {
            "accuracy": report["accuracy"],
            "f1_macro": report["macro avg"]["f1-score"],
            "f1_grey_area": report.get("grey_area", {}).get("f1-score", 0.0),
        }

    training_args = TrainingArguments(
        output_dir=str(AI_ROOT / "scripts" / "_tmp_train_output"),
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        eval_strategy="epoch",
        save_strategy="no",
        logging_steps=25,
        seed=args.seed,
        report_to=[],
    )

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        compute_metrics=compute_metrics,
    )

    print("[INFO] Starting training...")
    trainer.train()

    print("\n[INFO] Running FINAL evaluation on TEST set...")
    test_output = trainer.predict(test_ds)
    logits = test_output.predictions
    labels = test_output.label_ids
    preds = np.argmax(logits, axis=-1)

    acc = accuracy_score(labels, preds)
    f1_macro = f1_score(labels, preds, average="macro", zero_division=0)
    f1_per_class = f1_score(labels, preds, average=None, labels=[0, 1, 2], zero_division=0)
    f1_grey = float(f1_per_class[1])
    cm = confusion_matrix(labels, preds, labels=[0, 1, 2])
    report = classification_report(
        labels, preds, labels=[0, 1, 2], target_names=LABEL_NAMES, zero_division=0
    )

    print("\n===== FINAL TEST METRICS =====")
    print(f"Accuracy:       {acc:.4f}")
    print(f"F1 macro:       {f1_macro:.4f}")
    print(f"F1 legitimate:  {f1_per_class[0]:.4f}")
    print(f"F1 grey_area:   {f1_grey:.4f}   <-- hard class")
    print(f"F1 malicious:   {f1_per_class[2]:.4f}")
    print("\nConfusion matrix (rows=true, cols=pred, order=[legit, grey, malicious]):")
    print(cm)
    print("\nClassification report:")
    print(report)
    print("================================\n")

    gate_fail = (f1_macro < MIN_F1_MACRO) or (f1_grey < MIN_F1_GREY_AREA)
    if gate_fail:
        print(f"[GATE FAILED] f1_macro={f1_macro:.4f} (need {MIN_F1_MACRO}), "
              f"f1_grey_area={f1_grey:.4f} (need {MIN_F1_GREY_AREA}).")
        print("Model will NOT be saved.")
        if f1_grey < MIN_F1_GREY_AREA:
            print("Hint: label 100-200 more grey_area messages and retrain.")
        sys.exit(1)

    print(f"[GATE PASSED] f1_macro={f1_macro:.4f}, f1_grey_area={f1_grey:.4f}. Saving.")
    TRANSFORMER_OUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(TRANSFORMER_OUT_DIR)
    tokenizer.save_pretrained(TRANSFORMER_OUT_DIR)

    version = f"sentinelph-distilbert-3class-{dt.date.today().isoformat()}-v001"
    metadata = {
        "model_type": "transformer",
        "model_name": args.model_name,
        "model_version": version,
        "training_date": dt.datetime.now().isoformat(timespec="seconds"),
        "num_labels": 3,
        "label_mapping": {"0": "legitimate", "1": "grey_area", "2": "malicious"},
        "test_accuracy": round(float(acc), 4),
        "f1_macro": round(float(f1_macro), 4),
        "f1_legitimate": round(float(f1_per_class[0]), 4),
        "f1_grey_area": round(float(f1_grey), 4),
        "f1_malicious": round(float(f1_per_class[2]), 4),
        "training_samples": len(train_df),
        "validation_samples": len(val_df),
        "test_samples": len(test_df),
        "training_config": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "max_length": args.max_length,
            "seed": args.seed,
        },
        "advisory_only": True,
    }
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)
    print(f"[INFO] Metadata -> {METADATA_PATH}")
    print(f"[INFO] Model version: {version}")
    print("[INFO] Done.")


if __name__ == "__main__":
    main()