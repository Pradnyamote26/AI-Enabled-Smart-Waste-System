import uuid
import hashlib
import pytest
from app import create_app
from app.repositories.data_store import DataStore
from app.policies.workflow_policy import WorkflowPolicy

@pytest.fixture
def client():
    app = create_app()
    app.config["TESTING"] = True
    with app.test_client() as client:
        yield client

def get_admin_token(client):
    resp = client.post("/api/v1/auth/login", json={"email": "admin@smartwaste.gov", "password": "admin123"})
    assert resp.status_code == 200
    return resp.json["token"]

def get_driver_token(client):
    resp = client.post("/api/v1/auth/login", json={"email": "driver.rajesh@smartwaste.gov", "password": "driver123"})
    assert resp.status_code == 200
    return resp.json["token"]

# ----------------------------------------------------------------------------
# 1. Vehicle CRUD & Archival
# ----------------------------------------------------------------------------
def test_vehicle_full_crud_and_archival(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    rand_suffix = uuid.uuid4().hex[:4].upper()
    veh_num = f"MH-43-TEST-{rand_suffix}"

    # Create
    create_res = client.post("/api/v1/admin/vehicles", headers=headers, json={
        "vehicle_number": veh_num,
        "vehicle_type": "COMPACTOR_TRUCK",
        "capacity_kg": 3500,
        "status": "AVAILABLE"
    })
    assert create_res.status_code == 201
    veh_id = create_res.json["id"]
    assert create_res.json["vehicle_number"] == veh_num

    # View Details
    get_res = client.get(f"/api/v1/admin/vehicles/{veh_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json["capacity_kg"] == 3500

    # Update
    update_res = client.patch(f"/api/v1/admin/vehicles/{veh_id}", headers=headers, json={
        "capacity_kg": 4000,
        "maintenance_status": "SERVICED"
    })
    assert update_res.status_code == 200
    assert update_res.json["capacity_kg"] == 4000

    # Safe Archive
    del_res = client.delete(f"/api/v1/admin/vehicles/{veh_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json["vehicle"]["is_active"] is False

# ----------------------------------------------------------------------------
# 2. Driver CRUD & Security
# ----------------------------------------------------------------------------
def test_driver_full_crud_and_security(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    rand_email = f"driver.{uuid.uuid4().hex[:6]}@smartwaste.gov"

    # Create Driver
    create_res = client.post("/api/v1/admin/drivers", headers=headers, json={
        "full_name": "Ramesh K. Jadhav",
        "email": rand_email,
        "phone": "+91 98200 88991",
        "password": "secureDriverPass123"
    })
    assert create_res.status_code == 201
    driver_id = create_res.json["id"]
    # Verify plaintext password is never returned
    assert "password_hash" not in create_res.json
    assert "password" not in create_res.json

    # View Driver
    get_res = client.get(f"/api/v1/admin/drivers/{driver_id}", headers=headers)
    assert get_res.status_code == 200
    assert get_res.json["full_name"] == "Ramesh K. Jadhav"
    assert "password_hash" not in get_res.json

    # Update Driver
    update_res = client.patch(f"/api/v1/admin/drivers/{driver_id}", headers=headers, json={
        "phone": "+91 98200 99999"
    })
    assert update_res.status_code == 200
    assert update_res.json["phone"] == "+91 98200 99999"

    # Archive Driver
    del_res = client.delete(f"/api/v1/admin/drivers/{driver_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json["driver"]["is_active"] is False

# ----------------------------------------------------------------------------
# 3. Dustbin CRUD, QR Generation, Download URI, Regeneration & Deactivation
# ----------------------------------------------------------------------------
def test_dustbin_and_qr_management_lifecycle(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}
    rand_bin = f"BIN-TEST-{uuid.uuid4().hex[:4].upper()}"

    # Register Dustbin
    create_res = client.post("/api/v1/admin/dustbins", headers=headers, json={
        "bin_code": rand_bin,
        "bin_type": "RECYCLABLE",
        "capacity_liters": 240,
        "latitude": 19.0780,
        "longitude": 72.9995
    })
    assert create_res.status_code == 201
    bin_id = create_res.json["id"]
    orig_token = create_res.json["qr_public_token"]
    assert orig_token.startswith("qr-")

    # Get QR Details & Data URI
    qr_res = client.get(f"/api/v1/admin/dustbins/{bin_id}/qr", headers=headers)
    assert qr_res.status_code == 200
    assert qr_res.json["data_uri"].startswith("data:image/png;base64,")
    assert rand_bin in qr_res.json["target_url"]

    # Regenerate QR Token
    regen_res = client.post(f"/api/v1/admin/dustbins/{bin_id}/qr/regenerate", headers=headers)
    assert regen_res.status_code == 200
    new_token = regen_res.json["qr_data"]["qr_token"]
    assert new_token != orig_token

    # Toggle Deactivate QR
    toggle_res = client.post(f"/api/v1/admin/dustbins/{bin_id}/qr/toggle", headers=headers)
    assert toggle_res.status_code == 200
    assert toggle_res.json["dustbin"]["qr_active"] is False

    # Listed in QR studio aggregate endpoint
    all_qr_res = client.get("/api/v1/admin/qr-codes", headers=headers)
    assert all_qr_res.status_code == 200
    matching = [q for q in all_qr_res.json if q["bin_id"] == bin_id]
    assert len(matching) == 1
    assert matching[0]["qr_active"] is False

# ----------------------------------------------------------------------------
# 4. Waste Report Submission, Admin Listing & Filter Verification
# ----------------------------------------------------------------------------
def test_waste_report_submission_and_admin_listing(client):
    admin_token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {admin_token}"}
    unique_desc = f"Urgent commercial waste test {uuid.uuid4().hex[:6]}"

    # Public submission
    sub_res = client.post("/api/v1/public/reports", json={
        "report_type": "OVERFLOWING_BIN",
        "description": unique_desc,
        "latitude": 19.0765,
        "longitude": 72.9980
    })
    assert sub_res.status_code == 201
    rep_num = sub_res.json["report_number"]
    assert sub_res.json["status"] == "SUBMITTED"

    # Listed in Admin Reports with search query
    list_res = client.get(f"/api/v1/admin/reports?search={rep_num}", headers=headers)
    assert list_res.status_code == 200
    assert list_res.json["total_count"] >= 1
    found = next((r for r in list_res.json["reports"] if r["report_number"] == rep_num), None)
    assert found is not None
    assert found["description"] == unique_desc

# ----------------------------------------------------------------------------
# 5. Report State Transitions & Mandatory Reason Validation
# ----------------------------------------------------------------------------
def test_report_state_transitions_and_mandatory_reasons(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    sub_res = client.post("/api/v1/public/reports", json={
        "report_type": "NO_BIN_GARBAGE",
        "description": "Transition validation report"
    })
    report_id = sub_res.json["display_id"]
    # Get database record id
    reports_res = client.get("/api/v1/admin/reports?page=1&per_page=1", headers=headers)
    db_report_id = reports_res.json["reports"][0]["id"]

    # 1. Reject without mandatory reason -> Must fail 400
    fail_reject = client.patch(f"/api/v1/admin/reports/{db_report_id}/transition", headers=headers, json={
        "status": "REJECTED",
        "reason": "" # Empty
    })
    assert fail_reject.status_code == 400
    assert "mandatory reason" in fail_reject.json["message"].lower()

    # 2. Reject with valid reason -> 200 OK
    ok_reject = client.patch(f"/api/v1/admin/reports/{db_report_id}/transition", headers=headers, json={
        "status": "REJECTED",
        "reason": "Not in municipal municipal boundary jurisdiction."
    })
    assert ok_reject.status_code == 200
    assert ok_reject.json["report"]["status"] == "REJECTED"

    # 3. Reopen without reason -> Must fail 400
    fail_reopen = client.patch(f"/api/v1/admin/reports/{db_report_id}/transition", headers=headers, json={
        "status": "REOPENED",
        "reason": ""
    })
    assert fail_reopen.status_code == 400

    # 4. Reopen with reason -> 200 OK (moves to PENDING_REVIEW)
    ok_reopen = client.patch(f"/api/v1/admin/reports/{db_report_id}/transition", headers=headers, json={
        "status": "REOPENED",
        "reason": "Citizen confirmed jurisdiction error was rectified."
    })
    assert ok_reopen.status_code == 200
    assert ok_reopen.json["report"]["status"] == "PENDING_REVIEW"

# ----------------------------------------------------------------------------
# 6. No-Vehicle-Available Queueing vs Successful Assignment
# ----------------------------------------------------------------------------
def test_no_vehicle_available_queue_and_dispatch(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    sub_res = client.post("/api/v1/public/reports", json={
        "report_type": "SCATTERED_WASTE",
        "description": "Waiting queue validation"
    })
    rep_list = client.get("/api/v1/admin/reports?page=1&per_page=1", headers=headers)
    report_id = rep_list.json["reports"][0]["id"]

    # Approve report
    client.patch(f"/api/v1/admin/reports/{report_id}/transition", headers=headers, json={"status": "APPROVED"})

    # Assign with no vehicle available -> Moves to WAITING_FOR_VEHICLE
    queue_res = client.post(f"/api/v1/admin/reports/{report_id}/assign", headers=headers, json={
        "vehicle_id": None,
        "driver_id": None,
        "queue_if_unavailable": True
    })
    assert queue_res.status_code == 200
    assert queue_res.json["report"]["status"] == "WAITING_FOR_VEHICLE"

    # Now dispatch available vehicle and driver
    dispatch_res = client.post(f"/api/v1/admin/reports/{report_id}/assign", headers=headers, json={
        "vehicle_id": "f0000000-0000-0000-0000-000000000001",
        "driver_id": "d0000000-0000-0000-0000-000000000001"
    })
    assert dispatch_res.status_code == 200
    assert dispatch_res.json["report"]["status"] == "ASSIGNED"

# ----------------------------------------------------------------------------
# 7. AI Classification Override
# ----------------------------------------------------------------------------
def test_ai_classification_override(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    rep_list = client.get("/api/v1/admin/reports?page=1&per_page=1", headers=headers)
    report_id = rep_list.json["reports"][0]["id"]

    override_res = client.patch(f"/api/v1/admin/reports/{report_id}/ai-override", headers=headers, json={
        "category": "PLASTIC",
        "priority": "HIGH",
        "notes": "Verified by Admin: High density polyethylene containers"
    })
    assert override_res.status_code == 200
    assert override_res.json["report"]["priority"] == "HIGH"

# ----------------------------------------------------------------------------
# 8. Collection Schedules CRUD & Overdue Detection
# ----------------------------------------------------------------------------
def test_schedules_crud_and_overdue_alert(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # Create recurring schedule
    create_res = client.post("/api/v1/admin/schedules", headers=headers, json={
        "title": "Ward 7 High-Density Morning Route",
        "weekday": 2, # Tuesday
        "shift": "MORNING",
        "start_window": "06:30:00",
        "end_window": "09:30:00",
        "service_duration_minutes": 20
    })
    assert create_res.status_code == 201
    sched_id = create_res.json["id"]

    # List schedules
    list_res = client.get("/api/v1/admin/schedules", headers=headers)
    assert list_res.status_code == 200
    assert any(s["id"] == sched_id for s in list_res.json)

    # Check overdue collections endpoint
    overdue_res = client.get("/api/v1/admin/schedules/overdue", headers=headers)
    assert overdue_res.status_code == 200
    assert isinstance(overdue_res.json, list)

    # Delete / Archive schedule
    del_res = client.delete(f"/api/v1/admin/schedules/{sched_id}", headers=headers)
    assert del_res.status_code == 200
    assert del_res.json["schedule"]["is_active"] is False

# ----------------------------------------------------------------------------
# 9. Citizen Complaints Resolution
# ----------------------------------------------------------------------------
def test_complaints_resolution_workflow(client):
    token = get_admin_token(client)
    headers = {"Authorization": f"Bearer {token}"}

    # List complaints
    list_res = client.get("/api/v1/admin/complaints", headers=headers)
    assert list_res.status_code == 200

    if len(list_res.json) > 0:
        comp_id = list_res.json[0]["id"]
        res = client.patch(f"/api/v1/admin/complaints/{comp_id}/resolve", headers=headers, json={
            "status": "RESOLVED",
            "resolution_note": "Special recovery vehicle dispatched and bin cleared."
        })
        assert res.status_code == 200
        assert res.json["complaint"]["status"] == "RESOLVED"
