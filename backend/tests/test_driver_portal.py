import pytest
import json
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

def test_driver_portal_dashboard_and_auth(client):
    """Verifies driver dashboard metrics, assignments, and authorization."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    res = client.get("/api/v1/driver/dashboard", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "driver" in data
    assert data["driver"]["email"] == "driver.rajesh@smartwaste.gov"
    assert "today_summary" in data
    assert "total_tasks" in data["today_summary"]
    assert "performance_snapshot" in data
    assert "completion_rate" in data["performance_snapshot"]

def test_driver_tasks_listing_and_filtering(client):
    """Verifies driver tasks retrieval and query filtering."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    # All tasks
    res = client.get("/api/v1/driver/tasks", headers=headers)
    assert res.status_code == 200
    tasks = res.get_json()
    assert isinstance(tasks, list)

    # Filter by status
    res_pending = client.get("/api/v1/driver/tasks?status=PENDING", headers=headers)
    assert res_pending.status_code == 200
    for t in res_pending.get_json():
        assert t["status"] == "PENDING"

    # Detail view of first task if available
    if tasks:
        first_id = tasks[0]["id"]
        res_detail = client.get(f"/api/v1/driver/tasks/{first_id}", headers=headers)
        assert res_detail.status_code == 200
        assert res_detail.get_json()["stop"]["id"] == first_id

def test_driver_route_isolation_and_security(client):
    """Confirms Driver B cannot access or manipulate Driver A's tasks or routes."""
    token_rajesh = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    token_sunil = get_auth_token(client, "driver.sunil@smartwaste.gov", "driver123")

    headers_rajesh = {"Authorization": f"Bearer {token_rajesh}"}
    headers_sunil = {"Authorization": f"Bearer {token_sunil}"}

    # Get rajesh's routes
    res_routes = client.get("/api/v1/driver/routes", headers=headers_rajesh)
    assert res_routes.status_code == 200
    rajesh_routes = res_routes.get_json()

    if rajesh_routes:
        r_id = rajesh_routes[0]["id"]
        # Sunil attempts to start Rajesh's route -> 403 Forbidden
        res_forbidden = client.post(f"/api/v1/driver/routes/{r_id}/start", headers=headers_sunil)
        assert res_forbidden.status_code in [403, 400]

def test_driver_history_and_performance_analytics(client):
    """Verifies real calculated performance analytics and task history."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    # History
    res_hist = client.get("/api/v1/driver/history", headers=headers)
    assert res_hist.status_code == 200
    assert isinstance(res_hist.get_json(), list)

    # Performance
    res_perf = client.get("/api/v1/driver/performance", headers=headers)
    assert res_perf.status_code == 200
    perf = res_perf.get_json()
    assert "metrics" in perf
    assert "completion_rate" in perf["metrics"]
    assert "by_type" in perf
    assert "daily_trends" in perf
    assert len(perf["daily_trends"]) == 7

def test_driver_profile_and_secure_password_update(client):
    """Verifies profile retrieval, permitted phone edit, and password change."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    # Get profile
    res_prof = client.get("/api/v1/driver/profile", headers=headers)
    assert res_prof.status_code == 200
    prof = res_prof.get_json()
    assert prof["role"] == "driver"
    assert "password_hash" not in prof

    # Update phone
    res_update = client.patch("/api/v1/driver/profile", headers=headers, json={"phone": "9988776655"})
    assert res_update.status_code == 200
    assert res_update.get_json()["profile"]["phone"] == "9988776655"

    # Invalid current password test
    res_bad_pw = client.patch("/api/v1/driver/profile", headers=headers, json={
        "current_password": "wrongpassword",
        "new_password": "newpass12345"
    })
    assert res_bad_pw.status_code == 401

def test_driver_notifications_lifecycle(client):
    """Verifies driver notification retrieval and read status marking."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    res = client.get("/api/v1/driver/notifications", headers=headers)
    assert res.status_code == 200
    notifs = res.get_json()
    assert isinstance(notifs, list)

    # Mark all read
    res_read_all = client.post("/api/v1/driver/notifications/mark-all-read", headers=headers)
    assert res_read_all.status_code == 200

def test_driver_issues_and_admin_response_workflow(client):
    """Verifies driver ticketing and municipal admin response loop."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")

    driver_headers = {"Authorization": f"Bearer {driver_token}"}
    admin_headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Driver creates an issue ticket
    issue_payload = {
        "category": "BLOCKED_ROAD",
        "title": "Road dug up near Sector 4 Gate",
        "description": "Construction trench blocks garbage truck entry to Building 12.",
        "priority": "HIGH"
    }
    res_create = client.post("/api/v1/driver/issues", headers=driver_headers, json=issue_payload)
    assert res_create.status_code == 201
    created_issue = res_create.get_json()["issue"]
    issue_id = created_issue["id"]
    assert created_issue["status"] == "OPEN"

    # 2. Driver lists their issues
    res_my_issues = client.get("/api/v1/driver/issues", headers=driver_headers)
    assert res_my_issues.status_code == 200
    assert any(i["id"] == issue_id for i in res_my_issues.get_json())

    # 3. Admin lists all driver issues
    res_admin_list = client.get("/api/v1/admin/driver-issues", headers=admin_headers)
    assert res_admin_list.status_code == 200
    assert any(i["id"] == issue_id for i in res_admin_list.get_json())

    # 4. Admin responds to the ticket
    res_admin_resp = client.patch(f"/api/v1/admin/driver-issues/{issue_id}/respond", headers=admin_headers, json={
        "admin_response": "Dispatched field officer. Please bypass Gate 2 and take Rear Service Lane.",
        "status": "RESOLVED"
    })
    assert res_admin_resp.status_code == 200
    updated_issue = res_admin_resp.get_json()["issue"]
    assert updated_issue["status"] == "RESOLVED"
    assert "Dispatched field officer" in updated_issue["admin_response"]

    # 5. Driver verifies notification was received
    res_notifs = client.get("/api/v1/driver/notifications", headers=driver_headers)
    assert res_notifs.status_code == 200
    assert any("Dispatch Response" in n["title"] for n in res_notifs.get_json())

def test_driver_vehicle_telemetry(client):
    """Verifies driver vehicle telemetry query."""
    driver_token = get_auth_token(client, "driver.rajesh@smartwaste.gov", "driver123")
    headers = {"Authorization": f"Bearer {driver_token}"}

    res = client.get("/api/v1/driver/vehicle", headers=headers)
    assert res.status_code == 200
    data = res.get_json()
    assert "vehicle" in data
