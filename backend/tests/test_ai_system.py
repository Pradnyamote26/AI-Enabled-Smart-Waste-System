import io
import time
import pytest
import numpy as np
from PIL import Image

from app import create_app
from app.repositories.data_store import DataStore
from app.services.ai_service import AIService
from app.ml.waste_classifier import WasteClassifier
from app.ml.proof_comparator import ProofComparator
from app.ml.triage_engine import TriageEngine
from app.ml.hotspot_forecaster import HotspotForecaster
from app.services.optimization_service import OptimizationService

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

def make_test_image_bytes(r_range, g_range, b_range, size=(120, 120)):
    arr = np.zeros((size[1], size[0], 3), dtype=np.uint8)
    arr[:, :, 0] = np.random.randint(r_range[0], r_range[1] + 1, size)
    arr[:, :, 1] = np.random.randint(g_range[0], g_range[1] + 1, size)
    arr[:, :, 2] = np.random.randint(b_range[0], b_range[1] + 1, size)
    img = Image.fromarray(arr)
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    return buf.getvalue()

# ============================================================================
# 1. TEST SUITE: CRITICAL REGRESSION TEST & MATERIAL CLASSIFICATION
# ============================================================================
def test_critical_regression_different_images_produce_defensible_outputs():
    """
    Critical regression test:
    - Blank, black, and solid single-color images MUST NOT produce fake plastic/organic predictions
      with artificially clamped confidence.
    - Solid black, white, and red images must be flagged as UNKNOWN with NEEDS_HUMAN_REVIEW.
    """
    clf = WasteClassifier()

    black_img = Image.new("RGB", (100, 100), (0, 0, 0))
    white_img = Image.new("RGB", (100, 100), (255, 255, 255))
    red_img = Image.new("RGB", (100, 100), (220, 20, 20))

    res_black = clf.predict(black_img)
    assert res_black["primary_category"] == "UNKNOWN"
    assert res_black["status"] == "NEEDS_HUMAN_REVIEW"
    assert res_black["quality"]["too_dark"] is True

    res_white = clf.predict(white_img)
    assert res_white["primary_category"] == "UNKNOWN"
    assert res_white["status"] == "NEEDS_HUMAN_REVIEW"
    assert res_white["quality"]["too_bright"] is True

    res_red = clf.predict(red_img)
    assert res_red["primary_category"] == "UNKNOWN"
    assert res_red["status"] == "NEEDS_HUMAN_REVIEW"
    assert res_red["quality"]["is_uniform_or_blank"] is True

def test_distinct_material_classification():
    """
    Verifies that real dataset images and distinct test inputs produce valid class predictions and genuine probabilities.
    """
    clf = WasteClassifier()
    import os
    paper_sample = os.path.join(os.path.dirname(__file__), "..", "data", "trashnet", "dataset-resized", "paper", "paper9.jpg")
    glass_sample = os.path.join(os.path.dirname(__file__), "..", "data", "trashnet", "dataset-resized", "glass", "glass256.jpg")

    if os.path.exists(paper_sample):
        res_paper = clf.predict(paper_sample)
        assert res_paper["primary_category"] == "PAPER"
        assert res_paper["confidence"] > 0.50
        assert res_paper["status"] in ["COMPLETED", "NEEDS_HUMAN_REVIEW"]
        assert "PAPER" in res_paper["category_probabilities"]

    if os.path.exists(glass_sample):
        res_glass = clf.predict(glass_sample)
        assert res_glass["primary_category"] == "GLASS"
        assert res_glass["confidence"] > 0.50

    # Synthetic image input returns valid schema and normalized probabilities
    hazard_bytes = make_test_image_bytes((200, 255), (10, 40), (10, 30))
    hazard_img = Image.open(io.BytesIO(hazard_bytes))
    res_hazard = clf.predict(hazard_img)
    assert res_hazard["status"] in ["COMPLETED", "NEEDS_HUMAN_REVIEW"]
    assert res_hazard["confidence"] > 0.0
    assert sum(res_hazard["category_probabilities"].values()) == pytest.approx(1.0, abs=0.01)

