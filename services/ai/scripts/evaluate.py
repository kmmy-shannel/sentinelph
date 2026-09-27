#!/usr/bin/env python3
"""SentinelPH model evaluation harness.

Runs two checks against a trained checkpoint:

1. The regression suite (`tests/regression_suite.json`) — a set of known,
   hand-labeled SMS examples, some of which are past false negatives or
   adversarial domain-spoofing pairs that must never flip their Level 1
   prediction.
2. The held-out test set (`data/eval/test.csv`) — standard classification
   metrics (accuracy, macro F1, per-class F1, confusion matrix).

Both results are checked against hard release gates. A JSON report is
written to --output regardless of outcome, so failed runs are still
auditable.

Usage (run from services/ai/):
    python scripts/evaluate.py --model-path ./checkpoints/v3

Exit codes:
    0 - all gates passed
    1 - a gate failed (regression flip or metric threshold breach)
    2 - setup error (missing/malformed input file, model load failure)
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
import pandas as pd
import torch
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix,
    f1_score,
)
from transformers import AutoModelForSequenceClassification, AutoTokenizer

# Make the `app` package importable when this script is invoked as
# `python scripts/evaluate.py`, regardless of the caller's CWD, as long as
# this file stays at services/ai/scripts/evaluate.py.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from app.config import ID2LABEL  # noqa: E402
from app.utils.text_normalize import normalize_text  # noqa: E402

MAX_LENGTH = 256
F1_MACRO_THRESHOLD = 0.75
WORST_CLASS_F1_THRESHOLD = 0.55
LABEL2ID = {v: k for k, v in ID2LABEL.items()}

# The processed train/test split that data/eval/test.csv was originally
# frozen from (see scripts/prepare_eval_test_set.py). Used only for the
# non-blocking staleness check below.
PROCESSED_TEST_SET_PATH = Path("data/processed/test.csv")


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------

def parse_args() -> argparse.Namespace:
    """Parse CLI arguments for the evaluation harness."""
    parser = argparse.ArgumentParser(
        description=(
            "SentinelPH model evaluation harness: regression suite + "
            "held-out test set with hard release gates."
        ),
    )
    parser.add_argument(
        "--model-path",
        required=True,
        help="HF Hub repo id or local checkpoint directory.",
    )
    parser.add_argument(
        "--regression-suite",
        default="tests/regression_suite.json",
        help="Path to regression_suite.json.",
    )
    parser.add_argument(
        "--test-set",
        default="data/eval/test.csv",
        help="Path to held-out test CSV with columns: text,label.",
    )
    parser.add_argument(
        "--output",
        default="data/eval/reports/report_latest.json",
        help="Path to write the JSON report.",
    )
    parser.add_argument(
        "--device",
        default="auto",
        help="'auto' (default), 'cuda', 'cuda:0', or 'cpu'.",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=16,
        help="Inference batch size.",
    )
    return parser.parse_args()


def resolve_device(requested: str) -> str:
    """Resolve the compute device, auto-detecting CUDA when requested is 'auto'."""
    if requested != "auto":
        return requested
    return "cuda" if torch.cuda.is_available() else "cpu"


def warn_if_test_set_stale(
    eval_test_set_path: Path,
    processed_test_set_path: Path = PROCESSED_TEST_SET_PATH,
) -> None:
    """Warn (non-blocking) if the frozen eval test set may be stale.

    data/eval/test.csv is a frozen snapshot created once by
    scripts/prepare_eval_test_set.py from data/processed/test.csv, so that
    evaluation results stay comparable across model versions even as the
    processed train/test split is regenerated over time. If
    data/processed/test.csv has since been modified *more recently* than the
    frozen eval file, someone likely regenerated the split and the frozen
    benchmark may no longer reflect it. This is advisory only - it never
    blocks the run, since the whole point of freezing the set is that it is
    allowed to diverge from the processed split deliberately.
    """
    if not eval_test_set_path.exists() or not processed_test_set_path.exists():
        return  # nothing to compare yet; load_test_set() will raise its own error if needed

    eval_mtime = eval_test_set_path.stat().st_mtime
    processed_mtime = processed_test_set_path.stat().st_mtime

    if processed_mtime > eval_mtime:
        print(
            f"[warning] {processed_test_set_path} was modified more recently "
            f"than {eval_test_set_path}. The frozen eval test set may be "
            f"stale relative to the current processed split - consider "
            f"regenerating it with "
            f"'python scripts/prepare_eval_test_set.py --force' if that was "
            f"intentional.",
            file=sys.stderr,
        )


# --------------------------------------------------------------------------
# Model loading + inference
# --------------------------------------------------------------------------

def load_model_and_tokenizer(
    model_path: str, device: str
) -> Tuple[AutoModelForSequenceClassification, AutoTokenizer]:
    """Load a sequence classification model and its tokenizer onto `device`.

    Works with either a local checkpoint directory or a Hugging Face Hub
    repo id, matching how ScamClassifier in app/inference.py loads weights.
    """
    tokenizer = AutoTokenizer.from_pretrained(model_path)
    model = AutoModelForSequenceClassification.from_pretrained(model_path)
    model.to(device)
    model.eval()
    return model, tokenizer


def predict_batch(
    texts: List[str],
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    device: str,
    batch_size: int,
    max_length: int = MAX_LENGTH,
) -> Tuple[np.ndarray, np.ndarray]:
    """Run batched inference and return (predicted_label_ids, confidences).

    Applies the same normalize_text() preprocessing used at train and
    inference time, and the same tokenization settings as ScamClassifier
    (max_length=256, truncation=True, padding=True).
    """
    all_preds: List[int] = []
    all_confidences: List[float] = []

    normalized = [normalize_text(t) for t in texts]

    with torch.no_grad():
        for start in range(0, len(normalized), batch_size):
            batch = normalized[start : start + batch_size]
            encoded = tokenizer(
                batch,
                truncation=True,
                max_length=max_length,
                padding=True,
                return_tensors="pt",
            ).to(device)
            logits = model(**encoded).logits
            probs = torch.softmax(logits, dim=-1)
            confidences, preds = torch.max(probs, dim=-1)
            all_preds.extend(preds.cpu().tolist())
            all_confidences.extend(confidences.cpu().tolist())

    return np.array(all_preds), np.array(all_confidences)


def _preview(text: str, length: int = 60) -> str:
    """Truncate text for compact table display."""
    text = text.replace("\n", " ")
    return text if len(text) <= length else text[: length - 3] + "..."


# --------------------------------------------------------------------------
# Regression suite
# --------------------------------------------------------------------------

def load_regression_suite(path: Path) -> List[Dict[str, Any]]:
    """Load and lightly validate the regression suite JSON file.

    Raises FileNotFoundError if the file is missing, and ValueError/KeyError
    on malformed or empty content.
    """
    if not path.exists():
        raise FileNotFoundError(f"regression suite not found at {path}")
    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)
    examples = data["examples"]
    if not examples:
        raise ValueError(f"regression suite at {path} contains no examples")
    return examples


def evaluate_regression_suite(
    examples: List[Dict[str, Any]],
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    device: str,
    batch_size: int,
) -> Dict[str, Any]:
    """Run the regression suite and summarize pass/fail counts and failures.

    Each example's `expected_level1` is compared against the model's
    argmax(softmax) prediction. Examples marked `must_not_flip: true` are
    additionally tracked as a hard release gate, since any flip among them
    (a known past failure, an adversarial domain pair, a legit OTP, or a
    brand-impersonation case) is unacceptable regardless of aggregate
    accuracy.
    """
    texts = [ex["text"] for ex in examples]
    preds, confidences = predict_batch(texts, model, tokenizer, device, batch_size)

    total = len(examples)
    correct = 0
    must_not_flip_total = 0
    must_not_flip_correct = 0
    failures: List[Dict[str, Any]] = []

    for ex, pred_id, confidence in zip(examples, preds, confidences):
        predicted_level1 = ID2LABEL[int(pred_id)]
        expected_level1 = ex["expected_level1"]
        is_must_not_flip = bool(ex.get("must_not_flip", False))
        is_correct = predicted_level1 == expected_level1

        if is_correct:
            correct += 1
        if is_must_not_flip:
            must_not_flip_total += 1
            if is_correct:
                must_not_flip_correct += 1

        if not is_correct:
            failures.append(
                {
                    "id": ex["id"],
                    "note": ex.get("note", ""),
                    "text_preview": _preview(ex["text"]),
                    "expected_level1": expected_level1,
                    "predicted_level1": predicted_level1,
                    "confidence": round(float(confidence), 4),
                    "must_not_flip": is_must_not_flip,
                }
            )

    return {
        "total": total,
        "correct": correct,
        "must_not_flip_total": must_not_flip_total,
        "must_not_flip_correct": must_not_flip_correct,
        "failures": failures,
    }


def print_regression_report(result: Dict[str, Any]) -> None:
    """Print a summary and failure tables for the regression suite run."""
    total = result["total"]
    correct = result["correct"]
    mnf_total = result["must_not_flip_total"]
    mnf_correct = result["must_not_flip_correct"]

    print("\n" + "=" * 78)
    print("REGRESSION SUITE")
    print("=" * 78)
    pct = correct / total if total else 0.0
    print(f"Overall:        {correct}/{total} correct ({pct:.1%})")
    mnf_status = "OK" if mnf_correct == mnf_total else "VIOLATED"
    print(f"must_not_flip:  {mnf_correct}/{mnf_total} held ({mnf_status})")

    blocking = [f for f in result["failures"] if f["must_not_flip"]]
    other = [f for f in result["failures"] if not f["must_not_flip"]]

    if blocking:
        print(f"\n--- MUST-NOT-FLIP VIOLATIONS ({len(blocking)}) - release blocking ---")
        _print_failure_table(blocking)

    if other:
        print(f"\n--- Other regression failures ({len(other)}) ---")
        _print_failure_table(other)

    if not result["failures"]:
        print("\nNo regression failures.")


def _print_failure_table(failures: List[Dict[str, Any]]) -> None:
    """Print a fixed-width table of regression failures."""
    header = f"{'id':<10} {'expected':<12} {'predicted':<12} {'conf':<6} {'text':<60}  note"
    print(header)
    print("-" * len(header))
    for f in failures:
        print(
            f"{f['id']:<10} {f['expected_level1']:<12} {f['predicted_level1']:<12} "
            f"{f['confidence']:<6.2f} {f['text_preview']:<60}  {f['note']}"
        )


# --------------------------------------------------------------------------
# Held-out test set
# --------------------------------------------------------------------------

def load_test_set(path: Path) -> pd.DataFrame:
    """Load the frozen held-out test CSV, validating required columns.

    Expects columns `text` and `level1_label` (one of "legitimate",
    "grey_area", "malicious"), as produced by
    scripts/prepare_eval_test_set.py. Adds an integer `label` column
    (via ID2LABEL/LABEL2ID) for use with sklearn's metric functions.
    """
    if not path.exists():
        raise FileNotFoundError(f"test set not found at {path}")
    df = pd.read_csv(path)
    missing = {"text", "level1_label"} - set(df.columns)
    if missing:
        raise ValueError(
            f"test set at {path} is missing required columns: {sorted(missing)}"
        )
    df = df.dropna(subset=["text", "level1_label"]).copy()

    unknown = set(df["level1_label"].unique()) - set(LABEL2ID.keys())
    if unknown:
        raise ValueError(
            f"test set at {path} has unrecognized level1_label value(s): "
            f"{sorted(unknown)}; expected one of {sorted(LABEL2ID.keys())}"
        )
    df["label"] = df["level1_label"].map(LABEL2ID).astype(int)
    return df


def evaluate_test_set(
    df: pd.DataFrame,
    model: AutoModelForSequenceClassification,
    tokenizer: AutoTokenizer,
    device: str,
    batch_size: int,
) -> Dict[str, Any]:
    """Run inference on the held-out test set and compute classification metrics."""
    texts = df["text"].astype(str).tolist()
    y_true = df["label"].to_numpy()
    y_pred, _confidences = predict_batch(texts, model, tokenizer, device, batch_size)

    labels_sorted = sorted(ID2LABEL.keys())
    target_names = [ID2LABEL[i] for i in labels_sorted]

    accuracy = float(accuracy_score(y_true, y_pred))
    f1_macro = float(
        f1_score(y_true, y_pred, average="macro", labels=labels_sorted, zero_division=0)
    )
    per_class_f1_scores = f1_score(
        y_true, y_pred, average=None, labels=labels_sorted, zero_division=0
    )
    per_class_f1 = {
        ID2LABEL[i]: float(score) for i, score in zip(labels_sorted, per_class_f1_scores)
    }
    worst_class = min(per_class_f1, key=per_class_f1.get)
    worst_class_f1 = per_class_f1[worst_class]

    cm = confusion_matrix(y_true, y_pred, labels=labels_sorted).tolist()
    per_class_report = classification_report(
        y_true,
        y_pred,
        labels=labels_sorted,
        target_names=target_names,
        output_dict=True,
        zero_division=0,
    )

    return {
        "metrics": {
            "n_examples": int(len(df)),
            "accuracy": accuracy,
            "f1_macro": f1_macro,
            "per_class_f1": per_class_f1,
            "worst_class": worst_class,
            "worst_class_f1": worst_class_f1,
        },
        "confusion_matrix": cm,
        "confusion_matrix_labels": target_names,
        "per_class_report": per_class_report,
    }


def print_test_set_report(result: Dict[str, Any]) -> None:
    """Print accuracy, macro/per-class F1, and confusion matrix for the test set."""
    m = result["metrics"]
    print("\n" + "=" * 78)
    print("HELD-OUT TEST SET")
    print("=" * 78)
    print(f"n_examples:      {m['n_examples']}")
    print(f"accuracy:        {m['accuracy']:.4f}")
    print(f"f1_macro:        {m['f1_macro']:.4f}")
    print(f"worst_class_f1:  {m['worst_class_f1']:.4f}  ({m['worst_class']})")

    print("\nPer-class F1:")
    for label, score in m["per_class_f1"].items():
        print(f"  {label:<22} {score:.4f}")

    labels = result["confusion_matrix_labels"]
    cm = result["confusion_matrix"]
    print("\nConfusion matrix (rows=true, cols=predicted):")
    print(" " * 22 + "".join(f"{lbl:>16}" for lbl in labels))
    for label, row in zip(labels, cm):
        print(f"{label:<22}" + "".join(f"{v:>16}" for v in row))


# --------------------------------------------------------------------------
# Gates
# --------------------------------------------------------------------------

def check_gates(
    regression_result: Dict[str, Any], test_result: Dict[str, Any]
) -> Dict[str, Any]:
    """Apply hard release gates and collect specific failure reasons.

    Gates (any single failure hard-blocks release):
      - No `must_not_flip` regression example may flip its prediction.
      - f1_macro on the held-out test set must be >= F1_MACRO_THRESHOLD.
      - The worst per-class F1 must be >= WORST_CLASS_F1_THRESHOLD.
    """
    reasons: List[str] = []

    mnf_total = regression_result["must_not_flip_total"]
    mnf_correct = regression_result["must_not_flip_correct"]
    if mnf_correct < mnf_total:
        flipped = mnf_total - mnf_correct
        flipped_ids = [
            f["id"] for f in regression_result["failures"] if f["must_not_flip"]
        ]
        reasons.append(
            f"{flipped}/{mnf_total} must_not_flip regression example(s) flipped: "
            f"{', '.join(flipped_ids)}"
        )

    f1_macro = test_result["metrics"]["f1_macro"]
    if f1_macro < F1_MACRO_THRESHOLD:
        reasons.append(
            f"f1_macro {f1_macro:.4f} is below threshold {F1_MACRO_THRESHOLD}"
        )

    worst_class_f1 = test_result["metrics"]["worst_class_f1"]
    worst_class = test_result["metrics"]["worst_class"]
    if worst_class_f1 < WORST_CLASS_F1_THRESHOLD:
        reasons.append(
            f"worst_class_f1 {worst_class_f1:.4f} ({worst_class}) is below "
            f"threshold {WORST_CLASS_F1_THRESHOLD}"
        )

    return {
        "f1_macro_threshold": F1_MACRO_THRESHOLD,
        "worst_class_f1_threshold": WORST_CLASS_F1_THRESHOLD,
        "passed": len(reasons) == 0,
        "failure_reasons": reasons,
    }


def print_gate_result(gates: Dict[str, Any]) -> None:
    """Print the final PASSED/FAILED verdict with specific failure reasons."""
    print("\n" + "=" * 78)
    if gates["passed"]:
        print("\u2705 PASSED - all gates satisfied")
    else:
        print("\u274c FAILED - release blocked")
        for reason in gates["failure_reasons"]:
            print(f"  - {reason}")
    print("=" * 78)


# --------------------------------------------------------------------------
# Report
# --------------------------------------------------------------------------

def build_report(
    model_path: str,
    regression_result: Dict[str, Any],
    test_result: Dict[str, Any],
    gates: Dict[str, Any],
) -> Dict[str, Any]:
    """Assemble the full JSON report structure written to --output."""
    return {
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "model_path": model_path,
        "gates": gates,
        "regression_suite": regression_result,
        "test_set": test_result,
    }


def write_report(report: Dict[str, Any], path: Path) -> None:
    """Write the report as pretty-printed JSON, creating parent dirs if needed."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(report, f, indent=2)


