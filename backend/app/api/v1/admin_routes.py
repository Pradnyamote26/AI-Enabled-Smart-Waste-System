import hashlib
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.api.v1.auth_routes import token_required
from app.repositories.data_store import DataStore
from app.services.qr_service import QRService
from app.services.security_service import SecurityService
from app.services.notification_service import NotificationService
from app.config import Config

admin_bp = Blueprint("admin_bp", __name__)

# ============================================================================
# 1. ANALYTICS & DASHBOARD OVERVIEW
# ============================================================================
@admin_bp.route("/analytics/overview", methods=["GET"])
@token_required(roles=["admin"])
def get_analytics_overview():
    store = DataStore.get_instance()
    
    reports = store.list("waste_reports")
    routes = store.list("collection_routes")
    stops = store.list("route_stops")
    vehicles = store.list("vehicles")
    drivers = store.list("profiles", lambda p: p.get("role") == "driver")
    proofs = store.list("collection_proofs")
    complaints = store.list("missed_collection_complaints")
    dustbins = store.list("dustbins")
    buildings = store.list("buildings")
    schedules = store.list("collection_schedules")
    audit_logs = store.list("audit_logs")

    open_reports = len([r for r in reports if r.get("status") not in ["RESOLVED", "REJECTED", "DUPLICATE", "CANCELLED"]])
    pending_review = len([r for r in reports if r.get("status") in ["SUBMITTED", "PENDING_REVIEW"]])
    waiting_vehicles = len([r for r in reports if r.get("status") == "WAITING_FOR_VEHICLE"])
    pending_proofs = len([p for p in proofs if p.get("review_status") in ["SUBMITTED", "NEEDS_REVIEW", "AI_CHECKED"]])
    active_routes = len([r for r in routes if r.get("status") in ["IN_PROGRESS", "PUBLISHED"]])
    available_vehicles = len([v for v in vehicles if v.get("status") == "AVAILABLE" and v.get("is_active", True)])
    vehicles_in_maintenance = len([v for v in vehicles if v.get("status") in ["MAINTENANCE", "INACTIVE"] or v.get("maintenance_status") == "NEEDS_SERVICE"])
    overdue_stops = len([s for s in stops if s.get("status") == "ISSUE_REPORTED" or (s.get("status") == "PENDING" and s.get("scheduled_window") == "OVERDUE")])
    unresolved_complaints = len([c for c in complaints if c.get("status") in ["OPEN", "UNDER_REVIEW"]])

    # Recent Audit Activity (top 8)
    audit_sorted = sorted(audit_logs, key=lambda a: a.get("created_at", ""), reverse=True)
    recent_activity = audit_sorted[:8]

    # Urgent Operational Alerts
    urgent_alerts = []
    if waiting_vehicles > 0:
        urgent_alerts.append({
            "type": "WAITING_VEHICLE",
            "level": "WARNING",
            "message": f"{waiting_vehicles} report(s) are awaiting vehicle dispatch.",
            "target_tab": "reports",
            "filter": "WAITING_FOR_VEHICLE"
        })
    if pending_proofs > 0:
        urgent_alerts.append({
            "type": "PENDING_PROOFS",
            "level": "INFO",
            "message": f"{pending_proofs} collection proof photo(s) require review.",
            "target_tab": "proofs",
            "filter": "NEEDS_REVIEW"
        })
    if overdue_stops > 0:
        urgent_alerts.append({
            "type": "OVERDUE_STOPS",
            "level": "DANGER",
            "message": f"{overdue_stops} scheduled collection stop(s) flagged overdue or with exceptions.",
            "target_tab": "routes",
            "filter": "OVERDUE"
        })
    if unresolved_complaints > 0:
        urgent_alerts.append({
            "type": "OPEN_COMPLAINTS",
            "level": "WARNING",
            "message": f"{unresolved_complaints} missed-collection citizen complaint(s) require resolution.",
            "target_tab": "complaints",
            "filter": "OPEN"
        })

    return jsonify({
        "open_reports_count": open_reports,
        "pending_review_count": pending_review,
        "waiting_vehicle_count": waiting_vehicles,
        "pending_proof_reviews_count": pending_proofs,
        "active_routes_count": active_routes,
        "available_vehicles_count": available_vehicles,
        "vehicles_in_maintenance_count": vehicles_in_maintenance,
        "overdue_stops_count": overdue_stops,
        "unresolved_complaints_count": unresolved_complaints,
        "total_vehicles": len(vehicles),
        "total_drivers": len(drivers),
        "total_dustbins": len(dustbins),
        "total_buildings": len(buildings),
        "total_schedules": len(schedules),
        "urgent_alerts": urgent_alerts,
        "recent_activity": recent_activity
    })


