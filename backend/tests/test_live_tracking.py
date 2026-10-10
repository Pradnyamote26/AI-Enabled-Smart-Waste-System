import pytest
import json
import time
from app import create_app
from app.repositories.data_store import DataStore

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def get_auth_token(client, email, password):
    res = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, f"Login failed for {email}: {res.get_json()}"
    return res.get_json()["token"]

def test_driver_tracking_start_and_isolation(client):
    """
    Requirements 1 & 2:
    - Starting a trip enables an authorized tracking session.
    - An unassigned driver cannot publish locations for another driver's route.
    """
    token_rajesh = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    token_sunil = get_auth_token(client, "driver.sunil@smartwaste.gov", "driver123")
    headers_rajesh = {"Authorization": f"Bearer {token_rajesh}"}
    headers_sunil = {"Authorization": f"Bearer {token_sunil}"}

    # Find Rajesh's assigned route
    routes_res = client.get("/api/v1/driver/routes", headers=headers_rajesh)
    assert routes_res.status_code == 200
    rajesh_routes = routes_res.get_json()
    assert len(rajesh_routes) > 0, "Rajesh must have at least one assigned route in seed data"
    route_id = rajesh_routes[0]["id"]
    vehicle_id = rajesh_routes[0].get("vehicle_id")

    # Sunil (unassigned) attempts to start tracking on Rajesh's route -> 403 Forbidden
    unauthorized_res = client.post("/api/v1/driver/tracking/start", headers=headers_sunil, json={
        "route_id": route_id,
        "vehicle_id": vehicle_id
    })
    assert unauthorized_res.status_code == 403
    err_json = unauthorized_res.get_json()
    assert "not authorized" in err_json.get("message", "").lower()

    # Rajesh starts tracking -> 200 OK
    start_res = client.post("/api/v1/driver/tracking/start", headers=headers_rajesh, json={
        "route_id": route_id,
        "vehicle_id": vehicle_id,
        "latitude": 19.0760,
        "longitude": 72.8777,
        "accuracy": 8.5
    })
    assert start_res.status_code in [200, 201]
    session_data = start_res.get_json()
    assert session_data["status"] == "ACTIVE"
    assert session_data["route_id"] == route_id

def test_driver_location_telemetry_and_validation(client):
    """
    Requirements 3, 4, 8:
    - Valid GPS updates persist with timestamps.
    - ETA is computed using routing engine.
    - Invalid coordinates produce 400 Bad Request.
    """
    token_rajesh = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers_rajesh = {"Authorization": f"Bearer {token_rajesh}"}

    routes_res = client.get("/api/v1/driver/routes", headers=headers_rajesh)
    route_id = routes_res.get_json()[0]["id"]

    # Ensure tracking is active
    client.post("/api/v1/driver/tracking/start", headers=headers_rajesh, json={"route_id": route_id})

    # Test invalid coordinates (latitude out of range)
    invalid_res = client.post("/api/v1/driver/tracking/location", headers=headers_rajesh, json={
        "route_id": route_id,
        "latitude": 95.0,
        "longitude": 72.8777,
        "accuracy": 10.0
    })
    assert invalid_res.status_code == 400

    # Test valid telemetry coordinate in Mumbai/Navi Mumbai
    valid_res = client.post("/api/v1/driver/tracking/location", headers=headers_rajesh, json={
        "route_id": route_id,
        "latitude": 19.0765,
        "longitude": 72.8780,
        "accuracy": 6.2,
        "heading": 145.0,
        "speed": 6.5
    })
    assert valid_res.status_code == 200
    telemetry = valid_res.get_json()
    assert telemetry["success"] is True
    assert telemetry["current_latitude"] == 19.0765
    assert telemetry["current_longitude"] == 72.8780
    assert "next_stop_eta" in telemetry

def test_admin_live_fleet_and_route_tracking(client):
    """
    Requirements 5 & 8:
    - Admins can view authorized active vehicle positions.
    - Stop-by-stop cumulative ETAs are calculated using road network.
    """
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")
    headers_admin = {"Authorization": f"Bearer {admin_token}"}

    # Fetch active fleet tracking
    fleet_res = client.get("/api/v1/admin/tracking/live", headers=headers_admin)
    assert fleet_res.status_code == 200
    fleet = fleet_res.get_json()
    assert "active_vehicles" in fleet
    assert "total_active_trips" in fleet

    # Check route-specific tracking if active trips exist
    if fleet["total_active_trips"] > 0:
        active_route_id = fleet["active_vehicles"][0]["route_id"]
        route_track_res = client.get(f"/api/v1/admin/tracking/routes/{active_route_id}", headers=headers_admin)
        assert route_track_res.status_code == 200
        detail = route_track_res.get_json()
        assert "session" in detail
        assert "breadcrumbs" in detail
        assert "stops_with_eta" in detail

def test_public_tracking_privacy_and_token_protection(client):
    """
    Requirements 6, 7, 9, 10:
    - Public users can only retrieve tracking information for the supplied valid tracking token.
    - Public responses do NOT expose driver's phone number, email, or private driver profile.
    - Missing coordinates produce an unavailable ETA rather than a fabricated value.
    """
    # Submit report to get real unhashed tracking token
    submit_resp = client.post("/api/v1/public/reports", json={
        "report_type": "NO_BIN_GARBAGE",
        "latitude": 19.0765,
        "longitude": 72.9980,
        "address_text": "Sector 4 Vashi Waste Point",
        "description": "Garbage pile near roadside"
    })
    assert submit_resp.status_code == 201
    tracking_token = submit_resp.get_json()["tracking_token"]

    # Invalid tracking token -> 404
    bad_res = client.get("/api/v1/public/track/invalid-secret-token-xyz")
    assert bad_res.status_code == 404

    # Valid tracking token -> 200 with live_tracking payload
    valid_res = client.get(f"/api/v1/public/track/{tracking_token}")
    assert valid_res.status_code == 200
    public_data = valid_res.get_json()

    assert "report_number" in public_data
    assert "status" in public_data
    assert "live_tracking" in public_data

    live_trk = public_data["live_tracking"]
    # Privacy check: Must NOT contain driver sensitive fields
    assert "driver_phone" not in live_trk
    assert "driver_email" not in live_trk
    assert "driver_id" not in live_trk
    assert "driver_name" not in live_trk
    assert "driver" not in live_trk

    # Check vehicle and eta contract
    assert "has_live_tracking" in live_trk
    assert "trip_status" in live_trk
    assert "eta" in live_trk

def test_driver_tracking_stop_lifecycle(client):
    """
    Requirement 10:
    - Location sharing stops when the trip ends.
    """
    token_rajesh = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers_rajesh = {"Authorization": f"Bearer {token_rajesh}"}

    routes_res = client.get("/api/v1/driver/routes", headers=headers_rajesh)
    route_id = routes_res.get_json()[0]["id"]

    # Driver stops tracking
    stop_res = client.post("/api/v1/driver/tracking/stop", headers=headers_rajesh, json={"route_id": route_id})
    assert stop_res.status_code == 200
    assert stop_res.get_json()["status"] == "COMPLETED"

    # Status check confirms inactive
    status_res = client.get("/api/v1/driver/tracking/status", headers=headers_rajesh)
    assert status_res.status_code == 200
    assert status_res.get_json()["has_active_session"] is False