# --------------------------------------------------------------------------
# Entry point
# --------------------------------------------------------------------------

def main() -> int:
    """Run the evaluation harness end to end and return a process exit code."""
    args = parse_args()

    warn_if_test_set_stale(Path(args.test_set))

    try:
        device = resolve_device(args.device)
        print(f"Loading model from '{args.model_path}' onto {device} ...")
        model, tokenizer = load_model_and_tokenizer(args.model_path, device)
    except Exception as exc:  # any load failure is a setup error, not a gate failure
        print(
            f"[setup error] failed to load model/tokenizer from "
            f"'{args.model_path}': {exc}",
            file=sys.stderr,
        )
        return 2

    try:
        regression_examples = load_regression_suite(Path(args.regression_suite))
    except (FileNotFoundError, ValueError, KeyError, json.JSONDecodeError) as exc:
        print(
            f"[setup error] failed to load regression suite "
            f"'{args.regression_suite}': {exc}",
            file=sys.stderr,
        )
        return 2

    try:
        test_df = load_test_set(Path(args.test_set))
    except (FileNotFoundError, ValueError) as exc:
        print(
            f"[setup error] failed to load test set '{args.test_set}': {exc}",
            file=sys.stderr,
        )
        return 2

    regression_result = evaluate_regression_suite(
        regression_examples, model, tokenizer, device, args.batch_size
    )
    print_regression_report(regression_result)

    test_result = evaluate_test_set(test_df, model, tokenizer, device, args.batch_size)
    print_test_set_report(test_result)

    gates = check_gates(regression_result, test_result)
    print_gate_result(gates)

    report = build_report(args.model_path, regression_result, test_result, gates)
    output_path = Path(args.output)
    write_report(report, output_path)
    print(f"\nReport written to {output_path}")

    return 0 if gates["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())