import math
from datetime import datetime, timezone, timedelta
from flask import Blueprint, request, jsonify
from app.repositories.data_store import DataStore
from app.services.routing_service import RoutingService
from app.api.v1.auth_routes import token_required

tracking_bp = Blueprint("tracking_bp", __name__)

def is_session_stale(last_ping_iso, threshold_seconds=180):
    if not last_ping_iso:
        return True
    try:
        ping_time = datetime.fromisoformat(last_ping_iso.replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        return (now - ping_time).total_seconds() > threshold_seconds
    except Exception:
        return True

def compute_eta_to_target(origin_lat, origin_lon, dest_lat, dest_lon):
    """
    Computes road-network travel distance and arrival time using RoutingService.
    Returns (eta_time_iso, duration_seconds, distance_meters, provider)
    """
    if origin_lat is None or origin_lon is None or dest_lat is None or dest_lon is None:
        return None, 0, 0, "UNAVAILABLE"

    try:
        res = RoutingService.get_route_details([(origin_lat, origin_lon), (dest_lat, dest_lon)])
        duration_sec = res.get("duration_seconds", 0)
        dist_m = res.get("distance_meters", 0)
        provider = res.get("provider", "OSRM_ROAD_NETWORK")
        
        now = datetime.now(timezone.utc)
        eta_time = now + timedelta(seconds=duration_sec)
        return eta_time.isoformat(), duration_sec, dist_m, provider
    except Exception:
        return None, 0, 0, "UNAVAILABLE"

# =============================================================================
# 1. DRIVER LOCATION SHARING APIS
# =============================================================================

@tracking_bp.route("/driver/tracking/start", methods=["POST"])
@token_required(roles=["driver", "admin"])
def start_driver_tracking():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    data = request.get_json() or {}
    
    route_id = data.get("route_id")
    if not route_id:
        # Search for driver's active or published route for today
        active_routes = store.list("collection_routes", lambda r: r.get("driver_id") == driver_id and r.get("status") in ["IN_PROGRESS", "PUBLISHED"])
        if not active_routes:
            return jsonify({"error": "NO_ACTIVE_ROUTE", "message": "No active or published route found assigned to you."}), 400
        route = active_routes[0]
        route_id = route["id"]
    else:
        route = store.get("collection_routes", route_id)
        if not route:
            return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    # Authorization
    if request.current_user["role"] == "driver" and route.get("driver_id") != driver_id:
        return jsonify({"error": "FORBIDDEN", "message": "You are not authorized for this route."}), 403

    # If route is published, automatically transition to IN_PROGRESS
    now_iso = datetime.now(timezone.utc).isoformat()
    if route.get("status") == "PUBLISHED":
        store.update("collection_routes", route_id, {"status": "IN_PROGRESS", "started_at": now_iso})
        if route.get("vehicle_id"):
            store.update("vehicles", route["vehicle_id"], {"status": "EN_ROUTE"})
        route = store.get("collection_routes", route_id)

    vehicle_id = route.get("vehicle_id")

    # Check for existing active tracking session
    existing_sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("route_id") == route_id and s.get("driver_id") == driver_id and s.get("status") == "ACTIVE")
    
    initial_lat = data.get("latitude")
    initial_lon = data.get("longitude")
    accuracy = data.get("accuracy", 10.0)

    if existing_sessions:
        session = existing_sessions[0]
        updates = {"updated_at": now_iso, "last_ping_at": now_iso}
        if initial_lat is not None and initial_lon is not None:
            updates["current_latitude"] = float(initial_lat)
            updates["current_longitude"] = float(initial_lon)
            updates["accuracy_meters"] = float(accuracy)
        session = store.update("vehicle_tracking_sessions", session["id"], updates)
    else:
        session = store.insert("vehicle_tracking_sessions", {
            "route_id": route_id,
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "status": "ACTIVE",
            "current_latitude": float(initial_lat) if initial_lat is not None else None,
            "current_longitude": float(initial_lon) if initial_lon is not None else None,
            "accuracy_meters": float(accuracy) if accuracy is not None else 10.0,
            "heading": data.get("heading"),
            "speed_mps": data.get("speed"),
            "last_ping_at": now_iso if (initial_lat is not None) else None,
            "started_at": now_iso,
            "ended_at": None,
            "next_stop_id": None,
            "next_stop_eta_seconds": None,
            "next_stop_eta_time": None,
            "next_stop_distance_meters": None,
            "eta_provider": None
        })

    # Record breadcrumb if coordinates supplied
    if initial_lat is not None and initial_lon is not None:
        store.insert("location_breadcrumbs", {
            "session_id": session["id"],
            "route_id": route_id,
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "latitude": float(initial_lat),
            "longitude": float(initial_lon),
            "accuracy_meters": float(accuracy),
            "timestamp": now_iso
        })

    return jsonify({
        "message": "Live GPS tracking session active.",
        "status": session.get("status", "ACTIVE"),
        "route_id": route_id,
        "session": session,
        "route": {
            "id": route["id"],
            "name": route.get("route_name"),
            "status": route.get("status")
        }
    })

