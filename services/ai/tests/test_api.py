"""
tests/test_api.py
-----------------
Integration tests for the SentinelPH AI microservice.

The /predict and /ocr endpoints require an X-API-KEY header matching
the value stored in services/ai/.env (AI_SERVICE_API_KEY). These tests
load that key via python-dotenv so they exercise the same auth path as
production.
"""

import os
from pathlib import Path

import pytest
from dotenv import load_dotenv
from fastapi.testclient import TestClient

# Load services/ai/.env BEFORE importing app.main so the middleware
# picks up AI_SERVICE_API_KEY at module import time.
AI_ROOT = Path(__file__).resolve().parents[1]
load_dotenv(AI_ROOT / ".env")

if not os.environ.get("AI_SERVICE_API_KEY"):
    raise RuntimeError(
        "AI_SERVICE_API_KEY not found in services/ai/.env — tests cannot "
        "authenticate against /predict. Add the key to .env and retry."
    )

from app.main import app  # noqa: E402

TEST_API_KEY = os.environ["AI_SERVICE_API_KEY"]
HEADERS = {"X-API-KEY": TEST_API_KEY}

client = TestClient(app)


def test_health_check():
    """/health is public — no API key required."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert "model_version" in data


def test_predict_scam_message():
    """Obvious phishing -> malicious or grey_area."""
    payload = {
        "text": "BPI Alert: Your account locked. Verify at bpi-secure-update-ph.com"
    }
    response = client.post("/predict", json=payload, headers=HEADERS)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["label"] in ("malicious", "grey_area")
    assert data["risk_level"] in ("HIGH", "MEDIUM")
    assert data["probability_score"] > 0.5


def test_predict_grey_area_message():
    """Promo, no link, no urgency -> grey_area."""
    payload = {
        "text": "Grab promo 20% off, use code GRAB20, valid until Sept 30"
    }
    response = client.post("/predict", json=payload, headers=HEADERS)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["label"] in ("grey_area", "legitimate")
    assert data["risk_level"] in ("MEDIUM", "LOW")


def test_predict_legit_message():
    """First-party OTP, no link -> legitimate."""
    payload = {
        "text": "Your GCash Authentication Code is 839102. Do not share this code with anyone."
    }
    response = client.post("/predict", json=payload, headers=HEADERS)
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["label"] == "legitimate"
    assert data["risk_level"] == "LOW"
    assert data["probability_score"] < 0.5