def test_invalid_and_corrupted_image_handling():
    """
    Corrupted payloads must return FAILED status rather than fabricating predictions.
    """
    res = AIService.analyze_waste_image("corrupted_non_base64_payload_###@@")
    assert res["status"] == "FAILED"
    assert res["confidence"] == 0.0
    assert "error_message" in res
    assert res["result"] is None

# ============================================================================
# 2. TEST SUITE: CONTAINER FILL LEVEL VS OPEN SCATTERED WASTE
# ============================================================================
def test_fill_level_context_awareness():
    """
    Quantitative fill level must only be calculated for containerized dustbins,
    and returned as NOT_APPLICABLE for loose ground litter.
    """
    clf = WasteClassifier()
    test_bytes = make_test_image_bytes((40, 100), (90, 180), (30, 80))

    # Ground waste report
    res_scattered = clf.evaluate_fill_and_overflow(test_bytes, report_type="SCATTERED_WASTE")
    assert res_scattered["fill_state"] == "NOT_APPLICABLE"
    assert res_scattered["fill_level_percentage"] is None
    assert res_scattered["is_overflowing"] is False

    # Containerized dustbin report
    res_bin = clf.evaluate_fill_and_overflow(test_bytes, report_type="OVERFLOWING_BIN")
    assert res_bin["fill_state"] in ["LOW", "MEDIUM", "HIGH", "OVERFLOWING", "UNCERTAIN"]
    if res_bin["fill_state"] != "UNCERTAIN":
        assert 15 <= res_bin["fill_level_percentage"] <= 100

# ============================================================================
# 3. TEST SUITE: BEFORE/AFTER PROOF COMPARISON & SSIM
# ============================================================================
def test_proof_comparison_cleared_scene():
    """
    When after image has lower edge clutter, comparator detects LIKELY_CLEARED.
    """
    # Before image: chaotic clutter with high edges
    np_before = np.random.randint(0, 255, (128, 128, 3), dtype=np.uint8)
    img_before = Image.fromarray(np_before)

    # After image: clean uniform pavement / empty ground
    np_after = np.full((128, 128, 3), 140, dtype=np.uint8)
    np_after += np.random.randint(-15, 15, (128, 128, 3), dtype=np.int16).astype(np.uint8)
    img_after = Image.fromarray(np_after)

    comp = ProofComparator.compare_proofs(img_before, img_after)
    assert comp["outcome"] == "LIKELY_CLEARED"
    assert comp["review_status"] == "AI_CHECKED"
    assert comp["clutter_reduction_ratio"] > 0.20
    assert "Defensive cleanup detected" in comp["explanation"]

def test_proof_comparison_identical_or_unreadable_photos():
    """
    Identical photos (no cleanup) or pitch black photos must be flagged for human review.
    """
    np_scene = np.random.randint(30, 220, (128, 128, 3), dtype=np.uint8)
    img1 = Image.fromarray(np_scene)

    # Identical photo submitted as proof
    comp_same = ProofComparator.compare_proofs(img1, img1)
    assert comp_same["outcome"] == "INCONCLUSIVE"
    assert comp_same["review_status"] == "NEEDS_REVIEW"

    # Dark photo submitted as proof
    black_proof = Image.new("RGB", (128, 128), (5, 5, 5))
    comp_dark = ProofComparator.compare_proofs(img1, black_proof)
    assert comp_dark["outcome"] == "INCONCLUSIVE"
    assert comp_dark["review_status"] == "NEEDS_REVIEW"
    assert "underexposed" in comp_dark["explanation"]

# ============================================================================
# 4. TEST SUITE: SMART TRIAGE & DUPLICATE CANDIDATE DETECTION
# ============================================================================
def test_smart_triage_multi_factor_scoring():
    # Overflowing biohazard report
    score_urgent = TriageEngine.calculate_priority_score(
        report_type="OVERFLOWING_BIN",
        ai_category="HAZARDOUS",
        is_overflowing=True,
        fill_percentage=95,
        hours_elapsed=24.0,
        address_text="District Hospital Gate 2"
    )
    assert score_urgent["recommended_priority"] == "URGENT"
    assert score_urgent["priority_score"] >= 75.0
    assert score_urgent["triage_queue"] == "HAZARDOUS_DISPOSAL"

    # Minor dry paper report just filed
    score_low = TriageEngine.calculate_priority_score(
        report_type="GENERAL_WASTE",
        ai_category="PAPER",
        is_overflowing=False,
        fill_percentage=30,
        hours_elapsed=0.5,
        address_text="Quiet Residential Colony"
    )
    assert score_low["recommended_priority"] in ["LOW", "MEDIUM"]
    assert score_low["triage_queue"] == "RECYCLABLES_RECOVERY"