# ============================================================================
# 2. DRIVER MANAGEMENT (CRUD & ASSIGNMENTS)
# ============================================================================
@admin_bp.route("/drivers", methods=["GET"])
@token_required(roles=["admin"])
def list_drivers():
    store = DataStore.get_instance()
    drivers = store.list("profiles", lambda p: p.get("role") == "driver")
    vehicles = store.list("vehicles")
    routes = store.list("collection_routes")

    # Enrich driver with assigned vehicle and active route status
    for d in drivers:
        d.pop("password_hash", None)
        assigned_v = next((v for v in vehicles if v.get("assigned_driver_id") == d["id"]), None)
        d["assigned_vehicle"] = {
            "id": assigned_v["id"],
            "vehicle_number": assigned_v["vehicle_number"],
            "vehicle_type": assigned_v["vehicle_type"]
        } if assigned_v else None

        active_r = next((r for r in routes if r.get("driver_id") == d["id"] and r.get("status") in ["PUBLISHED", "IN_PROGRESS"]), None)
        d["active_route"] = {
            "id": active_r["id"],
            "route_name": active_r.get("route_name"),
            "status": active_r.get("status"),
            "route_date": active_r.get("route_date")
        } if active_r else None

    return jsonify(drivers)

@admin_bp.route("/drivers/<driver_id>", methods=["GET"])
@token_required(roles=["admin"])
def get_driver(driver_id):
    store = DataStore.get_instance()
    driver = store.get("profiles", driver_id)
    if not driver or driver.get("role") != "driver":
        return jsonify({"error": "NOT_FOUND", "message": "Driver not found."}), 404

    driver_copy = dict(driver)
    driver_copy.pop("password_hash", None)

    # Collection & route history
    routes = store.list("collection_routes", lambda r: r.get("driver_id") == driver_id)
    routes.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    driver_copy["route_history"] = routes[:10]

    return jsonify(driver_copy)

@admin_bp.route("/drivers", methods=["POST"])
@token_required(roles=["admin"])
def create_driver():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    full_name = data.get("full_name", "").strip()
    phone = data.get("phone", "").strip()
    password = data.get("password", "driver123")
    license_number = data.get("license_number", "").strip()

    if not email or not full_name:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Email and Full Name are required."}), 400

    store = DataStore.get_instance()
    if store.list("profiles", lambda p: p.get("email", "").lower() == email):
        return jsonify({"error": "ALREADY_EXISTS", "message": f"An account with email '{email}' already exists."}), 409

    driver_record = {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "license_number": license_number,
        "role": "driver",
        "is_active": True,
        "password_hash": SecurityService.hash_password(password),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("profiles", driver_record)
    created.pop("password_hash", None)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "CREATE_DRIVER",
        "entity_type": "profiles",
        "entity_id": created["id"],
        "safe_metadata": {"email": email, "full_name": full_name, "phone": phone}
    })

    return jsonify(created), 201

@admin_bp.route("/drivers/<driver_id>", methods=["PATCH"])
@token_required(roles=["admin"])
def update_driver(driver_id):
    store = DataStore.get_instance()
    driver = store.get("profiles", driver_id)
    if not driver or driver.get("role") != "driver":
        return jsonify({"error": "NOT_FOUND", "message": "Driver not found."}), 404

    data = request.get_json() or {}
    updates = {}
    if "full_name" in data and data["full_name"].strip():
        updates["full_name"] = data["full_name"].strip()
    if "phone" in data:
        updates["phone"] = data["phone"].strip()
    if "license_number" in data:
        updates["license_number"] = data["license_number"].strip()
    if "is_active" in data:
        updates["is_active"] = bool(data["is_active"])
    if "password" in data and len(data["password"].strip()) >= 6:
        updates["password_hash"] = SecurityService.hash_password(data["password"].strip())

    updated = store.update("profiles", driver_id, updates)
    updated.pop("password_hash", None)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "UPDATE_DRIVER",
        "entity_type": "profiles",
        "entity_id": driver_id,
        "safe_metadata": {k: v for k, v in updates.items() if k != "password_hash"}
    })

    return jsonify(updated)

@admin_bp.route("/drivers/<driver_id>", methods=["DELETE"])
@token_required(roles=["admin"])
def archive_driver(driver_id):
    store = DataStore.get_instance()
    driver = store.get("profiles", driver_id)
    if not driver or driver.get("role") != "driver":
        return jsonify({"error": "NOT_FOUND", "message": "Driver not found."}), 404

    # Conflict check: Driver assigned to active route?
    active_routes = store.list("collection_routes", lambda r: (
        r.get("driver_id") == driver_id and r.get("status") in ["PUBLISHED", "IN_PROGRESS"]
    ))
    if active_routes:
        return jsonify({
            "error": "ACTIVE_ASSIGNMENT_CONFLICT",
            "message": f"Cannot archive driver. Assigned to active route '{active_routes[0].get('route_name')}'."
        }), 409

    # Unassign from any vehicles
    assigned_vehicles = store.list("vehicles", lambda v: v.get("assigned_driver_id") == driver_id)
    for v in assigned_vehicles:
        store.update("vehicles", v["id"], {"assigned_driver_id": None})

    # Soft archive
    updated = store.update("profiles", driver_id, {"is_active": False})
    updated.pop("password_hash", None)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "ARCHIVE_DRIVER",
        "entity_type": "profiles",
        "entity_id": driver_id,
        "safe_metadata": {"full_name": driver.get("full_name")}
    })

    return jsonify({"message": f"Driver '{driver.get('full_name')}' archived successfully.", "driver": updated})


