from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.api.v1.auth_routes import token_required
from app.repositories.data_store import DataStore
from app.policies.workflow_policy import WorkflowPolicy
from app.services.optimization_service import OptimizationService
from app.services.notification_service import NotificationService

route_bp = Blueprint("route_bp", __name__)

@route_bp.route("/routes", methods=["GET"])
@token_required(roles=["admin"])
def list_routes():
    store = DataStore.get_instance()
    date_filter = request.args.get("date")
    status_filter = request.args.get("status")
    
    routes = store.list("collection_routes")
    if date_filter:
        routes = [r for r in routes if str(r.get("route_date")) == date_filter]
    if status_filter:
        routes = [r for r in routes if r.get("status") == status_filter]
        
    routes.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify(routes)

@route_bp.route("/routes", methods=["POST"])
@token_required(roles=["admin"])
def create_route():
    data = request.get_json() or {}
    route_name = data.get("route_name", "").strip()
    route_date = data.get("route_date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))
    shift = data.get("shift", "MORNING")
    vehicle_id = data.get("vehicle_id")
    driver_id = data.get("driver_id")
    dumpyard_id = data.get("dumpyard_id")

    if not route_name:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Route name is required."}), 400

    store = DataStore.get_instance()
    
    # Check default dumpyard if not passed
    if not dumpyard_id:
        dumpyards = store.list("dumpyards")
        if dumpyards:
            dumpyard_id = dumpyards[0]["id"]

    new_route = {
        "route_name": route_name,
        "route_date": route_date,
        "shift": shift,
        "vehicle_id": vehicle_id,
        "driver_id": driver_id,
        "dumpyard_id": dumpyard_id,
        "status": "DRAFT",
        "version": 1,
        "distance_meters": 0.0,
        "duration_seconds": 0,
        "geometry": [],
        "published_at": None,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    created = store.insert("collection_routes", new_route)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "CREATE_ROUTE_DRAFT",
        "entity_type": "collection_routes",
        "entity_id": created["id"],
        "safe_metadata": {"route_name": route_name, "date": route_date, "shift": shift}
    })

    return jsonify(created), 201

@route_bp.route("/routes/<route_id>", methods=["GET"])
@token_required(roles=["admin", "driver"])
def get_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    # Authorization: Driver can only view their own route unless admin
    if request.current_user["role"] == "driver" and route.get("driver_id") != request.current_user["id"]:
        return jsonify({"error": "FORBIDDEN", "message": "You cannot access routes not assigned to you."}), 403

    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    stops.sort(key=lambda x: x.get("sequence_number", 0))

    # Enrich stops with building / bin names and coordinates
    for s in stops:
        if s.get("building_id"):
            b = store.get("buildings", s["building_id"])
            if b:
                s["target_name"] = b.get("name")
                s["target_address"] = b.get("address")
                s["latitude"] = b.get("latitude")
                s["longitude"] = b.get("longitude")
        elif s.get("dustbin_id"):
            db = store.get("dustbins", s["dustbin_id"])
            if db:
                s["target_name"] = f"Dustbin {db.get('bin_code')} ({db.get('bin_type')})"
                s["latitude"] = db.get("latitude")
                s["longitude"] = db.get("longitude")
                s["capacity_liters"] = db.get("capacity_liters", 240)
        elif s.get("report_id"):
            rep = store.get("waste_reports", s["report_id"])
            if rep:
                s["target_name"] = f"Complaint {rep.get('report_number')} ({rep.get('report_type')})"
                s["target_address"] = rep.get("address_text", "")
                s["latitude"] = rep.get("latitude")
                s["longitude"] = rep.get("longitude")

    vehicle = store.get("vehicles", route.get("vehicle_id")) if route.get("vehicle_id") else None
    driver = store.get("profiles", route.get("driver_id")) if route.get("driver_id") else None
    if driver:
        driver.pop("password_hash", None)
    dumpyard = store.get("dumpyards", route.get("dumpyard_id")) if route.get("dumpyard_id") else None

    return jsonify({
        **route,
        "stops": stops,
        "vehicle": vehicle,
        "driver": driver,
        "dumpyard": dumpyard
    })

@route_bp.route("/routes/<route_id>/stops", methods=["POST"])
@token_required(roles=["admin"])
def add_stop_to_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    data = request.get_json() or {}
    stop_type = data.get("stop_type", "BUILDING")
    building_id = data.get("building_id")
    dustbin_id = data.get("dustbin_id")
    report_id = data.get("report_id")
    photo_required = data.get("photo_required", False)

    # Routine stops vs complaint stops: Complaints require photo proof by default (SRS Section 3.3)
    if stop_type == "COMPLAINT_REPORT" or report_id:
        photo_required = True

    existing_stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    seq = len(existing_stops) + 1

    stop_record = {
        "route_id": route_id,
        "sequence_number": seq,
        "stop_type": stop_type,
        "building_id": building_id,
        "dustbin_id": dustbin_id,
        "report_id": report_id,
        "scheduled_window": data.get("scheduled_window", "07:00 - 07:30"),
        "status": "PENDING",
        "photo_required": photo_required,
        "is_locked": False,
        "started_at": None,
        "completed_at": None,
        "exception_reason": None
    }
    created_stop = store.insert("route_stops", stop_record)
    return jsonify(created_stop), 201

