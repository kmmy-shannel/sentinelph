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

Startup behavior (Requirement 8):
    On boot, checks for model artifacts (.pkl) in services/ai/models/.
    If missing, the service still starts (so /health works for
    monitoring) but /predict returns HTTP 503 with a clear message
    instructing the operator to run `python scripts/train.py`.
"""

import sys
import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from loguru import logger

sys.path.append(str(Path(__file__).resolve().parent.parent))

from app.config import classify_score, settings  # noqa: E402
from app.inference import ModelNotLoadedError, get_classifier  # noqa: E402
from app.schemas import HealthResponse, PredictRequest, PredictResponse  # noqa: E402
from app.utils.ocr import OCRError, extract_text_from_base64
from app.utils.text_normalize import normalize_text


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup: attempt to load model artifacts once, log clear status.
    clf = get_classifier()
    if not clf.loaded:
        logger.warning(
            "=" * 70 + "\n"
            "STARTUP WARNING: No trained model artifacts found in {}\n"
            "The API will run, but POST /predict will return HTTP 503\n"
            "until you train a model:\n\n"
            "    cd services/ai\n"
            "    python scripts/train.py\n" + "=" * 70,
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

# Express gateway calls this service server-to-server; CORS is permissive
# here only for local dev convenience. In production, restrict
# `allow_origins` to the known gateway host(s) or remove CORS entirely
# since browsers never call this service directly.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["ops"])
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
        message=(
            "No model artifacts found. Run `python scripts/train.py` "
            "in services/ai/ to enable /predict."
        ),
    )


@app.post(
    "/predict",
    response_model=PredictResponse,
    tags=["inference"],
    responses={
        503: {"description": "Model artifacts not trained yet."},
        422: {"description": "Invalid request (no text or image provided, or bad base64)."},
    },
)
def predict(payload: PredictRequest) -> PredictResponse:
    t0 = time.time()
    clf = get_classifier()

    if not clf.loaded:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "Model artifacts not found. An administrator must run "
                "'python scripts/train.py' in services/ai/ before this "
                "endpoint can serve predictions."
            ),
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