# ============================================================================
# 3. VEHICLE MANAGEMENT (CRUD, STATUS & ASSIGNMENTS)
# ============================================================================
@admin_bp.route("/vehicles", methods=["GET"])
@token_required(roles=["admin"])
def list_vehicles():
    store = DataStore.get_instance()
    vehicles = store.list("vehicles")
    drivers = {d["id"]: d for d in store.list("profiles", lambda p: p.get("role") == "driver")}
    routes = store.list("collection_routes")

    for v in vehicles:
        driver = drivers.get(v.get("assigned_driver_id"))
        v["driver_name"] = driver.get("full_name") if driver else None
        v["driver_phone"] = driver.get("phone") if driver else None

        active_r = next((r for r in routes if r.get("vehicle_id") == v["id"] and r.get("status") in ["PUBLISHED", "IN_PROGRESS"]), None)
        v["active_route"] = {
            "id": active_r["id"],
            "route_name": active_r.get("route_name"),
            "shift": active_r.get("shift"),
            "status": active_r.get("status")
        } if active_r else None

    return jsonify(vehicles)

@admin_bp.route("/vehicles/<veh_id>", methods=["GET"])
@token_required(roles=["admin"])
def get_vehicle(veh_id):
    store = DataStore.get_instance()
    vehicle = store.get("vehicles", veh_id)
    if not vehicle:
        return jsonify({"error": "NOT_FOUND", "message": "Vehicle not found."}), 404

    driver = store.get("profiles", vehicle.get("assigned_driver_id")) if vehicle.get("assigned_driver_id") else None
    if driver:
        driver.pop("password_hash", None)
    
    routes = store.list("collection_routes", lambda r: r.get("vehicle_id") == veh_id)
    routes.sort(key=lambda r: r.get("created_at", ""), reverse=True)

    return jsonify({
        **vehicle,
        "driver": driver,
        "route_history": routes[:10]
    })

@admin_bp.route("/vehicles", methods=["POST"])
@token_required(roles=["admin"])
def create_vehicle():
    data = request.get_json() or {}
    veh_number = data.get("vehicle_number", "").strip().upper()
    veh_type = data.get("vehicle_type", "COMPACTOR_TRUCK")
    capacity = float(data.get("capacity_kg", 2500.0))
    assigned_driver_id = data.get("assigned_driver_id") or None
    status = data.get("status", "AVAILABLE")

    if not veh_number:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Vehicle registration number is required."}), 400

    store = DataStore.get_instance()
    if store.list("vehicles", lambda v: v.get("vehicle_number") == veh_number):
        return jsonify({"error": "ALREADY_EXISTS", "message": f"Vehicle number '{veh_number}' is already registered."}), 409

    record = {
        "vehicle_number": veh_number,
        "vehicle_type": veh_type,
        "capacity_kg": capacity,
        "status": status,
        "assigned_driver_id": assigned_driver_id,
        "maintenance_status": data.get("maintenance_status", "NORMAL"),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("vehicles", record)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "CREATE_VEHICLE",
        "entity_type": "vehicles",
        "entity_id": created["id"],
        "safe_metadata": {"vehicle_number": veh_number, "capacity_kg": capacity}
    })

    return jsonify(created), 201

@admin_bp.route("/vehicles/<veh_id>", methods=["PATCH"])
@token_required(roles=["admin"])
def update_vehicle(veh_id):
    store = DataStore.get_instance()
    vehicle = store.get("vehicles", veh_id)
    if not vehicle:
        return jsonify({"error": "NOT_FOUND", "message": "Vehicle not found."}), 404

    data = request.get_json() or {}
    allowed_keys = ["vehicle_number", "vehicle_type", "capacity_kg", "status", "assigned_driver_id", "maintenance_status", "is_active"]
    updates = {}
    for k in allowed_keys:
        if k in data:
            if k == "vehicle_number":
                updates[k] = data[k].strip().upper()
            elif k == "capacity_kg":
                updates[k] = float(data[k])
            elif k == "assigned_driver_id":
                updates[k] = data[k] if data[k] else None
            else:
                updates[k] = data[k]

    # Validate active route conflict if setting vehicle inactive or maintenance
    if updates.get("status") in ["MAINTENANCE", "INACTIVE"] or updates.get("is_active") is False:
        active_routes = store.list("collection_routes", lambda r: (
            r.get("vehicle_id") == veh_id and r.get("status") in ["PUBLISHED", "IN_PROGRESS"]
        ))
        if active_routes:
            return jsonify({
                "error": "ACTIVE_ASSIGNMENT_CONFLICT",
                "message": f"Cannot change status. Vehicle is assigned to active route '{active_routes[0].get('route_name')}'."
            }), 409

    updated = store.update("vehicles", veh_id, updates)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "UPDATE_VEHICLE",
        "entity_type": "vehicles",
        "entity_id": veh_id,
        "safe_metadata": updates
    })

    return jsonify(updated)