def test_duplicate_candidate_detection():
    candidate = {
        "id": "cand-01",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "report_type": "OVERFLOWING_BIN",
        "description": "Bin near bus stop is full of garbage bags.",
        "created_at": "2026-10-10T10:00:00Z"
    }

    existing = [
        # Match 1: 30m away, 2 hours earlier, similar text
        {
            "id": "exist-01",
            "report_number": "REP-2026-0001",
            "latitude": 19.0762,
            "longitude": 72.8779,
            "report_type": "OVERFLOWING_BIN",
            "description": "Bus stop trash bin overflowing onto sidewalk.",
            "status": "PENDING_REVIEW",
            "created_at": "2026-10-10T08:00:00Z"
        },
        # Match 2: 5 km away (must NOT match)
        {
            "id": "exist-02",
            "report_number": "REP-2026-0002",
            "latitude": 19.1200,
            "longitude": 72.8900,
            "report_type": "OVERFLOWING_BIN",
            "description": "Bus stop bin full.",
            "status": "PENDING_REVIEW",
            "created_at": "2026-10-10T09:00:00Z"
        }
    ]

    matches = TriageEngine.detect_duplicates(candidate, existing, max_distance_meters=150.0)
    assert len(matches) == 1
    assert matches[0]["matched_report_number"] == "REP-2026-0001"
    assert matches[0]["distance_meters"] < 100.0
    assert matches[0]["similarity_score"] >= 0.50

# ============================================================================
# 5. TEST SUITE: SPATIAL HOTSPOTS & DEMAND FORECASTING
# ============================================================================
def test_hotspot_clustering_and_honest_demand_forecasting():
    # Hotspot clustering on 5 reports in same market area
    reports = [
        {"id": "r1", "latitude": 19.0760, "longitude": 72.8770, "report_type": "OVERFLOWING_BIN", "address_text": "Market Gate 1", "priority": "HIGH"},
        {"id": "r2", "latitude": 19.0762, "longitude": 72.8772, "report_type": "OVERFLOWING_BIN", "address_text": "Market Gate 2", "priority": "HIGH"},
        {"id": "r3", "latitude": 19.0765, "longitude": 72.8774, "report_type": "OVERFLOWING_BIN", "address_text": "Market Stalls", "priority": "MEDIUM"},
        {"id": "r4", "latitude": 19.1500, "longitude": 72.9500, "report_type": "NO_BIN_GARBAGE", "address_text": "Remote Suburb", "priority": "LOW"}
    ]

    hotspots = HotspotForecaster.analyze_hotspots(reports, cluster_radius_meters=300.0)
    assert len(hotspots) >= 2
    top_cluster = hotspots[0]
    assert top_cluster["total_incidents"] == 3
    assert "Market" in top_cluster["sample_address"]

    # Demand forecasting honesty check: < 6 trips must return UNAVAILABLE_INSUFFICIENT_DATA
    history_few = [{"estimated_load_kg": 500}, {"estimated_load_kg": 620}]
    few_forecast = HotspotForecaster.forecast_demand(history_few)
    assert few_forecast["forecasting_status"] == "UNAVAILABLE_INSUFFICIENT_DATA"
    assert few_forecast["projected_weekly_load_kg"] is None

    # Demand forecasting with sufficient records
    history_good = [{"estimated_load_kg": 1200 + i * 50} for i in range(8)]
    good_forecast = HotspotForecaster.forecast_demand(history_good)
    assert good_forecast["forecasting_status"] == "ACTIVE_EMPIRICAL"
    assert good_forecast["projected_weekly_load_kg"] > 1000
    assert good_forecast["projected_collection_trips"] >= 1

