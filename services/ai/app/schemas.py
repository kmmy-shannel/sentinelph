# services/ai/app/schemas.py

"""
Pydantic models defining the /predict and /ocr request/response contracts
between the Express API Gateway and this FastAPI microservice.

3-class schema:
    legitimate  -> risk_level: "LOW"
    grey_area   -> risk_level: "MEDIUM"
    malicious   -> risk_level: "HIGH"
"""

from typing import List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


# Allowed risk buckets. "UNKNOWN" is emitted when the model is degraded
# or the AI client falls back — it must be a valid literal here or the
# FastAPI response validator will raise ResponseValidationError (500).
RiskLevel = Literal["HIGH", "MEDIUM", "LOW", "UNKNOWN"]


class PredictRequest(BaseModel):
    # Accept both snake_case and camelCase so Express, mobile, and any
    # future web client can all post without a translation layer.
    model_config = ConfigDict(populate_by_name=True, protected_namespaces=())

    text: Optional[str] = Field(default=None)
    image_base64: Optional[str] = Field(default=None)
    report_id: Optional[str] = Field(default=None)
    scam_type: Optional[str] = Field(
        default="UNKNOWN",
        alias="scamType",
        description="Optional client-supplied category. Advisory metadata only; "
        "the model predicts the score internally.",
    )

    @model_validator(mode="after")
    def _require_at_least_one_source(self) -> "PredictRequest":
        if not (self.text and self.text.strip()) and not (
            self.image_base64 and self.image_base64.strip()
        ):
            raise ValueError(
                "At least one of 'text' or 'image_base64' must be provided."
            )
        return self


class ExplanationReason(BaseModel):
    category: str
    description: str


class PredictResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    report_id: Optional[str] = None

    # Legacy field kept for UI backward-compat: P(malicious) as a scalar.
    probability_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model-estimated probability the content is malicious.",
    )

    # === 3-CLASS CHANGE ===
    label: Literal[
    "legitimate", "grey_area", "malicious",
    "likely_scam", "likely_legitimate", "uncertain",
] = Field(
    ..., description="Argmax class from the 3-class model. Legacy strings accepted during migration."
)
    # --- Layer 1: Instant AI Warning fields ---
    is_scam: bool = Field(
        ..., description="True when the model's argmax class is 'malicious'."
    )
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model confidence in the assigned label (probability of the argmax class).",
    )
    risk_level: RiskLevel = Field(
        ..., description="Coarse risk bucket for UI banner rendering."
    )
    explanation_reasons: List[ExplanationReason] = Field(
        default_factory=list,
        description="Human-readable reasons explaining the score.",
    )

    ocr_used: bool = Field(
        ..., description="Whether OCR extraction was performed on this request."
    )
    ocr_extracted_chars: int = Field(
        default=0, description="Character count of OCR-extracted text, for debugging."
    )
    ocr_text: Optional[str] = Field(
        default=None,
        description="Raw text extracted from screenshot evidence, if OCR ran.",
    )
    model_version: Optional[str] = Field(
        default=None,
        description="Model version string. Optional so degraded/untrained "
        "responses still validate.",
    )
    advisory_only: bool = Field(
        default=True,
        description=(
            "Guardrail flag: this output is ALWAYS advisory. The AI "
            "service never writes to the blacklist or bypasses the "
            "Two-Officer approval state machine in the Express gateway."
        ),
    )


class OCRResponse(BaseModel):
    """
    Response contract for POST /ocr (multipart screenshot extraction).

    Mirrors the JSON shape returned by the Express gateway's
    /api/v1/reports/ocr handler so the mobile client can consume either
    the raw FastAPI response or the gateway's enriched response.
    """
    model_config = ConfigDict(protected_namespaces=())

    text: str = Field(default="", description="OCR-extracted text.")
    confidence: Optional[float] = Field(
        default=None, ge=0.0, le=1.0,
        description="Mean per-word Tesseract confidence, if available.",
    )
    extracted_chars: int = Field(default=0)
    ocr_used: bool = Field(default=True)

    # Flattened Layer-1 fields so the mobile client can render the risk
    # banner from a single round trip.
    scam_type: Optional[str] = Field(default="UNKNOWN", alias="scamType")
    is_scam: Optional[bool] = None
    confidence_score: Optional[float] = Field(default=None, ge=0.0, le=1.0)
    risk_level: Optional[RiskLevel] = None
    explanation_reasons: List[ExplanationReason] = Field(default_factory=list)


class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ok", "degraded"]
    model_loaded: bool
    model_version: Optional[str] = None
    message: Optional[str] = None