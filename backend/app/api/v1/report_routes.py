import secrets
import hashlib
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.api.v1.auth_routes import token_required
from app.repositories.data_store import DataStore
from app.services.cloudinary_service import CloudinaryService
from app.services.ai_service import AIService
from app.services.notification_service import NotificationService
from app.services.security_service import SecurityService
from app.policies.workflow_policy import WorkflowPolicy

report_bp = Blueprint("report_bp", __name__)

# ============================================================================
# PUBLIC REPORT SUBMISSION & REVERSE GEOCODING
# ============================================================================
@report_bp.route("/public/reverse-geocode", methods=["GET"])
def reverse_geocode():
    """
    Reverse geocodes latitude & longitude into a human-friendly address and street landmark.
    Uses OpenStreetMap Nominatim with local municipal store fallback.
    """
    try:
        lat = float(request.args.get("lat"))
        lng = float(request.args.get("lng"))
    except (TypeError, ValueError):
        return jsonify({"success": False, "error": "Invalid or missing lat/lng coordinates"}), 400

    try:
        import requests
        url = f"https://nominatim.openstreetmap.org/reverse?lat={lat}&lon={lng}&format=jsonv2"
        headers = {"User-Agent": "EcoRoute-SmartWaste/1.0 (municipal waste management system)"}
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code == 200:
            data = resp.json()
            address_obj = data.get("address", {})
            road = address_obj.get("road") or address_obj.get("pedestrian") or address_obj.get("street") or address_obj.get("residential")
            suburb = address_obj.get("suburb") or address_obj.get("neighbourhood") or address_obj.get("subdistrict")
            city = address_obj.get("city") or address_obj.get("town") or address_obj.get("county")
            landmark = address_obj.get("amenity") or address_obj.get("building") or address_obj.get("house_name")

            components = []
            if landmark:
                components.append(landmark)
            if road:
                components.append(road)
            if suburb:
                components.append(suburb)
            if city:
                components.append(city)

            friendly_name = ", ".join(components) if components else data.get("display_name", "")
            return jsonify({
                "success": True,
                "address": friendly_name,
                "full_address": data.get("display_name", friendly_name),
                "details": address_obj
            })
    except Exception as e:
        pass

    # Municipal fallback: find nearest known building or service area
    store = DataStore.get_instance()
    nearest_building = None
    min_dist = float("inf")
    for b in store.get_all("buildings"):
        b_lat, b_lng = b.get("latitude"), b.get("longitude")
        if b_lat is not None and b_lng is not None:
            dist = (b_lat - lat)**2 + (b_lng - lng)**2
            if dist < min_dist:
                min_dist = dist
                nearest_building = b

    if nearest_building and min_dist < 0.002: # Within ~4km
        return jsonify({
            "success": True,
            "address": f"Near {nearest_building.get('name')}, {nearest_building.get('address', '')}",
            "full_address": f"{nearest_building.get('name')}, {nearest_building.get('address', '')}"
        })

    return jsonify({
        "success": True,
        "address": f"Pin at {lat:.5f}, {lng:.5f}",
        "full_address": f"Coordinates: {lat:.5f}, {lng:.5f}"
    })

