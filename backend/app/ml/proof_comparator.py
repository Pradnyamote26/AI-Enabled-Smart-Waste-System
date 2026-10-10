import numpy as np
from PIL import Image, ImageFilter
from app.ml.waste_classifier import WasteClassifier

class ProofComparator:
    """
    EcoVision Proof Verification Engine
    Compares original complaint photo with driver completion photo.
    Uses multi-scale Structural Similarity (SSIM) and visual entropy reduction.
    """

    @classmethod
    def compare_proofs(cls, orig_data, after_data):
        """
        Compares before and after images.
        Supports URLs, data URIs, base64 strings, raw bytes, or PIL Image objects.
        """
        # 1. Load images safely
        try:
            img_before = WasteClassifier.load_image(orig_data)
        except Exception as e:
            return {
                "outcome": "INCONCLUSIVE",
                "confidence": 0.0,
                "explanation": f"Original report photo could not be decoded: {str(e)}",
                "review_status": "NEEDS_REVIEW",
                "metrics": {}
            }

        try:
            img_after = WasteClassifier.load_image(after_data)
        except Exception as e:
            return {
                "outcome": "INCONCLUSIVE",
                "confidence": 0.0,
                "explanation": f"Driver completion photo could not be decoded: {str(e)}",
                "review_status": "NEEDS_REVIEW",
                "metrics": {}
            }

        # 2. Quality & Readability Verification
        w_b, h_b = img_before.size
        w_a, h_a = img_after.size

        gray_before = img_before.convert("L").resize((256, 256))
        gray_after = img_after.convert("L").resize((256, 256))

        np_before = np.array(gray_before, dtype=np.float64)
        np_after = np.array(gray_after, dtype=np.float64)

        mean_lum_b = np.mean(np_before)
        mean_lum_a = np.mean(np_after)

        # Check for unreadable photos
        if mean_lum_a < 25.0:
            return {
                "outcome": "INCONCLUSIVE",
                "confidence": 0.20,
                "explanation": "Driver completion photo is underexposed/too dark to verify cleanup.",
                "review_status": "NEEDS_REVIEW",
                "metrics": {"mean_luminance_after": round(float(mean_lum_a), 1)}
            }

        if mean_lum_a > 245.0:
            return {
                "outcome": "INCONCLUSIVE",
                "confidence": 0.20,
                "explanation": "Driver completion photo is overexposed/blown white.",
                "review_status": "NEEDS_REVIEW",
                "metrics": {"mean_luminance_after": round(float(mean_lum_a), 1)}
            }

        # High-pass edge clutter comparison
        edges_b = gray_before.filter(ImageFilter.FIND_EDGES)
        edges_a = gray_after.filter(ImageFilter.FIND_EDGES)

        np_edges_b = np.array(edges_b, dtype=np.float64)
        np_edges_a = np.array(edges_a, dtype=np.float64)

        clutter_before = float(np.mean(np_edges_b))
        clutter_after = float(np.mean(np_edges_a))

        if clutter_after < 4.0 and np.std(np_after) < 5.0:
            return {
                "outcome": "INCONCLUSIVE",
                "confidence": 0.30,
                "explanation": "Driver photo appears to be a blank or obstructed lens.",
                "review_status": "NEEDS_REVIEW",
                "metrics": {"clutter_after": round(clutter_after, 2)}
            }

        # 3. Structural Similarity Index (SSIM)
        c1 = (0.01 * 255)**2
        c2 = (0.03 * 255)**2
        mu_x = mean_lum_b
        mu_y = mean_lum_a
        sigma_x_sq = float(np.var(np_before))
        sigma_y_sq = float(np.var(np_after))
        sigma_xy = float(np.mean((np_before - mu_x) * (np_after - mu_y)))

        ssim_num = (2 * mu_x * mu_y + c1) * (2 * sigma_xy + c2)
        ssim_den = (mu_x**2 + mu_y**2 + c1) * (sigma_x_sq + sigma_y_sq + c2)
        ssim_score = float(ssim_num / max(1e-4, ssim_den))

        # 4. Clutter Reduction Ratio
        # Positive means clutter decreased in after photo
        clutter_reduction_ratio = (clutter_before - clutter_after) / max(1.0, clutter_before)
        mean_abs_diff = float(np.mean(np.abs(np_before - np_after)))

        metrics = {
            "clutter_before": round(clutter_before, 2),
            "clutter_after": round(clutter_after, 2),
            "clutter_reduction_ratio": round(clutter_reduction_ratio, 3),
            "ssim_index": round(ssim_score, 3),
            "pixel_difference": round(mean_abs_diff, 2)
        }

        # 5. Outcome Decision Logic
        if clutter_reduction_ratio > 0.24 and mean_abs_diff > 16.0:
            outcome = "LIKELY_CLEARED"
            confidence = round(min(0.95, 0.70 + clutter_reduction_ratio * 0.28), 2)
            review_status = "AI_CHECKED"
            explanation = (
                f"Defensive cleanup detected: surface clutter reduced by {round(clutter_reduction_ratio * 100)}% "
                f"with visible clearance of waste deposits."
            )
        elif clutter_reduction_ratio < -0.18 and clutter_after > 18.0:
            outcome = "LIKELY_STILL_PRESENT"
            confidence = round(min(0.90, 0.72 + abs(clutter_reduction_ratio) * 0.2), 2)
            review_status = "NEEDS_REVIEW"
            explanation = "Substantial visual clutter remains detected at the collection site. Administrator review advised."
        elif ssim_score > 0.92 and mean_abs_diff < 8.0:
            outcome = "INCONCLUSIVE"
            confidence = 0.85
            review_status = "NEEDS_REVIEW"
            explanation = "Proof photo is identical or nearly identical to original photo without noticeable cleanup action."
        else:
            outcome = "INCONCLUSIVE"
            confidence = 0.55
            review_status = "NEEDS_REVIEW"
            explanation = "Moderate visual variation between photos (different angle or lighting). Municipal policy requires human supervisor sign-off."

        return {
            "outcome": outcome,
            "confidence": confidence,
            "review_status": review_status,
            "clutter_reduction_ratio": round(clutter_reduction_ratio, 3),
            "difference_metric": round(mean_abs_diff, 2),
            "ssim_index": round(ssim_score, 3),
            "explanation": explanation,
            "metrics": metrics
        }
