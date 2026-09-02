import pytest
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_health_check():
    """Verify that the health check endpoint returns 200 OK and model status."""
    response = client.get("/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["model_loaded"] is True
    assert "model_version" in data


def test_predict_scam_message():
    """Verify that an obvious scam text receives a high scam probability score."""
    payload = {
        "text": "CONGRATS! You won 100,000 PHP from GCASH! Claim now at http://bit.ly/fake-link"
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "probability_score" in data
    assert data["probability_score"] > 0.5
    assert data["label"] == "likely_scam"


def test_predict_legit_message():
    """Verify that an authentic OTP message receives a low scam probability score."""
    payload = {
        "text": "Your GCash Authentication Code is 839102. Do not share this code with anyone."
    }
    response = client.post("/predict", json=payload)
    assert response.status_code == 200
    data = response.json()
    assert "probability_score" in data
    assert data["probability_score"] < 0.5
    assert data["label"] == "likely_legitimate"
