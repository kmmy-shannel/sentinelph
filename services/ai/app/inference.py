# services/ai/app/inference.py
"""
3-class advisory scam classifier.

Classes: 0=legitimate, 1=grey_area, 2=malicious.

Returns:
    - label: argmax class name
    - probability_score: P(malicious) — kept for existing UI banner
    - risk_level: "low" | "medium" | "high"
    - explanation_reasons: heuristic breakdown

Model priority:
    1. Local transformer (models/transformer/)
    2. Hugging Face Hub
    3. Classical logreg + tfidf fallback
"""

import json
import os
import re
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import joblib
from dotenv import load_dotenv

load_dotenv()

AI_ROOT = Path(__file__).resolve().parents[1]
MODELS_DIR = AI_ROOT / "models"
TRANSFORMER_DIR = MODELS_DIR / "transformer"
METADATA_PATH = MODELS_DIR / "model_metadata.json"
LOGREG_PATH = MODELS_DIR / "logreg_classifier.pkl"
VECTORIZER_PATH = MODELS_DIR / "tfidf_vectorizer.pkl"

HF_MODEL_REPO = os.environ.get("AI_HF_MODEL_REPO", "kmmyyy14/sentinelph-distilbert-v001").strip()
HF_MODEL_REVISION = os.environ.get("AI_HF_MODEL_REVISION", "main").strip()

# === 3-CLASS CHANGE ===
ID2LABEL = {0: "legitimate", 1: "grey_area", 2: "malicious"}
LABEL2ID = {v: k for k, v in ID2LABEL.items()}
RISK_LEVELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
MALICIOUS_HEURISTIC_FLOOR = 0.90

MIN_TEST_ACCURACY = 0.85


class ModelNotLoadedError(Exception):
    pass


# --- Explainability: heuristic pattern extractor ---
_SHORTENER_DOMAINS = ("bit.ly", "tinyurl.com", "is.gd", "t.co", "goo.gl", "cutt.ly", "rb.gy")
_IP_URL_PATTERN = re.compile(r"\bhttps?://(?:\d{1,3}\.){3}\d{1,3}\b")
_SPOOFED_DOMAIN_PATTERN = re.compile(
    r"\b(gcash|paymaya|maya|bdo|unionbank|bpi|metrobank)[\-_][a-z0-9\-]*\.[a-z]{1,}",
    re.IGNORECASE,
)
_URL_PATTERN = re.compile(r"https?://\S+|\bwww\.\S+", re.IGNORECASE)
_URGENCY_PHRASES = (
    "suspended", "unauthorized login", "unauthorized access", "locked",
    "verify immediately", "verify now", "within 24 hours", "account will be closed",
    "act now", "immediate action", "limited time", "your account has been",
    "unusual activity", "restore access", "permanent deactivation",
)
_BRAND_NAMES = ("gcash", "maya", "paymaya", "bdo", "unionbank", "lazada", "shopee", "bpi", "metrobank")
_JOB_SCAM_PATTERNS = (
    re.compile(r"earn\s*(?:₱|php|p)\s*[\d,]+\s*/?\s*day", re.IGNORECASE),
    re.compile(r"part[\s\-]?time\s+job", re.IGNORECASE),
    re.compile(r"\btelegram\b", re.IGNORECASE),
    re.compile(r"work\s+from\s+home.{0,20}(?:income|earn|salary)", re.IGNORECASE),
)
_STRONG_OVERRIDE_CATEGORIES = {"Malicious Link", "Brand Impersonation"}


