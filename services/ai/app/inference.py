"""
app/inference.py
------------------
Loads serialized model artifacts and performs scam-probability inference.
Kept separate from app/main.py so it can be unit-tested without spinning
up the FastAPI/Uvicorn server.
"""

import json
from pathlib import Path
from typing import Optional

import joblib
from loguru import logger

from app.config import classify_score, settings
from app.utils.text_normalize import normalize_text


class ModelNotLoadedError(Exception):
    """Raised when /predict is called before artifacts have been trained."""


class ScamClassifier:
    """
    Thin wrapper around the persisted TF-IDF vectorizer + Logistic
    Regression classifier. Instantiated once at FastAPI startup and
    reused across requests (loading the .pkl files per-request would be
    needlessly slow).
    """

    def __init__(self) -> None:
        self.vectorizer = None
        self.classifier = None
        self.metadata: dict = {}
        self.loaded = False
        self._try_load()

    def _try_load(self) -> None:
        vec_path: Path = settings.VECTORIZER_PATH
        clf_path: Path = settings.CLASSIFIER_PATH
        meta_path: Path = settings.METADATA_PATH

        if not vec_path.exists() or not clf_path.exists():
            logger.warning(
                "Model artifacts not found at {} / {}. "
                "The /predict endpoint will return 503 until you run: "
                "python scripts/train.py",
                vec_path,
                clf_path,
            )
            self.loaded = False
            return

        try:
            self.vectorizer = joblib.load(vec_path)
            self.classifier = joblib.load(clf_path)
            if meta_path.exists():
                self.metadata = json.loads(meta_path.read_text(encoding="utf-8"))
            self.loaded = True
            logger.info(
                "Loaded model artifacts (run_id={}, test_accuracy={})",
                self.metadata.get("run_id", "unknown"),
                self.metadata.get("test_metrics", {}).get("accuracy", "unknown"),
            )
        except Exception as exc:  # noqa: BLE001
            logger.error("Failed to load model artifacts: {}", exc)
            self.loaded = False

    def reload(self) -> None:
        """Re-attempt loading artifacts, e.g. after training completes."""
        self._try_load()

    @property
    def model_version(self) -> str:
        return self.metadata.get("run_id", "unknown")

    def predict(self, clean_text: str) -> float:
        """
        Return the probability (0.0-1.0) that `clean_text` is scam-like.
        `clean_text` must already be normalized via normalize_text().
        """
        if not self.loaded or self.vectorizer is None or self.classifier is None:
            raise ModelNotLoadedError(
                "Model artifacts are not loaded. Run scripts/train.py first."
            )

        if not clean_text:
            # No usable text at all -> cannot make a meaningful judgement.
            # Return a neutral, non-alarming probability rather than
            # guessing; the label will resolve to "likely_legitimate" /
            # low-confidence uncertain territory, and the gateway/officers
            # can decide based on other report metadata.
            return 0.0

        X = self.vectorizer.transform([clean_text])
        prob = float(self.classifier.predict_proba(X)[0, 1])
        return prob


# Singleton instance used by the FastAPI app.
classifier_singleton: Optional[ScamClassifier] = None


def get_classifier() -> ScamClassifier:
    global classifier_singleton
    if classifier_singleton is None:
        classifier_singleton = ScamClassifier()
    return classifier_singleton


def predict_from_raw_text(raw_text: str) -> dict:
    """Convenience wrapper: normalize + predict + classify in one call."""
    clean = normalize_text(raw_text)
    clf = get_classifier()
    prob = clf.predict(clean)
    return {
        "probability_score": round(prob, 4),
        "label": classify_score(prob),
        "model_version": clf.model_version,
    }