@report_bp.route("/public/reports", methods=["POST"])
def submit_public_report():
    """
    Submits waste report anonymously or from public portal (AC-07, AC-08).
    Creates cryptographic tracking token, runs real AI inference, uploads image.
    Automatically links reporter_id if user is authenticated with a JWT token.
    Prevents accidental repeated clicks/submissions within 30 seconds.
    """
    data = request.get_json() or {}
    report_type = data.get("report_type", "NO_BIN_GARBAGE")
    lat = float(data.get("latitude", 19.0760))
    lon = float(data.get("longitude", 72.9975))
    address = data.get("address_text", "").strip()
    description = data.get("description", "").strip()
    qr_token = data.get("qr_token")
    dustbin_id = data.get("dustbin_id")
    building_id = data.get("building_id")
    image_payload = data.get("image") # base64 string or file
    reporter_contact = data.get("reporter_contact", "")

    store = DataStore.get_instance()

    # Extract reporter_id from token if Authorization header is present
    reporter_id = data.get("reporter_id")
    if not reporter_id:
        auth_header = request.headers.get("Authorization")
        if auth_header and "Bearer " in auth_header:
            raw_jwt = auth_header.split("Bearer ")[1].strip()
            decoded = SecurityService.decode_jwt(raw_jwt)
            if decoded and "sub" in decoded:
                reporter_id = decoded["sub"]

    # Deduplication Guard: prevent duplicate submissions within 5 seconds (anti-double-click)
    now_dt = datetime.now(timezone.utc)
    def is_rapid_double_click(r):
        if not (r.get("report_type") == report_type and
                abs(r.get("latitude", 0) - lat) < 0.0001 and
                abs(r.get("longitude", 0) - lon) < 0.0001 and
                r.get("description", "").strip() == description and
                r.get("status") in ["SUBMITTED", "PENDING_REVIEW"]):
            return False
        try:
            created_dt = datetime.fromisoformat(r.get("created_at", "").replace("Z", "+00:00"))
            return (now_dt - created_dt).total_seconds() < 5
        except Exception:
            return False

    recent_dups = store.list("waste_reports", is_rapid_double_click)
    if recent_dups:
        existing = recent_dups[0]
        return jsonify({
            "message": "Existing report found with identical category and location.",
            "report_number": existing["report_number"],
            "tracking_token": existing.get("tracking_token"),
            "display_id": existing.get("tracking_token_display"),
            "status": existing["status"],
            "priority": existing["priority"],
            "is_duplicate_prevented": True
        }), 201

    # If QR token is passed, lookup dustbin
    if qr_token:
        matching_bins = store.list("dustbins", lambda b: b.get("qr_public_token") == qr_token and b.get("qr_active"))
        if matching_bins:
            dustbin_id = matching_bins[0]["id"]
            if not building_id:
                building_id = matching_bins[0].get("building_id")

    # Generate unguessable tracking token (32 chars)
    raw_tracking_token = secrets.token_urlsafe(24)
    token_hash = hashlib.sha256(raw_tracking_token.encode()).hexdigest()
    
    # Sequential-looking display number (REP-2026-XXXX)
    count = len(store.list("waste_reports")) + 1
    report_number = f"REP-2026-{count:04d}"
    report_id = str(uuid.uuid4())

    now_iso = datetime.now(timezone.utc).isoformat()
    masked_contact = None
    if reporter_contact and "@" in reporter_contact:
        parts = reporter_contact.split("@")
        masked_contact = f"{parts[0][:2]}***@{parts[1]}"
    elif reporter_contact:
        masked_contact = f"***{reporter_contact[-4:]}"

    report_record = {
        "id": report_id,
        "report_number": report_number,
        "report_type": report_type,
        "dustbin_id": dustbin_id,
        "building_id": building_id,
        "reporter_id": reporter_id,
        "anonymous_token_hash": token_hash,
        "tracking_token": raw_tracking_token,
        "tracking_token_display": f"TRK-{report_number[-4:]}",
        "reporter_contact_masked": masked_contact,
        "latitude": lat,
        "longitude": lon,
        "address_text": address or "GPS Pin Location",
        "description": description,
        "status": "SUBMITTED",
        "priority": "MEDIUM",
        "priority_suggested_by_ai": None,
        "assigned_driver_id": None,
        "assigned_vehicle_id": None,
        "photo_required": True, # Public complaints require proof upon resolution
        "rejection_reason": None,
        "admin_notes": None,
        "created_at": now_iso
    }

    # Upload Image & Run AI Analysis if provided
    ai_result = None
    uploaded_image_url = None
    if image_payload:
        upload_resp = CloudinaryService.upload_image(image_payload, folder="reports")
        uploaded_image_url = upload_resp["secure_url"]

        img_record = store.insert("report_images", {
            "report_id": report_id,
            "cloudinary_asset_id": upload_resp.get("asset_id"),
            "secure_url": upload_resp["secure_url"],
            "image_role": "ORIGINAL_REPORT",
            "upload_status": upload_resp.get("upload_status", "COMPLETED")
        })

        # Run Real AI Inference
        ai_resp = AIService.analyze_waste_image(image_payload, report_type=report_type)
        ai_analysis_record = store.insert("ai_analyses", {
            "report_id": report_id,
            "image_id": img_record["id"],
            "analysis_type": "WASTE_CLASSIFICATION",
            "model_name": ai_resp["model_name"],
            "model_version": ai_resp["model_version"],
            "result": ai_resp["result"],
            "confidence": ai_resp["confidence"],
            "status": ai_resp["status"],
            "error_message": ai_resp.get("error_message")
        })

        ai_result = ai_resp
        if ai_resp.get("result"):
            suggested_pri = ai_resp["result"].get("recommended_priority")
            report_record["priority_suggested_by_ai"] = suggested_pri
            report_record["priority"] = suggested_pri or "MEDIUM"
            report_record["triage_queue"] = ai_resp["result"].get("triage_queue", "GENERAL_COMPACTOR")
            report_record["status"] = "PENDING_REVIEW"

        # Duplicate detection check
        active_reports = store.list("waste_reports", lambda r: r.get("status") not in ["REJECTED", "CANCELLED"])
        candidates = AIService.detect_duplicate_reports(
            candidate_report=report_record,
            existing_reports=active_reports,
            max_distance_meters=150.0,
            max_hours_diff=48.0
        )
        if candidates:
            report_record["is_potential_duplicate"] = True
            report_record["duplicate_candidate_count"] = len(candidates)
            report_record["duplicate_candidates"] = candidates[:3]

    store.insert("waste_reports", report_record)

    # Initial notification if resident is registered
    if reporter_id:
        NotificationService.send_notification(
            user_id=reporter_id,
            title="Sanitation Request Received",
            message=f"Request {report_number} has been logged for municipal inspection.",
            notif_type="REPORT_STATUS",
            report_id=report_id
        )

    return jsonify({
        "message": "Waste report submitted successfully.",
        "report_number": report_number,
        "tracking_token": raw_tracking_token,
        "display_id": report_record["tracking_token_display"],
        "status": report_record["status"],
        "priority": report_record["priority"],
        "ai_analysis": ai_result
    }), 201

