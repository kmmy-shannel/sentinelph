"""
scripts/train.py
-----------------
SentinelPH — classical fallback trainer (TF-IDF + Logistic Regression).

Reads the pre-split 3-class dataset from prepare_dataset.py:
    data/processed/train.csv
    data/processed/val.csv
    data/processed/test.csv

Classes:
    0 = legitimate
    1 = grey_area
    2 = malicious

Usage:
    python scripts/train.py
    python scripts/train.py --C 0.5 1.0 2.0 --max-features 6000
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
    classification_report,
    confusion_matrix,
    f1_score,
)

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.utils.text_normalize import normalize_text  # noqa: E402

PROCESSED_DIR = Path(__file__).resolve().parents[1] / "data" / "processed"
TRAIN_CSV = PROCESSED_DIR / "train.csv"
VAL_CSV = PROCESSED_DIR / "val.csv"
TEST_CSV = PROCESSED_DIR / "test.csv"

LABEL_NAMES = ["legitimate", "grey_area", "malicious"]
MIN_F1_MACRO = 0.75
MIN_F1_GREY_AREA = 0.55


def load_split(path: Path, name: str) -> pd.DataFrame:
    if not path.exists():
        print(f"[ERROR] {path} not found. Run prepare_dataset.py first.")
        sys.exit(1)
    df = pd.read_csv(path)
    df = df.dropna(subset=["text", "label"])
    df["label"] = df["label"].astype(int)
    df = df[df["label"].isin([0, 1, 2])].reset_index(drop=True)
    df["clean_text"] = df["text"].apply(normalize_text)
    print(f"[train] {name}: {len(df)} rows")
    return df


def main() -> None:
    parser = argparse.ArgumentParser(description="Train SentinelPH classical 3-class classifier")
    parser.add_argument("--max-features", type=int, default=8000)
    parser.add_argument("--ngram-max", type=int, default=2)
    parser.add_argument("--C", type=float, nargs="+", default=[0.1, 0.5, 1.0, 2.0, 5.0])
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    run_id = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    print(f"[train] Run ID: {run_id}")
    t_start = time.time()

    train_df = load_split(TRAIN_CSV, "train")
    val_df = load_split(VAL_CSV, "val")
    test_df = load_split(TEST_CSV, "test")

    vectorizer = TfidfVectorizer(
        max_features=args.max_features,
        ngram_range=(1, args.ngram_max),
        min_df=2,
        sublinear_tf=True,
    )
    X_train = vectorizer.fit_transform(train_df["clean_text"])
    X_val = vectorizer.transform(val_df["clean_text"])
    X_test = vectorizer.transform(test_df["clean_text"])
    y_train = train_df["label"].values
    y_val = val_df["label"].values
    y_test = test_df["label"].values

    print(f"[train] Sweeping C in {args.C} on validation split...")
    best_C = None
    best_val_f1_macro = -1.0
    sweep_results = []
    for C in args.C:
        clf = LogisticRegression(
            C=C, max_iter=2000, class_weight="balanced",
            random_state=settings.RANDOM_STATE, multi_class="multinomial",
        )
        clf.fit(X_train, y_train)
        val_pred = clf.predict(X_val)
        val_f1_macro = f1_score(y_val, val_pred, average="macro", zero_division=0)
        sweep_results.append({"C": C, "val_f1_macro": round(val_f1_macro, 4)})
        print(f"[train]   C={C:<6} val_f1_macro={val_f1_macro:.4f}")
        if val_f1_macro > best_val_f1_macro:
            best_val_f1_macro = val_f1_macro
            best_C = C

    print(f"[train] Best C={best_C} (val_f1_macro={best_val_f1_macro:.4f})")

    # Refit on train+val
    X_trainval = vectorizer.transform(
        pd.concat([train_df["clean_text"], val_df["clean_text"]])
    )
    y_trainval = pd.concat([train_df["label"], val_df["label"]]).values

    final_clf = LogisticRegression(
        C=best_C, max_iter=2000, class_weight="balanced",
        random_state=settings.RANDOM_STATE, multi_class="multinomial",
    )
    final_clf.fit(X_trainval, y_trainval)

    test_pred = final_clf.predict(X_test)
    acc = accuracy_score(y_test, test_pred)
    f1_macro = f1_score(y_test, test_pred, average="macro", zero_division=0)
    f1_per_class = f1_score(y_test, test_pred, average=None, labels=[0, 1, 2], zero_division=0)
    f1_grey = float(f1_per_class[1])
    cm = confusion_matrix(y_test, test_pred, labels=[0, 1, 2])
    report = classification_report(
        y_test, test_pred, labels=[0, 1, 2], target_names=LABEL_NAMES, zero_division=0
    )

    print("\n[train] ===== TEST SET METRICS =====")
    print(f"[train]   accuracy:      {acc:.4f}")
    print(f"[train]   f1_macro:      {f1_macro:.4f}")
    print(f"[train]   f1_legitimate: {f1_per_class[0]:.4f}")
    print(f"[train]   f1_grey_area:  {f1_grey:.4f}   <-- hard class")
    print(f"[train]   f1_malicious:  {f1_per_class[2]:.4f}")
    print("[train] Confusion matrix (rows=true, cols=pred, [legit, grey, malicious]):")
    print(cm)
    print("[train] Classification report:")
    print(report)

    gate_fail = (f1_macro < MIN_F1_MACRO) or (f1_grey < MIN_F1_GREY_AREA)
    if gate_fail:
        msg = (f"[train] FAILED gate: f1_macro={f1_macro:.4f} (need {MIN_F1_MACRO}), "
               f"f1_grey_area={f1_grey:.4f} (need {MIN_F1_GREY_AREA})")
        if args.force:
            print(msg + " — writing artifacts because --force")
        else:
            print(msg + " — artifacts NOT written.")
            sys.exit(1)
    else:
        print(f"[train] PASSED gate: f1_macro={f1_macro:.4f}, f1_grey_area={f1_grey:.4f}")

    settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
    joblib.dump(vectorizer, settings.VECTORIZER_PATH)
    joblib.dump(final_clf, settings.CLASSIFIER_PATH)

    metadata = {
        "run_id": run_id,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "duration_seconds": round(time.time() - t_start, 2),
        "num_labels": 3,
        "label_mapping": {"0": "legitimate", "1": "grey_area", "2": "malicious"},
        "dataset": {
            "train_rows": len(train_df),
            "val_rows": len(val_df),
            "test_rows": len(test_df),
        },
        "vectorizer": {
            "type": "TfidfVectorizer",
            "max_features": args.max_features,
            "ngram_range": [1, args.ngram_max],
        },
        "model": {"type": "LogisticRegression", "selected_C": best_C,
                  "sweep": sweep_results},
        "test_metrics": {
            "accuracy": round(float(acc), 4),
            "f1_macro": round(float(f1_macro), 4),
            "f1_legitimate": round(float(f1_per_class[0]), 4),
            "f1_grey_area": round(float(f1_grey), 4),
            "f1_malicious": round(float(f1_per_class[2]), 4),
        },
        "gate": {
            "min_f1_macro": MIN_F1_MACRO,
            "min_f1_grey_area": MIN_F1_GREY_AREA,
            "passed": not gate_fail,
        },
    }
    settings.METADATA_PATH.write_text(json.dumps(metadata, indent=2), encoding="utf-8")

    print(f"\n[train] Artifacts -> {settings.MODELS_DIR}")
    print(f"[train] Total time: {time.time() - t_start:.1f}s")


if __name__ == "__main__":
    main()