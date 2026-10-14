"""
utils/text_normalize.py
------------------------
Shared text normalization logic.

CRITICAL: This exact function must be used identically at both training
time (scripts/train.py) and inference time (app/main.py). Any drift between
the two would silently degrade model accuracy ("training/serving skew").
"""

import re
import unicodedata

# Common leetspeak / obfuscation substitutions seen in SMS scam text
# (e.g. "cl@im your pr1ze n0w") normalized back to plain letters before
# vectorization. This is intentionally conservative to avoid corrupting
# legitimate text.
_LEET_MAP = {
    "@": "a",
    "0": "o",
    "1": "i",
    "3": "e",
    "$": "s",
    "5": "s",
    "7": "t",
}

_URL_PATTERN = re.compile(r"(https?://\S+|www\.\S+)")
_EMAIL_PATTERN = re.compile(r"\S+@\S+\.\S+")
_PHONE_PATTERN = re.compile(r"\b(?:\+?63|0)?9\d{9}\b")
_MULTI_WHITESPACE = re.compile(r"\s+")
_NON_ALNUM = re.compile(r"[^a-z0-9\s]")

# ─── OCR URL-repair patterns ─────────────────────────────────────────
# Tesseract splits URLs across line breaks when the screenshot is
# narrow — e.g. "https://\nexample.icu/ph". The _URL_PATTERN above
# requires the URL on a single line, so these regexes rejoin the split
# BEFORE normalization runs. Order matters: scheme first, then TLD.
_OCR_URL_JOIN_SCHEME = re.compile(r"(https?://)\s*\n\s*", re.IGNORECASE)
_OCR_URL_JOIN_BARE_SCHEME = re.compile(r"(www\.)\s*\n\s*", re.IGNORECASE)
_OCR_DOMAIN_MID_SPLIT = re.compile(r"([a-z0-9\-]+)\s*\n\s*\.([a-z]{2,})", re.IGNORECASE)
_OCR_DOMAIN_BEFORE_TLD = re.compile(r"([a-z0-9\-]+)\.\s*\n\s*([a-z]{2,})", re.IGNORECASE)


def _repair_ocr_url_breaks(text: str) -> str:
    """
    Rejoin URLs that Tesseract split across line breaks. This runs BEFORE
    placeholder substitution so the URL regexes can match. Without this,
    OCR reads "https://\nbrand.icu/ph" and the URL never becomes
    "__url__", leaking the raw tokens into the bag-of-words model.
    """
    if not text:
        return text
    text = _OCR_URL_JOIN_SCHEME.sub(r"\1", text)
    text = _OCR_URL_JOIN_BARE_SCHEME.sub(r"\1", text)
    text = _OCR_DOMAIN_BEFORE_TLD.sub(r"\1.\2", text)
    text = _OCR_DOMAIN_MID_SPLIT.sub(r"\1.\2", text)
    return text


def normalize_text(raw_text: str) -> str:
    """
    Normalize raw SMS / OCR-extracted text into a clean string suitable
    for TF-IDF vectorization.

    Steps:
    0. (NEW) Rejoin URLs that OCR split across line breaks.
    1. Unicode normalization (NFKC) — collapses visually-similar characters
       often used to evade filters.
    2. Lowercasing.
    3. Replace URLs, emails, and PH-format phone numbers with placeholder
       tokens (these are strong scam signals in aggregate, but the raw
       values are high-cardinality noise for a bag-of-words model).
    4. Light leetspeak de-obfuscation.
    5. Strip punctuation/symbols (keep alphanumerics + spaces).
    6. Collapse repeated whitespace.

    Returns an empty string if input is None/empty — callers should treat
    an empty normalized string as "no extractable text" (e.g. OCR failure).
    """
    if not raw_text:
        return ""

    # Step 0 — repair OCR-split URLs before any other transformation
    raw_text = _repair_ocr_url_breaks(raw_text)

    text = unicodedata.normalize("NFKC", raw_text)
    text = text.lower()

    text = _URL_PATTERN.sub(" __url__ ", text)
    text = _EMAIL_PATTERN.sub(" __email__ ", text)
    text = _PHONE_PATTERN.sub(" __phone__ ", text)

    text = "".join(_LEET_MAP.get(ch, ch) for ch in text)

    text = _NON_ALNUM.sub(" ", text)
    text = _MULTI_WHITESPACE.sub(" ", text).strip()

    return text