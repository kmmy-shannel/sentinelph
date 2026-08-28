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


def normalize_text(raw_text: str) -> str:
    """
    Normalize raw SMS / OCR-extracted text into a clean string suitable
    for TF-IDF vectorization.

    Steps:
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

    text = unicodedata.normalize("NFKC", raw_text)
    text = text.lower()

    text = _URL_PATTERN.sub(" __url__ ", text)
    text = _EMAIL_PATTERN.sub(" __email__ ", text)
    text = _PHONE_PATTERN.sub(" __phone__ ", text)

    text = "".join(_LEET_MAP.get(ch, ch) for ch in text)

    text = _NON_ALNUM.sub(" ", text)
    text = _MULTI_WHITESPACE.sub(" ", text).strip()

    return text