def blend_score_with_heuristics(probs: List[float], reasons: List[Dict[str, str]]) -> List[float]:
    """If a strong heuristic fires, floor P(malicious) at 0.90.

    probs: [p_legit, p_grey, p_malicious] — softmax output.
    Never lowers an already-confident malicious probability.
    """
    categories = {r["category"] for r in reasons}
    strong_hit = bool(categories & _STRONG_OVERRIDE_CATEGORIES)
    if strong_hit and probs[2] < MALICIOUS_HEURISTIC_FLOOR:
        print(f"[inference] Heuristic override: p_malicious {probs[2]:.4f} -> "
              f"{MALICIOUS_HEURISTIC_FLOOR} due to {sorted(categories & _STRONG_OVERRIDE_CATEGORIES)}.")
        new_probs = list(probs)
        new_probs[2] = MALICIOUS_HEURISTIC_FLOOR
        # Renormalize others so sum stays ~1.0
        remainder = 1.0 - MALICIOUS_HEURISTIC_FLOOR
        other_sum = probs[0] + probs[1]
        if other_sum > 0:
            new_probs[0] = probs[0] / other_sum * remainder
            new_probs[1] = probs[1] / other_sum * remainder
        else:
            new_probs[0] = remainder * 0.5
            new_probs[1] = remainder * 0.5
        return new_probs
    return probs


def extract_scam_explanations(text: str) -> List[Dict[str, str]]:
    if not text:
        return []
    reasons: List[Dict[str, str]] = []
    lower = text.lower()

    matched_shorteners = [d for d in _SHORTENER_DOMAINS if d in lower]
    if matched_shorteners:
        reasons.append({
            "category": "Malicious Link",
            "description": f"Contains a link shortener ({matched_shorteners[0]}) "
                            "commonly used to hide scam destinations.",
        })
    if _IP_URL_PATTERN.search(text):
        reasons.append({
            "category": "Malicious Link",
            "description": "Contains a raw IP-address link, a common phishing technique.",
        })
    spoofed_match = _SPOOFED_DOMAIN_PATTERN.search(lower)
    if spoofed_match:
        reasons.append({
            "category": "Malicious Link",
            "description": f"Contains a domain ('{spoofed_match.group(0)}') that "
                            "impersonates a known financial brand.",
        })

    matched_urgency = [p for p in _URGENCY_PHRASES if p in lower]
    if matched_urgency:
        sample = ", ".join(f"'{p}'" for p in matched_urgency[:3])
        reasons.append({
            "category": "Urgency/Panic Trigger",
            "description": f"Uses urgent or threatening language ({sample}).",
        })

    matched_brands = [b for b in _BRAND_NAMES if b in lower]
    has_link_or_action = bool(_URL_PATTERN.search(text)) or bool(matched_shorteners) \
        or bool(_IP_URL_PATTERN.search(text)) or bool(spoofed_match)
    if matched_brands and (has_link_or_action or matched_urgency):
        reasons.append({
            "category": "Brand Impersonation",
            "description": f"References '{matched_brands[0].upper()}' alongside an "
                            "unverified link or urgent action request.",
        })

    if any(p.search(text) for p in _JOB_SCAM_PATTERNS):
        reasons.append({
            "category": "Task/Job Scam",
            "description": "Mentions unrealistic earnings or off-platform contact.",
        })

    return reasons


def compute_risk_level(probs: List[float], reasons: List[Dict[str, str]]) -> str:
    """Argmax class -> risk bucket. Legit->low, grey->medium, malicious->high."""
    idx = max(range(3), key=lambda i: probs[i])
    return RISK_LEVELS[idx]


