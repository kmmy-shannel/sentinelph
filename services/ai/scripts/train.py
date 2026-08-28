"""
scripts/train.py
-----------------
SentinelPH — AI Scam Detection Pipeline — Model Training Script.

Pipeline:
    1. Load the UCI SMS Spam Collection dataset (downloads it once if not
       already present in services/ai/data/).
    2. Normalize text (utils/text_normalize.normalize_text — same function
       used at inference time to prevent train/serve skew).
    3. Stratified 80/10/10 train/val/test split.
    4. Fit a TF-IDF vectorizer on the TRAIN split only (never on val/test,
       to avoid data leakage).
    5. Train a Logistic Regression classifier with a light hyperparameter
       sweep on the validation split.
    6. Evaluate the final model on the held-out TEST split: Accuracy,
       Precision, Recall, F1, Confusion Matrix, ROC-AUC.
    7. Enforce the SRS accuracy gate (>= 85%) before allowing artifacts to
       be written — a model that misses the bar is NOT silently deployed.
    8. Serialize vectorizer + classifier (.pkl via joblib) and a
       model_metadata.json with full experiment provenance.

Usage:
    python scripts/train.py
    python scripts/train.py --C 0.5 --max-features 6000

Run from inside services/ai/ with the virtualenv activated.
"""

import argparse
import json
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import joblib
import pandas as pd
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    accuracy_score,
    confusion_matrix,
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import train_test_split

# Allow running as `python scripts/train.py` from services/ai/
sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.utils.text_normalize import normalize_text

DATASET_URL = (
    "https://archive.ics.uci.edu/static/public/228/sms+spam+collection.zip"
)
DATASET_MIRROR_URL = (
    "https://raw.githubusercontent.com/mohitgupta-omg/"
    "Kaggle-SMS-Spam-Collection-Dataset-/master/spam.csv"
)


def _download_dataset(dest: Path) -> None:
    """
    Download the UCI SMS Spam Collection dataset if it isn't already
    present locally. Tries the official UCI zip first, falls back to a
    known CSV mirror. If both fail (e.g. offline environment), raises a
    clear error telling the operator how to source the file manually.
    """
    import io
    import zipfile

    import requests

    print(f"[train] Dataset not found at {dest}. Attempting download...")

    try:
        resp = requests.get(DATASET_URL, timeout=30)
        resp.raise_for_status()
        with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
            with zf.open("SMSSpamCollection") as f:
                raw = f.read().decode("utf-8", errors="replace")
        dest.write_text(raw, encoding="utf-8")
        print(f"[train] Downloaded UCI dataset -> {dest}")
        return
    except Exception as exc:  # noqa: BLE001
        print(f"[train] Primary UCI source failed ({exc}). Trying mirror...")

    try:
        resp = requests.get(DATASET_MIRROR_URL, timeout=30)
        resp.raise_for_status()
        df = pd.read_csv(
            io.StringIO(resp.content.decode("latin-1")),
            encoding="latin-1",
        )
        df = df.iloc[:, :2]
        df.columns = ["label", "text"]
        df.to_csv(dest, sep="\t", header=False, index=False)
        print(f"[train] Downloaded mirror dataset -> {dest}")
        return
    except Exception as exc:  # noqa: BLE001
        raise RuntimeError(
            "Could not automatically download the SMS Spam Collection "
            "dataset from either source. Please manually download the "
            "'SMSSpamCollection' file from "
            "https://archive.ics.uci.edu/dataset/228/sms+spam+collection "
            f"and place it at: {dest} "
            "(tab-separated, two columns: label, text — no header row)."
        ) from exc


def load_dataset() -> pd.DataFrame:
    """Load the raw dataset into a DataFrame with columns [label, text]."""
    dest = settings.RAW_DATA_PATH
    if not dest.exists():
        _download_dataset(dest)

    df = pd.read_csv(
        dest,
        sep="\t",
        header=None,
        names=["label", "text"],
        encoding="utf-8",
        on_bad_lines="skip",
    )
    df = df.dropna(subset=["label", "text"])
    df["label"] = df["label"].str.strip().str.lower()
    df = df[df["label"].isin(["ham", "spam"])].reset_index(drop=True)

    if df.empty:
        raise RuntimeError(
            f"Loaded 0 usable rows from {dest}. Check the dataset format."
        )

    return df