@tracking_bp.route("/driver/tracking/location", methods=["POST"])
@token_required(roles=["driver", "admin"])
def submit_driver_location():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    data = request.get_json() or {}

    route_id = data.get("route_id")
    latitude = data.get("latitude")
    longitude = data.get("longitude")
    accuracy = data.get("accuracy", 10.0)
    heading = data.get("heading")
    speed = data.get("speed")
    client_ts = data.get("timestamp")

    if latitude is None or longitude is None:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Latitude and longitude are required."}), 400

    try:
        lat = float(latitude)
        lon = float(longitude)
        if not (-90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0):
            return jsonify({"error": "INVALID_COORDINATES", "message": "Coordinates outside valid terrestrial bounds."}), 400
    except (ValueError, TypeError):
        return jsonify({"error": "INVALID_COORDINATES", "message": "Invalid floating point coordinate values."}), 400

    # Locate route
    if not route_id:
        active_routes = store.list("collection_routes", lambda r: r.get("driver_id") == driver_id and r.get("status") == "IN_PROGRESS")
        if not active_routes:
            return jsonify({"error": "NO_ACTIVE_ROUTE", "message": "Driver does not have an active route in progress."}), 400
        route = active_routes[0]
        route_id = route["id"]
    else:
        route = store.get("collection_routes", route_id)
        if not route:
            return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    # Security: Driver must own this route
    if request.current_user["role"] == "driver" and route.get("driver_id") != driver_id:
        return jsonify({"error": "FORBIDDEN", "message": "You cannot submit location updates for another driver's route."}), 403

    if route.get("status") not in ["IN_PROGRESS", "PUBLISHED"]:
        return jsonify({"error": "ROUTE_NOT_ACTIVE", "message": f"Cannot submit location for route in '{route.get('status')}' state."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    vehicle_id = route.get("vehicle_id")

    # Next stop & ETA calculation
    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    stops.sort(key=lambda s: s.get("sequence_number", 0))
    pending_stops = [s for s in stops if s.get("status") in ["PENDING", "STARTED"]]
    
    next_stop = pending_stops[0] if pending_stops else None
    next_stop_id = next_stop["id"] if next_stop else None
    
    eta_time_iso = None
    duration_sec = None
    dist_meters = None
    eta_provider = None

    if next_stop and next_stop.get("latitude") and next_stop.get("longitude"):
        eta_time_iso, duration_sec, dist_meters, eta_provider = compute_eta_to_target(
            lat, lon,
            float(next_stop["latitude"]), float(next_stop["longitude"])
        )

    # Find or create tracking session
    sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("route_id") == route_id and s.get("driver_id") == driver_id and s.get("status") == "ACTIVE")
    
    session_data = {
        "current_latitude": lat,
        "current_longitude": lon,
        "accuracy_meters": float(accuracy),
        "heading": float(heading) if heading is not None else None,
        "speed_mps": float(speed) if speed is not None else None,
        "last_ping_at": now_iso,
        "updated_at": now_iso,
        "next_stop_id": next_stop_id,
        "next_stop_eta_seconds": duration_sec,
        "next_stop_eta_time": eta_time_iso,
        "next_stop_distance_meters": dist_meters,
        "eta_provider": eta_provider
    }

    if sessions:
        session = store.update("vehicle_tracking_sessions", sessions[0]["id"], session_data)
    else:
        session_data.update({
            "route_id": route_id,
            "driver_id": driver_id,
            "vehicle_id": vehicle_id,
            "status": "ACTIVE",
            "started_at": now_iso,
            "ended_at": None
        })
        session = store.insert("vehicle_tracking_sessions", session_data)

    # Breadcrumb audit (capped to 50 items per session)
    existing_crumbs = store.list("location_breadcrumbs", lambda b: b.get("session_id") == session["id"])
    if len(existing_crumbs) >= 50:
        # Remove oldest breadcrumb
        existing_crumbs.sort(key=lambda b: b.get("timestamp", ""))
        for old in existing_crumbs[:10]:
            store.delete("location_breadcrumbs", old["id"])

    store.insert("location_breadcrumbs", {
        "session_id": session["id"],
        "route_id": route_id,
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "latitude": lat,
        "longitude": lon,
        "accuracy_meters": float(accuracy),
        "timestamp": now_iso
    })

    return jsonify({
        "success": True,
        "status": "RECORDED",
        "timestamp": now_iso,
        "current_latitude": lat,
        "current_longitude": lon,
        "accuracy": accuracy,
        "next_stop_eta": {
            "id": next_stop["id"] if next_stop else None,
            "name": next_stop.get("target_name") if next_stop else None,
            "eta_time": eta_time_iso,
            "eta_minutes": round(duration_sec / 60, 1) if duration_sec is not None else None,
            "distance_km": round(dist_meters / 1000, 2) if dist_meters is not None else None,
            "provider": eta_provider
        },
        "next_stop": {
            "id": next_stop["id"] if next_stop else None,
            "name": next_stop.get("target_name") if next_stop else None,
            "eta_time": eta_time_iso,
            "eta_minutes": round(duration_sec / 60, 1) if duration_sec is not None else None,
            "distance_km": round(dist_meters / 1000, 2) if dist_meters is not None else None,
            "provider": eta_provider
        }
    })

@tracking_bp.route("/driver/tracking/stop", methods=["POST"])
@token_required(roles=["driver", "admin"])
def stop_driver_tracking():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    data = request.get_json() or {}
    
    route_id = data.get("route_id")
    sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("driver_id") == driver_id and s.get("status") == "ACTIVE" and (route_id is None or s.get("route_id") == route_id))
    
    now_iso = datetime.now(timezone.utc).isoformat()
    for s in sessions:
        store.update("vehicle_tracking_sessions", s["id"], {
            "status": "COMPLETED",
            "ended_at": now_iso,
            "updated_at": now_iso
        })

    return jsonify({
        "message": "Tracking session ended.",
        "status": "COMPLETED",
        "sessions_closed": len(sessions)
    })