class ScamClassifier:
    def __init__(self):
        self.backend = None
        self.model_version = "unknown"
        self.device = "cpu"
        self.metadata = {}

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
                "No usable model found (local transformer, HF Hub, or classical)."
            )

    @property
    def loaded(self) -> bool:
        return self.backend is not None

    def _load_metadata(self):
        if METADATA_PATH.exists():
            try:
                with open(METADATA_PATH, "r", encoding="utf-8") as f:
                    meta = json.load(f)
                    if isinstance(meta, dict):
                        self.metadata = meta
            except Exception as e:
                print(f"[inference] Warning reading metadata: {e}")
        if not self.metadata:
            self.metadata = {"test_accuracy": 0.0, "model_version": "unknown"}

    def _try_load_local_transformer(self):
        if not TRANSFORMER_DIR.exists() or not METADATA_PATH.exists():
            return
        test_acc = self.metadata.get("test_accuracy", 0)
        if test_acc is None or test_acc < MIN_TEST_ACCURACY:
            print(f"[inference] Local metadata test_accuracy={test_acc} below gate. Skipping.")
            return
        try:
            self._load_transformer_from(str(TRANSFORMER_DIR))
            self.backend = "transformer_local"
            self.model_version = self.metadata.get("model_version", "transformer-local")
            print(f"[inference] Loaded LOCAL transformer '{self.model_version}' on {self.device}.")
        except Exception as e:
            print(f"[inference] Local transformer load failed: {e}")
            self._transformer_model = None
            self._transformer_tokenizer = None

    def _try_load_hub_transformer(self):
        if not HF_MODEL_REPO:
            return
        try:
            print(f"[inference] Downloading '{HF_MODEL_REPO}' ({HF_MODEL_REVISION}) from HF Hub...")
            self._load_transformer_from(HF_MODEL_REPO, revision=HF_MODEL_REVISION)
            self.backend = "transformer_hub"
            self.model_version = f"{HF_MODEL_REPO}@{HF_MODEL_REVISION}"
            print(f"[inference] Loaded HUB transformer on {self.device}.")
        except Exception as e:
            print(f"[inference] HF Hub load failed: {e}")
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
            model_name_or_path, revision=revision, num_labels=3,
        ).to(self.device)
        self._transformer_model.eval()

    def _load_classical(self):
        if not LOGREG_PATH.exists() or not VECTORIZER_PATH.exists():
            print("[inference] Classical files not found.")
            return
        try:
            self._logreg = joblib.load(LOGREG_PATH)
            self._vectorizer = joblib.load(VECTORIZER_PATH)
            self.backend = "classical"
            self.model_version = "logreg-tfidf-3class"
            print("[inference] Loaded classical 3-class fallback.")
        except Exception as e:
            print(f"[inference] Classical load failed: {e}")

    def predict_probs(self, text: str) -> List[float]:
        """Return [p_legit, p_grey, p_malicious]."""
        if self.backend in ("transformer_local", "transformer_hub"):
            return self._predict_transformer_probs(text)
        if self.backend == "classical":
            return self._predict_classical_probs(text)
        raise RuntimeError("No model backend loaded.")

    def analyze(self, raw_text: str, normalized_text: str) -> dict:
        probs = self.predict_probs(normalized_text)
        reasons = extract_scam_explanations(raw_text)
        probs = blend_score_with_heuristics(probs, reasons)

        idx = max(range(3), key=lambda i: probs[i])
        label = ID2LABEL[idx]
        risk_level = RISK_LEVELS[idx]
        p_malicious = probs[2]

        return {
            "label": label,
            "risk_level": risk_level,
            "probability_score": round(p_malicious, 4),
            "is_scam": label == "malicious",
            "confidence_score": round(probs[idx], 4),
            "explanation_reasons": reasons,
        }

    def _predict_transformer_probs(self, text: str) -> List[float]:
        import torch
        inputs = self._transformer_tokenizer(
            text, truncation=True, padding=True, max_length=256, return_tensors="pt"
        ).to(self.device)
        with torch.no_grad():
            logits = self._transformer_model(**inputs).logits
            probs = torch.softmax(logits, dim=-1).squeeze().tolist()
        if isinstance(probs, float):
            probs = [probs]
        # Ensure 3-length
        while len(probs) < 3:
            probs.append(0.0)
        return probs[:3]

    def _predict_classical_probs(self, text: str) -> List[float]:
        vec = self._vectorizer.transform([text])
        proba = self._logreg.predict_proba(vec)[0]
        proba = list(proba)
        while len(proba) < 3:
            proba.append(0.0)
        return proba[:3]


_classifier: Optional[ScamClassifier] = None


def get_classifier() -> ScamClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ScamClassifier()
    return _classifier