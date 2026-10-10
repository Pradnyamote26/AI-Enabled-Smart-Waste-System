import pytest
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

# ----------------------------------------------------------------------
# 1. Test Public Schedules
# ----------------------------------------------------------------------
def test_public_schedules_endpoint(client):
    res = client.get("/api/v1/public/schedules")
    assert res.status_code == 200
    data = res.get_json()
    assert "schedules" in data
    assert "service_areas" in data
    assert "buildings" in data
    schedules = data["schedules"]
    assert len(schedules) > 0

    first_sched = schedules[0]
    assert "service_area_name" in first_sched
    assert "building_name" in first_sched
    assert "day_name" in first_sched
    assert "time_window" in first_sched

    # Test filtering by weekday
    weekday_res = client.get(f"/api/v1/public/schedules?weekday={first_sched['day_of_week']}")
    assert weekday_res.status_code == 200
    w_data = weekday_res.get_json()["schedules"]
    for s in w_data:
        assert s["day_of_week"] == first_sched["day_of_week"]

# ----------------------------------------------------------------------
# 2. Test Public Announcements
# ----------------------------------------------------------------------
def test_public_announcements_endpoint(client):
    res = client.get("/api/v1/public/announcements")
    assert res.status_code == 200
    data = res.get_json()
    assert "announcements" in data
    announcements = data["announcements"]
    assert len(announcements) >= 1
    for ann in announcements:
        assert "title" in ann
        assert "content" in ann
        assert "urgency" in ann
        assert "created_at" in ann

# ----------------------------------------------------------------------
# 3. Test Anonymous Report Submission & Deduplication
# ----------------------------------------------------------------------
def test_anonymous_report_submission_and_deduplication(client):
    payload = {
        "report_type": "OVERFLOWING_BIN",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "address_text": "Bandra West Promenade Near Gate 3",
        "description": "Bin is overflowing with municipal food waste and cartons.",
        "reporter_contact": "+91-9876543210"
    }

    # First submission
    res1 = client.post("/api/v1/public/reports", json=payload)
    assert res1.status_code == 201
    data1 = res1.get_json()
    assert "tracking_token" in data1
    assert "report_number" in data1
    token1 = data1["tracking_token"]
    assert len(token1) >= 16

    # Rapid repeated submission (anti-double-click guard within 5 seconds)
    res2 = client.post("/api/v1/public/reports", json=payload)
    assert res2.status_code == 201
    data2 = res2.get_json()
    assert data2.get("is_duplicate_prevented") is True
    assert data2["tracking_token"] == token1
    assert data2["report_number"] == data1["report_number"]

# ----------------------------------------------------------------------
# 4. Test Public Tracking Endpoint & Privacy Protection
# ----------------------------------------------------------------------
def test_public_tracking_privacy_and_timeline(client):
    # Submit report
    payload = {
        "report_type": "SCATTERED_WASTE",
        "latitude": 19.1136,
        "longitude": 72.8697,
        "address_text": "Andheri East Station Road",
        "description": "Construction debris and plastic bags scattered on walkway."
    }
    sub_res = client.post("/api/v1/public/reports", json=payload)
    assert sub_res.status_code == 201
    token = sub_res.get_json()["tracking_token"]

    # Query public tracking
    track_res = client.get(f"/api/v1/public/track/{token}")
    assert track_res.status_code == 200
    track_data = track_res.get_json()

    assert track_data["report_number"] == sub_res.get_json()["report_number"]
    assert track_data["status"] == "SUBMITTED"
    assert "status_timeline" in track_data
    assert len(track_data["status_timeline"]) >= 1

    # Privacy verification: no internal sensitive driver info or credentials leaked
    assert "driver_phone" not in track_data
    assert "driver_email" not in track_data
    assert "password_hash" not in track_data
    assert "assigned_driver_id" not in track_data

    # Invalid token check
    invalid_res = client.get("/api/v1/public/track/non-existent-random-token-xyz")
    assert invalid_res.status_code == 404

# ----------------------------------------------------------------------
# 5. Test Authenticated Resident Submission & Notifications
# ----------------------------------------------------------------------
def test_authenticated_resident_reports_and_notifications(client):
    # Priya is the resident/reporter in seed data
    priya_token = get_auth_token(client, "priya.sharma@example.com", "reporter123")
    priya_headers = {"Authorization": f"Bearer {priya_token}"}

    # Submit report as logged-in resident
    auth_payload = {
        "report_type": "MISSED_COLLECTION",
        "latitude": 19.0550,
        "longitude": 72.8300,
        "address_text": "Shivaji Park Seaface Lane 4",
        "description": "Morning scheduled bin truck missed society building."
    }
    sub_res = client.post("/api/v1/public/reports", json=auth_payload, headers=priya_headers)
    assert sub_res.status_code == 201
    token = sub_res.get_json()["tracking_token"]

    # Priya checks her My Reports endpoint
    my_reports_res = client.get("/api/v1/public/my-reports", headers=priya_headers)
    assert my_reports_res.status_code == 200
    my_reports = my_reports_res.get_json()
    assert any(r.get("tracking_token_display") == token for r in my_reports)

    # Priya checks citizen notifications inbox
    notifs_res = client.get("/api/v1/citizen/notifications", headers=priya_headers)
    assert notifs_res.status_code == 200
    notifs_data = notifs_res.get_json()
    assert "notifications" in notifs_data
    assert len(notifs_data["notifications"]) >= 1
    first_notif = notifs_data["notifications"][0]
    assert "title" in first_notif
    assert "message" in first_notif

    # Priya marks notification as read
    notif_id = first_notif["id"]
    read_res = client.patch(f"/api/v1/citizen/notifications/{notif_id}/read", headers=priya_headers)
    assert read_res.status_code == 200

    # Priya marks all notifications as read
    mark_all_res = client.post("/api/v1/citizen/notifications/mark-all-read", headers=priya_headers)
    assert mark_all_res.status_code == 200
    assert mark_all_res.get_json().get("success") is True

# ----------------------------------------------------------------------
# 6. Test Unresolved Issue Reopen Workflow
# ----------------------------------------------------------------------
def test_unresolved_issue_reopen_workflow(client):
    # Submit report
    payload = {
        "report_type": "ILLEGAL_DUMPING",
        "latitude": 19.0800,
        "longitude": 72.8900,
        "address_text": "Ghatkopar Industrial Zone Backroad",
        "description": "Commercial waste dumped near storm drain."
    }
    sub_res = client.post("/api/v1/public/reports", json=payload)
    assert sub_res.status_code == 201
    token = sub_res.get_json()["tracking_token"]

    # Reopen with reason
    reopen_payload = {
        "reason": "Vehicle collected small bags but left behind industrial chemical containers.",
        "image": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    }
    reopen_res = client.post(f"/api/v1/public/reports/{token}/reopen", json=reopen_payload)
    assert reopen_res.status_code == 200
    reopen_data = reopen_res.get_json()
    assert reopen_data.get("status") == "REOPENED"
    assert "followup" in reopen_data

    # Re-fetch public tracking to verify REOPENED in timeline
    track_res = client.get(f"/api/v1/public/track/{token}")
    assert track_res.status_code == 200
    t_data = track_res.get_json()
    assert t_data["status"] == "REOPENED"
    assert len(t_data.get("followups", [])) >= 1
    assert t_data["followups"][0]["reason"] == reopen_payload["reason"]