@tracking_bp.route("/driver/tracking/status", methods=["GET"])
@token_required(roles=["driver", "admin"])
def get_driver_tracking_status():
    store = DataStore.get_instance()
    driver_id = request.current_user["id"]
    
    sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("driver_id") == driver_id and s.get("status") == "ACTIVE")
    if not sessions:
        return jsonify({
            "is_tracking": False,
            "has_active_session": False,
            "session": None
        })
    
    session = sessions[0]
    stale = is_session_stale(session.get("last_ping_at"))
    
    return jsonify({
        "is_tracking": True,
        "has_active_session": True,
        "is_stale": stale,
        "session": session
    })

# =============================================================================
# 2. ADMIN LIVE FLEET TRACKING APIS
# =============================================================================

@tracking_bp.route("/admin/tracking/live", methods=["GET"])
@token_required(roles=["admin"])
def get_admin_live_tracking():
    store = DataStore.get_instance()
    
    active_sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("status") == "ACTIVE")
    enriched_sessions = []
    
    for s in active_sessions:
        driver = store.get("profiles", s.get("driver_id")) or {}
        vehicle = store.get("vehicles", s.get("vehicle_id")) or {}
        route = store.get("collection_routes", s.get("route_id")) or {}
        
        # Stops progress
        stops = store.list("route_stops", lambda st: st.get("route_id") == s.get("route_id"))
        stops.sort(key=lambda st: st.get("sequence_number", 0))
        
        total_stops = len(stops)
        completed_stops = len([st for st in stops if st.get("status") == "COMPLETED"])
        remaining_stops = len([st for st in stops if st.get("status") in ["PENDING", "STARTED"]])
        
        current_stop = None
        if s.get("next_stop_id"):
            current_stop = store.get("route_stops", s["next_stop_id"])
        elif remaining_stops > 0:
            current_stop = [st for st in stops if st.get("status") in ["PENDING", "STARTED"]][0]

        stale = is_session_stale(s.get("last_ping_at"))

        # Formatted ETA clock time
        eta_minutes = None
        if s.get("next_stop_eta_seconds") is not None:
            eta_minutes = round(s["next_stop_eta_seconds"] / 60, 1)

        enriched_sessions.append({
            "session_id": s["id"],
            "driver_id": s.get("driver_id"),
            "driver_name": driver.get("full_name", "Unknown Driver"),
            "driver_phone": driver.get("phone"),
            "vehicle_id": s.get("vehicle_id"),
            "vehicle_number": vehicle.get("vehicle_number", "Unregistered"),
            "vehicle_type": vehicle.get("vehicle_type", "COMPACTOR_TRUCK"),
            "vehicle_capacity_kg": vehicle.get("capacity_kg"),
            "route_id": s.get("route_id"),
            "route_name": route.get("route_name", "Collection Route"),
            "route_shift": route.get("shift", "MORNING"),
            "route_status": route.get("status", "IN_PROGRESS"),
            "current_latitude": s.get("current_latitude"),
            "current_longitude": s.get("current_longitude"),
            "accuracy_meters": s.get("accuracy_meters"),
            "heading": s.get("heading"),
            "speed_mps": s.get("speed_mps"),
            "last_ping_at": s.get("last_ping_at"),
            "started_at": s.get("started_at"),
            "is_stale": stale,
            "progress": {
                "total_stops": total_stops,
                "completed_stops": completed_stops,
                "remaining_stops": remaining_stops,
                "percent_complete": round((completed_stops / total_stops * 100), 1) if total_stops > 0 else 0.0
            },
            "next_stop": {
                "id": current_stop.get("id") if current_stop else None,
                "sequence_number": current_stop.get("sequence_number") if current_stop else None,
                "name": (current_stop.get("target_name") or current_stop.get("stop_type")) if current_stop else None,
                "address": current_stop.get("target_address") if current_stop else None,
                "eta_time": s.get("next_stop_eta_time"),
                "eta_minutes": eta_minutes,
                "distance_km": round(s["next_stop_distance_meters"] / 1000, 2) if s.get("next_stop_distance_meters") is not None else None,
                "provider": s.get("eta_provider", "OSRM_ROAD_NETWORK")
            }
        })

    return jsonify({
        "count": len(enriched_sessions),
        "total_active_trips": len(enriched_sessions),
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active_vehicles": enriched_sessions,
        "sessions": enriched_sessions
    })