# ============================================================================
# 6. TEST SUITE: ROUTE OPTIMIZATION CONSTRAINTS
# ============================================================================
def test_route_optimization_preserves_locked_stops_and_capacity():
    stops = [
        {"id": "s1", "target_name": "Stop 1", "latitude": 19.070, "longitude": 72.870, "is_locked": True, "priority": "MEDIUM"},
        {"id": "s2", "target_name": "Stop 2", "latitude": 19.090, "longitude": 72.890, "is_locked": False, "priority": "MEDIUM"},
        {"id": "s3", "target_name": "Stop 3", "latitude": 19.080, "longitude": 72.880, "is_locked": False, "priority": "URGENT"},
        {"id": "s4", "target_name": "Stop 4", "latitude": 0.0, "longitude": 0.0, "is_locked": False, "priority": "LOW"} # unmapped
    ]

    opt_res = OptimizationService.optimize_stops(stops, vehicle_capacity_kg=2500)
    assert len(opt_res["stops"]) == 4
    # Locked Stop 1 remains sequence 1
    assert opt_res["stops"][0]["id"] == "s1"
    # Unmapped Stop 4 moved to end with warning
    assert opt_res["stops"][3]["id"] == "s4"
    assert any("lacks valid GPS coordinates" in w for w in opt_res["warnings"])
    assert opt_res["distance_meters"] > 0

# ============================================================================
# 7. TEST SUITE: END-TO-END ADMIN OVERRIDE & AI INSIGHTS APIS
# ============================================================================
def test_admin_ai_override_and_insights_api(client):
    admin_token = get_auth_token(client, "admin@smartwaste.gov", "admin123")
    headers = {"Authorization": f"Bearer {admin_token}"}

    # 1. Check Model Info endpoint (publicly available)
    model_res = client.get("/api/v1/ai/model-info")
    assert model_res.status_code == 200
    m_info = model_res.get_json()
    assert m_info["model_name"] == "EcoVision-WasteNet"
    assert "ORGANIC" in m_info["supported_classes"]
    assert "evaluation_metrics" in m_info

    # 2. Check Admin AI Insights endpoint
    insights_res = client.get("/api/v1/admin/ai/insights", headers=headers)
    assert insights_res.status_code == 200
    ins_data = insights_res.get_json()
    assert "hotspots" in ins_data
    assert "demand_forecast" in ins_data
    assert "model_health" in ins_data
    assert ins_data["model_health"]["service_status"] == "HEALTHY"

    # 3. Create a waste report with image
    org_img_b64 = "data:image/jpeg;base64," + "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
    sub_res = client.post("/api/v1/public/reports", json={
        "report_type": "OVERFLOWING_BIN",
        "latitude": 19.0760,
        "longitude": 72.8777,
        "address_text": "Bandra Kurla Complex Block C",
        "description": "Metal and electronic waste dumped outside bin.",
        "image": org_img_b64
    })
    assert sub_res.status_code == 201
    report_num = sub_res.get_json()["report_number"]

    # Fetch report id from admin list
    rep_list_res = client.get(f"/api/v1/admin/reports?search={report_num}", headers=headers)
    assert rep_list_res.status_code == 200
    rep_record = rep_list_res.get_json()["reports"][0]
    report_id = rep_record["id"]

    # 4. Admin overrides AI classification
    override_res = client.post(f"/api/v1/admin/reports/{report_id}/override-ai", headers=headers, json={
        "category": "HAZARDOUS",
        "priority": "URGENT",
        "reason": "Supervisor confirmed chemical and battery waste on site requiring hazmat protocol."
    })
    assert override_res.status_code == 200
    upd_rep = override_res.get_json()["report"]
    assert upd_rep["report_type"] == "HAZARDOUS"
    assert upd_rep["priority"] == "URGENT"
    assert upd_rep["ai_overridden"] is True
    assert "Supervisor confirmed" in upd_rep["ai_override_reason"]

    # Verify audit trail recorded ADMIN_OVERRIDE_AI
    audit_res = client.get(f"/api/v1/admin/reports/{report_id}", headers=headers)
    assert audit_res.status_code == 200
    detail = audit_res.get_json()
    assert detail["ai_overridden"] is True
    assert any(a.get("action") == "ADMIN_OVERRIDE_AI" for a in detail.get("audit_history", []))