@admin_bp.route("/vehicles/<veh_id>/unassign", methods=["POST"])
@token_required(roles=["admin"])
def unassign_vehicle_driver(veh_id):
    store = DataStore.get_instance()
    vehicle = store.get("vehicles", veh_id)
    if not vehicle:
        return jsonify({"error": "NOT_FOUND", "message": "Vehicle not found."}), 404

    updated = store.update("vehicles", veh_id, {"assigned_driver_id": None})
    return jsonify({"message": "Driver unassigned from vehicle.", "vehicle": updated})

@admin_bp.route("/vehicles/<veh_id>", methods=["DELETE"])
@token_required(roles=["admin"])
def archive_vehicle(veh_id):
    store = DataStore.get_instance()
    vehicle = store.get("vehicles", veh_id)
    if not vehicle:
        return jsonify({"error": "NOT_FOUND", "message": "Vehicle not found."}), 404

    active_routes = store.list("collection_routes", lambda r: (
        r.get("vehicle_id") == veh_id and r.get("status") in ["PUBLISHED", "IN_PROGRESS"]
    ))
    if active_routes:
        return jsonify({
            "error": "ACTIVE_ASSIGNMENT_CONFLICT",
            "message": f"Cannot archive vehicle. It is currently deployed on route '{active_routes[0].get('route_name')}'."
        }), 409

    updated = store.update("vehicles", veh_id, {"is_active": False, "status": "INACTIVE", "assigned_driver_id": None})

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "ARCHIVE_VEHICLE",
        "entity_type": "vehicles",
        "entity_id": veh_id,
        "safe_metadata": {"vehicle_number": vehicle.get("vehicle_number")}
    })

    return jsonify({"message": f"Vehicle '{vehicle.get('vehicle_number')}' archived.", "vehicle": updated})


# ============================================================================
# 4. BUILDING MANAGEMENT (CRUD)
# ============================================================================
@admin_bp.route("/buildings", methods=["GET"])
@token_required(roles=["admin"])
def list_buildings():
    store = DataStore.get_instance()
    buildings = store.list("buildings")
    dustbins = store.list("dustbins")
    areas = {a["id"]: a["name"] for a in store.list("service_areas")}

    for b in buildings:
        b["dustbins_count"] = len([d for d in dustbins if d.get("building_id") == b["id"]])
        b["service_area_name"] = areas.get(b.get("service_area_id"), "Default Zone")

    return jsonify(buildings)

@admin_bp.route("/buildings/<id>", methods=["GET"])
@token_required(roles=["admin"])
def get_building(id):
    store = DataStore.get_instance()
    building = store.get("buildings", id)
    if not building:
        return jsonify({"error": "NOT_FOUND", "message": "Building not found."}), 404

    dustbins = store.list("dustbins", lambda d: d.get("building_id") == id)
    reports = store.list("waste_reports", lambda r: r.get("building_id") == id)
    return jsonify({**building, "dustbins": dustbins, "recent_reports": reports[:10]})

