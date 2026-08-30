# services/ai/app/inference.py

"""
Advisory scam-text classifier. Never blacklists anything — only returns a
probability + label consumed by the API layer, which still requires
two-officer consensus for any blacklist action.

Model priority:
  1. Transformer model at models/transformer/ IF it exists and its recorded
     test_accuracy in model_metadata.json passed the 85% quality gate.
  2. Otherwise, fall back to the classical logreg + tfidf model.
  3. If the transformer fails to load for any reason, fall back to classical
     rather than crashing the API.
"""

import json
import pickle
from pathlib import Path
from typing import Optional

AI_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = AI_ROOT / "models"
TRANSFORMER_DIR = MODELS_DIR / "transformer"
METADATA_PATH = MODELS_DIR / "model_metadata.json"

LOGREG_PATH = MODELS_DIR / "logreg_classifier.pkl"
VECTORIZER_PATH = MODELS_DIR / "tfidf_vectorizer.pkl"

MIN_TEST_ACCURACY = 0.85

ID2LABEL = {0: "likely_legitimate", 1: "likely_scam"}


class ModelNotLoadedError(Exception):
    """Raised when inference is requested but no classification backend is available."""
    pass


class ScamClassifier:
    def __init__(self):
        self.backend = None          # "transformer" or "classical"
        self.model_version = "unknown"
        self.device = "cpu"
        self.metadata = {}           # Stores model metadata for main.py lifespan checks

        self._transformer_model = None
        self._transformer_tokenizer = None
        self._logreg = None
        self._vectorizer = None

        self._try_load_transformer()
        if self.backend is None:
            self._load_classical()

        if self.backend is None:
            raise ModelNotLoadedError(
                "No usable model found (neither transformer nor classical). "
                "The AI service cannot start without at least the classical "
                "fallback model present."
            )

    @property
    def loaded(self) -> bool:
        """Helper property expected by main.py lifespan check."""
        return self.backend is not None

    # -- transformer path -------------------------------------------------
    def _try_load_transformer(self):
        if not TRANSFORMER_DIR.exists() or not METADATA_PATH.exists():
            return
        try:
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                meta = json.load(f)
                self.metadata = meta if isinstance(meta, dict) else {}
        except Exception as e:
            print(f"[inference] Could not read model_metadata.json: {e}. "
                  f"Falling back to classical model.")
            return

        if meta.get("model_type") != "transformer":
            return

        test_acc = meta.get("test_accuracy")
        if test_acc is None or test_acc < MIN_TEST_ACCURACY:
            print(f"[inference] Transformer metadata present but test_accuracy="
                  f"{test_acc} did not meet the {MIN_TEST_ACCURACY} quality gate. "
                  f"Falling back to classical model.")
            return

        try:
            import torch
            from transformers import AutoTokenizer, AutoModelForSequenceClassification

            self.device = "cuda" if torch.cuda.is_available() else "cpu"
            self._transformer_tokenizer = AutoTokenizer.from_pretrained(str(TRANSFORMER_DIR))
            self._transformer_model = AutoModelForSequenceClassification.from_pretrained(
                str(TRANSFORMER_DIR)
            ).to(self.device)
            self._transformer_model.eval()

            self.backend = "transformer"
            self.model_version = meta.get("model_version", "transformer-unknown")
            print(f"[inference] Loaded transformer model '{self.model_version}' "
                  f"on device={self.device} (test_accuracy={test_acc}).")
        except Exception as e:
            print(f"[inference] Failed to load transformer model, falling back "
                  f"to classical. Reason: {e}")
            self._transformer_model = None
            self._transformer_tokenizer = None
            self.backend = None

    # -- classical fallback path -------------------------------------------
    def _load_classical(self):
        if not LOGREG_PATH.exists() or not VECTORIZER_PATH.exists():
            print("[inference] Classical model files not found either.")
            return
        try:
            with open(LOGREG_PATH, "rb") as f:
                self._logreg = pickle.load(f)
            with open(VECTORIZER_PATH, "rb") as f:
                self._vectorizer = pickle.load(f)
            self.backend = "classical"
            self.model_version = "logreg-tfidf-baseline"
            print("[inference] Loaded classical logreg + tfidf fallback model.")
        except Exception as e:
            print(f"[inference] Failed to load classical model: {e}")

    # -- prediction ----------------------------------------------------------
   # -- prediction ----------------------------------------------------------
    def predict(self, text: str) -> float:
        """Runs model inference on normalized text and returns the raw scam probability score (0.0 to 1.0)."""
        if self.backend == "transformer":
            probability_score, _ = self._predict_transformer(text)
        elif self.backend == "classical":
            probability_score, _ = self._predict_classical(text)
        else:
            raise RuntimeError("No model backend loaded.")

        return float(probability_score)

    def _predict_transformer(self, text: str):
        import torch

        inputs = self._transformer_tokenizer(
            text, truncation=True, padding=True, max_length=256, return_tensors="pt"
        ).to(self.device)
        with torch.no_grad():
            logits = self._transformer_model(**inputs).logits
            probs = torch.softmax(logits, dim=-1).squeeze().tolist()
        scam_prob = probs[1]
        label = ID2LABEL[1] if scam_prob >= 0.5 else ID2LABEL[0]
        return scam_prob, label

    def _predict_classical(self, text: str):
        vec = self._vectorizer.transform([text])
        proba = self._logreg.predict_proba(vec)[0]
        scam_prob = proba[1] if len(proba) > 1 else proba[0]
        label = ID2LABEL[1] if scam_prob >= 0.5 else ID2LABEL[0]
        return scam_prob, label


# Singleton, loaded once at API startup.
_classifier: Optional[ScamClassifier] = None


def get_classifier() -> ScamClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ScamClassifier()
    return _classifier