@report_bp.route("/public/track/<tracking_token>", methods=["GET"])
def track_report_by_token(tracking_token):
    token_hash = hashlib.sha256(tracking_token.strip().encode()).hexdigest()
    store = DataStore.get_instance()
    
    matches = store.list("waste_reports", lambda r: r.get("anonymous_token_hash") == token_hash)
    if not matches:
        return jsonify({"error": "NOT_FOUND", "message": "No report found matching this tracking token."}), 404

    report = matches[0]
    images = store.list("report_images", lambda img: img.get("report_id") == report["id"])
    ai_records = store.list("ai_analyses", lambda a: a.get("report_id") == report["id"])
    complaints = store.list("missed_collection_complaints", lambda c: c.get("tracking_token_hash") == token_hash)
    raw_followups = store.list("report_followups", lambda f: f.get("report_id") == report["id"])
    followups = [{**f, "reason": f.get("reason") or f.get("citizen_reason")} for f in raw_followups]
    
    # Audit trail timeline
    audit_entries = store.list("audit_logs", lambda a: a.get("entity_id") == report["id"])
    audit_entries.sort(key=lambda a: a.get("created_at", ""))

    timeline = [{
        "status": "SUBMITTED",
        "label": "Report Submitted & Logged",
        "timestamp": report.get("created_at"),
        "note": "Sanitation request recorded and queued for municipal inspection."
    }]
    for a in audit_entries:
        action = a.get("action", "")
        meta = a.get("safe_metadata", {})
        if action.startswith("REPORT_TRANSITION_") or action == "CITIZEN_REOPEN_REPORT":
            new_st = meta.get("new_status") or action.replace("REPORT_TRANSITION_", "")
            timeline.append({
                "status": new_st,
                "label": f"Status: {new_st.replace('_', ' ').title()}",
                "timestamp": a.get("created_at"),
                "note": meta.get("reason") or meta.get("citizen_reason") or "Status transition verified."
            })

    # Verified collection proofs
    proofs = store.list("collection_proofs", lambda p: p.get("report_id") == report["id"])
    safe_proofs = [{
        "id": p["id"],
        "secure_url": p.get("image_url"),
        "review_status": p.get("review_status", "APPROVED"),
        "timestamp": p.get("created_at")
    } for p in proofs if p.get("image_url")]

    # Vehicle info (without driver PII)
    vehicle = store.get("vehicles", report.get("assigned_vehicle_id")) if report.get("assigned_vehicle_id") else None

    from app.api.v1.tracking_routes import get_public_live_tracking_for_report
    live_tracking = get_public_live_tracking_for_report(report)

    safe_payload = {
        "report_number": report.get("report_number"),
        "report_type": report.get("report_type"),
        "status": report.get("status"),
        "priority": report.get("priority"),
        "address_text": report.get("address_text"),
        "description": report.get("description"),
        "created_at": report.get("created_at"),
        "resolved_at": report.get("resolved_at"),
        "status_reason": report.get("status_transition_reason"),
        "rejection_reason": report.get("rejection_reason"),
        "reopen_reason": report.get("reopen_reason"),
        "assigned_vehicle": {
            "vehicle_number": vehicle.get("vehicle_number"),
            "vehicle_type": vehicle.get("vehicle_type")
        } if vehicle else None,
        "images": [{"secure_url": img["secure_url"], "role": img.get("image_role")} for img in images],
        "ai_summary": ai_records[0].get("result") if ai_records else None,
        "complaints": complaints,
        "followups": followups,
        "proofs": safe_proofs,
        "timeline": timeline,
        "status_timeline": timeline,
        "live_tracking": live_tracking
    }

    return jsonify(safe_payload)