@admin_bp.route("/buildings", methods=["POST"])
@token_required(roles=["admin"])
def create_building():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    address = data.get("address", "").strip()
    lat = float(data.get("latitude", 19.0770))
    lon = float(data.get("longitude", 72.9989))

    if not name or not address:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Building name and address are required."}), 400

    store = DataStore.get_instance()
    record = {
        "name": name,
        "address": address,
        "latitude": lat,
        "longitude": lon,
        "service_area_id": data.get("service_area_id"),
        "collection_frequency": data.get("collection_frequency", "DAILY_MORNING"),
        "collection_window": data.get("collection_window", "07:00 - 08:00"),
        "contact_person": data.get("contact_person", ""),
        "contact_phone": data.get("contact_phone", ""),
        "collection_point_notes": data.get("collection_point_notes", ""),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("buildings", record)
    return jsonify(created), 201

@admin_bp.route("/buildings/<id>", methods=["PATCH"])
@token_required(roles=["admin"])
def update_building(id):
    store = DataStore.get_instance()
    building = store.get("buildings", id)
    if not building:
        return jsonify({"error": "NOT_FOUND", "message": "Building not found."}), 404

    data = request.get_json() or {}
    allowed_keys = ["name", "address", "latitude", "longitude", "service_area_id", "collection_frequency", "collection_window", "contact_person", "contact_phone", "collection_point_notes", "is_active"]
    updates = {k: data[k] for k in allowed_keys if k in data}

    if "latitude" in updates: updates["latitude"] = float(updates["latitude"])
    if "longitude" in updates: updates["longitude"] = float(updates["longitude"])

    updated = store.update("buildings", id, updates)
    return jsonify(updated)

@admin_bp.route("/buildings/<id>", methods=["DELETE"])
@token_required(roles=["admin"])
def archive_building(id):
    store = DataStore.get_instance()
    building = store.get("buildings", id)
    if not building:
        return jsonify({"error": "NOT_FOUND", "message": "Building not found."}), 404

    updated = store.update("buildings", id, {"is_active": False})
    return jsonify({"message": f"Building '{building.get('name')}' archived.", "building": updated})


# ============================================================================
# 5. DUSTBIN MANAGEMENT (CRUD & QR CODES)
# ============================================================================
@admin_bp.route("/dustbins", methods=["GET"])
@token_required(roles=["admin"])
def list_dustbins():
    store = DataStore.get_instance()
    bins = store.list("dustbins")
    buildings = {b["id"]: b["name"] for b in store.list("buildings")}
    areas = {a["id"]: a["name"] for a in store.list("service_areas")}

    for b in bins:
        b["building_name"] = buildings.get(b.get("building_id"), "Standalone Location")
        b["service_area_name"] = areas.get(b.get("service_area_id"), "Ward Zone")

    return jsonify(bins)

@admin_bp.route("/dustbins/<bin_id>", methods=["GET"])
@token_required(roles=["admin"])
def get_dustbin(bin_id):
    store = DataStore.get_instance()
    bin_record = store.get("dustbins", bin_id)
    if not bin_record:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    building = store.get("buildings", bin_record.get("building_id")) if bin_record.get("building_id") else None
    qr_data = QRService.generate_bin_qr(
        bin_code=bin_record["bin_code"],
        qr_token=bin_record["qr_public_token"],
        base_url=Config.PUBLIC_WEB_BASE_URL
    )
    return jsonify({**bin_record, "building": building, "qr_data": qr_data})

@admin_bp.route("/dustbins", methods=["POST"])
@token_required(roles=["admin"])
def create_dustbin():
    data = request.get_json() or {}
    bin_code = data.get("bin_code", "").strip().upper()
    bin_type = data.get("bin_type", "GENERAL_MIXED")
    lat = float(data.get("latitude", 19.0772))
    lon = float(data.get("longitude", 72.9991))

    if not bin_code:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Bin code is required."}), 400

    store = DataStore.get_instance()
    if store.list("dustbins", lambda b: b.get("bin_code") == bin_code):
        return jsonify({"error": "ALREADY_EXISTS", "message": f"Bin code '{bin_code}' is already registered."}), 409

    qr_token = f"qr-{uuid.uuid4().hex[:12]}"
    record = {
        "bin_code": bin_code,
        "bin_type": bin_type,
        "latitude": lat,
        "longitude": lon,
        "service_area_id": data.get("service_area_id"),
        "building_id": data.get("building_id") or None,
        "qr_public_token": qr_token,
        "qr_active": True,
        "capacity_liters": int(data.get("capacity_liters", 240)),
        "fill_level_percentage": int(data.get("fill_level_percentage", 0)),
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("dustbins", record)
    return jsonify(created), 201

@admin_bp.route("/dustbins/<bin_id>", methods=["PATCH"])
@token_required(roles=["admin"])
def update_dustbin(bin_id):
    store = DataStore.get_instance()
    bin_record = store.get("dustbins", bin_id)
    if not bin_record:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    data = request.get_json() or {}
    allowed_keys = ["bin_code", "bin_type", "latitude", "longitude", "service_area_id", "building_id", "capacity_liters", "fill_level_percentage", "is_active", "qr_active"]
    updates = {}
    for k in allowed_keys:
        if k in data:
            if k == "bin_code": updates[k] = data[k].strip().upper()
            elif k in ["latitude", "longitude"]: updates[k] = float(data[k])
            elif k in ["capacity_liters", "fill_level_percentage"]: updates[k] = int(data[k])
            else: updates[k] = data[k]

    updated = store.update("dustbins", bin_id, updates)
    return jsonify(updated)

@admin_bp.route("/dustbins/<bin_id>", methods=["DELETE"])
@token_required(roles=["admin"])
def archive_dustbin(bin_id):
    store = DataStore.get_instance()
    bin_record = store.get("dustbins", bin_id)
    if not bin_record:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    updated = store.update("dustbins", bin_id, {"is_active": False, "qr_active": False})
    return jsonify({"message": f"Dustbin '{bin_record.get('bin_code')}' archived.", "dustbin": updated})

@admin_bp.route("/dustbins/<bin_id>/qr", methods=["GET"])
@token_required(roles=["admin"])
def get_dustbin_qr(bin_id):
    store = DataStore.get_instance()
    dustbin = store.get("dustbins", bin_id)
    if not dustbin:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    qr_data = QRService.generate_bin_qr(
        bin_code=dustbin["bin_code"],
        qr_token=dustbin["qr_public_token"],
        base_url=Config.PUBLIC_WEB_BASE_URL
    )
    return jsonify({**qr_data, "qr_active": dustbin.get("qr_active", True), "bin_id": dustbin["id"]})

@admin_bp.route("/dustbins/<bin_id>/qr/regenerate", methods=["POST"])
@token_required(roles=["admin"])
def regenerate_dustbin_qr(bin_id):
    store = DataStore.get_instance()
    dustbin = store.get("dustbins", bin_id)
    if not dustbin:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    old_token = dustbin.get("qr_public_token")
    new_token = f"qr-{uuid.uuid4().hex[:12]}"
    store.update("dustbins", bin_id, {
        "qr_public_token": new_token,
        "qr_active": True,
        "qr_last_regenerated_at": datetime.now(timezone.utc).isoformat()
    })

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "REGENERATE_DUSTBIN_QR",
        "entity_type": "dustbins",
        "entity_id": bin_id,
        "safe_metadata": {"bin_code": dustbin["bin_code"], "old_token": old_token, "new_token": new_token}
    })

    qr_data = QRService.generate_bin_qr(
        bin_code=dustbin["bin_code"],
        qr_token=new_token,
        base_url=Config.PUBLIC_WEB_BASE_URL
    )
    return jsonify({
        "message": f"QR Code regenerated for bin {dustbin['bin_code']}. Previous token invalidated.",
        "qr_data": qr_data,
        "dustbin": store.get("dustbins", bin_id)
    })

