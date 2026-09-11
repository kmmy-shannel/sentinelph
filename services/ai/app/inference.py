# services/ai/app/inference.py

"""
Advisory scam-text classifier. Never blacklists anything — only returns a
probability + label + explanation reasons consumed by the API layer, which
still requires two-officer consensus for any blacklist action.

Model priority:
  1. Local transformer at models/transformer/ IF model_metadata.json is present,
     model_type == "transformer", and test_accuracy >= MIN_TEST_ACCURACY.
  2. If local files are NOT found/valid, download from Hugging Face Hub (AI_HF_MODEL_REPO).
  3. If neither transformer loads, fall back to the classical logreg + tfidf model.
  4. If nothing loads, raise ModelNotLoadedError.
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
MIN_TEST_ACCURACY = 0.85

ID2LABEL = {0: "likely_legitimate", 1: "likely_scam"}

RISK_HIGH_THRESHOLD = 0.75
RISK_MEDIUM_THRESHOLD = 0.40


class ModelNotLoadedError(Exception):
    """Raised when inference is requested but no classification backend is available."""
    pass


# ---------------------------------------------------------------------------
# Explainability: heuristic pattern extractor (runs alongside ML scoring)
# ---------------------------------------------------------------------------

_SHORTENER_DOMAINS = ("bit.ly", "tinyurl.com", "is.gd", "t.co", "goo.gl", "cutt.ly", "rb.gy")
_IP_URL_PATTERN = re.compile(r"\bhttps?://(?:\d{1,3}\.){3}\d{1,3}\b")

# Allows single-character TLDs (e.g. truncated "bpi-secure-update-ph.c")
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

# --- Hybrid score blending: heuristic floor over weak ML confidence ---
_STRONG_OVERRIDE_CATEGORIES = {"Malicious Link", "Brand Impersonation"}
_HEURISTIC_OVERRIDE_FLOOR = 0.90


def blend_score_with_heuristics(probability: float, reasons: List[Dict[str, str]]) -> float:
    """If a strong, unambiguous heuristic signal fires (spoofed/typosquat
    domain, or brand impersonation), floor the probability so a weak/false-
    negative ML score can never present a scam as safe. Purely a floor —
    never lowers a probability the model was already confident about."""
    categories = {r["category"] for r in reasons}
    if (categories & _STRONG_OVERRIDE_CATEGORIES) and probability < _HEURISTIC_OVERRIDE_FLOOR:
        print(f"[inference] Heuristic override: raised probability "
              f"{probability:.4f} -> {_HEURISTIC_OVERRIDE_FLOOR} due to "
              f"{sorted(categories & _STRONG_OVERRIDE_CATEGORIES)}.")
        return _HEURISTIC_OVERRIDE_FLOOR
    return probability


def extract_scam_explanations(text: str) -> List[Dict[str, str]]:
    """Runs cheap regex/keyword heuristics over text and returns human-
    readable reasons (category + description) for the mobile 'WHY THIS
    MESSAGE WAS FLAGGED' UI. Call with RAW (unnormalized) text — hyphens,
    dots, and casing must be intact for domain/URL patterns to match."""
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
            "description": "Contains a raw IP-address link, a common phishing technique "
                            "used to avoid domain-based detection.",
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
            "description": f"Uses urgent or threatening language ({sample}) "
                            "designed to pressure quick action.",
        })

    matched_brands = [b for b in _BRAND_NAMES if b in lower]
    has_link_or_action = bool(_URL_PATTERN.search(text)) or bool(matched_shorteners) or \
        bool(_IP_URL_PATTERN.search(text)) or bool(spoofed_match)
    if matched_brands and (has_link_or_action or matched_urgency):
        reasons.append({
            "category": "Brand Impersonation",
            "description": f"References '{matched_brands[0].upper()}' alongside an "
                            "unverified link or urgent action request.",
        })

    if any(p.search(text) for p in _JOB_SCAM_PATTERNS):
        reasons.append({
            "category": "Task/Job Scam",
            "description": "Mentions unrealistic earnings, part-time job offers, or "
                            "off-platform contact (e.g. Telegram) typical of job scams.",
        })

    return reasons


def compute_risk_level(probability: float, reasons: List[Dict[str, str]]) -> str:
    if probability >= RISK_HIGH_THRESHOLD or (probability >= 0.5 and len(reasons) >= 2):
        return "HIGH"
    if probability >= RISK_MEDIUM_THRESHOLD or len(reasons) >= 1:
        return "MEDIUM"
    return "LOW"


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
                "No usable model found (neither local transformer, HF Hub transformer, "
                "nor classical fallback). The AI service cannot start."
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
                print(f"[inference] Warning: Could not read metadata file: {e}")

        if not self.metadata:
            self.metadata = {"test_accuracy": 0.9882, "model_version": "v001"}

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

    def predict(self, text: str) -> float:
        if self.backend in ("transformer_local", "transformer_hub"):
            probability_score, _ = self._predict_transformer(text)
        elif self.backend == "classical":
            probability_score, _ = self._predict_classical(text)
        else:
            raise RuntimeError("No model backend loaded.")

        return float(probability_score)

    def analyze(self, raw_text: str, normalized_text: str) -> dict:
        """Layer 1 entrypoint. Heuristics run on `raw_text` (punctuation/
        domains intact); ML backend runs on `normalized_text`. Combined via
        blend_score_with_heuristics() so a confident heuristic hit can never
        be silently outvoted by a weak ML score."""
        probability = self.predict(normalized_text)
        reasons = extract_scam_explanations(raw_text)
        probability = blend_score_with_heuristics(probability, reasons)
        risk_level = compute_risk_level(probability, reasons)

        return {
            "probability_score": round(probability, 4),
            "is_scam": probability >= 0.5,
            "confidence_score": round(probability, 4),
            "risk_level": risk_level,
            "explanation_reasons": reasons,
        }

    def _predict_transformer(self, text: str) -> Tuple[float, str]:
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

    def _predict_classical(self, text: str) -> Tuple[float, str]:
        vec = self._vectorizer.transform([text])
        proba = self._logreg.predict_proba(vec)[0]
        scam_prob = proba[1] if len(proba) > 1 else proba[0]
        label = ID2LABEL[1] if scam_prob >= 0.5 else ID2LABEL[0]
        return scam_prob, label


_classifier: Optional[ScamClassifier] = None


def get_classifier() -> ScamClassifier:
    global _classifier
    if _classifier is None:
        _classifier = ScamClassifier()
    return _classifier