import io
import os
from datetime import datetime, timezone
from types import SimpleNamespace

os.environ["DATABASE_URL"] = "sqlite:///./test_nagardrishti.db"
os.environ["UPLOAD_DIR"] = "work/test-uploads"
os.environ["JWT_SECRET"] = "test-only-secret-with-sufficient-length"

from fastapi.testclient import TestClient
from PIL import Image
from backend.main import app
from backend import main as api_main
from backend.database import Base, engine
from backend.routing import route_hazard_summary, route_rank

client = TestClient(app)

def png_bytes():
    buffer = io.BytesIO()
    Image.new("RGB", (12, 12), (210, 200, 180)).save(buffer, format="PNG")
    return buffer.getvalue()

def setup_function():
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)

def test_health_and_empty_model_status():
    assert client.get("/api/health").json()["status"] == "ok"
    result = client.get("/api/models/status").json()
    assert result["model_available"] is False
    assert result["supported_classes"] == []

def test_cors_allows_both_local_frontend_hostnames():
    for origin in ("http://localhost:5173", "http://127.0.0.1:5173"):
        response = client.options("/api/hazards", headers={
            "Origin": origin,
            "Access-Control-Request-Method": "GET",
        })
        assert response.status_code == 200
        assert response.headers["access-control-allow-origin"] == origin

def test_report_upload_persists_without_dataset_consent():
    response = client.post("/api/reports", data={"category":"pothole", "latitude":"12.9", "longitude":"77.5", "dataset_consent":"false"}, files={"image":("road.png", png_bytes(), "image/png")})
    assert response.status_code == 201, response.text
    report = response.json()
    assert report["status"] == "submitted"
    assert client.get("/api/reports").json()["count"] == 1
    from backend.database import SessionLocal
    from backend.models import DatasetConsent, DatasetContribution
    db = SessionLocal()
    try:
        assert db.query(DatasetConsent).one().dataset_consent is False
        assert db.query(DatasetContribution).count() == 0
    finally:
        db.close()

def test_dataset_contribution_requires_and_records_explicit_consent():
    response = client.post("/api/reports", data={"category":"pothole", "latitude":"12.9", "longitude":"77.5", "dataset_consent":"true"}, files={"image":("consented.png", png_bytes(), "image/png")})
    assert response.status_code == 201, response.text
    from backend.database import SessionLocal
    from backend.models import DatasetConsent, DatasetContribution, RoadReport
    db = SessionLocal()
    try:
        consent = db.query(DatasetConsent).one()
        contribution = db.query(DatasetContribution).one()
        report = db.query(RoadReport).one()
        assert consent.dataset_consent is True
        assert report.public_id == response.json()["id"]
        assert contribution.report_id == report.id
        assert contribution.status == "pending_review"
    finally:
        db.close()

def test_authenticated_report_is_only_in_owners_report_history():
    first = client.post("/api/auth/register", json={"email":"owner@example.org", "password":"a-very-long-test-password"})
    second = client.post("/api/auth/register", json={"email":"another@example.org", "password":"a-very-long-test-password"})
    assert first.status_code == 201 and second.status_code == 201
    owner_headers = {"Authorization": f"Bearer {first.json()['access_token']}"}
    response = client.post("/api/reports", headers=owner_headers,
                           data={"category":"pothole", "latitude":"12.9", "longitude":"77.5", "dataset_consent":"false"},
                           files={"image":("owned.png", png_bytes(), "image/png")})
    assert response.status_code == 201, response.text
    assert client.get("/api/reports/mine", headers=owner_headers).json()["items"][0]["id"] == response.json()["id"]
    assert client.get("/api/reports/mine", headers={"Authorization": f"Bearer {second.json()['access_token']}"}).json()["items"] == []
    assert client.get("/api/reports/mine").status_code == 401

def test_unconsented_and_invalid_image_are_rejected_or_excluded():
    bad = client.post("/api/reports", data={"category":"pothole", "latitude":"12", "longitude":"77"}, files={"image":("x.png", b"not an image", "image/png")})
    assert bad.status_code == 415
    invalid_category = client.post("/api/reports", data={"category":"invented", "latitude":"12", "longitude":"77"}, files={"image":("x.png", png_bytes(), "image/png")})
    assert invalid_category.status_code == 422

def test_citizen_cannot_open_admin_review_queue():
    registration = client.post("/api/auth/register", json={"email":"citizen@example.org", "password":"a-very-long-test-password"})
    assert registration.status_code == 201
    token = registration.json()["access_token"]
    denied = client.get("/api/admin/dataset/review", headers={"Authorization":f"Bearer {token}"})
    assert denied.status_code == 403

def test_route_hazard_summary_and_ranking():
    route = {"geometry":{"coordinates":[[77.5, 12.9], [77.51, 12.9]]}}
    near = SimpleNamespace(latitude=12.9001, longitude=77.505, category="pothole", status="verified", created_at=datetime.now(timezone.utc))
    far = SimpleNamespace(latitude=13.2, longitude=77.8, category="road_crack", status="submitted", created_at=datetime.now(timezone.utc))
    summary = route_hazard_summary(route, [near, far])
    assert summary["hazard_count"] == 1
    assert summary["verified_hazard_count"] == 1
    ranked = route_rank([{"duration":600,"hazard_score":3},{"duration":720,"hazard_score":0}])
    assert ranked[0]["recommended"] is True
    assert ranked[0]["hazard_score"] == 0

def test_navigation_provider_unconfigured_returns_clear_status(monkeypatch):
    monkeypatch.setenv("OSRM_BASE_URL", "")
    response = client.get("/api/navigation/routes", params={"origin_lat":12.9,"origin_lon":77.5,"destination_lat":12.91,"destination_lon":77.51})
    assert response.status_code == 503
    assert "not configured" in response.json()["detail"]

def test_navigation_endpoint_returns_ranked_provider_routes(monkeypatch):
    from backend.database import SessionLocal
    from backend.models import RoadReport
    db = SessionLocal()
    try:
        db.add(RoadReport(public_id="qa-route-hazard", category="pothole", description="",
                          latitude=12.9001, longitude=77.505, status="verified"))
        db.commit()
    finally:
        db.close()
    api_main.route_last_request.clear()
    monkeypatch.setattr(api_main, "fetch_osrm_routes", lambda *args: [
        {"distance":1000,"duration":120,"geometry":{"coordinates":[[77.5,12.9],[77.51,12.9]]}},
        {"distance":1500,"duration":200,"geometry":{"coordinates":[[77.5,13.0],[77.51,13.0]]}},
    ])
    response = client.get("/api/navigation/routes", params={"origin_lat":12.9,"origin_lon":77.5,"destination_lat":12.91,"destination_lon":77.51})
    assert response.status_code == 200
    result = response.json()
    assert len(result["routes"]) == 2
    assert result["routes"][0]["recommended"] is True
    assert result["hazard_coverage_limited"] is True
    near_route = next(route for route in result["routes"] if route["geometry"]["coordinates"][0][1] == 12.9)
    far_route = next(route for route in result["routes"] if route["geometry"]["coordinates"][0][1] == 13.0)
    assert near_route["hazard_count"] == 1
    assert near_route["verified_hazard_count"] == 1
    assert near_route["hazard_score"] > 0
    assert far_route["hazard_count"] == 0