@admin_bp.route("/dustbins/<bin_id>/qr/toggle", methods=["POST"])
@token_required(roles=["admin"])
def toggle_dustbin_qr(bin_id):
    store = DataStore.get_instance()
    dustbin = store.get("dustbins", bin_id)
    if not dustbin:
        return jsonify({"error": "NOT_FOUND", "message": "Dustbin not found."}), 404

    current_state = dustbin.get("qr_active", True)
    updated = store.update("dustbins", bin_id, {"qr_active": not current_state})
    return jsonify({"message": f"QR active status set to {not current_state}.", "dustbin": updated})

# Aggregated QR codes list for QR Management Studio
@admin_bp.route("/qr-codes", methods=["GET"])
@token_required(roles=["admin"])
def list_all_qr_codes():
    store = DataStore.get_instance()
    dustbins = store.list("dustbins")
    buildings = {b["id"]: b["name"] for b in store.list("buildings")}
    
    qr_list = []
    for b in dustbins:
        qr_data = QRService.generate_bin_qr(
            bin_code=b["bin_code"],
            qr_token=b["qr_public_token"],
            base_url=Config.PUBLIC_WEB_BASE_URL
        )
        qr_list.append({
            "bin_id": b["id"],
            "bin_code": b["bin_code"],
            "bin_type": b["bin_type"],
            "building_name": buildings.get(b.get("building_id"), "Public Standalone"),
            "qr_public_token": b["qr_public_token"],
            "qr_active": b.get("qr_active", True),
            "target_url": qr_data["target_url"],
            "data_uri": qr_data["data_uri"],
            "created_at": b.get("created_at"),
            "latitude": b.get("latitude"),
            "longitude": b.get("longitude")
        })
    return jsonify(qr_list)


# ============================================================================
# 6. COLLECTION SCHEDULES & OVERDUE WORKFLOW
# ============================================================================
@admin_bp.route("/schedules", methods=["GET"])
@token_required(roles=["admin"])
def list_schedules():
    store = DataStore.get_instance()
    schedules = store.list("collection_schedules")
    areas = {a["id"]: a["name"] for a in store.list("service_areas")}
    vehicles = {v["id"]: v["vehicle_number"] for v in store.list("vehicles")}
    drivers = {d["id"]: d["full_name"] for d in store.list("profiles", lambda p: p.get("role") == "driver")}

    for s in schedules:
        s["service_area_name"] = areas.get(s.get("service_area_id"), "Ward Area")
        s["vehicle_number"] = vehicles.get(s.get("vehicle_id"))
        s["driver_name"] = drivers.get(s.get("driver_id"))

    schedules.sort(key=lambda s: (s.get("weekday", 0), s.get("start_window", "")))
    return jsonify(schedules)