@tracking_bp.route("/admin/tracking/routes/<route_id>", methods=["GET"])
@token_required(roles=["admin"])
def get_admin_route_tracking(route_id):
    store = DataStore.get_instance()
    route = store.get("collection_routes", route_id)
    if not route:
        return jsonify({"error": "NOT_FOUND", "message": "Route not found."}), 404

    sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("route_id") == route_id and s.get("status") == "ACTIVE")
    active_session = sessions[0] if sessions else None

    driver = store.get("profiles", route.get("driver_id")) or {}
    vehicle = store.get("vehicles", route.get("vehicle_id")) or {}

    stops = store.list("route_stops", lambda s: s.get("route_id") == route_id)
    stops.sort(key=lambda s: s.get("sequence_number", 0))

    # Breadcrumbs trail
    breadcrumbs = []
    if active_session:
        crumbs = store.list("location_breadcrumbs", lambda b: b.get("session_id") == active_session["id"])
        crumbs.sort(key=lambda b: b.get("timestamp", ""))
        breadcrumbs = [{
            "lat": b["latitude"],
            "lng": b["longitude"],
            "timestamp": b["timestamp"],
            "accuracy": b.get("accuracy_meters")
        } for b in crumbs]

    # Calculate stop-by-stop cumulative ETAs from current vehicle position
    enriched_stops = []
    curr_lat = active_session.get("current_latitude") if active_session else None
    curr_lon = active_session.get("current_longitude") if active_session else None

    accumulated_seconds = 0
    now = datetime.now(timezone.utc)

    for st in stops:
        stop_dict = dict(st)
        if st.get("status") in ["PENDING", "STARTED"] and curr_lat is not None and curr_lon is not None and st.get("latitude") and st.get("longitude"):
            # Leg calculation
            st_lat = float(st["latitude"])
            st_lon = float(st["longitude"])
            _, leg_sec, leg_dist, provider = compute_eta_to_target(curr_lat, curr_lon, st_lat, st_lon)
            
            accumulated_seconds += leg_sec
            stop_eta = now + timedelta(seconds=accumulated_seconds)
            stop_dict["estimated_arrival_time"] = stop_eta.isoformat()
            stop_dict["estimated_arrival_minutes"] = round(accumulated_seconds / 60, 1)
            stop_dict["distance_meters"] = leg_dist
            stop_dict["eta_provider"] = provider
            # Advance reference position to this stop with 3 minute service allowance
            curr_lat, curr_lon = st_lat, st_lon
            accumulated_seconds += 180
        else:
            stop_dict["estimated_arrival_time"] = None
            stop_dict["estimated_arrival_minutes"] = None

        enriched_stops.append(stop_dict)

    return jsonify({
        "route": route,
        "driver": {
            "id": driver.get("id"),
            "full_name": driver.get("full_name"),
            "phone": driver.get("phone")
        },
        "vehicle": {
            "id": vehicle.get("id"),
            "vehicle_number": vehicle.get("vehicle_number"),
            "vehicle_type": vehicle.get("vehicle_type")
        },
        "active_session": active_session,
        "session": active_session,
        "is_stale": is_session_stale(active_session.get("last_ping_at")) if active_session else True,
        "breadcrumbs": breadcrumbs,
        "stops": enriched_stops,
        "stops_with_eta": enriched_stops
    })

