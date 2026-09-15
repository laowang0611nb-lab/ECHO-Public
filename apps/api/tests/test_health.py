from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app


def test_health() -> None:
    with TestClient(app) as client:
        response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "service": "ECHO API",
        "version": settings.app_version,
        "environment": "development",
    }
