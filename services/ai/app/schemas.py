# services/ai/app/schemas.py

"""
Pydantic models defining the /predict request/response contract between
the Express API Gateway and this FastAPI microservice.
"""

from typing import Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator


class PredictRequest(BaseModel):
    text: Optional[str] = Field(default=None)
    image_base64: Optional[str] = Field(default=None)
    report_id: Optional[str] = Field(default=None)
    scam_type: Optional[str] = Field(
        default="UNKNOWN",
        description="Deprecated client field, accepted but ignored — "
        "the model predicts category internally.",
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
    probability_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model-estimated probability the content is scam-like.",
    )
    label: Literal["likely_scam", "uncertain", "likely_legitimate"]

    # --- Layer 1: Instant AI Warning fields ---
    is_scam: bool = Field(
        ..., description="Convenience boolean: probability_score >= 0.5."
    )
    confidence_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model confidence in the assigned label (mirrors probability_score).",
    )
    risk_level: Literal["HIGH", "MEDIUM", "LOW"] = Field(
        ..., description="Coarse risk bucket for UI banner rendering."
    )
    explanation_reasons: List[ExplanationReason] = Field(
        default_factory=list,
        description="Human-readable reasons (ML + heuristic) explaining the score, "
        "for the 'WHY THIS MESSAGE WAS FLAGGED' UI section.",
    )

    ocr_used: bool = Field(
        ..., description="Whether OCR extraction was performed on this request."
    )
    ocr_extracted_chars: int = Field(
        default=0, description="Character count of OCR-extracted text, for debugging."
    )
    model_version: str
    advisory_only: bool = Field(
        default=True,
        description=(
            "Guardrail flag: this output is ALWAYS advisory. The AI "
            "service never writes to the blacklist or bypasses the "
            "Two-Officer approval state machine in the Express gateway."
        ),
    )


class HealthResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    status: Literal["ok", "degraded"]
    model_loaded: bool
    model_version: Optional[str] = None
    message: Optional[str] = None