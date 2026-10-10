import io
import pytest
from PIL import Image
from app import create_app
from app.repositories.data_store import DataStore
from app.services.ai_service import AIService
from app.policies.workflow_policy import WorkflowPolicy

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def get_auth_token(client, email, password):
    resp = client.post("/api/v1/auth/login", json={"email": email, "password": password})
    assert resp.status_code == 200
    return resp.json["token"]

# AC-01: Separate authenticated experiences
def test_admin_and_driver_login(client):
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")
    assert admin_token is not None

    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    assert driver_token is not None

# AC-02: Self-registration restricted to reporter; cannot self-assign admin role
def test_self_registration_role_restriction(client):
    import uuid
    rand_email = f"citizen.test.{uuid.uuid4().hex[:6]}@example.com"
    resp = client.post("/api/v1/auth/register", json={
        "full_name": "Test Citizen",
        "email": rand_email,
        "password": "password123",
        "role": "admin" # Attacker attempts role escalation
    })
    assert resp.status_code == 201
    assert resp.json["user"]["role"] == "reporter" # Enforced by server

# AC-05: Driver route isolation (Driver A cannot mutate Driver B's route)
def test_driver_route_isolation(client):
    driver_rajesh_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    driver_sunil_token = get_auth_token(client, "driver.sunil@smartwaste.gov", "driver123")
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")

    import uuid
    rand_date = f"2026-11-{uuid.uuid4().hex[:2]}"

    # Admin creates route assigned to Rajesh
    create_resp = client.post("/api/v1/admin/routes", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "route_name": "Morning Test Route Rajesh",
        "route_date": rand_date,
        "shift": "MORNING",
        "vehicle_id": "f0000000-0000-0000-0000-000000000001",
        "driver_id": "d0000000-0000-0000-0000-000000000001" # Rajesh
    })
    route_id = create_resp.json["id"]

    # Publish route
    pub_res = client.post(f"/api/v1/admin/routes/{route_id}/publish", headers={"Authorization": f"Bearer {admin_token}"})
    assert pub_res.status_code == 200

    # Sunil attempts to start Rajesh's route -> Must be 403 FORBIDDEN
    sunil_start = client.post(f"/api/v1/driver/routes/{route_id}/start", headers={"Authorization": f"Bearer {driver_sunil_token}"})
    assert sunil_start.status_code == 403

    # Rajesh starts his own route -> 200 OK
    rajesh_start = client.post(f"/api/v1/driver/routes/{route_id}/start", headers={"Authorization": f"Bearer {driver_rajesh_token}"})
    assert rajesh_start.status_code == 200

# AC-06: Routine stop completes without photo; proof-required stop blocks without photo
def test_stop_photo_proof_policy(client):
    import uuid
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    rand_date = f"2026-12-{uuid.uuid4().hex[:2]}"

    # Create route
    create_resp = client.post("/api/v1/admin/routes", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "route_name": "Policy Test Route",
        "route_date": rand_date,
        "shift": "MORNING",
        "vehicle_id": "f0000000-0000-0000-0000-000000000001",
        "driver_id": "d0000000-0000-0000-0000-000000000001"
    })
    route_id = create_resp.json["id"]

    # Add Routine Stop (photo_required=False)
    routine_stop = client.post(f"/api/v1/admin/routes/{route_id}/stops", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "stop_type": "BUILDING",
        "building_id": "10000000-0000-0000-0000-000000000001",
        "photo_required": False
    }).json

    # Add Complaint Stop (photo_required=True)
    complaint_stop = client.post(f"/api/v1/admin/routes/{route_id}/stops", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "stop_type": "COMPLAINT_REPORT",
        "building_id": "10000000-0000-0000-0000-000000000002",
        "photo_required": True
    }).json

    # Publish and start route
    client.post(f"/api/v1/admin/routes/{route_id}/publish", headers={"Authorization": f"Bearer {admin_token}"})
    client.post(f"/api/v1/driver/routes/{route_id}/start", headers={"Authorization": f"Bearer {driver_token}"})

    # Routine Stop: start then complete WITHOUT photo -> Succeeds!
    client.post(f"/api/v1/driver/stops/{routine_stop['id']}/start", headers={"Authorization": f"Bearer {driver_token}"})
    comp_routine = client.post(f"/api/v1/driver/stops/{routine_stop['id']}/complete", headers={"Authorization": f"Bearer {driver_token}"})
    assert comp_routine.status_code == 200

    # Complaint Stop: start then complete WITHOUT photo -> Blocked by Policy!
    client.post(f"/api/v1/driver/stops/{complaint_stop['id']}/start", headers={"Authorization": f"Bearer {driver_token}"})
    comp_complaint_fail = client.post(f"/api/v1/driver/stops/{complaint_stop['id']}/complete", headers={"Authorization": f"Bearer {driver_token}"})
    assert comp_complaint_fail.status_code == 400
    assert "requires completion photo proof" in comp_complaint_fail.json["message"]

