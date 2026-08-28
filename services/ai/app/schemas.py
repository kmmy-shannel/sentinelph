"""
app/schemas.py
----------------
Pydantic models defining the /predict request/response contract between
the Express API Gateway and this FastAPI microservice.
"""

from typing import Literal, Optional

from pydantic import BaseModel, Field, model_validator


class PredictRequest(BaseModel):
    """
    Exactly one evidence source must be provided:
      - `text`            : plain report text (e.g. the SMS body)
      - `image_base64`    : base64-encoded screenshot (data-URI prefix OK)

    Both may be supplied together (e.g. report text + a supporting
    screenshot); in that case the OCR-extracted text is appended to the
    plain text before vectorization.
    """

    text: Optional[str] = Field(
        default=None, description="Plain report text, e.g. the raw SMS body."
    )
    image_base64: Optional[str] = Field(
        default=None,
        description="Base64-encoded screenshot evidence, optionally "
        "prefixed with a data:image/...;base64, URI header.",
    )
    report_id: Optional[str] = Field(
        default=None,
        description="Optional Express-side report ID, echoed back for "
        "correlation/logging on the gateway side.",
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


class PredictResponse(BaseModel):
    report_id: Optional[str] = None
    probability_score: float = Field(
        ..., ge=0.0, le=1.0,
        description="Model-estimated probability the content is scam-like.",
    )
    label: Literal["likely_scam", "uncertain", "likely_legitimate"]
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
    status: Literal["ok", "degraded"]
    model_loaded: bool
    model_version: Optional[str] = None
    message: Optional[str] = None