@route_bp.route("/routes/<route_id>/optimize", methods=["POST"])
@token_required(roles=["admin"])
def optimize_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    if not stops:
        return jsonify({"error": "BAD_REQUEST", "message": "Cannot optimize an empty route without stops."}), 400

    # Enrich stop coordinate information
    for s in stops:
        if s.get("building_id"):
            b = store.get("buildings", s["building_id"])
            if b:
                s["latitude"] = b["latitude"]
                s["longitude"] = b["longitude"]
                s["service_duration_minutes"] = 15
        elif s.get("dustbin_id"):
            db = store.get("dustbins", s["dustbin_id"])
            if db:
                s["latitude"] = db["latitude"]
                s["longitude"] = db["longitude"]
                s["service_duration_minutes"] = 10
                s["capacity_liters"] = db.get("capacity_liters", 240)
        elif s.get("report_id"):
            rep = store.get("waste_reports", s["report_id"])
            if rep:
                s["latitude"] = rep["latitude"]
                s["longitude"] = rep["longitude"]
                s["service_duration_minutes"] = 20

    dumpyard = store.get("dumpyards", route.get("dumpyard_id"))
    end_location = (float(dumpyard["latitude"]), float(dumpyard["longitude"])) if dumpyard else None

    vehicle = store.get("vehicles", route.get("vehicle_id"))
    capacity_kg = vehicle.get("capacity_kg", 2500) if vehicle else 2500

    optimization_res = OptimizationService.optimize_stops(
        stops=stops,
        start_location=None,
        end_location=end_location,
        vehicle_capacity_kg=capacity_kg
    )

    # Persist updated sequence numbers and arrival times to route_stops
    for s in optimization_res["stops"]:
        store.update("route_stops", s["id"], {
            "sequence_number": s["sequence_number"],
            "scheduled_window": f"{s.get('estimated_arrival')} - {s.get('estimated_departure')}"
        })

    # Update collection_route metrics and geometry
    store.update("collection_routes", route_id, {
        "status": "OPTIMIZED",
        "distance_meters": optimization_res["distance_meters"],
        "duration_seconds": optimization_res["duration_seconds"],
        "geometry": optimization_res["geometry"],
        "version": route.get("version", 1) + 1
    })

    # Save run record
    store.insert("route_optimization_runs", {
        "route_id": route_id,
        "algorithm": "NEAREST_NEIGHBOR_2OPT",
        "input_summary": {"stops_count": len(stops), "vehicle_capacity_kg": capacity_kg},
        "output_order": [s["id"] for s in optimization_res["stops"]],
        "metrics": {
            "distance_meters": optimization_res["distance_meters"],
            "duration_seconds": optimization_res["duration_seconds"],
            "estimated_load_kg": optimization_res.get("estimated_load_kg"),
            "provider": optimization_res.get("provider")
        },
        "warnings": optimization_res.get("warnings", [])
    })

    updated_route = store.get("collection_routes", route_id)
    return jsonify({
        "route": updated_route,
        "stops": optimization_res["stops"],
        "warnings": optimization_res.get("warnings", []),
        "provider": optimization_res.get("provider")
    })

@route_bp.route("/routes/<route_id>/publish", methods=["POST"])
@token_required(roles=["admin"])
def publish_route(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    vehicle_id = route.get("vehicle_id")
    driver_id = route.get("driver_id")

    if not vehicle_id or not driver_id:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Both vehicle and driver must be assigned before publishing."}), 400

    # Rule AC-12: Conflict prevention for active vehicle or driver
    conflict_ok, conflict_msg = WorkflowPolicy.check_assignment_conflicts(
        store=store,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        route_date=route.get("route_date"),
        shift=route.get("shift"),
        exclude_route_id=route_id
    )
    if not conflict_ok:
        return jsonify({"error": "ASSIGNMENT_CONFLICT", "message": conflict_msg}), 409

    # Transition status
    valid_trans, trans_err = WorkflowPolicy.validate_route_transition(route.get("status"), "PUBLISHED")
    if not valid_trans:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": trans_err}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("collection_routes", route_id, {
        "status": "PUBLISHED",
        "published_at": now_iso
    })
    store.update("vehicles", vehicle_id, {"status": "ASSIGNED"})

    # Send Notification to Driver
    NotificationService.send_notification(
        user_id=driver_id,
        title="New Route Assigned",
        message=f"You have been assigned to route '{route.get('route_name')}' for {route.get('route_date')} ({route.get('shift')} shift).",
        notif_type="ROUTE_PUBLISHED",
        route_id=route_id
    )

    # Audit log
    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "PUBLISH_ROUTE",
        "entity_type": "collection_routes",
        "entity_id": route_id,
        "safe_metadata": {"driver_id": driver_id, "vehicle_id": vehicle_id}
    })

    return jsonify({"message": "Route published successfully.", "route": store.get("collection_routes", route_id)})