# AC-07 & AC-16: Anonymous report submission & tracking token isolation
def test_anonymous_report_and_tracking(client):
    # Submit report
    submit_resp = client.post("/api/v1/public/reports", json={
        "report_type": "NO_BIN_GARBAGE",
        "latitude": 19.0765,
        "longitude": 72.9980,
        "address_text": "Near Station Road Bus Stop",
        "description": "Scattered plastic bottles and food boxes."
    })
    assert submit_resp.status_code == 201
    data = submit_resp.json
    tracking_token = data["tracking_token"]
    assert tracking_token is not None

    # Track with valid token -> 200 OK
    track_resp = client.get(f"/api/v1/public/track/{tracking_token}")
    assert track_resp.status_code == 200
    assert track_resp.json["report_type"] == "NO_BIN_GARBAGE"

    # Track with invalid token -> 404 NOT FOUND
    track_fake = client.get("/api/v1/public/track/invalid-fake-token-999")
    assert track_fake.status_code == 404

# AC-08 & AC-09: Real AI inference on submitted images
def test_ai_real_inference():
    # Create test image with distinct green / organic hue
    img = Image.new("RGB", (100, 100), color=(34, 139, 34))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)

    res = AIService.analyze_waste_image(buf.getvalue())
    assert res["status"] in ["COMPLETED", "NEEDS_HUMAN_REVIEW"]
    assert res["model_name"] == "EcoVision-WasteNet"
    assert res["confidence"] > 0
    assert "primary_category" in res["result"]
    assert "fill_level_percentage" in res["result"]
    assert "quality" in res["result"]

# AC-12: Conflict prevention for active vehicle or driver
def test_vehicle_assignment_conflict(client):
    import uuid
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")
    conflict_date = f"2027-01-{uuid.uuid4().hex[:2]}"

    # Route 1
    r1 = client.post("/api/v1/admin/routes", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "route_name": "Conflict Route 1",
        "route_date": conflict_date,
        "shift": "MORNING",
        "vehicle_id": "f0000000-0000-0000-0000-000000000001",
        "driver_id": "d0000000-0000-0000-0000-000000000001"
    }).json
    client.post(f"/api/v1/admin/routes/{r1['id']}/publish", headers={"Authorization": f"Bearer {admin_token}"})

    # Route 2 on same date and shift with SAME vehicle
    r2 = client.post("/api/v1/admin/routes", headers={"Authorization": f"Bearer {admin_token}"}, json={
        "route_name": "Conflict Route 2",
        "route_date": conflict_date,
        "shift": "MORNING",
        "vehicle_id": "f0000000-0000-0000-0000-000000000001", # Duplicate vehicle
        "driver_id": "d0000000-0000-0000-0000-000000000002"
    }).json

    pub2 = client.post(f"/api/v1/admin/routes/{r2['id']}/publish", headers={"Authorization": f"Bearer {admin_token}"})
    assert pub2.status_code == 409
    assert "Conflict: Vehicle" in pub2.json["message"]