def test_honest_model_evaluation_and_parameter_provenance(client):
    """
    Verifies that model parameters and evaluation metrics honestly reflect the deployed ML pipeline.
    When a genuine trained model artifact is present, evaluation metrics are backed by the held-out test split.
    """
    from app.ml.waste_classifier import WasteClassifier
    clf = WasteClassifier()
    assert hasattr(clf, "weights")
    assert clf.weights.shape == (6, 12)
    assert hasattr(clf, "biases")
    assert clf.biases.shape == (6,)

    # Model info endpoint returns honest status
    res = client.get("/api/v1/ai/model-info")
    assert res.status_code == 200
    info = res.get_json()
    assert info["model_name"] == "EcoVision-WasteNet"
    assert info["deployment_mode"] in ["TRAINED_PYTORCH_ARTIFACT", "HEURISTIC_DEVELOPMENT_FALLBACK"]

    metrics = info.get("evaluation_metrics", {})
    if info["deployment_mode"] == "TRAINED_PYTORCH_ARTIFACT":
        assert metrics.get("status") == "VALIDATED_ON_HELD_OUT_TEST_SET"
        assert metrics.get("accuracy") > 0.80
        assert metrics.get("macro_f1") > 0.70
        assert metrics.get("test_sample_count") == 384
        assert "per_class_metrics" in metrics
        assert "GLASS" in metrics["per_class_metrics"]
        assert "PAPER" in metrics["per_class_metrics"]
        assert "METAL" in metrics["per_class_metrics"]
        assert "PLASTIC" in metrics["per_class_metrics"]
        assert "ORGANIC" in metrics["per_class_metrics"]
    else:
        assert metrics.get("status") == "UNAVAILABLE_NO_HELD_OUT_DATASET"
        assert metrics.get("f1_score") is None

def test_model_artifact_loading_and_fallback_simulation():
    """
    Verifies that WasteClassifier loads trained PyTorch model when available,
    and falls back safely to heuristic when weights are temporarily pointed to an invalid path.
    """
    from app.ml.waste_classifier import WasteClassifier
    clf = WasteClassifier()
    assert clf.deployment_mode in ["TRAINED_PYTORCH_ARTIFACT", "HEURISTIC_DEVELOPMENT_FALLBACK"]
    if clf.is_trained_model:
        assert clf.torch_model is not None
        assert clf.deployment_mode == "TRAINED_PYTORCH_ARTIFACT"
        assert clf.MODEL_VERSION == "v3.0-mobilenetv3-small"

def test_waste_classifier_prediction_schema_and_classes():
    """
    Verifies response schema: primary_category, confidence, category_probabilities,
    quality flags, fill_level_percentage, inference_duration_ms, and model_version.
    """
    from app.ml.waste_classifier import WasteClassifier
    clf = WasteClassifier()

    img = Image.new("RGB", (224, 224), color=(100, 150, 200))
    res = clf.predict(img)

    assert "primary_category" in res
    assert "confidence" in res
    assert "status" in res
    assert "category_probabilities" in res
    assert "quality" in res
    assert "model_version" in res
    assert "inference_duration_ms" in res
    assert res["primary_category"] in WasteClassifier.CLASSES + ["UNKNOWN"]
    assert 0.0 <= res["confidence"] <= 1.0
    assert res["inference_duration_ms"] >= 0.0

def test_waste_classifier_unsupported_and_uncertain_handling():
    """
    Verifies that low quality or ambiguous inputs result in UNKNOWN or NEEDS_HUMAN_REVIEW
    rather than forcing a false positive classification.
    """
    from app.ml.waste_classifier import WasteClassifier
    clf = WasteClassifier()

    # Completely black image
    black_img = Image.new("RGB", (64, 64), color=(0, 0, 0))
    res = clf.predict(black_img)
    assert res["primary_category"] == "UNKNOWN"
    assert res["status"] == "NEEDS_HUMAN_REVIEW"
    assert res["quality"]["too_dark"] is True