@report_bp.route("/public/reports/<tracking_token>/reopen", methods=["POST"])
def reopen_public_report(tracking_token):
    """
    Allows a citizen to indicate that a reported issue remains unresolved after collection.
    Creates follow-up record, resets report to REOPENED, logs audit entry, and alerts administrators.
    """
    token_hash = hashlib.sha256(tracking_token.strip().encode()).hexdigest()
    store = DataStore.get_instance()
    
    matches = store.list("waste_reports", lambda r: r.get("anonymous_token_hash") == token_hash)
    if not matches:
        return jsonify({"error": "NOT_FOUND", "message": "Invalid tracking token."}), 404

    report = matches[0]
    data = request.get_json() or {}
    reason = data.get("reason", "").strip()
    image_payload = data.get("image")

    if not reason:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Please specify why the collection remains unresolved."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    photo_url = None
    if image_payload:
        upload_resp = CloudinaryService.upload_image(image_payload, folder="followups")
        photo_url = upload_resp.get("secure_url")

    count = len(store.list("report_followups")) + 1
    followup_id = f"fol-{uuid.uuid4().hex[:8]}"
    followup = store.insert("report_followups", {
        "id": followup_id,
        "followup_number": f"FOL-2026-{count:04d}",
        "report_id": report["id"],
        "report_number": report["report_number"],
        "citizen_reason": reason,
        "reason": reason,
        "photo_url": photo_url,
        "status": "UNDER_INVESTIGATION",
        "created_at": now_iso
    })

    # Update report status
    updated_report = store.update("waste_reports", report["id"], {
        "status": "REOPENED",
        "reopen_reason": reason,
        "reopened_at": now_iso,
        "unresolved_alert": True
    })

    # Audit log
    store.insert("audit_logs", {
        "actor_id": report.get("reporter_id") or "ANONYMOUS_CITIZEN",
        "action": "CITIZEN_REOPEN_REPORT",
        "entity_type": "waste_reports",
        "entity_id": report["id"],
        "safe_metadata": {
            "previous_status": report.get("status"),
            "new_status": "REOPENED",
            "citizen_reason": reason,
            "has_evidence_photo": photo_url is not None
        }
    })

    # Alert administrators
    admins = store.list("profiles", lambda p: p.get("role") == "admin")
    for adm in admins:
        NotificationService.send_notification(
            user_id=adm["id"],
            title=f"Report Reopened: {report['report_number']}",
            message=f"Resident reported collection still unresolved: '{reason[:75]}...'",
            notif_type="REPORT_UNRESOLVED",
            report_id=report["id"]
        )

    return jsonify({
        "message": "Follow-up request received. Municipal supervisors have been alerted.",
        "followup": followup,
        "status": "REOPENED",
        "report_status": "REOPENED"
    }), 200

@report_bp.route("/public/reports/<tracking_token>/missed-collection", methods=["POST"])
def file_missed_collection(tracking_token):
    token_hash = hashlib.sha256(tracking_token.strip().encode()).hexdigest()
    store = DataStore.get_instance()
    
    matches = store.list("waste_reports", lambda r: r.get("anonymous_token_hash") == token_hash)
    if not matches:
        return jsonify({"error": "NOT_FOUND", "message": "Invalid tracking token."}), 404

    report = matches[0]
    data = request.get_json() or {}
    text = data.get("complaint_text", "").strip()
    if not text:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Complaint text is required."}), 400

    count = len(store.list("missed_collection_complaints")) + 1
    complaint_no = f"CMP-2026-{count:04d}"

    complaint = store.insert("missed_collection_complaints", {
        "complaint_number": complaint_no,
        "building_id": report.get("building_id"),
        "dustbin_id": report.get("dustbin_id"),
        "tracking_token_hash": token_hash,
        "complaint_text": text,
        "status": "OPEN",
        "resolution_note": None
    })

    return jsonify({"message": "Missed collection complaint filed.", "complaint": complaint}), 201

@report_bp.route("/public/schedules", methods=["GET"])
def get_public_schedules():
    """
    Publicly browsable collection schedules enriched with service area,
    building names, address, weekday, and collection time windows.
    """
    store = DataStore.get_instance()
    area_filter = request.args.get("service_area_id")
    building_filter = request.args.get("building_id")
    weekday_filter = request.args.get("weekday")

    schedules = store.list("collection_schedules", lambda s: s.get("is_active", True))
    areas = {a["id"]: a for a in store.list("service_areas", lambda a: a.get("is_active", True))}
    buildings = {b["id"]: b for b in store.list("buildings", lambda b: b.get("is_active", True))}
    dustbins = {d["id"]: d for d in store.list("dustbins", lambda d: d.get("is_active", True))}
    vehicles = {v["id"]: v for v in store.list("vehicles")}

    weekdays_map = {
        0: "Sunday", 1: "Monday", 2: "Tuesday", 3: "Wednesday",
        4: "Thursday", 5: "Friday", 6: "Saturday"
    }

    enriched = []
    for s in schedules:
        if area_filter and s.get("service_area_id") != area_filter:
            continue
        if building_filter and s.get("building_id") != building_filter:
            continue
        if weekday_filter is not None and str(s.get("weekday")) != str(weekday_filter):
            continue

        b = buildings.get(s.get("building_id"))
        d = dustbins.get(s.get("dustbin_id"))
        a = areas.get(s.get("service_area_id"))
        v = vehicles.get(s.get("vehicle_id"))

        enriched.append({
            "id": s["id"],
            "title": s.get("title", "Collection Run"),
            "stop_type": s.get("stop_type", "BUILDING"),
            "service_area_id": s.get("service_area_id"),
            "service_area_name": a.get("name") if a else "Municipal General Ward",
            "building_id": s.get("building_id"),
            "building_name": b.get("name") if b else (d.get("bin_code") if d else "General Residential"),
            "building_address": b.get("address") if b else None,
            "dustbin_code": d.get("bin_code") if d else None,
            "weekday": s.get("weekday", 1),
            "day_of_week": s.get("weekday", 1),
            "weekday_name": weekdays_map.get(s.get("weekday", 1), "Scheduled Day"),
            "day_name": weekdays_map.get(s.get("weekday", 1), "Scheduled Day"),
            "shift": s.get("shift", "MORNING"),
            "start_window": s.get("start_window", "06:30:00"),
            "end_window": s.get("end_window", "10:30:00"),
            "time_window": f"{s.get('start_window', '06:30:00')[:5]} - {s.get('end_window', '10:30:00')[:5]}",
            "vehicle_type": v.get("vehicle_type") if v else "COMPACTOR_TRUCK",
            "is_active": s.get("is_active", True)
        })

    enriched.sort(key=lambda s: (s["weekday"], s["start_window"]))

    return jsonify({
        "schedules": enriched,
        "count": len(enriched),
        "service_areas": [{"id": a["id"], "name": a["name"], "code": a.get("code")} for a in areas.values()],
        "buildings": [{"id": b["id"], "name": b["name"], "address": b.get("address")} for b in buildings.values()]
    })

