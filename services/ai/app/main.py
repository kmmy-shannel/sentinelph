# services/ai/app/main.py

"""
app/main.py
------------
SentinelPH — AI Scam Detection Pipeline — FastAPI Microservice.

Endpoints:
    GET  /health   -> liveness + model-load status
    POST /predict  -> scam probability, risk level + explainable reasons
    POST /ocr      -> multipart screenshot OCR (used by Express gateway)

STRICT GUARDRAIL (SRS Requirement 5):
    This service is READ-ONLY / ADVISORY with respect to SentinelPH's
    core data. It has no database credentials, no write access to
    MongoDB, and no knowledge of the blacklist. It can NEVER blacklist a
    number or bypass the Express gateway's Two-Officer approval state
    machine — it only returns a probability + label + explanation that
    the Express Gateway attaches to a report as metadata for human
    officers to consider.
"""

import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.config import settings  # noqa: E402
from app.inference import ModelNotLoadedError, get_classifier  # noqa: E402
from app.schemas import (  # noqa: E402
    HealthResponse,
    OCRResponse,
    PredictRequest,
    PredictResponse,
)
from app.utils.ocr import (  # noqa: E402
    OCRError,
    extract_text_and_confidence_from_bytes,
    extract_text_from_base64,
)
from app.utils.text_normalize import normalize_text

API_KEY = os.environ.get("AI_SERVICE_API_KEY", "").strip()
PROTECTED_PATHS = {"/predict", "/ocr"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    clf = get_classifier()
    if not clf.loaded:
        logger.warning(
            "=" * 70 + "\n"
            "STARTUP WARNING: No trained model artifacts found in {}\n"
            "The API will run, but POST /predict will return HTTP 503\n"
            "until model weights are loaded.\n" + "=" * 70,
            settings.MODELS_DIR,
        )
    else:
        test_acc = clf.metadata.get("test_accuracy") or clf.metadata.get("test_metrics", {}).get("accuracy")
        logger.info(
            "Model loaded successfully. version={} test_accuracy={}",
            clf.model_version,
            test_acc,
        )
    yield


app = FastAPI(
    title="SentinelPH AI Scam Detection Service",
    description=(
        "Advisory-only scam probability + explainable-reason scoring for "
        "SMS/text and screenshot evidence. Never writes to the SentinelPH "
        "database and never bypasses the Two-Officer approval workflow."
    ),
    version=settings.SERVICE_VERSION,
    lifespan=lifespan,
)


@app.middleware("http")
async def api_key_middleware(request: Request, call_next):
    if request.url.path in PROTECTED_PATHS:
        if not API_KEY:
            return JSONResponse(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                content={"error": "AI_SERVICE_API_KEY not configured on the server."},
            )
        provided = request.headers.get("x-api-key", "")
        if provided != API_KEY:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"error": "Invalid or missing X-API-KEY."},
            )
    return await call_next(request)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.api_route("/health", methods=["GET", "HEAD"], response_model=HealthResponse, tags=["ops"])
def health() -> HealthResponse:
    clf = get_classifier()
    if clf.loaded:
        return HealthResponse(
            status="ok",
            model_loaded=True,
            model_version=clf.model_version,
        )
    return HealthResponse(
        status="degraded",
        model_loaded=False,
        message="No model artifacts loaded.",
    )


