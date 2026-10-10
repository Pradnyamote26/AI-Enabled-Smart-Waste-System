import io
import math
import base64
from datetime import datetime, timezone
from PIL import Image

from app.ml.waste_classifier import WasteClassifier
from app.ml.proof_comparator import ProofComparator
from app.ml.triage_engine import TriageEngine
from app.ml.hotspot_forecaster import HotspotForecaster

class AIService:
    """
    Unified AI & Computer Vision Service for EcoRoute
    Integrates:
    - WasteClassifier (Multi-material classification, quality checks, container fill estimation)
    - ProofComparator (Before/After SSIM and clutter entropy verification)
    - TriageEngine (Multi-factor transparent priority scoring, duplicate detection)
    - HotspotForecaster (Spatial cluster analysis and honest demand forecasting)
    """
    MODEL_NAME = WasteClassifier.MODEL_NAME
    MODEL_VERSION = WasteClassifier.MODEL_VERSION

    _classifier = None

    @classmethod
    def get_classifier(cls):
        if cls._classifier is None:
            cls._classifier = WasteClassifier()
        return cls._classifier

    @classmethod
    def analyze_waste_image(cls, image_bytes_or_base64, report_type="OVERFLOWING_BIN"):
        """
        Performs genuine Computer Vision and Machine Learning analysis on submitted waste photo.
        Returns:
        - material classification with calibrated probabilities
        - image quality flags (dark, bright, blurry, uniform/blank)
        - fill level estimation and overflow detection (calibrated for containers, not ground litter)
        - recommended priority and triage queue
        """
        clf = cls.get_classifier()

        # 1. Run Classification
        pred = clf.predict(image_bytes_or_base64)
        if pred.get("status") == "FAILED":
            return {
                "status": "FAILED",
                "error_message": pred.get("error_message"),
                "model_name": cls.MODEL_NAME,
                "model_version": cls.MODEL_VERSION,
                "confidence": 0.0,
                "result": None
            }

        # 2. Run Container Fill & Overflow Analysis
        fill_res = clf.evaluate_fill_and_overflow(image_bytes_or_base64, report_type=report_type)

        # 3. Run Smart Triage & Prioritization
        is_overflowing = fill_res.get("is_overflowing", False)
        fill_pct = fill_res.get("fill_level_percentage")
        triage_res = TriageEngine.calculate_priority_score(
            report_type=report_type,
            ai_category=pred.get("primary_category"),
            is_overflowing=is_overflowing,
            fill_percentage=fill_pct,
            hours_elapsed=0.0
        )

        overall_confidence = pred.get("confidence", 0.5)

        result_payload = {
            "quality": pred.get("quality", {}),
            "primary_category": pred.get("primary_category", "UNKNOWN"),
            "category_probabilities": pred.get("category_probabilities", {}),
            "fill_level_percentage": fill_pct,
            "fill_state": fill_res.get("fill_state"),
            "is_overflowing": is_overflowing,
            "recommended_priority": triage_res.get("recommended_priority"),
            "priority_score": triage_res.get("priority_score"),
            "triage_queue": triage_res.get("triage_queue"),
            "scoring_factors": triage_res.get("scoring_factors"),
            "analysis_notes": (
                f"Classified as {pred.get('primary_category')} ({round(overall_confidence * 100)}% confidence). "
                f"{fill_res.get('notes')}"
            )
        }

        # Status determination: if image has issues or confidence is low, require human review
        status = pred.get("status", "COMPLETED")
        if fill_res.get("fill_state") == "UNCERTAIN" or pred.get("primary_category") == "UNKNOWN":
            status = "NEEDS_HUMAN_REVIEW"

        return {
            "status": status,
            "model_name": clf.MODEL_NAME,
            "model_version": clf.MODEL_VERSION,
            "deployment_mode": clf.deployment_mode,
            "confidence": overall_confidence,
            "inference_duration_ms": pred.get("inference_duration_ms"),
            "result": result_payload,
            "rejection_reason": pred.get("rejection_reason"),
            "error_message": None,
            "timestamp": datetime.now(timezone.utc).isoformat()
        }

    @classmethod
    def compare_proof_images(cls, original_bytes_or_b64, after_bytes_or_b64):
        """
        Compares before (citizen report) and after (driver completion proof) images.
        Uses multi-scale Structural Similarity (SSIM) and high-frequency edge entropy reduction.
        """
        return ProofComparator.compare_proofs(original_bytes_or_b64, after_bytes_or_b64)

    @classmethod
    def triage_report(cls, report_type, ai_category=None, is_overflowing=False, fill_percentage=None, hours_elapsed=0.0, address_text=""):
        """
        Calculates multi-factor priority score and triage queue assignment.
        """
        return TriageEngine.calculate_priority_score(
            report_type=report_type,
            ai_category=ai_category,
            is_overflowing=is_overflowing,
            fill_percentage=fill_percentage,
            hours_elapsed=hours_elapsed,
            address_text=address_text
        )

    @classmethod
    def detect_duplicate_reports(cls, candidate_report, existing_reports, max_distance_meters=150.0, max_hours_diff=48.0):
        """
        Discovers potential duplicate complaints within geographic and temporal radius.
        """
        return TriageEngine.detect_duplicates(
            candidate_report=candidate_report,
            existing_reports=existing_reports,
            max_distance_meters=max_distance_meters,
            max_hours_diff=max_hours_diff
        )

    @classmethod
    def analyze_hotspots(cls, reports, cluster_radius_meters=300.0):
        """
        Identifies spatial waste accumulation hotspots from historical reports.
        """
        return HotspotForecaster.analyze_hotspots(reports, cluster_radius_meters=cluster_radius_meters)

    @classmethod
    def forecast_demand(cls, collection_history):
        """
        Projects upcoming collection demand from verified trip history.
        """
        return HotspotForecaster.forecast_demand(collection_history)

    @classmethod
    def detect_collection_anomalies(cls, schedules, route_stops):
        """
        Detects overdue collection tasks and unexplained skips.
        """
        return TriageEngine.detect_missed_collection_anomalies(schedules, route_stops)