@report_bp.route("/public/announcements", methods=["GET"])
def get_public_announcements():
    """
    Public official municipal bulletins, weather advisories, and service notices.
    """
    store = DataStore.get_instance()
    announcements = store.list("service_announcements", lambda a: a.get("is_active", True))
    enriched_ann = []
    for a in announcements:
        item = dict(a)
        if "created_at" not in item:
            item["created_at"] = item.get("published_at") or datetime.now(timezone.utc).isoformat()
        enriched_ann.append(item)
    enriched_ann.sort(key=lambda a: a.get("published_at") or a.get("created_at", ""), reverse=True)
    return jsonify({
        "announcements": enriched_ann,
        "count": len(enriched_ann)
    })

@report_bp.route("/public/my-reports", methods=["GET"])
@token_required(roles=["reporter", "admin", "driver"])
def get_resident_my_reports():
    """
    Returns waste reports submitted by the logged-in resident with display tokens.
    """
    store = DataStore.get_instance()
    user_id = request.current_user["id"]
    reports = store.list("waste_reports", lambda r: r.get("reporter_id") == user_id)
    reports.sort(key=lambda r: r.get("created_at", ""), reverse=True)
    out = []
    for r in reports:
        item = dict(r)
        item["tracking_token_display"] = item.get("tracking_token") or item.get("tracking_token_display")
        out.append(item)
    return jsonify(out)

@report_bp.route("/citizen/notifications", methods=["GET"])
@token_required(roles=["reporter", "admin"])
def get_citizen_notifications():
    """
    Returns notifications dispatched for the authenticated resident.
    """
    store = DataStore.get_instance()
    user_id = request.current_user["id"]
    notifs = store.list("notifications", lambda n: n.get("user_id") == user_id)
    notifs.sort(key=lambda n: n.get("created_at", ""), reverse=True)
    unread_count = len([n for n in notifs if not n.get("read_at")])
    return jsonify({
        "notifications": notifs,
        "unread_count": unread_count
    })

@report_bp.route("/citizen/notifications/<notif_id>/read", methods=["PATCH"])
@token_required(roles=["reporter", "admin"])
def mark_citizen_notification_read(notif_id):
    store = DataStore.get_instance()
    user_id = request.current_user["id"]
    notif = store.get("notifications", notif_id)
    if not notif or notif.get("user_id") != user_id:
        return jsonify({"error": "NOT_FOUND", "message": "Notification not found."}), 404
    
    updated = store.update("notifications", notif_id, {
        "read_at": datetime.now(timezone.utc).isoformat()
    })
    return jsonify(updated)

@report_bp.route("/citizen/notifications/mark-all-read", methods=["POST"])
@token_required(roles=["reporter", "admin"])
def mark_all_citizen_notifications_read():
    store = DataStore.get_instance()
    user_id = request.current_user["id"]
    now_iso = datetime.now(timezone.utc).isoformat()
    notifs = store.list("notifications", lambda n: n.get("user_id") == user_id and not n.get("read_at"))
    for n in notifs:
        store.update("notifications", n["id"], {"read_at": now_iso})
    return jsonify({"success": True, "message": f"{len(notifs)} notifications marked as read."})

@report_bp.route("/reports/mine", methods=["GET"])
@token_required(roles=["reporter", "admin"])
def get_my_reports():
    store = DataStore.get_instance()
    user_id = request.current_user["id"]
    reports = store.list("waste_reports", lambda r: r.get("reporter_id") == user_id)
    reports.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    return jsonify(reports)


