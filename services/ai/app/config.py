"""
app/config.py
--------------
Centralised configuration for SentinelPH AI microservice.

3-class schema:
    0 = legitimate  (risk: low)
    1 = grey_area   (risk: medium)
    2 = malicious   (risk: high)
"""

from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict

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

    # --- Artifact paths ---
    MODELS_DIR: Path = BASE_DIR / "models"
    VECTORIZER_PATH: Path = BASE_DIR / "models" / "tfidf_vectorizer.pkl"
    CLASSIFIER_PATH: Path = BASE_DIR / "models" / "logreg_classifier.pkl"
    METADATA_PATH: Path = BASE_DIR / "models" / "model_metadata.json"

    # --- Training data ---
    DATA_DIR: Path = BASE_DIR / "data"
    RAW_DATA_PATH: Path = BASE_DIR / "data" / "sms_spam_collection.tsv"

    # --- Split configuration ---
    TRAIN_SIZE: float = 0.80
    VAL_SIZE: float = 0.10
    TEST_SIZE: float = 0.10
    RANDOM_STATE: int = 42

    # === 3-CLASS CHANGE ===
    # Class indices from the model's softmax output.
    NUM_LABELS: int = 3
    ID2LABEL: dict = {0: "legitimate", 1: "grey_area", 2: "malicious"}
    LABEL2ID: dict = {"legitimate": 0, "grey_area": 1, "malicious": 2}

    # Risk level mapping (class index -> UI bucket)
    RISK_LEVELS: dict = {0: "low", 1: "medium", 2: "high"}

    # Heuristic override: if a strong heuristic rule fires
    # (spoofed domain, brand impersonation), floor the malicious-class
    # probability at this value.
    MALICIOUS_HEURISTIC_FLOOR: float = 0.90

    # --- Quality gates ---
    MIN_TEST_ACCURACY: float = 0.85
    MIN_F1_MACRO: float = 0.75
    MIN_F1_GREY_AREA: float = 0.55

    # --- OCR ---
    TESSERACT_CMD: str | None = None

    # --- API guardrails ---
    ADVISORY_ONLY: bool = True
    SERVICE_VERSION: str = "2.0.0"  # bumped for 3-class


settings = Settings()

settings.MODELS_DIR.mkdir(parents=True, exist_ok=True)
settings.DATA_DIR.mkdir(parents=True, exist_ok=True)


def classify_probs(probs: list) -> tuple:
    """Return (label_name, risk_level) for a 3-length probability vector."""
    idx = max(range(len(probs)), key=lambda i: probs[i])
    return settings.ID2LABEL[idx], settings.RISK_LEVELS[idx]
def classify_score(score: float) -> str:
    """
    DEPRECATED — kept for backward compatibility with app/main.py.

    Maps a scalar malicious-probability score to a 3-class label using the
    same thresholds historically used for the binary classifier.
    """
    if score >= 0.75:
        return "malicious"
    if score >= 0.40:
        return "grey_area"
    return "legitimate"