@app.post(
    "/predict",
    response_model=PredictResponse,
    tags=["inference"],
    responses={
        401: {"description": "Invalid or missing X-API-KEY header."},
        503: {"description": "Model not loaded or AI_SERVICE_API_KEY missing on server."},
        422: {"description": "Invalid request (no text or image provided, or bad base64)."},
    },
)
def predict(payload: PredictRequest) -> PredictResponse:
    t0 = time.time()
    clf = get_classifier()

    if not clf.loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model artifacts not found or failed to load.",
        )

    combined_text_parts = []
    ocr_used = False
    ocr_char_count = 0
    ocr_text = ""

    if payload.text and payload.text.strip():
        combined_text_parts.append(payload.text.strip())

    if payload.image_base64 and payload.image_base64.strip():
        ocr_used = True
        try:
            ocr_text = extract_text_from_base64(payload.image_base64)
        except OCRError as exc:
            logger.warning("OCR failed for report_id={}: {}", payload.report_id, exc)
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Could not process screenshot evidence: {exc}",
            ) from exc

        ocr_char_count = len(ocr_text)
        if ocr_text:
            combined_text_parts.append(ocr_text)

    raw_combined = " ".join(combined_text_parts).strip()
    clean_text = normalize_text(raw_combined)

    try:
        result = clf.analyze(raw_text=raw_combined, normalized_text=clean_text)
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    probability = result["probability_score"]
    label = result["label"]                          # 3-class label from inference
    # Normalize risk_level to UPPERCASE to match schemas.RiskLevel Literal
    risk_level_upper = str(result["risk_level"]).upper()

    logger.info(
        "predict report_id={} ocr_used={} chars={} prob={:.4f} "
        "risk={} reasons={} label={} took_ms={:.1f}",
        payload.report_id, ocr_used, len(clean_text), probability,
        result["risk_level"], len(result["explanation_reasons"]), label,
        (time.time() - t0) * 1000,
    )

    return PredictResponse(
        report_id=payload.report_id,
        probability_score=probability,
        label=label,
        is_scam=result["is_scam"],
        confidence_score=result["confidence_score"],
        risk_level=risk_level_upper,                  # ← UPPERCASE
        explanation_reasons=result["explanation_reasons"],
        ocr_used=ocr_used,
        ocr_extracted_chars=ocr_char_count,
        ocr_text=ocr_text or None,
        model_version=clf.model_version,
        advisory_only=True,
    )


@app.post(
    "/ocr",
    response_model=OCRResponse,
    tags=["ocr"],
    responses={
        401: {"description": "Invalid or missing X-API-KEY header."},
        422: {"description": "Image could not be decoded."},
    },
)
async def ocr_extract(
    file: UploadFile = File(..., description="Screenshot image (jpeg/png/webp)."),
    scamType: Optional[str] = Form(default="UNKNOWN"),
) -> OCRResponse:
    """
    Multipart endpoint used by the Express gateway's /reports/ocr route.
    Returns extracted text plus a confidence score, and (when the
    classifier is loaded) a flattened Layer-1 risk assessment.
    """
    raw = await file.read()
    if not raw:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Uploaded file is empty.",
        )

    try:
        text, confidence = extract_text_and_confidence_from_bytes(raw)
    except OCRError as exc:
        logger.warning("OCR failed for upload {}: {}", file.filename, exc)
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Could not process screenshot evidence: {exc}",
        ) from exc

    response = OCRResponse(
        text=text,
        confidence=confidence,
        extracted_chars=len(text),
        ocr_used=True,
        scamType=(scamType or "UNKNOWN"),
    )

    # Best-effort Layer-1 classification of the extracted text.
    clf = get_classifier()
    if clf.loaded and text.strip():
        try:
            clean_text = normalize_text(text)
            result = clf.analyze(raw_text=text, normalized_text=clean_text)
            response.is_scam = result["is_scam"]
            response.confidence_score = result["confidence_score"]
            response.risk_level = str(result["risk_level"]).upper()
            response.explanation_reasons = result["explanation_reasons"]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Layer-1 classification after OCR failed: {}", exc)

    # FIX: the field's real Python attribute name is `scam_type`
    # (schemas.py declares `scam_type: ... = Field(alias="scamType")`).
    # `scamType` is only the JSON/wire alias — it doesn't exist as an
    # attribute on the constructed model, which is exactly what crashed
    # this endpoint with AttributeError before.
    logger.info(
        "ocr file={} scamType={} chars={} confidence={} risk={}",
        file.filename, response.scam_type, response.extracted_chars,
        response.confidence, response.risk_level,
    )
    return response


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )