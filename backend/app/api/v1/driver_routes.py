import uuid
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from app.api.v1.auth_routes import token_required
from app.repositories.data_store import DataStore
from app.policies.workflow_policy import WorkflowPolicy
from app.services.notification_service import NotificationService
from app.services.security_service import SecurityService
from app.services.cloudinary_service import CloudinaryService

driver_bp = Blueprint("driver_bp", __name__)

# -----------------------------------------------------------------------------
# 1. Driver Dashboard Overview
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/dashboard", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_dashboard():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Driver's routes
    driver_routes = store.list("collection_routes", lambda r: r.get("driver_id") == driver_id and r.get("status") != "CANCELLED")
    today_routes = [r for r in driver_routes if r.get("route_date") == today_str]

    # Stops across today's routes
    today_route_ids = {r["id"] for r in today_routes}
    today_stops = store.list("route_stops", lambda s: s.get("route_id") in today_route_ids)

    pending_count = len([s for s in today_stops if s.get("status") == "PENDING"])
    in_progress_count = len([s for s in today_stops if s.get("status") == "STARTED"])
    completed_count = len([s for s in today_stops if s.get("status") == "COMPLETED"])
    failed_count = len([s for s in today_stops if s.get("status") in ["SKIPPED", "ISSUE_REPORTED"]])

    # Assigned vehicle
    assigned_vehicle = None
    vehicles = store.list("vehicles", lambda v: v.get("assigned_driver_id") == driver_id and v.get("is_active", True))
    if vehicles:
        assigned_vehicle = vehicles[0]
    elif today_routes and today_routes[0].get("vehicle_id"):
        assigned_vehicle = store.get("vehicles", today_routes[0]["vehicle_id"])

    # Active route (prefer IN_PROGRESS, else PUBLISHED today)
    active_route = None
    in_prog = [r for r in today_routes if r.get("status") == "IN_PROGRESS"]
    if in_prog:
        active_route = in_prog[0]
    elif today_routes:
        active_route = today_routes[0]

    # Upcoming stops on active route
    upcoming_stops = []
    if active_route:
        stops = store.list("route_stops", lambda s: s.get("route_id") == active_route["id"])
        stops.sort(key=lambda s: s.get("sequence_number", 0))
        upcoming_stops = [s for s in stops if s.get("status") in ["PENDING", "STARTED"]][:3]

    # Unread notifications
    notifs = store.list("notifications", lambda n: n.get("user_id") == driver_id and n.get("read_at") is None)
    unread_notifs_count = len(notifs)

    # Performance snapshot
    all_driver_route_ids = {r["id"] for r in driver_routes}
    all_stops = store.list("route_stops", lambda s: s.get("route_id") in all_driver_route_ids)
    total_assigned = len(all_stops)
    total_completed = len([s for s in all_stops if s.get("status") == "COMPLETED"])
    total_exceptions = len([s for s in all_stops if s.get("status") in ["SKIPPED", "ISSUE_REPORTED"]])
    eligible = total_completed + total_exceptions
    completion_rate = round((total_completed / eligible * 100), 1) if eligible > 0 else (100.0 if total_completed > 0 else 0.0)

    return jsonify({
        "driver": {
            "id": request.current_user["id"],
            "full_name": request.current_user["full_name"],
            "email": request.current_user["email"],
            "phone": request.current_user.get("phone")
        },
        "today_summary": {
            "total_tasks": len(today_stops),
            "pending": pending_count,
            "in_progress": in_progress_count,
            "completed": completed_count,
            "failed": failed_count
        },
        "assigned_vehicle": assigned_vehicle,
        "active_route": active_route,
        "upcoming_stops": upcoming_stops,
        "unread_notifications_count": unread_notifs_count,
        "performance_snapshot": {
            "total_assigned": total_assigned,
            "total_completed": total_completed,
            "completion_rate": completion_rate
        }
    })

# -----------------------------------------------------------------------------
# 2. Driver Tasks Center
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/tasks", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_tasks():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    
    # Query parameters
    status_filter = request.args.get("status")
    date_filter = request.args.get("date")
    type_filter = request.args.get("type")
    today_only = request.args.get("today_only", "false").lower() == "true"
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    # Get driver's routes
    driver_routes = store.list("collection_routes", lambda r: (
        request.current_user["role"] == "admin" or r.get("driver_id") == driver_id
    ))
    
    if today_only:
        driver_routes = [r for r in driver_routes if r.get("route_date") == today_str]
    elif date_filter:
        driver_routes = [r for r in driver_routes if r.get("route_date") == date_filter]

    route_map = {r["id"]: r for r in driver_routes}
    route_ids = set(route_map.keys())

    # Get stops for these routes
    stops = store.list("route_stops", lambda s: s.get("route_id") in route_ids)

    # Filter stops
    if status_filter:
        stops = [s for s in stops if s.get("status") == status_filter]
    if type_filter:
        stops = [s for s in stops if s.get("stop_type") == type_filter]

    # Enrich stops with route, proof, and location data
    enriched = []
    proofs = store.list("collection_proofs")
    proof_by_stop = {p.get("route_stop_id"): p for p in proofs if p.get("route_stop_id")}

    for s in stops:
        r = route_map.get(s.get("route_id"), {})
        proof = proof_by_stop.get(s["id"])

        target_info = {}
        if s.get("stop_type") == "BUILDING" and s.get("building_id"):
            b = store.get("buildings", s["building_id"])
            if b: target_info = {"name": b.get("name"), "address": b.get("address")}
        elif s.get("stop_type") == "DUSTBIN" and s.get("dustbin_id"):
            bin_obj = store.get("dustbins", s["dustbin_id"])
            if bin_obj: target_info = {"bin_code": bin_obj.get("bin_code"), "fill_level": bin_obj.get("fill_level_percentage")}

        enriched.append({
            **s,
            "route_name": r.get("route_name"),
            "route_date": r.get("route_date"),
            "route_status": r.get("status"),
            "shift": r.get("shift"),
            "target_info": target_info,
            "proof": proof
        })

    # Sort by route date desc, then sequence number asc
    enriched.sort(key=lambda item: (item.get("route_date", ""), -(item.get("sequence_number", 0))), reverse=True)
    return jsonify(enriched)

@driver_bp.route("/driver/tasks/<stop_id>", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_task_detail(stop_id):
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop:
        return jsonify({"error": "NOT_FOUND", "message": "Task not found."}), 404

    route = store.get("collection_routes", stop.get("route_id"))
    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "Unauthorized for this task."}), 403

    # Proof review
    proofs = store.list("collection_proofs", lambda p: p.get("route_stop_id") == stop_id)
    proof = proofs[0] if proofs else None

    # Linked report details if any
    report = None
    if stop.get("report_id"):
        report = store.get("waste_reports", stop["report_id"])

    return jsonify({
        "stop": stop,
        "route": route,
        "proof": proof,
        "report": report
    })

# -----------------------------------------------------------------------------
# 3. Driver Routes & Operations
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/routes", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_routes():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    status_filter = request.args.get("status")

    filter_fn = lambda r: (
        request.current_user["role"] == "admin" or r.get("driver_id") == driver_id
    ) and (not status_filter or r.get("status") == status_filter)

    routes = store.list("collection_routes", filter_fn)
    routes.sort(key=lambda r: r.get("route_date", ""), reverse=True)

    enriched = []
    for r in routes:
        vehicle = store.get("vehicles", r.get("vehicle_id"))
        stops = store.list("route_stops", lambda s: s.get("route_id") == r["id"])
        completed_stops = len([s for s in stops if s.get("status") in ["COMPLETED", "SKIPPED", "ISSUE_REPORTED"]])
        enriched.append({
            **r,
            "vehicle_number": vehicle.get("vehicle_number") if vehicle else "Unassigned",
            "vehicle_type": vehicle.get("vehicle_type") if vehicle else "N/A",
            "total_stops": len(stops),
            "completed_stops": completed_stops
        })
    return jsonify(enriched)

@driver_bp.route("/driver/routes/today", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_today_routes():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    filter_fn = lambda r: r.get("status") in ["PUBLISHED", "IN_PROGRESS", "COMPLETED"] and (
        request.current_user["role"] == "admin" or r.get("driver_id") == driver_id
    ) and (r.get("route_date") == today_str or r.get("status") == "IN_PROGRESS")
    
    routes = store.list("collection_routes", filter_fn)
    routes.sort(key=lambda r: 0 if r.get("status") == "IN_PROGRESS" else 1)

    enriched = []
    for r in routes:
        vehicle = store.get("vehicles", r.get("vehicle_id"))
        stops = store.list("route_stops", lambda s: s.get("route_id") == r["id"])
        completed_stops = len([s for s in stops if s.get("status") in ["COMPLETED", "SKIPPED", "ISSUE_REPORTED"]])
        enriched.append({
            **r,
            "vehicle_number": vehicle.get("vehicle_number") if vehicle else "Unassigned",
            "vehicle_type": vehicle.get("vehicle_type") if vehicle else "N/A",
            "total_stops": len(stops),
            "completed_stops": completed_stops
        })
    return jsonify(enriched)

@driver_bp.route("/driver/routes/<route_id>/start", methods=["POST"])
@token_required(roles=["driver", "admin"])
def start_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "You are not authorized to start another driver's route."}), 403

    valid_trans, trans_err = WorkflowPolicy.validate_route_transition(route.get("status"), "IN_PROGRESS")
    if not valid_trans:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": trans_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("collection_routes", route_id, {
        "status": "IN_PROGRESS",
        "started_at": now_iso
    })
    if route.get("vehicle_id"):
        store.update("vehicles", route["vehicle_id"], {"status": "EN_ROUTE"})

    return jsonify({"message": "Route started.", "route": store.get("collection_routes", route_id)})

@driver_bp.route("/driver/routes/<route_id>/complete", methods=["POST"])
@token_required(roles=["driver", "admin"])
def complete_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "Unauthorized for this route."}), 403

    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    unresolved = [s for s in stops if s.get("status") in ["PENDING", "STARTED"]]
    if unresolved:
        return jsonify({
            "error": "UNRESOLVED_STOPS",
            "message": f"Cannot complete route: {len(unresolved)} stops remain unresolved (PENDING or STARTED)."
        }), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("collection_routes", route_id, {
        "status": "COMPLETED",
        "completed_at": now_iso
    })
    if route.get("vehicle_id"):
        store.update("vehicles", route["vehicle_id"], {"status": "AVAILABLE"})

    # Conclude live tracking session
    active_sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("route_id") == route_id and s.get("status") == "ACTIVE")
    for s in active_sessions:
        store.update("vehicle_tracking_sessions", s["id"], {
            "status": "COMPLETED",
            "ended_at": now_iso,
            "updated_at": now_iso
        })

    return jsonify({"message": "Route marked as completed.", "route": store.get("collection_routes", route_id)})

@driver_bp.route("/driver/stops/<stop_id>/start", methods=["POST"])
@token_required(roles=["driver", "admin"])
def start_stop(stop_id):
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found."}), 404

    route = store.get("collection_routes", stop["route_id"])
    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "Unauthorized for this stop."}), 403

    valid_trans, trans_err = WorkflowPolicy.validate_stop_transition(stop.get("status"), "STARTED", stop)
    if not valid_trans:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": trans_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("route_stops", stop_id, {
        "status": "STARTED",
        "started_at": now_iso
    })

    if stop.get("report_id"):
        store.update("waste_reports", stop["report_id"], {"status": "IN_COLLECTION"})

    return jsonify({"message": "Stop started.", "stop": store.get("route_stops", stop_id)})

@driver_bp.route("/driver/stops/<stop_id>/complete", methods=["POST"])
@token_required(roles=["driver", "admin"])
def complete_stop(stop_id):
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found."}), 404

    route = store.get("collection_routes", stop["route_id"])
    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "Unauthorized for this stop."}), 403

    # Check proof if required
    proof_record = None
    if stop.get("photo_required"):
        proofs = store.list("collection_proofs", lambda p: p.get("route_stop_id") == stop_id)
        if proofs:
            proof_record = proofs[0]

    valid_trans, trans_err = WorkflowPolicy.validate_stop_transition(stop.get("status"), "COMPLETED", stop, proof_record)
    if not valid_trans:
        return jsonify({"error": "POLICY_VIOLATION", "message": trans_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("route_stops", stop_id, {
        "status": "COMPLETED",
        "completed_at": now_iso
    })

    if stop.get("report_id"):
        if stop.get("photo_required"):
            store.update("waste_reports", stop["report_id"], {"status": "AWAITING_PROOF_REVIEW"})
        else:
            store.update("waste_reports", stop["report_id"], {"status": "COMPLETED"})

    if stop.get("dustbin_id"):
        store.update("dustbins", stop["dustbin_id"], {"fill_level_percentage": 0})

    return jsonify({"message": "Stop completed successfully.", "stop": store.get("route_stops", stop_id)})

@driver_bp.route("/driver/stops/<stop_id>/exception", methods=["POST"])
@token_required(roles=["driver", "admin"])
def report_stop_exception(stop_id):
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found."}), 404

    route = store.get("collection_routes", stop["route_id"])
    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "Unauthorized for this stop."}), 403

    data = request.get_json() or {}
    exception_type = data.get("type", "SKIPPED")
    reason = data.get("reason", "").strip()

    if exception_type not in ["SKIPPED", "ISSUE_REPORTED"]:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Exception type must be SKIPPED or ISSUE_REPORTED."}), 400

    stop_data_for_check = {**stop, "exception_reason": reason}
    valid_trans, trans_err = WorkflowPolicy.validate_stop_transition(stop.get("status"), exception_type, stop_data_for_check)
    if not valid_trans:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": trans_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("route_stops", stop_id, {
        "status": exception_type,
        "exception_reason": reason,
        "completed_at": now_iso
    })

    return jsonify({"message": f"Stop marked as {exception_type}.", "stop": store.get("route_stops", stop_id)})

# -----------------------------------------------------------------------------
# 4. Task History
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/history", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_history():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]

    status_filter = request.args.get("status")
    start_date = request.args.get("start_date")
    end_date = request.args.get("end_date")

    # Get driver's routes
    driver_routes = store.list("collection_routes", lambda r: (
        request.current_user["role"] == "admin" or r.get("driver_id") == driver_id
    ))
    route_map = {r["id"]: r for r in driver_routes}
    route_ids = set(route_map.keys())

    # Completed/finished stops
    stops = store.list("route_stops", lambda s: s.get("route_id") in route_ids and s.get("status") in ["COMPLETED", "SKIPPED", "ISSUE_REPORTED"])

    if status_filter:
        stops = [s for s in stops if s.get("status") == status_filter]
    if start_date:
        stops = [s for s in stops if (route_map.get(s["route_id"], {}).get("route_date") or "") >= start_date]
    if end_date:
        stops = [s for s in stops if (route_map.get(s["route_id"], {}).get("route_date") or "") <= end_date]

    proofs = {p.get("route_stop_id"): p for p in store.list("collection_proofs") if p.get("route_stop_id")}

    records = []
    for s in stops:
        r = route_map.get(s["route_id"], {})
        p = proofs.get(s["id"])
        records.append({
            "stop_id": s["id"],
            "sequence_number": s.get("sequence_number"),
            "target_name": s.get("target_name"),
            "target_address": s.get("target_address"),
            "stop_type": s.get("stop_type"),
            "status": s.get("status"),
            "completed_at": s.get("completed_at"),
            "route_name": r.get("route_name"),
            "route_date": r.get("route_date"),
            "shift": r.get("shift"),
            "exception_reason": s.get("exception_reason"),
            "proof": p
        })

    records.sort(key=lambda x: x.get("completed_at") or x.get("route_date") or "", reverse=True)
    return jsonify(records)

# -----------------------------------------------------------------------------
# 5. Performance Analytics
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/performance", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_performance():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]

    driver_routes = store.list("collection_routes", lambda r: (
        request.current_user["role"] == "admin" or r.get("driver_id") == driver_id
    ) and r.get("status") != "CANCELLED")
    
    route_map = {r["id"]: r for r in driver_routes}
    route_ids = set(route_map.keys())

    all_stops = store.list("route_stops", lambda s: s.get("route_id") in route_ids)

    total_assigned = len(all_stops)
    total_completed = len([s for s in all_stops if s.get("status") == "COMPLETED"])
    total_skipped = len([s for s in all_stops if s.get("status") == "SKIPPED"])
    total_issues = len([s for s in all_stops if s.get("status") == "ISSUE_REPORTED"])
    total_pending = len([s for s in all_stops if s.get("status") in ["PENDING", "STARTED"]])

    eligible = total_completed + total_skipped + total_issues
    completion_rate = round((total_completed / eligible * 100), 1) if eligible > 0 else (100.0 if total_completed > 0 else 0.0)

    # Type breakdown
    by_type = {}
    for st in ["BUILDING", "DUSTBIN", "COMPLAINT_REPORT"]:
        subset = [s for s in all_stops if s.get("stop_type") == st]
        comp = len([s for s in subset if s.get("status") == "COMPLETED"])
        by_type[st] = {
            "total": len(subset),
            "completed": comp,
            "rate": round((comp / len(subset) * 100), 1) if subset else 0.0
        }

    # Last 7 days trend
    daily_trends = []
    now = datetime.now(timezone.utc)
    for i in range(6, -1, -1):
        day_date = (now - timedelta(days=i)).strftime("%Y-%m-%d")
        day_route_ids = {r["id"] for r in driver_routes if r.get("route_date") == day_date}
        day_stops = [s for s in all_stops if s.get("route_id") in day_route_ids]
        d_comp = len([s for s in day_stops if s.get("status") == "COMPLETED"])
        d_fail = len([s for s in day_stops if s.get("status") in ["SKIPPED", "ISSUE_REPORTED"]])
        daily_trends.append({
            "date": day_date,
            "assigned": len(day_stops),
            "completed": d_comp,
            "exceptions": d_fail
        })

    return jsonify({
        "metrics": {
            "total_assigned": total_assigned,
            "total_completed": total_completed,
            "total_skipped": total_skipped,
            "total_issues": total_issues,
            "total_pending": total_pending,
            "completion_rate": completion_rate,
            "routes_served": len(driver_routes)
        },
        "by_type": by_type,
        "daily_trends": daily_trends
    })

# -----------------------------------------------------------------------------
# 6. Driver Profile & Password Security
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/profile", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_profile():
    store = DataStore.get_instance()
    user = request.current_user

    # Find currently assigned vehicle
    assigned_vehicle = None
    veh_list = store.list("vehicles", lambda v: v.get("assigned_driver_id") == user["id"] and v.get("is_active", True))
    if veh_list:
        assigned_vehicle = veh_list[0]

    return jsonify({
        "id": user["id"],
        "full_name": user["full_name"],
        "email": user["email"],
        "phone": user.get("phone"),
        "license_number": user.get("license_number"),
        "role": user["role"],
        "is_active": user.get("is_active", True),
        "created_at": user.get("created_at"),
        "assigned_vehicle": assigned_vehicle
    })

@driver_bp.route("/driver/profile", methods=["PATCH"])
@token_required(roles=["driver", "admin"])
def update_driver_profile():
    store = DataStore.get_instance()
    user = request.current_user
    data = request.get_json() or {}

    updates = {}
    # Permitted contact fields
    if "phone" in data:
        updates["phone"] = str(data["phone"]).strip()

    # Password change
    if "new_password" in data and data["new_password"]:
        current_password = data.get("current_password", "")
        if not current_password:
            return jsonify({"error": "VALIDATION_ERROR", "message": "Current password is required to set a new password."}), 400
        
        if not SecurityService.verify_password(user.get("password_hash"), current_password):
            return jsonify({"error": "INVALID_CREDENTIALS", "message": "Current password is incorrect."}), 401

        new_password = str(data["new_password"]).strip()
        if len(new_password) < 6:
            return jsonify({"error": "VALIDATION_ERROR", "message": "New password must be at least 6 characters long."}), 400

        updates["password_hash"] = SecurityService.hash_password(new_password)

    if updates:
        store.update("profiles", user["id"], updates)

    updated = store.get("profiles", user["id"])
    return jsonify({
        "message": "Profile updated successfully.",
        "profile": {
            "id": updated["id"],
            "full_name": updated["full_name"],
            "email": updated["email"],
            "phone": updated.get("phone"),
            "license_number": updated.get("license_number"),
            "role": updated["role"]
        }
    })

# -----------------------------------------------------------------------------
# 7. Notifications Center
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/notifications", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_notifications():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]

    notifs = store.list("notifications", lambda n: n.get("user_id") == driver_id)
    notifs.sort(key=lambda n: n.get("created_at", ""), reverse=True)
    return jsonify(notifs)

@driver_bp.route("/driver/notifications/<notif_id>/read", methods=["PATCH"])
@token_required(roles=["driver", "admin"])
def mark_notification_read(notif_id):
    store = DataStore.get_instance()
    notif = store.get("notifications", notif_id)
    if not notif or notif.get("user_id") != request.current_user["id"]:
        return jsonify({"error": "NOT_FOUND", "message": "Notification not found."}), 404

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("notifications", notif_id, {"read_at": now_iso})
    return jsonify({"message": "Marked as read.", "notification": store.get("notifications", notif_id)})