@admin_bp.route("/schedules", methods=["POST"])
@token_required(roles=["admin"])
def create_schedule():
    data = request.get_json() or {}
    title = data.get("title", "").strip()
    stop_type = data.get("stop_type", "BUILDING")
    weekday = int(data.get("weekday", 1)) # 0=Sun, 1=Mon...
    shift = data.get("shift", "MORNING")

    if not title:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Schedule title is required."}), 400

    store = DataStore.get_instance()
    record = {
        "title": title,
        "stop_type": stop_type,
        "service_area_id": data.get("service_area_id"),
        "building_id": data.get("building_id"),
        "dustbin_id": data.get("dustbin_id"),
        "weekday": weekday,
        "shift": shift,
        "start_window": data.get("start_window", "06:30:00"),
        "end_window": data.get("end_window", "10:30:00"),
        "service_duration_minutes": int(data.get("service_duration_minutes", 15)),
        "vehicle_id": data.get("vehicle_id") or None,
        "driver_id": data.get("driver_id") or None,
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("collection_schedules", record)
    return jsonify(created), 201

@admin_bp.route("/schedules/<id>", methods=["PATCH"])
@token_required(roles=["admin"])
def update_schedule(id):
    store = DataStore.get_instance()
    schedule = store.get("collection_schedules", id)
    if not schedule:
        return jsonify({"error": "NOT_FOUND", "message": "Schedule not found."}), 404

    data = request.get_json() or {}
    allowed_keys = ["title", "stop_type", "service_area_id", "building_id", "dustbin_id", "weekday", "shift", "start_window", "end_window", "service_duration_minutes", "vehicle_id", "driver_id", "is_active"]
    updates = {k: data[k] for k in allowed_keys if k in data}
    updated = store.update("collection_schedules", id, updates)
    return jsonify(updated)

@admin_bp.route("/schedules/<id>", methods=["DELETE"])
@token_required(roles=["admin"])
def archive_schedule(id):
    store = DataStore.get_instance()
    schedule = store.get("collection_schedules", id)
    if not schedule:
        return jsonify({"error": "NOT_FOUND", "message": "Schedule not found."}), 404

    updated = store.update("collection_schedules", id, {"is_active": False})
    return jsonify({"message": f"Schedule '{schedule.get('title')}' archived.", "schedule": updated})

@admin_bp.route("/schedules/overdue", methods=["GET"])
@token_required(roles=["admin"])
def get_overdue_collections():
    store = DataStore.get_instance()
    stops = store.list("route_stops")
    routes = {r["id"]: r for r in store.list("collection_routes")}
    vehicles = {v["id"]: v["vehicle_number"] for v in store.list("vehicles")}
    drivers = {d["id"]: d["full_name"] for d in store.list("profiles")}

    overdue_items = []
    for s in stops:
        if s.get("status") in ["ISSUE_REPORTED"] or (s.get("status") == "PENDING" and s.get("scheduled_window") == "OVERDUE"):
            route = routes.get(s.get("route_id"), {})
            overdue_items.append({
                "stop_id": s["id"],
                "route_id": s.get("route_id"),
                "route_name": route.get("route_name", "Unknown Route"),
                "route_date": route.get("route_date"),
                "stop_type": s.get("stop_type"),
                "target_name": s.get("target_name", "Collection Location"),
                "status": s.get("status"),
                "exception_reason": s.get("exception_reason"),
                "vehicle_number": vehicles.get(route.get("vehicle_id")),
                "driver_name": drivers.get(route.get("driver_id"))
            })
    return jsonify(overdue_items)


# ============================================================================
# 7. CITIZEN COMPLAINTS MANAGEMENT
# ============================================================================
@admin_bp.route("/complaints", methods=["GET"])
@token_required(roles=["admin"])
def list_complaints():
    store = DataStore.get_instance()
    complaints = store.list("missed_collection_complaints")
    buildings = {b["id"]: b["name"] for b in store.list("buildings")}
    dustbins = {d["id"]: d["bin_code"] for d in store.list("dustbins")}

    for c in complaints:
        c["building_name"] = buildings.get(c.get("building_id"), "Unlinked Building")
        c["dustbin_code"] = dustbins.get(c.get("dustbin_id"), "General Area")

    complaints.sort(key=lambda c: c.get("created_at", ""), reverse=True)
    return jsonify(complaints)

@admin_bp.route("/complaints/<id>/resolve", methods=["PATCH"])
@token_required(roles=["admin"])
def resolve_complaint(id):
    store = DataStore.get_instance()
    complaint = store.get("missed_collection_complaints", id)
    if not complaint:
        return jsonify({"error": "NOT_FOUND", "message": "Complaint not found."}), 404

    data = request.get_json() or {}
    new_status = data.get("status", "RESOLVED") # UNDER_REVIEW, RECOVERY_SCHEDULED, RESOLVED, REJECTED
    resolution_note = data.get("resolution_note", "").strip()

    updates = {
        "status": new_status,
        "resolution_note": resolution_note,
        "resolved_at": datetime.now(timezone.utc).isoformat(),
        "resolved_by": request.current_user["id"]
    }
    updated = store.update("missed_collection_complaints", id, updates)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": f"RESOLVE_COMPLAINT_{new_status}",
        "entity_type": "missed_collection_complaints",
        "entity_id": id,
        "safe_metadata": {"complaint_number": complaint.get("complaint_number"), "status": new_status, "note": resolution_note}
    })

    return jsonify({"message": f"Complaint {complaint.get('complaint_number')} updated to {new_status}.", "complaint": updated})


