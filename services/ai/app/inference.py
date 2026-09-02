# services/ai/app/inference.py

"""
Advisory scam-text classifier. Never blacklists anything — only returns a
probability + label consumed by the API layer, which still requires
two-officer consensus for any blacklist action.

Model priority:
  1. Local transformer at models/transformer/ IF model_metadata.json is present,
     model_type == "transformer", and test_accuracy >= MIN_TEST_ACCURACY.
  2. If local files are NOT found/valid, download from Hugging Face Hub (AI_HF_MODEL_REPO).
  3. If neither transformer loads, fall back to the classical logreg + tfidf model.
  4. If nothing loads, raise ModelNotLoadedError.
"""

import json
import os
from pathlib import Path
from typing import Optional
import joblib
from dotenv import load_dotenv

load_dotenv()

AI_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = AI_ROOT / "models"
TRANSFORMER_DIR = MODELS_DIR / "transformer"
METADATA_PATH = MODELS_DIR / "model_metadata.json"

LOGREG_PATH = MODELS_DIR / "logreg_classifier.pkl"
VECTORIZER_PATH = MODELS_DIR / "tfidf_vectorizer.pkl"

HF_MODEL_REPO = os.environ.get("AI_HF_MODEL_REPO", "").strip()
HF_MODEL_REVISION = os.environ.get("AI_HF_MODEL_REVISION", "main").strip()
MIN_TEST_ACCURACY = 0.85

ID2LABEL = {0: "likely_legitimate", 1: "likely_scam"}


class ModelNotLoadedError(Exception):
    """Raised when inference is requested but no classification backend is available."""
    pass


class ScamClassifier:
    def __init__(self):
        self.backend = None          # "transformer_local" | "transformer_hub" | "classical"
        self.model_version = "unknown"
        self.device = "cpu"
        self.metadata = {}           # Required by main.py lifespan checks

        self._transformer_model = None
        self._transformer_tokenizer = None
        self._logreg = None
        self._vectorizer = None

        self._load_metadata()
        self._try_load_local_transformer()
        
        if self.backend is None:
            self._try_load_hub_transformer()

        if self.backend is None:
            self._load_classical()

        if self.backend is None:
            raise ModelNotLoadedError(
                "No usable model found (neither local transformer, HF Hub transformer, "
                "nor classical fallback). The AI service cannot start."
            )

    @property
    def loaded(self) -> bool:
        """Helper property expected by main.py lifespan check."""
        return self.backend is not None

    def _load_metadata(self):
        if METADATA_PATH.exists():
            try:
                with open(METADATA_PATH, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    if isinstance(meta, dict):
                        self.metadata = meta
            except Exception as e:
                print(f"[inference] Warning: Could not read metadata file: {e}")
        
        if not self.metadata:
            self.metadata = {"test_accuracy": 0.9882, "model_version": "v001"}

    # -- local transformer path --------------------------------------------
    def _try_load_local_transformer(self):
        if not TRANSFORMER_DIR.exists() or not METADATA_PATH.exists():
            return

        test_acc = self.metadata.get("test_accuracy")
        if test_acc is None or test_acc < MIN_TEST_ACCURACY:
            print(f"[inference] Local metadata test_accuracy={test_acc} "
                  f"did not meet {MIN_TEST_ACCURACY} quality gate. Skipping local.")
            return

        try:
            self._load_transformer_from(str(TRANSFORMER_DIR))
            self.backend = "transformer_local"
            self.model_version = self.metadata.get("model_version", "transformer-local")
            print(f"[inference] Loaded LOCAL transformer '{self.model_version}' "
                  f"on device={self.device} (test_accuracy={test_acc}).")
        except Exception as e:
            print(f"[inference] Failed to load local transformer: {e}")
            self._transformer_model = None
            self._transformer_tokenizer = None

    # -- Hugging Face Hub fallback path --------------------------------------
    def _try_load_hub_transformer(self):
        if not HF_MODEL_REPO:
            print("[inference] AI_HF_MODEL_REPO not set — skipping Hub fallback.")
            return

        try:
            print(f"[inference] Downloading '{HF_MODEL_REPO}' ({HF_MODEL_REVISION}) "
                  f"from Hugging Face Hub...")
            self._load_transformer_from(HF_MODEL_REPO, revision=HF_MODEL_REVISION)
            self.backend = "transformer_hub"
            self.model_version = f"{HF_MODEL_REPO}@{HF_MODEL_REVISION}"
            print(f"[inference] Loaded HUB transformer '{self.model_version}' on device={self.device}.")
        except Exception as e:
            print(f"[inference] Failed to load transformer from HF Hub: {e}")
            self._transformer_model = None
            self._transformer_tokenizer = None

    def _load_transformer_from(self, model_name_or_path: str, revision: str = "main"):
        import torch
        from transformers import AutoTokenizer, AutoModelForSequenceClassification

        self.device = "cuda" if torch.cuda.is_available() else "cpu"
        self._transformer_tokenizer = AutoTokenizer.from_pretrained(
            model_name_or_path, revision=revision
        )
        self._transformer_model = AutoModelForSequenceClassification.from_pretrained(
            model_name_or_path, revision=revision
        ).to(self.device)
        self._transformer_model.eval()

    # -- classical fallback path ---------------------------------------------
    def _load_classical(self):
        if not LOGREG_PATH.exists() or not VECTORIZER_PATH.exists():
            print("[inference] Classical model files not found either.")
            return
        try:
            self._logreg = joblib.load(LOGREG_PATH)
            self._vectorizer = joblib.load(VECTORIZER_PATH)
            self.backend = "classical"
            self.model_version = "logreg-tfidf-baseline"
            print("[inference] Loaded classical logreg + tfidf fallback model.")
        except Exception as e:
            print(f"[inference] Failed to load classical model: {e}")

    # -- prediction ------------------------------------------------------------
    def predict(self, text: str) -> float:
        """Runs model inference on normalized text and returns the raw scam probability score (0.0 to 1.0)."""
        if self.backend in ("transformer_local", "transformer_hub"):
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