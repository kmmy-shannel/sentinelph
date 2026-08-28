"""
app/config.py
--------------
Centralised configuration for the SentinelPH AI Scam Detection microservice.

All tunables (file paths, classification thresholds, server settings) live
here so that `scripts/train.py` and `app/main.py` share a single source of
truth. Values can be overridden via environment variables or a `.env` file
placed in `services/ai/`.
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

# services/ai/  <- BASE_DIR
BASE_DIR = Path(__file__).resolve().parent.parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=str(BASE_DIR / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- Server ---
    HOST: str = "0.0.0.0"
    PORT: int = 8000

    # --- Artifact paths (relative to services/ai/) ---
    MODELS_DIR: Path = BASE_DIR / "models"
    VECTORIZER_PATH: Path = BASE_DIR / "models" / "tfidf_vectorizer.pkl"
    CLASSIFIER_PATH: Path = BASE_DIR / "models" / "logreg_classifier.pkl"
    METADATA_PATH: Path = BASE_DIR / "models" / "model_metadata.json"

    # --- Training data ---
    DATA_DIR: Path = BASE_DIR / "data"
    RAW_DATA_PATH: Path = BASE_DIR / "data" / "sms_spam_collection.tsv"

    # --- Split configuration (Requirement: stratified 80/10/10) ---
    TRAIN_SIZE: float = 0.80
    VAL_SIZE: float = 0.10
    TEST_SIZE: float = 0.10
    RANDOM_STATE: int = 42

    # --- Classification thresholds (SRS Requirement 3) ---
    THRESHOLD_LIKELY_SCAM: float = 0.75
    THRESHOLD_UNCERTAIN_LOW: float = 0.40

    # --- Minimum acceptable test accuracy (SRS Objective 2) ---
    MIN_TEST_ACCURACY: float = 0.85

    # --- OCR ---
    TESSERACT_CMD: str | None = None  # e.g. r"C:\Program Files\Tesseract-OCR\tesseract.exe"

    # --- API guardrail metadata (Requirement 5) ---
    ADVISORY_ONLY: bool = True
    SERVICE_VERSION: str = "1.0.0"


settings = Settings()

# Ensure directories exist so first-run doesn't crash on a missing folder.
settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)


def classify_score(score: float) -> str:
    """
    Map a probability score to the SRS-defined categorical label.

    likely_scam        : score >= 0.75
    uncertain           : 0.40 <= score < 0.75
    likely_legitimate   : score < 0.40
    """
    if score >= settings.THRESHOLD_LIKELY_SCAM:
        return "likely_scam"
    if score >= settings.THRESHOLD_UNCERTAIN_LOW:
        return "uncertain"
    return "likely_legitimate"