@route_bp.route("/routes/<route_id>/stops/reorder", methods=["PATCH"])
@token_required(roles=["admin"])
def reorder_route_stops(route_id):
    """
    Manually reorders stops within a route. Respects locked stops.
    """
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    data = request.get_json() or {}
    ordered_stop_ids = data.get("stop_ids", [])
    if not ordered_stop_ids:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Ordered stop_ids list is required."}), 400

    for idx, s_id in enumerate(ordered_stop_ids, start=1):
        stop = store.get("route_stops", s_id)
        if stop and stop.get("route_id") == route_id:
            store.update("route_stops", s_id, {"sequence_number": idx})

    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    stops.sort(key=lambda s: s.get("sequence_number", 0))

    return jsonify({"message": "Stop sequence updated.", "stops": stops})

@route_bp.route("/routes/<route_id>/stops/<stop_id>/lock", methods=["PATCH"])
@token_required(roles=["admin"])
def toggle_stop_lock(route_id):
    """
    Toggles is_locked flag on a stop so optimizer preserves its exact sequence position.
    """
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop or stop.get("route_id") != route_id:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found on this route."}), 404

    current_locked = stop.get("is_locked", False)
    updated = store.update("route_stops", stop_id, {"is_locked": not current_locked})
    return jsonify({"message": f"Stop sequence {'locked' if not current_locked else 'unlocked'}.", "stop": updated})

@route_bp.route("/routes/<route_id>/stops/<stop_id>", methods=["DELETE"])
@token_required(roles=["admin"])
def remove_stop_from_route(route_id):
    """
    Removes a stop from a draft/optimized route.
    """
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    if route.get("status") in ["IN_PROGRESS", "COMPLETED"]:
        return jsonify({"error": "BAD_REQUEST", "message": "Cannot remove stops from an active or completed route."}), 400

    stop = store.get("route_stops", stop_id)
    if not stop or stop.get("route_id") != route_id:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found."}), 404

    store.delete("route_stops", stop_id)

    # Renumber remaining stops
    remaining = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    remaining.sort(key=lambda s: s.get("sequence_number", 0))
    for idx, s in enumerate(remaining, start=1):
        store.update("route_stops", s["id"], {"sequence_number": idx})

    return jsonify({"message": "Stop removed from route successfully."})

@route_bp.route("/routes/<route_id>/cancel", methods=["POST"])
@token_required(roles=["admin"])
def cancel_route(route_id):
    """
    Cancels an active or planned route and releases its assigned vehicle.
    """
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    data = request.get_json() or {}
    reason = data.get("reason", "Cancelled by Admin Operations").strip()

    valid_trans, trans_err = WorkflowPolicy.validate_route_transition(route.get("status"), "CANCELLED")
    if not valid_trans:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": trans_err}), 400

    store.update("collection_routes", route_id, {
        "status": "CANCELLED",
        "cancellation_reason": reason,
        "cancelled_at": datetime.now(timezone.utc).isoformat()
    })

    # Release vehicle back to AVAILABLE
    if route.get("vehicle_id"):
        store.update("vehicles", route["vehicle_id"], {"status": "AVAILABLE"})

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "CANCEL_ROUTE",
        "entity_type": "collection_routes",
        "entity_id": route_id,
        "safe_metadata": {"reason": reason}
    })

    return jsonify({"message": "Route has been cancelled.", "route": store.get("collection_routes", route_id)})

@route_bp.route("/routes/<route_id>", methods=["DELETE"])
@token_required(roles=["admin"])
def delete_route(route_id):
    """
    Deletes a DRAFT route.
    """
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    if route.get("status") not in ["DRAFT", "OPTIMIZED", "CANCELLED"]:
        return jsonify({"error": "BAD_REQUEST", "message": "Only DRAFT, OPTIMIZED, or CANCELLED routes can be deleted."}), 400

    # Delete stops
    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    for s in stops:
        store.delete("route_stops", s["id"])

    store.delete("collection_routes", route_id)

    return jsonify({"message": f"Route '{route.get('route_name')}' deleted successfully."})