def stratified_three_way_split(df: pd.DataFrame, args: argparse.Namespace):
    """
    Perform a stratified 80/10/10 train/val/test split.

    sklearn's train_test_split only splits two ways, so we chain two
    stratified splits:
        1. train (80%) vs temp (20%)
        2. temp (20%) -> val (10%) / test (10%)  [50/50 of the 20%]
    """
    train_df, temp_df = train_test_split(
        df,
        train_size=settings.TRAIN_SIZE,
        stratify=df["label"],
        random_state=settings.RANDOM_STATE,
    )
    val_df, test_df = train_test_split(
        temp_df,
        test_size=0.5,  # 0.5 of the remaining 20% -> 10% / 10% overall
        stratify=temp_df["label"],
        random_state=settings.RANDOM_STATE,
    )
    return (
        train_df.reset_index(drop=True),
        val_df.reset_index(drop=True),
        test_df.reset_index(drop=True),
    )


def evaluate(y_true, y_pred, y_prob) -> dict:
    cm = confusion_matrix(y_true, y_pred, labels=[0, 1])
    return {
        "accuracy": round(accuracy_score(y_true, y_pred), 4),
        "precision": round(precision_score(y_true, y_pred, zero_division=0), 4),
        "recall": round(recall_score(y_true, y_pred, zero_division=0), 4),
        "f1_score": round(f1_score(y_true, y_pred, zero_division=0), 4),
        "roc_auc": round(roc_auc_score(y_true, y_prob), 4),
        "confusion_matrix": {
            "tn": int(cm[0][0]),
            "fp": int(cm[0][1]),
            "fn": int(cm[1][0]),
            "tp": int(cm[1][1]),
        },
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train SentinelPH scam classifier")
    parser.add_argument("--max-features", type=int, default=5000)
    parser.add_argument("--ngram-max", type=int, default=2)
    parser.add_argument(
        "--C",
        type=float,
        nargs="+",
        default=[0.1, 0.5, 1.0, 2.0, 5.0],
        help="Candidate inverse-regularization values swept on the val split",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Write artifacts even if the test accuracy gate is not met",
    )
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(f"[train] Run ID: {run_id}")
    t_start = time.time()

    # 1. Load
    print("[train] Loading dataset...")
    df = load_dataset()
    print(f"[train] Loaded {len(df)} rows "
          f"({(df['label'] == 'spam').sum()} spam / "
          f"{(df['label'] == 'ham').sum()} ham)")

    # 2. Normalize
    print("[train] Normalizing text...")
    df["clean_text"] = df["text"].apply(normalize_text)
    df["target"] = (df["label"] == "spam").astype(int)  # 1 = spam/scam-like

    # 3. Stratified 80/10/10 split
    print("[train] Performing stratified 80/10/10 split...")
    train_df, val_df, test_df = stratified_three_way_split(df, args)
    print(f"[train]   train={len(train_df)} val={len(val_df)} test={len(test_df)}")

    # 4. Fit vectorizer on TRAIN ONLY
    print("[train] Fitting TF-IDF vectorizer on training split...")
    vectorizer = TfidfVectorizer(
        max_features=args.max_features,
        ngram_range=(1, args.ngram_max),
        min_df=2,
        sublinear_tf=True,
    )
    X_train = vectorizer.fit_transform(train_df["clean_text"])
    X_val = vectorizer.transform(val_df["clean_text"])
    X_test = vectorizer.transform(test_df["clean_text"])

    y_train = train_df["target"].values
    y_val = val_df["target"].values
    y_test = test_df["target"].values

    # 5. Hyperparameter sweep on validation split
    print(f"[train] Sweeping C in {args.C} on validation split...")
    best_C = None
    best_val_f1 = -1.0
    sweep_results = []
    for C in args.C:
        clf = LogisticRegression(
            C=C, max_iter=1000, class_weight="balanced",
            random_state=settings.RANDOM_STATE,
        )
        clf.fit(X_train, y_train)
        val_pred = clf.predict(X_val)
        val_f1 = f1_score(y_val, val_pred, zero_division=0)
        sweep_results.append({"C": C, "val_f1": round(val_f1, 4)})
        print(f"[train]   C={C:<6} val_f1={val_f1:.4f}")
        if val_f1 > best_val_f1:
            best_val_f1 = val_f1
            best_C = C

    print(f"[train] Best C selected: {best_C} (val_f1={best_val_f1:.4f})")

    # Refit best model on train+val for the final model (standard practice:
    # test split remains completely untouched until final evaluation).
    print("[train] Refitting best model on train+val, evaluating on test...")
    X_trainval = vectorizer.transform(
        pd.concat([train_df["clean_text"], val_df["clean_text"]])
    )
    y_trainval = pd.concat(
        [train_df["target"], val_df["target"]]
    ).values

    final_clf = LogisticRegression(
        C=best_C, max_iter=1000, class_weight="balanced",
        random_state=settings.RANDOM_STATE,
    )
    final_clf.fit(X_trainval, y_trainval)

    # 6. Final evaluation on held-out TEST split
    test_pred = final_clf.predict(X_test)
    test_prob = final_clf.predict_proba(X_test)[:, 1]
    metrics = evaluate(y_test, test_pred, test_prob)

    print("\n[train] ===== TEST SET METRICS =====")
    for k, v in metrics.items():
        print(f"[train]   {k}: {v}")

    # 7. Enforce SRS accuracy gate
    passed_gate = metrics["accuracy"] >= settings.MIN_TEST_ACCURACY
    if not passed_gate:
        msg = (
            f"[train] FAILED accuracy gate: {metrics['accuracy']:.4f} < "
            f"required {settings.MIN_TEST_ACCURACY:.2f}."
        )
        if args.force:
            print(msg + " Writing artifacts anyway because --force was passed.")
        else:
            print(msg + " Artifacts NOT written. Re-run with --force to override, "
                        "or adjust --max-features / --C / --ngram-max.")
            sys.exit(1)
    else:
        print(f"[train] PASSED accuracy gate: {metrics['accuracy']:.4f} >= "
              f"{settings.MIN_TEST_ACCURACY:.2f}")

    # 8. Serialize artifacts
    settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, settings.VECTORIZER_PATH)
    joblib.dump(final_clf, settings.CLASSIFIER_PATH)

    metadata = {
        "run_id": run_id,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - t_start, 2),
        "dataset": {
            "source_path": str(settings.RAW_DATA_PATH),
            "total_rows": len(df),
            "spam_rows": int((df["label"] == "spam").sum()),
            "ham_rows": int((df["label"] == "ham").sum()),
            "train_rows": len(train_df),
            "val_rows": len(val_df),
            "test_rows": len(test_df),
        },
        "vectorizer": {
            "type": "TfidfVectorizer",
            "max_features": args.max_features,
            "ngram_range": [1, args.ngram_max],
            "min_df": 2,
            "sublinear_tf": True,
            "vocabulary_size": len(vectorizer.vocabulary_),
        },
        "model": {
            "type": "LogisticRegression",
            "selected_C": best_C,
            "class_weight": "balanced",
            "hyperparameter_sweep": sweep_results,
        },
        "test_metrics": metrics,
        "accuracy_gate": {
            "required_min_accuracy": settings.MIN_TEST_ACCURACY,
            "passed": passed_gate,
        },
        "thresholds": {
            "likely_scam": settings.THRESHOLD_LIKELY_SCAM,
            "uncertain_low": settings.THRESHOLD_UNCERTAIN_LOW,
        },
        "sklearn_artifact_files": {
            "vectorizer": settings.VECTORIZER_PATH.name,
            "classifier": settings.CLASSIFIER_PATH.name,
        },
    }
    settings.METADATA_PATH.write_text(
        json.dumps(metadata, indent=2), encoding="utf-8"
    )

    print(f"\n[train] Artifacts written to {settings.MODELS_DIR}")
    print(f"[train]   - {settings.VECTORIZER_PATH.name}")
    print(f"[train]   - {settings.CLASSIFIER_PATH.name}")
    print(f"[train]   - {settings.METADATA_PATH.name}")
    print(f"[train] Total run time: {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()