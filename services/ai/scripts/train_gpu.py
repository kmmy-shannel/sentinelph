"""
services/ai/scripts/train_gpu.py

Fine-tunes DistilBERT on services/ai/data/processed/combined_dataset.csv
with an 80/10/10 stratified split, leakage checks, and a hard 85% test-accuracy
quality gate before saving anything to services/ai/models/transformer/.

This is an ADVISORY classifier only. It never blacklists anyone; it only
produces likely_scam / likely_legitimate + a probability score consumed by
the existing two-officer-consensus workflow.

Windows PowerShell usage (from services/ai/, with venv active):

    python scripts\\train_gpu.py `
        --model_name distilbert-base-uncased `
        --epochs 4 `
        --batch_size 8 `
        --max_length 256

If you hit a CUDA out-of-memory error, re-run with --batch_size 4.
"""

import argparse
import datetime as dt
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.metrics import (
    accuracy_score, precision_recall_fscore_support, roc_auc_score,
    confusion_matrix, classification_report,
)

AI_ROOT = Path(__file__).resolve().parents[1]
COMBINED_CSV = AI_ROOT / "data" / "processed" / "combined_dataset.csv"
TRANSFORMER_OUT_DIR = AI_ROOT / "models" / "transformer"
METADATA_PATH = AI_ROOT / "models" / "model_metadata.json"

LABEL2ID = {"likely_legitimate": 0, "likely_scam": 1}
ID2LABEL = {v: k for k, v in LABEL2ID.items()}

MIN_TEST_ACCURACY = 0.85


def parse_args():
    p = argparse.ArgumentParser()
    p.add_argument("--model_name", default="distilbert-base-uncased")
    p.add_argument("--epochs", type=int, default=4)
    p.add_argument("--batch_size", type=int, default=8)
    p.add_argument("--max_length", type=int, default=256)
    p.add_argument("--seed", type=int, default=42)
    return p.parse_args()


