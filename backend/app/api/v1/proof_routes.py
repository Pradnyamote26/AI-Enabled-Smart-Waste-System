from datetime import datetime, timezone
from flask import Blueprint, request, jsonify
from app.api.v1.auth_routes import token_required
from app.repositories.data_store import DataStore
from app.services.cloudinary_service import CloudinaryService
from app.services.ai_service import AIService
from app.services.notification_service import NotificationService

proof_bp = Blueprint("proof_bp", __name__)

@proof_bp.route("/driver/stops/<stop_id>/proof", methods=["POST"])
@token_required(roles=["driver", "admin"])
def submit_stop_proof(stop_id):
    """
    Submits completion proof image for a stop.
    Runs automated AI before/after comparison if original report photo exists.
    """
    store = DataStore.get_instance()
    stop = store.get("route_stops", stop_id)
    if not stop:
        return jsonify({"error": "NOT_FOUND", "message": "Stop not found."}), 404

    data = request.get_json() or {}
    image_payload = data.get("image")
    if not image_payload:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Image payload is required for proof submission."}), 400

    # Upload proof photo
    upload_res = CloudinaryService.upload_image(image_payload, folder="proofs")
    
    # Check if there is an original photo to compare against
    ai_comparison = None
    review_status = "SUBMITTED"
    if stop.get("report_id"):
        orig_imgs = store.list("report_images", lambda img: img.get("report_id") == stop["report_id"] and img.get("image_role") == "ORIGINAL_REPORT")
        if orig_imgs:
            orig_url = orig_imgs[0]["secure_url"]
            # Run real visual comparison
            ai_comparison = AIService.compare_proof_images(orig_url, image_payload)
            review_status = ai_comparison.get("review_status", "NEEDS_REVIEW")

    now_iso = datetime.now(timezone.utc).isoformat()
    proof_record = {
        "route_stop_id": stop_id,
        "report_id": stop.get("report_id"),
        "driver_id": request.current_user["id"],
        "image_url": upload_res["secure_url"],
        "cloudinary_asset_id": upload_res.get("asset_id"),
        "captured_at": now_iso,
        "latitude": data.get("latitude"),
        "longitude": data.get("longitude"),
        "ai_comparison_result": ai_comparison,
        "review_status": review_status,
        "reviewed_by": None,
        "review_notes": None,
        "reviewed_at": None
    }
    created_proof = store.insert("collection_proofs", proof_record)

    # Save also as evidence image on report
    if stop.get("report_id"):
        store.insert("report_images", {
            "report_id": stop["report_id"],
            "cloudinary_asset_id": upload_res.get("asset_id"),
            "secure_url": upload_res["secure_url"],
            "image_role": "EVIDENCE_AFTER",
            "upload_status": "COMPLETED"
        })

    return jsonify({
        "message": "Proof uploaded and analyzed.",
        "proof": created_proof,
        "ai_comparison": ai_comparison
    }), 201

@proof_bp.route("/admin/proofs", methods=["GET"])
@token_required(roles=["admin"])
def list_proofs():
    store = DataStore.get_instance()
    status_filter = request.args.get("status")
    proofs = store.list("collection_proofs")
    if status_filter:
        proofs = [p for p in proofs if p.get("review_status") == status_filter]

    # Enrich proofs with report and driver information
    for p in proofs:
        driver = store.get("profiles", p.get("driver_id"))
        p["driver_name"] = driver.get("full_name") if driver else "Unknown"
        if p.get("report_id"):
            rep = store.get("waste_reports", p["report_id"])
            p["report_number"] = rep.get("report_number") if rep else None
            p["report_type"] = rep.get("report_type") if rep else None
            orig_imgs = store.list("report_images", lambda img: img.get("report_id") == p["report_id"] and img.get("image_role") == "ORIGINAL_REPORT")
            p["original_image_url"] = orig_imgs[0]["secure_url"] if orig_imgs else None

    proofs.sort(key=lambda x: x.get("captured_at", ""), reverse=True)
    return jsonify(proofs)

@proof_bp.route("/admin/proofs/<proof_id>/review", methods=["POST"])
@token_required(roles=["admin"])
def review_proof(proof_id):
    store = DataStore.get_instance()
    proof = store.get("collection_proofs", proof_id)
    if not proof:
        return jsonify({"error": "NOT_FOUND", "message": "Proof not found."}), 404

    data = request.get_json() or {}
    decision = data.get("decision") # APPROVED or REJECTED
    notes = data.get("notes", "").strip()

    if decision not in ["APPROVED", "REJECTED"]:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Decision must be APPROVED or REJECTED."}), 400

    now_iso = datetime.now(timezone.utc).isoformat()
    store.update("collection_proofs", proof_id, {
        "review_status": decision,
        "reviewed_by": request.current_user["id"],
        "review_notes": notes,
        "reviewed_at": now_iso
    })

    # If approved and attached to report, resolve the report!
    if proof.get("report_id"):
        rep = store.get("waste_reports", proof["report_id"])
        if decision == "APPROVED":
            store.update("waste_reports", proof["report_id"], {"status": "RESOLVED"})
            if rep and rep.get("reporter_id"):
                NotificationService.send_notification(
                    user_id=rep["reporter_id"],
                    title="Sanitation Request Resolved",
                    message=f"Collection proof for request {rep.get('report_number')} has been verified by municipal supervisors. Issue marked as resolved.",
                    notif_type="REPORT_RESOLVED",
                    report_id=rep["id"]
                )
        else:
            store.update("waste_reports", proof["report_id"], {"status": "AWAITING_PROOF_REVIEW"})
            if rep and rep.get("reporter_id"):
                NotificationService.send_notification(
                    user_id=rep["reporter_id"],
                    title="Collection Proof Under Additional Review",
                    message=f"Collection proof for request {rep.get('report_number')} requires additional supervisor inspection.",
                    notif_type="REPORT_STATUS",
                    report_id=rep["id"]
                )

    # Audit log
    store.insert("audit_logs", {
        "actor_id": request.current_user["id"],
        "action": f"PROOF_REVIEW_{decision}",
        "entity_type": "collection_proofs",
        "entity_id": proof_id,
        "safe_metadata": {"decision": decision, "notes": notes}
    })

    return jsonify({"message": f"Proof has been {decision}.", "proof": store.get("collection_proofs", proof_id)})