# ============================================================================
# ACTIONABLE ADMIN REPORTS MANAGEMENT (PHASE 3)
# ============================================================================
@report_bp.route("/admin/reports", methods=["GET"])
@token_required(roles=["admin"])
def list_admin_reports():
    store = DataStore.get_instance()
    status_filter = request.args.get("status")
    type_filter = request.args.get("type")
    priority_filter = request.args.get("priority")
    search_query = request.args.get("search", "").strip().lower()
    page = int(request.args.get("page", 1))
    per_page = int(request.args.get("per_page", 25))

    reports = store.list("waste_reports")
    buildings = {b["id"]: b["name"] for b in store.list("buildings")}
    dustbins = {d["id"]: d["bin_code"] for d in store.list("dustbins")}
    drivers = {p["id"]: p["full_name"] for p in store.list("profiles", lambda p: p.get("role") == "driver")}
    vehicles = {v["id"]: v["vehicle_number"] for v in store.list("vehicles")}

    # Filters
    if status_filter:
        reports = [r for r in reports if r.get("status") == status_filter]
    if type_filter:
        reports = [r for r in reports if r.get("report_type") == type_filter]
    if priority_filter:
        reports = [r for r in reports if r.get("priority") == priority_filter]
    if search_query:
        reports = [r for r in reports if (
            search_query in r.get("report_number", "").lower() or
            search_query in r.get("description", "").lower() or
            search_query in r.get("address_text", "").lower() or
            search_query in r.get("tracking_token_display", "").lower()
        )]

    reports.sort(key=lambda x: x.get("created_at", ""), reverse=True)
    total_count = len(reports)

    # Paginate
    start_idx = (page - 1) * per_page
    paginated_reports = reports[start_idx : start_idx + per_page]

    # Enrich reports with images, AI inference, and linked entities
    for r in paginated_reports:
        r["images"] = store.list("report_images", lambda img: img.get("report_id") == r["id"])
        ai_runs = store.list("ai_analyses", lambda a: a.get("report_id") == r["id"])
        r["ai_analysis"] = ai_runs[0] if ai_runs else None
        r["building_name"] = buildings.get(r.get("building_id"))
        r["dustbin_code"] = dustbins.get(r.get("dustbin_id"))
        r["assigned_driver_name"] = drivers.get(r.get("assigned_driver_id"))
        r["assigned_vehicle_number"] = vehicles.get(r.get("assigned_vehicle_id"))
        
        # Check if proof submitted
        proofs = store.list("collection_proofs", lambda p: p.get("report_id") == r["id"])
        r["collection_proof"] = proofs[0] if proofs else None

    return jsonify({
        "reports": paginated_reports,
        "total_count": total_count,
        "page": page,
        "per_page": per_page
    })

@report_bp.route("/admin/reports/<report_id>", methods=["GET"])
@token_required(roles=["admin"])
def get_report_details(report_id):
    store = DataStore.get_instance()
    report = store.get("waste_reports", report_id)
    if not report:
        return jsonify({"error": "NOT_FOUND", "message": "Report not found."}), 404

    # Comprehensive relations
    images = store.list("report_images", lambda img: img.get("report_id") == report_id)
    ai_runs = store.list("ai_analyses", lambda a: a.get("report_id") == report_id)
    proofs = store.list("collection_proofs", lambda p: p.get("report_id") == report_id)
    complaints = store.list("missed_collection_complaints", lambda c: c.get("building_id") == report.get("building_id") or c.get("dustbin_id") == report.get("dustbin_id"))
    audit_history = store.list("audit_logs", lambda a: a.get("entity_id") == report_id)
    audit_history.sort(key=lambda a: a.get("created_at", ""), reverse=True)

    driver = store.get("profiles", report.get("assigned_driver_id")) if report.get("assigned_driver_id") else None
    if driver: driver.pop("password_hash", None)
    vehicle = store.get("vehicles", report.get("assigned_vehicle_id")) if report.get("assigned_vehicle_id") else None
    building = store.get("buildings", report.get("building_id")) if report.get("building_id") else None
    dustbin = store.get("dustbins", report.get("dustbin_id")) if report.get("dustbin_id") else None

    return jsonify({
        **report,
        "images": images,
        "ai_analysis": ai_runs[0] if ai_runs else None,
        "proofs": proofs,
        "related_complaints": complaints,
        "driver": driver,
        "vehicle": vehicle,
        "building": building,
        "dustbin": dustbin,
        "audit_history": audit_history
    })