# ============================================================================
# 8. DUMPYARDS, SERVICE AREAS, & AUDIT LOGS
# ============================================================================
@admin_bp.route("/dumpyards", methods=["GET"])
@token_required(roles=["admin"])
def list_dumpyards():
    store = DataStore.get_instance()
    return jsonify(store.list("dumpyards"))

@admin_bp.route("/dumpyards", methods=["POST"])
@token_required(roles=["admin"])
def create_dumpyard():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    address = data.get("address", "").strip()
    if not name or not address:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Name and address required."}), 400

    store = DataStore.get_instance()
    created = store.insert("dumpyards", {
        "name": name,
        "address": address,
        "latitude": float(data.get("latitude", 19.0820)),
        "longitude": float(data.get("longitude", 73.0030)),
        "capacity_tonnes": float(data.get("capacity_tonnes", 1000.0)),
        "is_active": True
    })
    return jsonify(created), 201

@admin_bp.route("/service-areas", methods=["GET"])
@token_required(roles=["admin"])
def list_service_areas():
    store = DataStore.get_instance()
    return jsonify(store.list("service_areas"))

@admin_bp.route("/service-areas", methods=["POST"])
@token_required(roles=["admin"])
def create_service_area():
    data = request.get_json() or {}
    name = data.get("name", "").strip()
    code = data.get("code", "").strip().upper()
    if not name or not code:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Name and Code required."}), 400

    store = DataStore.get_instance()
    created = store.insert("service_areas", {
        "name": name,
        "code": code,
        "description": data.get("description", ""),
        "is_active": True
    })
    return jsonify(created), 201

@admin_bp.route("/audit-logs", methods=["GET"])
@token_required(roles=["admin"])
def list_audit_logs():
    store = DataStore.get_instance()
    logs = store.list("audit_logs")
    actor_ids = {l.get("actor_id") for l in logs if l.get("actor_id")}
    profiles = {p["id"]: p["full_name"] for p in store.list("profiles") if p["id"] in actor_ids}

    for l in logs:
        l["actor_name"] = profiles.get(l.get("actor_id"), "System Officer")

    logs.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify(logs[:150])


# ============================================================================
# 11. DRIVER FIELD ISSUES & INQUIRIES MANAGEMENT
# ============================================================================
@admin_bp.route("/driver-issues", methods=["GET"])
@token_required(roles=["admin"])
def list_driver_issues():
    store = DataStore.get_instance()
    status_filter = request.args.get("status")
    category_filter = request.args.get("category")

    issues = store.list("driver_issues")
    if status_filter:
        issues = [i for i in issues if i.get("status") == status_filter]
    if category_filter:
        issues = [i for i in issues if i.get("category") == category_filter]

    drivers = {p["id"]: p for p in store.list("profiles")}
    vehicles = {v["id"]: v for v in store.list("vehicles")}
    routes = {r["id"]: r for r in store.list("collection_routes")}

    for iss in issues:
        d = drivers.get(iss.get("driver_id"))
        iss["driver_name"] = d.get("full_name") if d else "Unknown Driver"
        iss["driver_phone"] = d.get("phone") if d else None
        if iss.get("vehicle_id"):
            v = vehicles.get(iss["vehicle_id"])
            iss["vehicle_number"] = v.get("vehicle_number") if v else None
        if iss.get("route_id"):
            r = routes.get(iss["route_id"])
            iss["route_name"] = r.get("route_name") if r else None

    issues.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify(issues)

@admin_bp.route("/driver-issues/<id>/respond", methods=["PATCH"])
@token_required(roles=["admin"])
def respond_driver_issue(id):
    store = DataStore.get_instance()
    issue = store.get("driver_issues", id)
    if not issue:
        return jsonify({"error": "NOT_FOUND", "message": "Issue ticket not found."}), 404

    data = request.get_json() or {}
    response_text = data.get("admin_response", "").strip()
    status = data.get("status", "RESOLVED").upper()

    if not response_text:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Response text is required."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    updates = {
        "admin_response": response_text,
        "status": status,
        "resolved_by": request.current_user["id"],
        "resolved_at": now_iso,
        "updated_at": now_iso
    }
    store.update("driver_issues", id, updates)

    # Notify driver
    if issue.get("driver_id"):
        NotificationService.send_notification(
            user_id=issue["driver_id"],
            title=f"Dispatch Response: {issue.get('title')}",
            message=f"Admin updated ticket status to {status}: {response_text}",
            notif_type="SYSTEM"
        )

    # Audit log
    store.insert("audit_logs", {
        "id": str(uuid.uuid4()),
        "action": "DRIVER_ISSUE_RESOLVED",
        "entity_type": "driver_issues",
        "entity_id": id,
        "performed_by": request.current_user["id"],
        "created_at": now_iso,
        "safe_metadata": {"status": status}
    })

    return jsonify({"message": f"Issue ticket updated to {status}.", "issue": store.get("driver_issues", id)})

