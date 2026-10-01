# services/ai/app/inference.py
"""
Two-level advisory scam classifier.

LEVEL 1 (3-class) — always runs, required for the service to start.
    Classes: 0=legitimate, 1=grey_area, 2=malicious.
    Backed by DistilBERT (local -> HF Hub) with a classical logreg+tfidf
    fallback. Regex heuristics then adjust the probabilities:
      * "Malicious Link" / "Brand Impersonation" floor P(malicious) at 0.90.
      * "Official Government Domain" / "Anti-Scam PSA" /
        "Legitimate Transaction Notice" force the result to legitimate
        ([0.95, 0.03, 0.02]) — but ONLY when no strong malicious signal
        is present. Malicious signals always win.

LEVEL 2 (subtype) — optional, runs on top of the final Level 1 label.
    legitimate -> models/subtype_legit     (appointment_reminder,
                  bank_activity_alert, delivery_tracking,
                  personal_conversational, two_factor_auth)
    malicious  -> models/subtype_malicious (fake_prize_lottery, phishing_link)
    grey_area  -> passthrough "brand_marketing" (no model)
    If a subtype directory is missing or fails to load, a warning is logged
    and that tier's subtype stays None; the service still starts and serves
    Level 1 only.

    Subtype models are loaded from the local models/subtype_* dir first,
    then fall back to the Hugging Face Hub repos
    kmmyyy14/sentinelph-subtype-legit and kmmyyy14/sentinelph-subtype-malicious
    (env: AI_HF_SUBTYPE_LEGIT_REPO, AI_HF_SUBTYPE_MALICIOUS_REPO).

Returns:
    - label: argmax class name (Level 1)
    - probability_score: P(malicious) — kept for existing UI banner
    - risk_level: "LOW" | "MEDIUM" | "HIGH"
    - is_scam, confidence_score
    - explanation_reasons: heuristic breakdown
    - subtype, subtype_confidence, subtype_model_version (Level 2, may be None)

Level 1 model priority:
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
SUBTYPE_LEGIT_DIR = MODELS_DIR / "subtype_legit"
SUBTYPE_MALICIOUS_DIR = MODELS_DIR / "subtype_malicious"
METADATA_PATH = MODELS_DIR / "model_metadata.json"
LOGREG_PATH = MODELS_DIR / "logreg_classifier.pkl"
VECTORIZER_PATH = MODELS_DIR / "tfidf_vectorizer.pkl"

HF_MODEL_REPO = os.environ.get("AI_HF_MODEL_REPO", "kmmyyy14/sentinelph-distilbert-v001").strip()
HF_MODEL_REVISION = os.environ.get("AI_HF_MODEL_REVISION", "main").strip()

# Subtype model HF Hub fallbacks (used when local dirs are missing)
HF_SUBTYPE_LEGIT_REPO = os.environ.get(
    "AI_HF_SUBTYPE_LEGIT_REPO", "kmmyyy14/sentinelph-subtype-legit"
).strip()
HF_SUBTYPE_MALICIOUS_REPO = os.environ.get(
    "AI_HF_SUBTYPE_MALICIOUS_REPO", "kmmyyy14/sentinelph-subtype-malicious"
).strip()

# === 3-CLASS CHANGE ===
ID2LABEL = {0: "legitimate", 1: "grey_area", 2: "malicious"}
LABEL2ID = {v: k for k, v in ID2LABEL.items()}
RISK_LEVELS = {0: "LOW", 1: "MEDIUM", 2: "HIGH"}
MALICIOUS_HEURISTIC_FLOOR = 0.90

MIN_TEST_ACCURACY = 0.85

# === LEVEL 2 SUBTYPE CONFIG ===
SUBTYPE_MAX_LENGTH = 256
# Level 1 label -> (model directory, tier name used in the version string)
_SUBTYPE_SOURCES = {
    "legitimate": (SUBTYPE_LEGIT_DIR, "legit"),
    "malicious": (SUBTYPE_MALICIOUS_DIR, "malicious"),
}
_GREY_AREA_PASSTHROUGH = {
    "subtype": "brand_marketing",
    "confidence": 1.0,
    "model_version": "passthrough",
}
_NO_SUBTYPE = {"subtype": None, "confidence": None, "model_version": None}


class ModelNotLoadedError(Exception):
    pass


# --- Explainability: heuristic pattern extractor ---
_SHORTENER_DOMAINS = ("bit.ly", "tinyurl.com", "is.gd", "t.co", "goo.gl", "cutt.ly", "rb.gy")
_IP_URL_PATTERN = re.compile(r"\bhttps?://(?:\d{1,3}\.){3}\d{1,3}\b")
_SPOOFED_DOMAIN_PATTERN = re.compile(
    r"\b(gcash|paymaya|maya|bdo|unionbank|bpi|metrobank|landbank|phlpost|phpost|lbc|dhl|jnt|j&t|ninjavan|sss|pag-?ibig|bir|nbi|lto|philhealth)"
    r"[\-_][a-z0-9\-]*\.(com|net|info|life|xyz|top|club|online|site|website|icu|tv|bid|buzz|cfd|digital|pw|cn|shop|store)",
    re.IGNORECASE,
)

_ANY_URL_PATTERN = re.compile(r"https?://([a-z0-9\-\.]+\.[a-z]{2,})", re.IGNORECASE)
_URL_HOST_PATTERN = re.compile(r"(?:https?://|www\.)([a-z0-9\-\.]+\.[a-z]{2,})", re.IGNORECASE)

_BARE_HOST_PATTERN = re.compile(
    r"(?<![\w.\-])([a-z0-9\-]+\.(?:click|info|life|xyz|top|icu|tv|bid|buzz|loan|website|digital|eu|ca|de|uk|pw|cn|online|site|club|shop|store))(?=[/\s,;!?]|$)",
    re.IGNORECASE,
)

_SUSPICIOUS_TLDS = (".life", ".xyz", ".top", ".icu", ".tv", ".bid", ".buzz", ".cfd",
                    ".website", ".digital", ".pw", ".cn", ".online", ".site", ".club",
                    ".shop", ".store", ".info", ".click", ".link")
_URL_PATTERN = re.compile(r"https?://\S+|\bwww\.\S+", re.IGNORECASE)
_URGENCY_PHRASES = (
    "suspended", "unauthorized login", "unauthorized access", "locked",
    "verify immediately", "verify now", "within 24 hours", "account will be closed",
    "act now", "immediate action", "limited time", "your account has been",
    "unusual activity", "restore access", "permanent deactivation",
)
_BRAND_NAMES = (
    "gcash", "maya", "paymaya", "bdo", "unionbank", "bpi", "metrobank",
    "landbank", "rcbc", "security bank", "chinabank", "cimb", "gotyme",
    "palawanpay", "coins.ph",
    "phlpost", "phpost", "lbc", "dhl", "fedex", "j&t", "jnt", "ninjavan",
    "2go", "flash express", "grab express",
    "sss", "pag-ibig", "pagibig", "bir", "nbi", "dti", "dict", "dfa",
    "lto", "philhealth", "gsis", "psa", "comelec",
    "globe", "smart", "tnt", "dito", "lazada", "shopee", "grab", "foodpanda",
)

_KNOWN_BRAND_DOMAINS = {
    "gcash": ("gcash.com",),
    "maya": ("maya.ph",),
    "paymaya": ("maya.ph",),
    "bdo": ("bdo.com.ph",),
    "bpi": ("bpi.com.ph",),
    "unionbank": ("unionbankph.com", "unionbank.com.ph"),
    "metrobank": ("metrobank.com.ph",),
    "landbank": ("landbank.com",),
    "phlpost": ("phlpost.gov.ph",),
    "phpost": ("phlpost.gov.ph",),
    "lbc": ("lbcexpress.com",),
    "dhl": ("dhl.com",),
    "j&t": ("jtexpress.ph",),
    "jnt": ("jtexpress.ph",),
    "ninjavan": ("ninjavan.co",),
    "sss": ("sss.gov.ph",),
    "pag-ibig": ("pagibigfund.gov.ph",),
    "pagibig": ("pagibigfund.gov.ph",),
    "bir": ("bir.gov.ph",),
    "nbi": ("nbi.gov.ph",),
    "lto": ("lto.gov.ph",),
    "philhealth": ("philhealth.gov.ph",),
}
_ALL_OFFICIAL_DOMAINS = tuple(sorted({d for ds in _KNOWN_BRAND_DOMAINS.values() for d in ds}))
_JOB_SCAM_PATTERNS = (
    re.compile(r"earn\s*(?:₱|php|p)\s*[\d,]+\s*/?\s*day", re.IGNORECASE),
    re.compile(r"part[\s\-]?time\s+job", re.IGNORECASE),
    re.compile(r"\btelegram\b", re.IGNORECASE),
    re.compile(r"work\s+from\s+home.{0,20}(?:income|earn|salary)", re.IGNORECASE),
)

# --- New heuristic rule config (Rules A-E) ---
_RULE_A_TLDS = (".click", ".info", ".life", ".xyz", ".top", ".icu", ".tv", ".bid",
                ".buzz", ".loan", ".website", ".digital", ".eu", ".ca", ".de", ".uk")
_RULE_B_BANKS = ("bdo", "bpi", "gcash", "maya", "metrobank", "unionbank", "landbank")
_RULE_B_TXN_PHRASES = ("sent php", "debited", "credited", "ref#", "reference", "account ending")
_GOV_PH_PATTERN = re.compile(
    r"(?<![a-z0-9\-])(?:[a-z0-9\-]+\.)*[a-z0-9\-]+\.gov\.ph(?![a-z0-9\-]|\.[a-z0-9])",
    re.IGNORECASE,
)
_RULE_D_AGENCIES = ("lto", "bir", "nbi", "sss", "pag-ibig", "pagibig", "philhealth", "gsis", "comelec")
_PHONE_PATTERN = re.compile(
    r"(?<!\d)(?:"
    r"09\d{2}[\-\s]?\d{3}[\-\s]?\d{4}"
    r"|09\d{9}"
    r"|\+63[\s\-]?9\d{2}[\s\-]?\d{3}[\s\-]?\d{4}"
    r")(?!\d)"
)
_CALLBACK_PHRASES = (
    "call this number", "call us", "call now", "contact us", "hotline",
    "call immediately", "call 09", "call +63", "text this number",
)
_PSA_PHRASES = (
    "will never ask", "don't share", "do not share", "never share", "beware",
    "report suspicious", "scam alert", "laging tandaan", "huwag magbigay", "huwag ibigay",
)

_GOV_DEADLINE_WORDS = ("due", "deadline", "expire", "renew", "schedule")

_STRONG_OVERRIDE_CATEGORIES = {"Malicious Link", "Brand Impersonation"}
_FORCE_LEGIT_CATEGORIES = {
    "Official Government Domain",
    "Anti-Scam PSA",
    "Legitimate Transaction Notice",
}
_FORCE_LEGIT_BLOCKERS = _STRONG_OVERRIDE_CATEGORIES | {"Task/Job Scam"}


def _has_term(lower: str, term: str) -> bool:
    return re.search(r"(?<![a-z0-9])" + re.escape(term) + r"(?![a-z0-9])", lower) is not None


def _is_official_domain(domain: str) -> bool:
    domain = domain.lower().rstrip(".")
    if domain.endswith(".gov.ph") or domain == "gov.ph":
        return True
    return any(domain == d or domain.endswith("." + d) for d in _ALL_OFFICIAL_DOMAINS)


def _force_legitimate() -> List[float]:
    return [0.95, 0.03, 0.02]


def blend_score_with_heuristics(probs: List[float], reasons: List[Dict[str, str]]) -> List[float]:
    categories = {r["category"] for r in reasons}
    strong_hit = bool(categories & _STRONG_OVERRIDE_CATEGORIES)

    if strong_hit:
        if probs[2] < MALICIOUS_HEURISTIC_FLOOR:
            print(f"[inference] Heuristic override: p_malicious {probs[2]:.4f} -> "
                  f"{MALICIOUS_HEURISTIC_FLOOR} due to {sorted(categories & _STRONG_OVERRIDE_CATEGORIES)}.")
            new_probs = list(probs)
            new_probs[2] = MALICIOUS_HEURISTIC_FLOOR
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

    legit_hit = categories & _FORCE_LEGIT_CATEGORIES
    if legit_hit and not (categories & _FORCE_LEGIT_BLOCKERS):
        print(f"[inference] Heuristic override: forcing legitimate due to {sorted(legit_hit)}.")
        return _force_legitimate()

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
    urls_in_text = _ANY_URL_PATTERN.findall(lower)
    for brand in _BRAND_NAMES:
        if brand in lower and urls_in_text:
            real_domains = _KNOWN_BRAND_DOMAINS.get(brand, ())
            for url_domain in urls_in_text:
                if real_domains and not any(real in url_domain for real in real_domains):
                    reasons.append({
                        "category": "Brand Impersonation",
                        "description": f"Message mentions '{brand.upper()}' but link goes to "
                                        f"'{url_domain}' — the official domain is {real_domains[0]}.",
                    })
                    break

    for url_domain in urls_in_text:
        for tld in _SUSPICIOUS_TLDS:
            if url_domain.endswith(tld):
                reasons.append({
                    "category": "Malicious Link",
                    "description": f"Link uses a suspicious top-level domain ({tld}) "
                                    "commonly used in phishing campaigns.",
                })
                break

    matched_urgency = [p for p in _URGENCY_PHRASES if p in lower]
    if matched_urgency:
        sample = ", ".join(f"'{p}'" for p in matched_urgency[:3])
        reasons.append({
            "category": "Urgency/Panic Trigger",
            "description": f"Uses urgent or threatening language ({sample}).",
        })

    matched_brands = [b for b in _BRAND_NAMES if b in lower]
    only_official_links = bool(urls_in_text) and all(_is_official_domain(d) for d in urls_in_text)
    has_link_or_action = (bool(_URL_PATTERN.search(text)) and not only_official_links) \
        or bool(matched_shorteners) \
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

    rule_a_brand = next((b for b in _BRAND_NAMES if _has_term(lower, b)), None)
    if rule_a_brand:
        rule_a_hit = None
        hosts = _URL_HOST_PATTERN.findall(lower)
        hosts += _BARE_HOST_PATTERN.findall(lower)
        for host in hosts:
            tld = next((t for t in _RULE_A_TLDS if host.endswith(t)), None)
            if tld:
                rule_a_hit = tld
                break
        if rule_a_hit:
            reasons.append({
                "category": "Malicious Link",
                "description": f"Brand '{rule_a_brand.upper()}' paired with non-official TLD '{rule_a_hit}'",
            })

    if (any(_has_term(lower, b) for b in _RULE_B_BANKS)
            and any(p in lower for p in _RULE_B_TXN_PHRASES)
            and "http" not in lower):
        reasons.append({
            "category": "Legitimate Transaction Notice",
            "description": "Real bank transaction format with no link",
        })

    if _GOV_PH_PATTERN.search(lower):
        reasons.append({
            "category": "Official Government Domain",
            "description": "Contains a verified .gov.ph domain",
        })

    if any(_has_term(lower, a) for a in _RULE_D_AGENCIES) and (
        _PHONE_PATTERN.search(text) or any(p in lower for p in _CALLBACK_PHRASES)
    ):
        reasons.append({
            "category": "Brand Impersonation",
            "description": "Government agency paired with unverified callback number",
        })

    if any(p in lower for p in _PSA_PHRASES):
        reasons.append({
            "category": "Anti-Scam PSA",
            "description": "Defensive warning content (not a scam)",
        })

    return reasons


def compute_risk_level(probs: List[float], reasons: List[Dict[str, str]]) -> str:
    idx = max(range(3), key=lambda i: probs[i])
    base = RISK_LEVELS[idx]
    categories = {r["category"] for r in reasons}
    strong_signals = categories & {"Malicious Link", "Brand Impersonation"}
    if len(strong_signals) >= 2:
        return "HIGH"
    if strong_signals and base == "LOW":
        return "MEDIUM"
    return base


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

        self._subtype_models: Dict[str, Optional[Tuple[object, object, Dict[int, str]]]] = {
            "legitimate": None,
            "malicious": None,
            "grey_area": None,
        }

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

        self._load_subtype_models()

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

    # ------------------------------------------------------------------
    # Level 2: subtype models
    # ------------------------------------------------------------------
    def _load_subtype_models(self):
        """Load subtype models from local dir first, then fall back to HF Hub.

        Local paths are checked first (dev/test). If a local dir is missing,
        the corresponding HF Hub repo is used instead (production/Render).
        """
        hf_repos = {
            "legitimate": HF_SUBTYPE_LEGIT_REPO,
            "malicious": HF_SUBTYPE_MALICIOUS_REPO,
        }

        for level1_label, (model_dir, tier) in _SUBTYPE_SOURCES.items():
            # Prefer local, then HF Hub
            if model_dir.exists():
                source = str(model_dir)
                source_label = "local"
            elif hf_repos.get(level1_label):
                source = hf_repos[level1_label]
                source_label = "HF Hub"
                print(f"[inference] Local subtype dir not found for '{level1_label}'; "
                      f"falling back to HF Hub: {source}")
            else:
                print(f"[inference] Warning: subtype model dir not found ({model_dir}) "
                      f"and no HF Hub fallback configured. "
                      f"Subtype for '{level1_label}' will be None.")
                continue

            try:
                import torch
                from transformers import AutoTokenizer, AutoModelForSequenceClassification
                device = "cuda" if torch.cuda.is_available() else "cpu"
                tokenizer = AutoTokenizer.from_pretrained(source)
                model = AutoModelForSequenceClassification.from_pretrained(source).to(device)
                model.eval()
                id2label = {int(k): v for k, v in model.config.id2label.items()}
                self._subtype_models[level1_label] = (model, tokenizer, id2label)
                print(f"[inference] Loaded subtype model '{tier}' "
                      f"({len(id2label)} labels) from {source_label} on {device}.")
            except Exception as e:
                print(f"[inference] Warning: subtype model load failed for "
                      f"'{level1_label}' (source={source}): {e}")
                self._subtype_models[level1_label] = None

    def subtype_models_loaded(self) -> Dict[str, bool]:
        return {tier: entry is not None for tier, entry in self._subtype_models.items()}

    def predict_subtype(self, raw_text: str, normalized_text: str, level1_label: str) -> dict:
        """Level 2 prediction for the given Level 1 label.

        - Heuristic overrides inspect raw_text (needs original punctuation
          like ".gov.ph").
        - The subtype model itself receives normalized_text (what it was
          trained on).
        """
        if level1_label == "grey_area":
            return dict(_GREY_AREA_PASSTHROUGH)

        # Heuristic override on the RAW text
        if level1_label == "legitimate":
            lower_raw = raw_text.lower()
            if _GOV_PH_PATTERN.search(lower_raw) and any(w in lower_raw for w in _GOV_DEADLINE_WORDS):
                return {
                    "subtype": "appointment_reminder",
                    "confidence": 0.85,
                    "model_version": "heuristic-gov-deadline",
                }

        entry = self._subtype_models.get(level1_label)
        if entry is None or level1_label not in _SUBTYPE_SOURCES:
            return dict(_NO_SUBTYPE)

        model, tokenizer, id2label = entry
        tier = _SUBTYPE_SOURCES[level1_label][1]
        try:
            import torch
            device = next(model.parameters()).device
            inputs = tokenizer(
                normalized_text, truncation=True, padding=True,
                max_length=SUBTYPE_MAX_LENGTH, return_tensors="pt",
            ).to(device)
            with torch.no_grad():
                logits = model(**inputs).logits
                probs = torch.softmax(logits, dim=-1)[0]
            max_prob, idx = torch.max(probs, dim=0)
            return {
                "subtype": id2label[int(idx.item())],
                "confidence": round(float(max_prob.item()), 4),
                "model_version": f"subtype-{tier}-v001",
            }
        except Exception as e:
            print(f"[inference] Subtype prediction failed for '{level1_label}': {e}")
            return dict(_NO_SUBTYPE)

    # ------------------------------------------------------------------
    # Level 1 prediction + analysis
    # ------------------------------------------------------------------
    def predict_probs(self, text: str) -> List[float]:
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
        risk_level = compute_risk_level(probs, reasons)
        p_malicious = probs[2]

        if risk_level == "HIGH" and label != "malicious":
            label = "malicious"
            p_malicious = max(p_malicious, 0.90)

        # Pass BOTH: overrides use raw_text, model uses normalized_text
        subtype_result = self.predict_subtype(raw_text, normalized_text, label)

        return {
            "label": label,
            "risk_level": risk_level,
            "probability_score": round(p_malicious, 4),
            "is_scam": label == "malicious",
            "confidence_score": round(probs[idx], 4),
            "explanation_reasons": reasons,
            "subtype": subtype_result["subtype"],
            "subtype_confidence": subtype_result["confidence"],
            "subtype_model_version": subtype_result["model_version"],
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