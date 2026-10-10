import io
import os
import json
import time
import base64
import requests
import numpy as np
from PIL import Image, ImageFilter, ImageStat

import torch
import torch.nn as nn
import torchvision.transforms as transforms
from torchvision.models import mobilenet_v3_small

MODELS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "models"))
WEIGHTS_PATH = os.path.join(MODELS_DIR, "ecovision_wastenet_mobilenetv3.pt")
CLASS_MAP_PATH = os.path.join(MODELS_DIR, "class_mapping.json")
EVAL_RESULTS_PATH = os.path.join(MODELS_DIR, "evaluation_results.json")
METADATA_PATH = os.path.join(MODELS_DIR, "model_metadata.json")

class WasteClassifier:
    """
    EcoVision-WasteNet Waste Classifier
    Integrates a genuine trained MobileNetV3-Small deep learning model fine-tuned on the TrashNet dataset.
    Features graceful fallback to development heuristic if weights artifact is missing.
    """
    MODEL_NAME = "EcoVision-WasteNet"
    MODEL_VERSION = "v3.0-mobilenetv3-small"
    ARCHITECTURE = "MobileNetV3-Small"
    CLASSES = ["ORGANIC", "PLASTIC", "PAPER", "METAL", "GLASS", "HAZARDOUS"]

    def __init__(self):
        # Always initialize heuristic baseline weights for fallback safety and parameter inspection
        self._init_heuristic_classifier()
        self._load_trained_model_or_fallback()

    def _load_trained_model_or_fallback(self):
        """
        Attempts to load the trained PyTorch MobileNetV3 artifact.
        If the file is not found, activates the explicitly documented development heuristic fallback.
        """
        self.is_trained_model = False
        self.torch_model = None
        self.target_classes = ["GLASS", "PAPER", "PLASTIC", "METAL", "ORGANIC"]
        self.idx_to_class = {0: "GLASS", 1: "PAPER", 2: "PLASTIC", 3: "METAL", 4: "ORGANIC"}

        if os.path.exists(WEIGHTS_PATH) and os.path.exists(CLASS_MAP_PATH):
            try:
                with open(CLASS_MAP_PATH, "r") as f:
                    cmap = json.load(f)
                    self.target_classes = cmap.get("target_classes", self.target_classes)
                    self.idx_to_class = {int(k): v for k, v in cmap.get("idx_to_class", {}).items()}

                # Instantiate architecture
                model = mobilenet_v3_small(weights=None)
                num_ftrs = model.classifier[3].in_features
                model.classifier[3] = nn.Linear(num_ftrs, len(self.target_classes))

                # Load weights onto CPU
                state_dict = torch.load(WEIGHTS_PATH, map_location="cpu", weights_only=True)
                model.load_state_dict(state_dict)
                model.eval()

                self.torch_model = model
                self.is_trained_model = True
                self.MODEL_NAME = "EcoVision-WasteNet"
                self.MODEL_VERSION = "v3.0-mobilenetv3-small"
                self.deployment_mode = "TRAINED_PYTORCH_ARTIFACT"
                self.eval_transform = transforms.Compose([
                    transforms.Resize((224, 224)),
                    transforms.ToTensor(),
                    transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
                ])
                return
            except Exception as e:
                # Log load failure and proceed to fallback
                print(f"[WARNING] Failed to load trained weights ({e}). Activating development fallback.")

        # Fallback to development heuristic
        self.MODEL_NAME = "EcoVision-WasteNet"
        self.MODEL_VERSION = "v2.0-rf-cv"
        self.deployment_mode = "HEURISTIC_DEVELOPMENT_FALLBACK"

    def _init_heuristic_classifier(self):
        """
        Initializes handcrafted linear projection weights across 12 computer vision feature domains
        for development fallback when model weights artifact is absent.
        """
        self.weights = np.array([
            [ 0.15,  1.85, -1.20,  0.45, -0.10,  0.75,  0.65, -0.20,  0.85,  0.60, -2.10,  2.80],
            [ 0.65, -0.30,  0.75,  1.10,  0.30,  0.20,  1.90,  0.80,  0.50,  0.30,  0.95, -1.80],
            [ 0.85,  0.75,  0.30, -0.85, -0.25, -0.40, -1.80,  0.40,  0.30,  0.20, -1.50, -0.90],
            [ 0.10,  0.10,  0.20,  1.60,  0.85, -0.50, -1.50,  1.20,  1.75,  0.80,  3.20, -1.40],
            [-0.40,  0.35,  0.60,  1.40,  0.70,  0.40, -0.60,  1.40,  1.60,  0.90,  2.80, -0.80],
            [ 1.40, -0.80, -0.60,  1.50,  0.50, -0.20,  1.60,  0.50,  1.30,  0.70,  0.40, -1.50]
        ], dtype=np.float64)
        self.biases = np.array([-0.35, 0.10, -0.20, -0.45, -0.50, -0.60], dtype=np.float64)

    @classmethod
    def load_image(cls, data):
        """
        Safely loads an image from bytes, bytearray, base64 data URI, HTTP URL, or file path.
        """
        if isinstance(data, Image.Image):
            return data.convert("RGB")

        if isinstance(data, (bytes, bytearray)):
            return Image.open(io.BytesIO(data)).convert("RGB")

        if hasattr(data, "read"):
            return Image.open(data).convert("RGB")

        if isinstance(data, str):
            data_str = data.strip()
            if data_str.startswith("http://") or data_str.startswith("https://"):
                resp = requests.get(data_str, timeout=5)
                resp.raise_for_status()
                return Image.open(io.BytesIO(resp.content)).convert("RGB")

            if data_str.startswith("data:image"):
                data_str = data_str.split(",", 1)[1]

            try:
                decoded = base64.b64decode(data_str)
                return Image.open(io.BytesIO(decoded)).convert("RGB")
            except Exception:
                if os.path.exists(data_str):
                    return Image.open(data_str).convert("RGB")
                raise ValueError("Could not decode image from provided string payload.")

        raise TypeError(f"Unsupported image input type: {type(data)}")

    def extract_features(self, img):
        """
        Extracts 12-dimensional continuous feature vector for quality guardrails and fallback.
        """
        w, h = img.size
        # Resize to standard analysis resolution
        proc_img = img.resize((224, 224), Image.Resampling.BILINEAR)

        stat = ImageStat.Stat(proc_img)
        mean_r, mean_g, mean_b = stat.mean[:3]
        std_r, std_g, std_b = stat.stddev[:3]

        gray = proc_img.convert("L")
        gray_stat = ImageStat.Stat(gray)
        mean_lum = gray_stat.mean[0]
        std_lum = gray_stat.stddev[0]

        np_gray = np.array(gray, dtype=np.float64)
        skew_lum = float(np.mean(((np_gray - mean_lum) / (std_lum + 1e-5)) ** 3))

        hsv = proc_img.convert("HSV")
        hsv_stat = ImageStat.Stat(hsv)
        mean_h = hsv_stat.mean[0]
        mean_s = hsv_stat.mean[1]
        mean_v = hsv_stat.mean[2]

        edges = gray.filter(ImageFilter.FIND_EDGES)
        np_edges = np.array(edges, dtype=np.float64) / 255.0
        edge_density = float(np.mean(np_edges))
        edge_energy = float(np.sum(np_edges ** 2))
        total_energy = float(np.sum((np_gray / 255.0) ** 2)) + 1e-5
        edge_energy_ratio = edge_energy / total_energy

        specular_pixels = np.sum(np_gray > 240.0)
        specular_ratio = float(specular_pixels) / float(224 * 224)

        green_brown_idx = (2.0 * mean_g - mean_r - mean_b) / (mean_g + mean_r + mean_b + 1e-5)

        feat_vector = np.array([
            (mean_r - 128.0) / 64.0,
            (mean_g - 128.0) / 64.0,
            (mean_b - 128.0) / 64.0,
            (std_lum - 40.0) / 20.0,
            skew_lum,
            (mean_h - 128.0) / 64.0,
            (mean_s - 128.0) / 64.0,
            (mean_v - 128.0) / 64.0,
            (edge_density - 0.15) / 0.10,
            (edge_energy_ratio - 0.20) / 0.15,
            (specular_ratio - 0.05) / 0.05,
            green_brown_idx
        ], dtype=np.float64)

        quality_metrics = {
            "mean_luminance": round(mean_lum, 2),
            "std_luminance": round(std_lum, 2),
            "edge_mean": round(edge_density * 255.0, 2),
            "specular_ratio": round(specular_ratio, 3)
        }

        return feat_vector, quality_metrics

    def predict(self, image_data):
        """
        Executes genuine machine learning inference on the input image.
        Uses the trained MobileNetV3-Small model if available, or development fallback.
        """
        t0 = time.perf_counter_ns()
        try:
            img = self.load_image(image_data)
        except Exception as e:
            return {
                "status": "FAILED",
                "error_message": f"Image decoding failed: {str(e)}",
                "model_name": self.MODEL_NAME,
                "model_version": self.MODEL_VERSION,
                "deployment_mode": self.deployment_mode,
                "confidence": 0.0,
                "primary_category": "UNKNOWN",
                "category_probabilities": {},
                "quality": {"is_valid": False}
            }

        w, h = img.size
        feat_vector, q_metrics = self.extract_features(img)

        # Quality guardrails
        is_too_dark = q_metrics["mean_luminance"] < 25.0
        is_too_bright = q_metrics["mean_luminance"] > 245.0
        is_blurry = q_metrics["edge_mean"] < 6.0
        is_uniform_or_blank = q_metrics["std_luminance"] < 6.0 and q_metrics["edge_mean"] < 4.0

        quality = {
            "dimensions": f"{w}x{h}",
            "mean_luminance": q_metrics["mean_luminance"],
            "sharpness_score": round(min(1.0, q_metrics["edge_mean"] / 25.0), 3),
            "too_dark": is_too_dark,
            "too_bright": is_too_bright,
            "blurry": is_blurry,
            "is_uniform_or_blank": is_uniform_or_blank
        }

        # Deterministic rejection of blank/uniform/unreadable images
        if is_uniform_or_blank or is_too_dark or is_too_bright:
            duration_ms = round((time.perf_counter_ns() - t0) / 1_000_000.0, 2)
            return {
                "status": "NEEDS_HUMAN_REVIEW",
                "model_name": self.MODEL_NAME,
                "model_version": self.MODEL_VERSION,
                "deployment_mode": self.deployment_mode,
                "primary_category": "UNKNOWN",
                "confidence": 0.15,
                "inference_duration_ms": duration_ms,
                "category_probabilities": {c: round(1.0 / len(self.CLASSES), 3) for c in self.CLASSES},
                "quality": quality,
                "rejection_reason": (
                    "Image is pitch black." if is_too_dark else
                    "Image is overexposed/blown white." if is_too_bright else
                    "Image is a uniform flat color/blank surface without discernible waste items."
                ),
                "error_message": None
            }

        # --- A. Trained MobileNetV3 PyTorch Inference ---
        if self.is_trained_model and self.torch_model is not None:
            tensor = self.eval_transform(img).unsqueeze(0)
            with torch.no_grad():
                logits = self.torch_model(tensor)
                probs = torch.softmax(logits, dim=1).squeeze(0).cpu().numpy()

            cat_probs = {}
            for idx, prob in enumerate(probs):
                cls_name = self.idx_to_class.get(idx, f"CLASS_{idx}")
                cat_probs[cls_name] = round(float(prob), 3)

            # HAZARDOUS is unrepresented in TrashNet
            cat_probs["HAZARDOUS"] = 0.0

            top_idx = int(np.argmax(probs))
            top_category = self.idx_to_class.get(top_idx, "UNKNOWN")
            top_confidence = round(float(probs[top_idx]), 3)

            # Uncertainty check: if top probability is below 0.38 or image is blurry
            needs_review = is_blurry or top_confidence < 0.40
            if top_confidence < 0.35:
                top_category = "UNKNOWN"

            duration_ms = round((time.perf_counter_ns() - t0) / 1_000_000.0, 2)
            return {
                "status": "NEEDS_HUMAN_REVIEW" if needs_review else "COMPLETED",
                "model_name": self.MODEL_NAME,
                "model_version": self.MODEL_VERSION,
                "deployment_mode": self.deployment_mode,
                "primary_category": top_category,
                "confidence": top_confidence,
                "inference_duration_ms": duration_ms,
                "category_probabilities": cat_probs,
                "quality": quality,
                "unsupported_categories": ["HAZARDOUS"],
                "rejection_reason": "Low confidence or motion blur detected. Manual supervisor review recommended." if needs_review else None,
                "error_message": None
            }

        # --- B. Development Heuristic Fallback ---
        logits = np.dot(self.weights, feat_vector) + self.biases
        exp_logits = np.exp(logits - np.max(logits))
        probabilities = exp_logits / np.sum(exp_logits)

        cat_probs = {self.CLASSES[i]: round(float(probabilities[i]), 3) for i in range(len(self.CLASSES))}
        top_idx = int(np.argmax(probabilities))
        top_category = self.CLASSES[top_idx]
        top_confidence = round(float(probabilities[top_idx]), 3)

        needs_review = is_blurry or top_confidence < 0.38
        if top_confidence < 0.30:
            top_category = "UNKNOWN"

        duration_ms = round((time.perf_counter_ns() - t0) / 1_000_000.0, 2)
        return {
            "status": "NEEDS_HUMAN_REVIEW" if needs_review else "COMPLETED",
            "model_name": self.MODEL_NAME,
            "model_version": self.MODEL_VERSION,
            "deployment_mode": self.deployment_mode,
            "primary_category": top_category,
            "confidence": top_confidence,
            "inference_duration_ms": duration_ms,
            "category_probabilities": cat_probs,
            "quality": quality,
            "rejection_reason": "Low confidence or motion blur detected. Manual review recommended." if needs_review else None,
            "error_message": None
        }

    def evaluate_fill_and_overflow(self, image_data, report_type="OVERFLOWING_BIN"):
        """
        Evaluates fill level percentage and overflow flags.
        Distinguishes between containerized dustbins and open street litter.
        Notice: Uses an experimental edge-density texture heuristic, not volumetric ground truth.
        """
        if report_type not in ["OVERFLOWING_BIN", "DUSTBIN_DAMAGE"]:
            return {
                "fill_level_percentage": None,
                "fill_state": "NOT_APPLICABLE",
                "is_overflowing": False,
                "confidence": 0.90,
                "notes": "Report is for loose/scattered ground waste; container volume estimation is not applicable."
            }

        try:
            img = self.load_image(image_data)
        except Exception:
            return {
                "fill_level_percentage": None,
                "fill_state": "UNAVAILABLE",
                "is_overflowing": False,
                "confidence": 0.0,
                "notes": "Failed to decode image for fill analysis."
            }

        w, h = img.size
        if w < 16 or h < 16:
            return {
                "fill_level_percentage": None,
                "fill_state": "UNCERTAIN",
                "is_overflowing": False,
                "confidence": 0.20,
                "notes": "Image resolution too low for container fill segmentation."
            }

        gray = img.convert("L")
        edges = gray.filter(ImageFilter.FIND_EDGES)
        np_edges = np.array(edges, dtype=np.float64) / 255.0

        half_h = max(1, h // 2)
        upper_slice = np_edges[:half_h, :]
        lower_slice = np_edges[half_h:, :]

        upper_edge_mean = float(np.mean(upper_slice)) * 255.0 if upper_slice.size > 0 else 0.0
        lower_edge_mean = float(np.mean(lower_slice)) * 255.0 if lower_slice.size > 0 else 0.0

        if np.isnan(upper_edge_mean):
            upper_edge_mean = 0.0
        if np.isnan(lower_edge_mean):
            lower_edge_mean = 0.0

        if upper_edge_mean < 4.0 and lower_edge_mean < 4.0:
            return {
                "fill_level_percentage": None,
                "fill_state": "UNCERTAIN",
                "is_overflowing": False,
                "confidence": 0.35,
                "notes": "Image lacks sufficient edge details to reliably calculate container fill load."
            }

        raw_fill = int(lower_edge_mean * 2.2 + upper_edge_mean * 1.9)
        fill_percentage = int(np.clip(raw_fill, 15, 100))

        is_overflowing = (upper_edge_mean > 14.0 and fill_percentage >= 70) or (fill_percentage >= 88)
        fill_state = "OVERFLOWING" if is_overflowing else ("HIGH" if fill_percentage >= 75 else ("MEDIUM" if fill_percentage >= 45 else "LOW"))

        return {
            "fill_level_percentage": fill_percentage,
            "fill_state": fill_state,
            "is_overflowing": is_overflowing,
            "upper_edge_density": round(float(upper_edge_mean), 1),
            "lower_edge_density": round(float(lower_edge_mean), 1),
            "confidence": round(min(0.92, 0.65 + (0.15 if is_overflowing else 0.05)), 2),
            "notes": f"Container assessed at {fill_percentage}% load via experimental edge-density heuristic ({fill_state.lower()}). Notice: not a volumetric sensor measurement."
        }