# =============================================================================
# 3. PUBLIC TRACKING ENRICHMENT HELPER
# =============================================================================

def get_public_live_tracking_for_report(report):
    """
    Computes secure public tracking payload for a given waste report record.
    Strictly sanitizes and omits any driver personal data (phone, email, profile).
    """
    store = DataStore.get_instance()
    report_id = report["id"]
    status = report.get("status")

    if status in ["RESOLVED", "REJECTED", "DUPLICATE"]:
        return {
            "has_live_tracking": False,
            "trip_status": "COMPLETED",
            "eta": None,
            "message": "This waste report has been resolved and closed. Live GPS tracking is concluded."
        }

    # Find associated route stop
    stops = store.list("route_stops", lambda s: s.get("report_id") == report_id)
    if not stops:
        # Check if directly assigned to vehicle / driver
        if report.get("assigned_vehicle_id"):
            vehicle = store.get("vehicles", report["assigned_vehicle_id"])
            return {
                "has_live_tracking": False,
                "trip_status": "WAITING_DISPATCH",
                "vehicle_number": vehicle.get("vehicle_number") if vehicle else "Assigned",
                "eta": None,
                "message": "Vehicle assigned. Waiting for driver to begin collection run."
            }
        return {
            "has_live_tracking": False,
            "trip_status": "QUEUED",
            "eta": None,
            "message": "Report is awaiting route assignment by municipal operations."
        }

    stop = stops[0]
    route_id = stop["route_id"]
    route = store.get("collection_routes", route_id)
    
    if not route:
        return {"has_live_tracking": False, "trip_status": "QUEUED", "eta": None, "message": "Awaiting route scheduling."}

    if route.get("status") != "IN_PROGRESS":
        return {
            "has_live_tracking": False,
            "trip_status": "SCHEDULED",
            "route_shift": route.get("shift"),
            "scheduled_date": route.get("route_date"),
            "message": f"Assigned to {route.get('shift', 'Daily')} shift. Live tracking will begin once driver starts the route."
        }

    # Check for active tracking session
    sessions = store.list("vehicle_tracking_sessions", lambda s: s.get("route_id") == route_id and s.get("status") == "ACTIVE")
    if not sessions:
        vehicle = store.get("vehicles", route.get("vehicle_id"))
        return {
            "has_live_tracking": False,
            "trip_status": "EN_ROUTE",
            "vehicle_number": vehicle.get("vehicle_number") if vehicle else None,
            "message": "Collection run started; awaiting driver GPS signal."
        }

    session = sessions[0]
    vehicle = store.get("vehicles", route.get("vehicle_id"))
    stale = is_session_stale(session.get("last_ping_at"))

    veh_lat = session.get("current_latitude")
    veh_lon = session.get("current_longitude")
    rep_lat = report.get("latitude") or stop.get("latitude")
    rep_lon = report.get("longitude") or stop.get("longitude")

    eta_time_iso = None
    duration_sec = None
    dist_meters = None
    provider = "UNAVAILABLE"

    if veh_lat and veh_lon and rep_lat and rep_lon:
        eta_time_iso, duration_sec, dist_meters, provider = compute_eta_to_target(
            float(veh_lat), float(veh_lon),
            float(rep_lat), float(rep_lon)
        )

    eta_minutes = round(duration_sec / 60, 1) if duration_sec is not None else None
    dist_km = round(dist_meters / 1000, 2) if dist_meters is not None else None

    return {
        "has_live_tracking": True,
        "trip_status": "EN_ROUTE" if stop.get("status") != "STARTED" else "ARRIVING",
        "vehicle_number": vehicle.get("vehicle_number") if vehicle else "Municipal Truck",
        "vehicle_type": vehicle.get("vehicle_type", "COMPACTOR_TRUCK") if vehicle else "TRUCK",
        "vehicle_location": {
            "latitude": veh_lat,
            "longitude": veh_lon,
            "accuracy_meters": session.get("accuracy_meters"),
            "last_updated": session.get("last_ping_at"),
            "is_stale": stale
        },
        "destination_location": {
            "latitude": float(rep_lat) if rep_lat else None,
            "longitude": float(rep_lon) if rep_lon else None,
            "address": report.get("address_text") or stop.get("target_address")
        },
        "eta": {
            "status": "CALCULATED" if (not stale and eta_time_iso) else ("STALE" if stale else "UNAVAILABLE"),
            "estimated_arrival_time": eta_time_iso,
            "remaining_minutes": eta_minutes,
            "remaining_distance_km": dist_km,
            "provider": provider
        }
    }