@report_bp.route("/admin/reports/<report_id>/transition", methods=["PATCH"])
@token_required(roles=["admin"])
def transition_report_status(report_id):
    """
    Enforces status-aware transition machine with mandatory reasons,
    audit records, and safe assignment/reopening rules.
    """
    store = DataStore.get_instance()
    report = store.get("waste_reports", report_id)
    if not report:
        return jsonify({"error": "NOT_FOUND", "message": "Report not found."}), 404

    data = request.get_json() or {}
    new_status = data.get("status")
    reason = data.get("reason", "").strip()
    priority = data.get("priority")
    admin_notes = data.get("admin_notes")

    if not new_status:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Target status is required."}), 400

    current_status = report.get("status", "SUBMITTED")
    
    # State Machine Validation
    is_valid, err_msg = WorkflowPolicy.validate_report_transition(current_status, new_status, reason)
    if not is_valid:
        return jsonify({"error": "INVALID_STATE_TRANSITION", "message": err_msg}), 400

    updates = {"status": new_status}
    if priority:
        updates["priority"] = priority
    if admin_notes is not None:
        updates["admin_notes"] = admin_notes
    if reason:
        updates["status_transition_reason"] = reason

    # Status-specific side effects
    if new_status in ["REJECTED", "DUPLICATE", "CANCELLED"]:
        updates["rejection_reason"] = reason
        updates["assigned_driver_id"] = None
        updates["assigned_vehicle_id"] = None
    elif new_status == "REOPENED":
        updates["status"] = "PENDING_REVIEW" # Reset to pending review upon reopening
        updates["reopen_reason"] = reason
    elif new_status == "RESOLVED":
        updates["resolved_at"] = datetime.now(timezone.utc).isoformat()
        updates["resolved_by"] = request.current_user["id"]

    updated_report = store.update("waste_reports", report_id, updates)

    # Immutable Audit Log
    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": f"REPORT_TRANSITION_{new_status}",
        "entity_type": "waste_reports",
        "entity_id": report_id,
        "safe_metadata": {
            "previous_status": current_status,
            "new_status": updated_report["status"],
            "reason": reason,
            "priority": updated_report.get("priority")
        }
    })

    # Notify reporter if registered
    if report.get("reporter_id"):
        status_labels = {
            "APPROVED": "Report Approved for Dispatch",
            "REJECTED": "Report Closed",
            "IN_COLLECTION": "Collection Underway",
            "COMPLETED": "Collection Completed",
            "RESOLVED": "Sanitation Request Resolved",
            "PENDING_REVIEW": "Report Under Active Review"
        }
        title = status_labels.get(new_status, f"Report Status Updated: {new_status}")
        msg = f"Your request {report.get('report_number')} has transitioned to {new_status}."
        if reason:
            msg += f" Note: {reason}"
        NotificationService.send_notification(
            user_id=report["reporter_id"],
            title=title,
            message=msg,
            notif_type="REPORT_STATUS",
            report_id=report_id
        )

    return jsonify({
        "message": f"Report {report.get('report_number')} moved from {current_status} to {updated_report['status']}.",
        "report": updated_report
    })

@report_bp.route("/admin/reports/<report_id>/override-ai", methods=["POST", "PATCH"])
@report_bp.route("/admin/reports/<report_id>/ai-override", methods=["POST", "PATCH"])
@token_required(roles=["admin"])
def override_report_ai(report_id):
    """
    Allows authorized administrators to override an AI classification or priority recommendation.
    Preserves both the original AI prediction and human correction for model auditing.
    """
    store = DataStore.get_instance()
    report = store.get("waste_reports", report_id)
    if not report:
        return jsonify({"error": "NOT_FOUND", "message": "Report not found."}), 404

    data = request.get_json() or {}
    new_category = data.get("category")
    new_priority = data.get("priority")
    override_reason = (data.get("reason") or data.get("notes") or "").strip() or "Administrator manual inspection override"

    now_iso = datetime.now(timezone.utc).isoformat()
    ai_runs = store.list("ai_analyses", lambda a: a.get("report_id") == report_id)

    original_category = report.get("report_type")
    original_confidence = None
    if ai_runs:
        ai_res = ai_runs[0].get("result") or {}
        original_category = ai_res.get("primary_category") or report.get("report_type")
        original_confidence = ai_runs[0].get("confidence")
        store.update("ai_analyses", ai_runs[0]["id"], {
            "is_overridden": True,
            "overridden_category": new_category or report.get("report_type"),
            "overridden_priority": new_priority or report.get("priority"),
            "override_reason": override_reason,
            "overridden_by": request.current_user["id"],
            "overridden_at": now_iso
        })

    updates = {
        "ai_overridden": True,
        "ai_override_reason": override_reason,
        "ai_overridden_by": request.current_user["id"],
        "ai_overridden_at": now_iso,
        "original_ai_category": original_category,
        "original_ai_confidence": original_confidence
    }
    if new_category:
        updates["report_type"] = new_category
    if new_priority:
        updates["priority"] = new_priority

    updated_report = store.update("waste_reports", report_id, updates)

    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "ADMIN_OVERRIDE_AI",
        "entity_type": "waste_reports",
        "entity_id": report_id,
        "safe_metadata": {
            "report_number": report.get("report_number"),
            "original_category": original_category,
            "new_category": new_category,
            "original_priority": report.get("priority"),
            "new_priority": new_priority,
            "reason": override_reason
        }
    })

    return jsonify({
        "message": f"AI prediction successfully overridden for report {report.get('report_number')}.",
        "report": updated_report
    })