@driver_bp.route("/driver/notifications/mark-all-read", methods=["POST"])
@token_required(roles=["driver", "admin"])
def mark_all_notifications_read():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    now_iso = datetime.now(timezone.utc).isoformat()

    notifs = store.list("notifications", lambda n: n.get("user_id") == driver_id and n.get("read_at") is None)
    for n in notifs:
        store.update("notifications", n["id"], {"read_at": now_iso})

    return jsonify({"message": f"Marked {len(notifs)} notifications as read."})

# -----------------------------------------------------------------------------
# 8. Driver Issue Tickets & Admin Communication
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/issues", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_issues():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]

    issues = store.list("driver_issues", lambda i: i.get("driver_id") == driver_id)
    issues.sort(key=lambda i: i.get("created_at", ""), reverse=True)
    return jsonify(issues)

@driver_bp.route("/driver/issues", methods=["POST"])
@token_required(roles=["driver", "admin"])
def create_driver_issue():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    data = request.get_json() or {}

    category = data.get("category", "OTHER").upper()
    title = data.get("title", "").strip()
    description = data.get("description", "").strip()
    priority = data.get("priority", "MEDIUM").upper()
    photo_payload = data.get("photo")

    valid_cats = ["VEHICLE_FAULT", "BLOCKED_ROAD", "ACCESS_ISSUE", "ACCIDENT", "SCHEDULE_INQUIRY", "OTHER"]
    if category not in valid_cats:
        return jsonify({"error": "VALIDATION_ERROR", "message": f"Category must be one of {valid_cats}."}), 400

    if not title or not description:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Title and description are required."}), 400

    photo_url = None
    if photo_payload:
        upload_res = CloudinaryService.upload_image(photo_payload, folder="driver_issues")
        photo_url = upload_res.get("secure_url")

    now_iso = datetime.now(timezone.utc).isoformat()
    issue_record = {
        "id": str(uuid.uuid4()),
        "driver_id": driver_id,
        "driver_name": request.current_user["full_name"],
        "vehicle_id": data.get("vehicle_id"),
        "route_id": data.get("route_id"),
        "stop_id": data.get("stop_id"),
        "category": category,
        "title": title,
        "description": description,
        "photo_url": photo_url,
        "priority": priority if priority in ["LOW", "MEDIUM", "HIGH", "URGENT"] else "MEDIUM",
        "status": "OPEN",
        "admin_response": None,
        "resolved_by": None,
        "resolved_at": None,
        "created_at": now_iso,
        "updated_at": now_iso
    }
    created = store.insert("driver_issues", issue_record)

    # Log audit
    store.insert("audit_logs", {
        "id": str(uuid.uuid4()),
        "action": "DRIVER_ISSUE_SUBMITTED",
        "entity_type": "driver_issues",
        "entity_id": created["id"],
        "performed_by": driver_id,
        "created_at": now_iso,
        "safe_metadata": {"category": category, "title": title}
    })

    return jsonify({"message": "Issue ticket submitted to municipal dispatch.", "issue": created}), 201

# -----------------------------------------------------------------------------
# 9. Driver Vehicle Telemetry & Specifications
# -----------------------------------------------------------------------------
@driver_bp.route("/driver/vehicle", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_vehicle():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]

    # Check vehicle assigned directly to driver
    assigned_vehicle = None
    veh_list = store.list("vehicles", lambda v: v.get("assigned_driver_id") == driver_id and v.get("is_active", True))
    if veh_list:
        assigned_vehicle = veh_list[0]
    else:
        # Check active route vehicle
        active_routes = store.list("collection_routes", lambda r: r.get("driver_id") == driver_id and r.get("status") in ["IN_PROGRESS", "PUBLISHED"])
        if active_routes and active_routes[0].get("vehicle_id"):
            assigned_vehicle = store.get("vehicles", active_routes[0]["vehicle_id"])

    if not assigned_vehicle:
        return jsonify({"vehicle": None, "message": "No vehicle currently assigned to your driver account."})

    # Find today's routes with this vehicle
    routes = store.list("collection_routes", lambda r: r.get("vehicle_id") == assigned_vehicle["id"])
    routes.sort(key=lambda r: r.get("route_date", ""), reverse=True)

    return jsonify({
        "vehicle": assigned_vehicle,
        "recent_routes": routes[:5]
    })
