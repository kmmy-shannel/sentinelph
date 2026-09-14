"""
utils/ocr.py
-------------
OCR helper for the SentinelPH AI Scam Detection microservice.

Extracts text from screenshot evidence (SMS/chat/email screenshots)
submitted as part of a scam report, so that it can be fed through the
same text-normalization + TF-IDF pipeline used for plain-text reports.

Supports four input forms:
    - a filesystem path to an image
    - raw image bytes (e.g. from an uploaded file buffer)
    - a base64-encoded string (with or without a `data:image/...;base64,`
      prefix, as commonly sent from mobile/web clients)

Engine: pytesseract (wraps the native Tesseract OCR binary).
"""

import base64
import binascii
import io
import re
from pathlib import Path
from typing import Optional, Tuple, Union

import pytesseract
from PIL import Image, UnidentifiedImageError

from app.config import settings

if settings.TESSERACT_CMD:
    pytesseract.pytesseract.tesseract_cmd = settings.TESSERACT_CMD

_DATA_URI_PATTERN = re.compile(r"^data:image/[a-zA-Z0-9.+-]+;base64,")

# Guard against pathologically large uploads being decoded in-memory.
MAX_IMAGE_BYTES = 15 * 1024 * 1024  # 15 MB


class OCRError(Exception):
    """Raised when an image cannot be decoded or no text can be extracted."""


def _strip_data_uri_prefix(b64_string: str) -> str:
    return _DATA_URI_PATTERN.sub("", b64_string.strip())


def _bytes_to_image(image_bytes: bytes) -> Image.Image:
    if len(image_bytes) > MAX_IMAGE_BYTES:
        raise OCRError(
            f"Image payload exceeds maximum allowed size "
            f"({MAX_IMAGE_BYTES // (1024 * 1024)} MB)."
        )
    try:
        img = Image.open(io.BytesIO(image_bytes))
        img.load()  # force decode now so corrupt images fail fast, here
        return img
    except UnidentifiedImageError as exc:
        raise OCRError("Could not identify image format from bytes.") from exc
    except Exception as exc:  # noqa: BLE001
        raise OCRError(f"Failed to decode image bytes: {exc}") from exc


def _preprocess_for_ocr(img: Image.Image) -> Image.Image:
    """
    Light preprocessing to improve OCR accuracy on phone-screenshot text
    (typically high-contrast UI text on solid backgrounds):
      - convert to grayscale
      - upscale small images (Tesseract performs better on larger text)
    """
    img = img.convert("L")  # grayscale
    width, height = img.size
    if max(width, height) < 1000:
        scale = 1000 / max(width, height)
        img = img.resize(
            (int(width * scale), int(height * scale)), Image.LANCZOS
        )
    return img


def _run_tesseract(img: Image.Image) -> Tuple[str, Optional[float]]:
    """
    Runs Tesseract and returns (text, mean_confidence_0_to_1).
    Confidence is derived from per-word conf values; None if unavailable.
    """
    try:
        text = pytesseract.image_to_string(img)
    except pytesseract.TesseractNotFoundError as exc:
        raise OCRError(
            "Tesseract OCR binary not found on this machine. Install it "
            "natively and/or set TESSERACT_CMD in services/ai/.env — see "
            "the Runbook section of AI_SCAM_DETECTION_GUIDE.md."
        ) from exc

    cleaned = text.strip()
    confidence: Optional[float] = None

    # Compute a rough mean confidence when Tesseract exposes it.
    try:
        data = pytesseract.image_to_data(
            img, output_type=pytesseract.Output.DICT
        )
        confs = [
            int(c)
            for c in data.get("conf", [])
            if c is not None and str(c).lstrip("-").isdigit() and int(c) >= 0
        ]
        if confs:
            confidence = round(sum(confs) / (len(confs) * 100.0), 4)
    except Exception:  # noqa: BLE001
        confidence = None

    return cleaned, confidence


def extract_text_from_image(source: Union[str, Path, bytes]) -> str:
    """
    Extract text from an image given as a filesystem path or raw bytes.

    Raises OCRError on decode failure. Returns an empty string (not an
    error) if the image decodes fine but Tesseract finds no text.
    """
    if isinstance(source, (str, Path)) and Path(source).exists():
        try:
            img = Image.open(source)
            img.load()
        except UnidentifiedImageError as exc:
            raise OCRError(f"Could not identify image format at path: {source}") from exc
    elif isinstance(source, bytes):
        img = _bytes_to_image(source)
    else:
        raise OCRError(
            "extract_text_from_image expects a valid file path or raw bytes."
        )

    img = _preprocess_for_ocr(img)
    text, _ = _run_tesseract(img)
    return text


def extract_text_and_confidence_from_bytes(
    image_bytes: bytes,
) -> Tuple[str, Optional[float]]:
    """
    Extract (text, confidence) from raw image bytes.

    Used by the FastAPI `/ocr` endpoint which receives multipart uploads
    directly from the Express gateway's multer memory buffer.
    """
    if not image_bytes:
        raise OCRError("Empty image buffer provided.")

    img = _bytes_to_image(image_bytes)
    img = _preprocess_for_ocr(img)
    return _run_tesseract(img)


def extract_text_from_base64(b64_string: str) -> str:
    """
    Decode a base64-encoded screenshot (optionally prefixed with a
    `data:image/...;base64,` URI header) and run OCR on it.
    """
    if not b64_string:
        raise OCRError("Empty base64 string provided.")

    cleaned = _strip_data_uri_prefix(b64_string)
    try:
        image_bytes = base64.b64decode(cleaned, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise OCRError("Provided string is not valid base64.") from exc

    if not image_bytes:
        raise OCRError("Decoded base64 payload is empty.")

    img = _bytes_to_image(image_bytes)
    img = _preprocess_for_ocr(img)
    text, _ = _run_tesseract(img)
    return text
# services/ai/app/utils/ocr.py — add this function alongside the existing ones

def extract_text_and_confidence_from_bytes(image_bytes: bytes):
    """
    Extract (text, confidence_0_to_1) from raw image bytes.

    Used by the FastAPI `/ocr` endpoint which receives multipart uploads
    directly from the Express gateway's multer memory buffer.
    """
    if not image_bytes:
        raise OCRError("Empty image buffer provided.")

    img = _bytes_to_image(image_bytes)
    img = _preprocess_for_ocr(img)
    return _run_tesseract(img)