@report_bp.route("/admin/reports/<report_id>/assign", methods=["POST"])
@token_required(roles=["admin"])
def assign_report_crew(report_id):
    """
    Assigns vehicle & driver to an approved waste report.
    If no vehicle is available, moves report into WAITING_FOR_VEHICLE queue.
    """
    store = DataStore.get_instance()
    report = store.get("waste_reports", report_id)
    if not report:
        return jsonify({"error": "NOT_FOUND", "message": "Report not found."}), 404

    data = request.get_json() or {}
    vehicle_id = data.get("vehicle_id")
    driver_id = data.get("driver_id")
    queue_if_unavailable = data.get("queue_if_unavailable", True)
    priority = data.get("priority", report.get("priority", "MEDIUM"))

    # If vehicle/driver omitted or set to wait
    if not vehicle_id or not driver_id:
        if queue_if_unavailable:
            store.update("waste_reports", report_id, {
                "status": "WAITING_FOR_VEHICLE",
                "priority": priority,
                "waiting_since": datetime.now(timezone.utc).isoformat()
            })
            store.insert("audit_logs", {
                "actor_id": request.current_user["id"],
                "action": "REPORT_QUEUED_WAITING_FOR_VEHICLE",
                "entity_type": "waste_reports",
                "entity_id": report_id,
                "safe_metadata": {"reason": "No vehicle or driver immediately available."}
            })
            return jsonify({
                "message": "Report placed in 'Waiting for Vehicle' queue.",
                "report": store.get("waste_reports", report_id)
            })
        else:
            return jsonify({"error": "VALIDATION_ERROR", "message": "Both vehicle and driver are required for immediate dispatch."}), 400

    # Validate vehicle and driver existence and availability
    vehicle = store.get("vehicles", vehicle_id)
    driver = store.get("profiles", driver_id)
    if not vehicle or not vehicle.get("is_active"):
        return jsonify({"error": "BAD_REQUEST", "message": "Selected vehicle is inactive or invalid."}), 400
    if not driver or not driver.get("is_active"):
        return jsonify({"error": "BAD_REQUEST", "message": "Selected driver is inactive or invalid."}), 400

    # Conflict check with active routes
    today_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    conflict_ok, conflict_err = WorkflowPolicy.check_assignment_conflicts(
        store=store,
        vehicle_id=vehicle_id,
        driver_id=driver_id,
        route_date=today_str,
        shift="MORNING"
    )
    if not conflict_ok:
        if queue_if_unavailable:
            store.update("waste_reports", report_id, {
                "status": "WAITING_FOR_VEHICLE",
                "priority": priority,
                "conflict_note": conflict_err,
                "waiting_since": datetime.now(timezone.utc).isoformat()
            })
            return jsonify({
                "message": f"Conflict detected ({conflict_err}). Report held in 'Waiting for Vehicle' queue.",
                "report": store.get("waste_reports", report_id)
            }), 409
        return jsonify({"error": "ASSIGNMENT_CONFLICT", "message": conflict_err}), 409

    # Update report
    updated = store.update("waste_reports", report_id, {
        "status": "ASSIGNED",
        "assigned_vehicle_id": vehicle_id,
        "assigned_driver_id": driver_id,
        "priority": priority,
        "assigned_at": datetime.now(timezone.utc).isoformat()
    })

    # Record driver assignment
    store.insert("driver_assignments", {
        "report_id": report_id,
        "driver_id": driver_id,
        "vehicle_id": vehicle_id,
        "assigned_by": request.current_user["id"],
        "assigned_at": datetime.now(timezone.utc).isoformat(),
        "status": "ACTIVE",
        "notes": f"Dispatch for Report {report.get('report_number')}"
    })

    # Send Notification to Driver
    NotificationService.send_notification(
        user_id=driver_id,
        title="New Waste Collection Assigned",
        message=f"You have been assigned to collect Report {report.get('report_number')} at {report.get('address_text', 'Location')}.",
        notif_type="TASK_ASSIGNED"
    )

    # Notify Resident if registered
    if report.get("reporter_id"):
        NotificationService.send_notification(
            user_id=report["reporter_id"],
            title="Collection Vehicle Assigned",
            message=f"Collection unit ({vehicle.get('vehicle_number')}) has been assigned to your request {report.get('report_number')}.",
            notif_type="REPORT_ASSIGNED",
            report_id=report_id
        )

    # Audit log
    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": "ASSIGN_REPORT_CREW",
        "entity_type": "waste_reports",
        "entity_id": report_id,
        "safe_metadata": {
            "vehicle_number": vehicle.get("vehicle_number"),
            "driver_name": driver.get("full_name")
        }
    })

    return jsonify({"message": f"Report assigned to {driver.get('full_name')} ({vehicle.get('vehicle_number')}).", "report": updated})

