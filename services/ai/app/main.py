"""
app/main.py
------------
SentinelPH — AI Scam Detection Pipeline — FastAPI Microservice.

Endpoints:
    GET  /health   -> liveness + model-load status
    POST /predict  -> scam probability + categorical label for a report

STRICT GUARDRAIL (SRS Requirement 5):
    This service is READ-ONLY / ADVISORY with respect to SentinelPH's
    core data. It has no database credentials, no write access to
    MongoDB, and no knowledge of the blacklist. It can NEVER blacklist a
    number or bypass the Express gateway's Two-Officer approval state
    machine — it only returns a probability + label that the Express
    Gateway attaches to a report as metadata for human officers to
    consider. Enforcement of this boundary lives on the Express side
    (see services/api/controllers/reportController.js), not here — but
    this service is intentionally built with zero capability to do
    anything else, as defense in depth.
"""

import os
import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.config import classify_score, settings  # noqa: E402
from app.inference import ModelNotLoadedError, get_classifier  # noqa: E402
from app.schemas import HealthResponse, PredictRequest, PredictResponse  # noqa: E402
from app.utils.ocr import OCRError, extract_text_from_base64
from app.utils.text_normalize import normalize_text

# Security configuration
API_KEY = os.environ.get("AI_SERVICE_API_KEY", "").strip()
PROTECTED_PATHS = {"/predict"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: attempt to load model artifacts once, log clear status.
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
    # Shutdown: nothing to clean up (no DB connections held by this service).


app = FastAPI(
    title="SentinelPH AI Scam Detection Service",
    description=(
        "Advisory-only scam probability scoring for SMS/text and "
        "screenshot evidence. Never writes to the SentinelPH database "
        "and never bypasses the Two-Officer approval workflow."
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
        probability = clf.predict(clean_text)
    except ModelNotLoadedError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc

    label = classify_score(probability)

    logger.info(
        "predict report_id={} ocr_used={} chars={} prob={:.4f} "
        "label={} took_ms={:.1f}",
        payload.report_id, ocr_used, len(clean_text), probability, label,
        (time.time() - t0) * 1000,
    )

    return PredictResponse(
        report_id=payload.report_id,
        probability_score=round(probability, 4),
        label=label,
        ocr_used=ocr_used,
        ocr_extracted_chars=ocr_char_count,
        model_version=clf.model_version,
        advisory_only=True,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app.main:app",
        host=settings.HOST,
        port=settings.PORT,
        reload=True,
    )