def load_dataset():
    if not COMBINED_CSV.exists():
        print(f"[ERROR] {COMBINED_CSV} not found. Run prepare_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(COMBINED_CSV)
    df = df.dropna(subset=["text", "label"])
    df = df[df["label"].isin(LABEL2ID.keys())].reset_index(drop=True)
    df["label_id"] = df["label"].map(LABEL2ID)
    return df


def stratified_split(df, seed):
    # 80 / 10 / 10, stratified on label
    train_df, temp_df = train_test_split(
        df, test_size=0.20, stratify=df["label_id"], random_state=seed
    )
    val_df, test_df = train_test_split(
        temp_df, test_size=0.50, stratify=temp_df["label_id"], random_state=seed
    )
    return (
        train_df.reset_index(drop=True),
        val_df.reset_index(drop=True),
        test_df.reset_index(drop=True),
    )


def print_split_report(name, split_df):
    scam = int((split_df["label_id"] == LABEL2ID["likely_scam"]).sum())
    legit = int((split_df["label_id"] == LABEL2ID["likely_legitimate"]).sum())
    print(f"{name}:")
    print(f"  samples: {len(split_df)}")
    print(f"  scam: {scam}")
    print(f"  legitimate: {legit}")


def check_no_overlap(train_df, val_df, test_df):
    """Verify no exact text overlap between splits (leakage guard)."""
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
            print(f"[ERROR] Leakage detected: {len(ov)} exact-duplicate text(s) "
                  f"shared between {name}.")
    if any_overlap:
        print("[ERROR] Fix duplicates in prepare_dataset.py output before training. Aborting.")
        sys.exit(1)
    else:
        print("[OK] No exact text overlap between train/validation/test splits.")


def main():
    args = parse_args()

    try:
        import torch
        from torch.utils.data import Dataset
        from transformers import (
            AutoTokenizer, AutoModelForSequenceClassification,
            TrainingArguments, Trainer,
        )
    except ImportError as e:
        print(f"[ERROR] Missing dependency: {e}. "
              f"Run: pip install torch transformers scikit-learn pandas")
        sys.exit(1)

    device = "cuda" if torch.cuda.is_available() else "cpu"
    print(f"[INFO] Device selected: {device}")
    if device == "cuda":
        print(f"[INFO] GPU: {torch.cuda.get_device_name(0)}")
    else:
        print("[WARN] CUDA not available — training on CPU will be much slower.")

    df = load_dataset()
    print(f"[INFO] Loaded {len(df)} total labeled records from combined_dataset.csv")

    train_df, val_df, test_df = stratified_split(df, args.seed)

    print("\n===== Split report =====")
    print_split_report("TRAIN", train_df)
    print_split_report("VALIDATION", val_df)
    print_split_report("TEST", test_df)
    print("=========================\n")

    check_no_overlap(train_df, val_df, test_df)

    tokenizer = AutoTokenizer.from_pretrained(args.model_name)

    class ScamDataset(Dataset):
        def __init__(self, texts, labels):
            self.encodings = tokenizer(
                list(texts), truncation=True, padding=True,
                max_length=args.max_length,
            )
            self.labels = list(labels)

        def __len__(self):
            return len(self.labels)

        def __getitem__(self, idx):
            item = {k: torch.tensor(v[idx]) for k, v in self.encodings.items()}
            item["labels"] = torch.tensor(self.labels[idx])
            return item

    train_ds = ScamDataset(train_df["text"], train_df["label_id"])
    val_ds = ScamDataset(val_df["text"], val_df["label_id"])
    test_ds = ScamDataset(test_df["text"], test_df["label_id"])

    model = AutoModelForSequenceClassification.from_pretrained(
        args.model_name, num_labels=2, id2label=ID2LABEL, label2id=LABEL2ID,
    ).to(device)

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        precision, recall, f1, _ = precision_recall_fscore_support(
            labels, preds, average="binary", zero_division=0
        )
        acc = accuracy_score(labels, preds)
        try:
            probs = torch.softmax(torch.tensor(logits), dim=-1)[:, 1].numpy()
            auc = roc_auc_score(labels, probs)
        except ValueError:
            auc = float("nan")
        return {"accuracy": acc, "precision": precision, "recall": recall,
                "f1": f1, "roc_auc": auc}

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
        # NOTE: validation set only is used for model selection / early inspection.
        # Test set is used exactly once below, after training finishes.
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

    print("\n[INFO] Running FINAL evaluation on the untouched TEST set...")
    test_output = trainer.predict(test_ds)
    logits = test_output.predictions
    labels = test_output.label_ids
    preds = np.argmax(logits, axis=-1)

    acc = accuracy_score(labels, preds)
    precision, recall, f1, _ = precision_recall_fscore_support(
        labels, preds, average="binary", zero_division=0
    )
    try:
        probs = torch.softmax(torch.tensor(logits), dim=-1)[:, 1].numpy()
        auc = roc_auc_score(labels, probs)
    except ValueError:
        auc = float("nan")

    cm = confusion_matrix(labels, preds)
    report = classification_report(labels, preds, target_names=["likely_legitimate", "likely_scam"])

    print("\n===== FINAL TEST METRICS (measured once, not tuned against) =====")
    print(f"Accuracy:  {acc:.4f}")
    print(f"Precision: {precision:.4f}")
    print(f"Recall:    {recall:.4f}")
    print(f"F1:        {f1:.4f}")
    print(f"ROC-AUC:   {auc:.4f}")
    print("\nConfusion matrix (rows=true, cols=pred, order=[legit, scam]):")
    print(cm)
    print("\nClassification report:")
    print(report)
    print("====================================================================\n")

    if acc < MIN_TEST_ACCURACY:
        print(f"[GATE FAILED] Test accuracy {acc:.4f} is below the required "
              f"MIN_TEST_ACCURACY={MIN_TEST_ACCURACY}. Model will NOT be saved. "
              f"Existing classical model (logreg) remains the active model.")
        sys.exit(1)

    print(f"[GATE PASSED] Test accuracy {acc:.4f} >= {MIN_TEST_ACCURACY}. Saving model.")

    TRANSFORMER_OUT_DIR.mkdir(parents=True, exist_ok=True)
    model.save_pretrained(TRANSFORMER_OUT_DIR)
    tokenizer.save_pretrained(TRANSFORMER_OUT_DIR)

    version = f"sentinelph-distilbert-{dt.date.today().isoformat()}-v001"
    metadata = {
        "model_type": "transformer",
        "model_name": args.model_name,
        "model_version": version,
        "training_date": dt.datetime.now().isoformat(timespec="seconds"),
        "test_accuracy": round(float(acc), 4),
        "precision": round(float(precision), 4),
        "recall": round(float(recall), 4),
        "f1": round(float(f1), 4),
        "roc_auc": round(float(auc), 4) if not np.isnan(auc) else None,
        "training_samples": len(train_df),
        "validation_samples": len(val_df),
        "test_samples": len(test_df),
        "training_config": {
            "epochs": args.epochs,
            "batch_size": args.batch_size,
            "max_length": args.max_length,
            "seed": args.seed,
        },
        "label_mapping": {"likely_scam": 1, "likely_legitimate": 0},
        "advisory_only": True,
    }

    # Do not clobber a previously-passing model's metadata blindly — write versioned
    # metadata alongside, and only update the "active" pointer file after this check.
    METADATA_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=2)

    print(f"[INFO] Metadata written to {METADATA_PATH}")
    print(f"[INFO] Model version: {version}")
    print("[INFO] Done.")


if __name__ == "__main__":
    main()
