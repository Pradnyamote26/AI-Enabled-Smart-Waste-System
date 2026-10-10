import os
import json
from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
from app.api.v1.auth_routes import token_required
from app.services.ai_service import AIService
from app.repositories.data_store import DataStore

ai_bp = Blueprint("ai_bp", __name__)

@ai_bp.route("/ai/analyze-image", methods=["POST"])
@token_required(roles=["admin", "driver", "reporter"])
def analyze_image_direct():
    """
    Direct computer vision inference on image payload.
    Returns material classification, quality metrics, and container fill estimation.
    """
    data = request.get_json() or {}
    image_payload = data.get("image")
    report_type = data.get("report_type", "OVERFLOWING_BIN")
    if not image_payload:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Image payload is required."}), 400

    analysis = AIService.analyze_waste_image(image_payload, report_type=report_type)
    return jsonify(analysis)

@ai_bp.route("/ai/compare-proof", methods=["POST"])
@token_required(roles=["admin", "driver"])
def compare_proof_direct():
    """
    Runs before/after SSIM and clutter entropy comparison between two photos.
    """
    data = request.get_json() or {}
    orig_img = data.get("original_image")
    after_img = data.get("after_image")
    if not orig_img or not after_img:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Both original_image and after_image are required."}), 400

    comparison = AIService.compare_proof_images(orig_img, after_img)
    return jsonify(comparison)

@ai_bp.route("/ai/check-duplicates", methods=["POST"])
@token_required(roles=["admin", "reporter"])
def check_duplicates():
    """
    Discovers candidate duplicate reports based on location proximity, time window, and description.
    """
    data = request.get_json() or {}
    store = DataStore.get_instance()
    all_reports = store.list("waste_reports", lambda r: r.get("status") not in ["REJECTED", "CANCELLED"])

    candidates = AIService.detect_duplicate_reports(
        candidate_report=data,
        existing_reports=all_reports,
        max_distance_meters=float(data.get("max_distance_meters", 150.0)),
        max_hours_diff=float(data.get("max_hours_diff", 48.0))
    )
    return jsonify({
        "candidates": candidates,
        "count": len(candidates),
        "has_duplicates": len(candidates) > 0
    })

@ai_bp.route("/admin/ai/insights", methods=["GET"])
@token_required(roles=["admin"])
def get_admin_ai_insights():
    """
    Executive AI Operational Insights:
    - Recurring waste hotspots
    - Predictive demand forecasting
    - Missed-collection anomaly detection
    - Model health and inference diagnostics
    """
    store = DataStore.get_instance()
    reports = store.list("waste_reports")
    routes = store.list("collection_routes")
    stops = store.list("route_stops")
    schedules = store.list("collection_schedules")
    ai_logs = store.list("ai_analyses")

    # 1. Hotspot Clustering
    hotspots = AIService.analyze_hotspots(reports, cluster_radius_meters=300.0)

    # 2. Demand Forecasting
    demand_forecast = AIService.forecast_demand(routes)

    # 3. Collection Anomalies
    anomalies = AIService.detect_collection_anomalies(schedules, stops)

    # 4. Model Health Metrics
    total_inferences = len(ai_logs)
    review_needed_count = len([a for a in ai_logs if a.get("status") == "NEEDS_HUMAN_REVIEW"])
    completed_count = len([a for a in ai_logs if a.get("status") == "COMPLETED"])
    overridden_count = len([a for a in ai_logs if a.get("is_overridden")])

    avg_conf = 0.0
    if ai_logs:
        confidences = [float(a.get("confidence") or 0.5) for a in ai_logs]
        avg_conf = round(sum(confidences) / len(confidences), 3)

    clf = AIService.get_classifier()
    eval_data = {}
    eval_path = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models", "evaluation_results.json")
    if os.path.exists(eval_path):
        try:
            with open(eval_path, "r") as f:
                eval_data = json.load(f)
        except Exception:
            pass

    model_health = {
        "model_name": clf.MODEL_NAME,
        "model_version": clf.MODEL_VERSION,
        "deployment_mode": clf.deployment_mode,
        "total_inferences": total_inferences,
        "automated_completions": completed_count,
        "flagged_for_review": review_needed_count,
        "admin_overrides": overridden_count,
        "average_confidence": avg_conf,
        "review_rate": round(review_needed_count / max(1, total_inferences), 3),
        "override_rate": round(overridden_count / max(1, total_inferences), 3),
        "service_status": "HEALTHY",
        "held_out_accuracy": eval_data.get("accuracy"),
        "held_out_macro_f1": eval_data.get("macro_f1"),
        "held_out_test_count": eval_data.get("test_sample_count"),
        "evaluation_status": eval_data.get("status", "UNAVAILABLE_NO_EVALUATION")
    }

    return jsonify({
        "hotspots": hotspots[:6],
        "demand_forecast": demand_forecast,
        "collection_anomalies": anomalies,
        "model_health": model_health,
        "generated_at": datetime.now(timezone.utc).isoformat()
    })

@ai_bp.route("/ai/model-info", methods=["GET"])
def get_model_info():
    """
    Publicly transparent AI specifications and technical documentation.
    """
    clf = AIService.get_classifier()
    models_dir = os.path.join(os.path.dirname(__file__), "..", "..", "ml", "models")
    eval_path = os.path.join(models_dir, "evaluation_results.json")
    meta_path = os.path.join(models_dir, "model_metadata.json")

    eval_data = {}
    if os.path.exists(eval_path):
        try:
            with open(eval_path, "r") as f:
                eval_data = json.load(f)
        except Exception:
            pass

    meta_data = {}
    if os.path.exists(meta_path):
        try:
            with open(meta_path, "r") as f:
                meta_data = json.load(f)
        except Exception:
            pass

    return jsonify({
        "model_name": clf.MODEL_NAME,
        "model_version": clf.MODEL_VERSION,
        "deployment_mode": clf.deployment_mode,
        "architecture": meta_data.get("architecture", "MobileNetV3-Small (PyTorch Transfer Learning)") if clf.is_trained_model else "Development Heuristic Fallback",
        "supported_classes": ["ORGANIC", "PLASTIC", "PAPER", "METAL", "GLASS", "HAZARDOUS", "UNKNOWN"],
        "trained_classes": clf.target_classes,
        "unsupported_classes": ["HAZARDOUS"],
        "unsupported_policy": "Flagged for supervisor review (NEEDS_HUMAN_REVIEW) because HAZARDOUS waste is not represented in the TrashNet dataset.",
        "dataset_name": meta_data.get("dataset_name", "TrashNet (Gary Thung & Mindy Yang, Stanford CS229)"),
        "dataset_license": meta_data.get("license", "MIT License"),
        "training_sample_count": meta_data.get("training_samples", 1766),
        "evaluation_metrics": eval_data if eval_data else {
            "status": "UNAVAILABLE_NO_HELD_OUT_DATASET",
            "f1_score": None,
            "accuracy": None
        },
        "known_limitations": [
            "Hazardous waste (batteries, chemicals) is not represented in TrashNet training samples and is routed to human review",
            "Cannot determine numeric fill percentage when container edges or rims are not visible in frame",
            "Extreme viewpoint shifts (>45 degrees) between before/after photos degrade SSIM accuracy to INCONCLUSIVE"
        ],
        "human_review_policy": "Flagged as NEEDS_HUMAN_REVIEW whenever confidence < 0.40, sharpness < 0.28, or image is unreadable"
    })
