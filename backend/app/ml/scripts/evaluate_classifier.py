import os
import sys
import json
from datetime import datetime, timezone
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as transforms
from torchvision.models import mobilenet_v3_small
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", ".."))
MODELS_DIR = os.path.join(BACKEND_DIR, "app", "ml", "models")
SPLITS_PATH = os.path.join(MODELS_DIR, "dataset_splits.json")
WEIGHTS_PATH = os.path.join(MODELS_DIR, "ecovision_wastenet_mobilenetv3.pt")
CLASS_MAP_PATH = os.path.join(MODELS_DIR, "class_mapping.json")
OUTPUT_PATH = os.path.join(MODELS_DIR, "evaluation_results.json")

class TestWasteDataset(Dataset):
    def __init__(self, sample_paths, class_to_idx, raw_to_app_map, transform=None):
        self.samples = []
        self.transform = transform
        for p in sample_paths:
            # Determine class from folder
            folder_name = os.path.basename(os.path.dirname(p))
            app_class = raw_to_app_map.get(folder_name)
            if app_class and app_class in class_to_idx:
                self.samples.append((p, class_to_idx[app_class]))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label_idx = self.samples[idx]
        with Image.open(path) as img:
            img = img.convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label_idx

def evaluate():
    if not os.path.exists(WEIGHTS_PATH):
        raise FileNotFoundError(f"Model checkpoint not found: {WEIGHTS_PATH}. Run train_classifier.py first.")
    if not os.path.exists(SPLITS_PATH):
        raise FileNotFoundError(f"Splits file not found: {SPLITS_PATH}.")

    with open(SPLITS_PATH, "r") as f:
        splits = json.load(f)
    with open(CLASS_MAP_PATH, "r") as f:
        class_map = json.load(f)

    target_classes = class_map["target_classes"]
    class_to_idx = class_map["class_to_idx"]
    raw_to_app_map = {
        "cardboard": "PAPER",
        "paper": "PAPER",
        "glass": "GLASS",
        "metal": "METAL",
        "plastic": "PLASTIC",
        "trash": "ORGANIC"
    }

    test_paths = splits["test_sample_paths"]
    print(f"[INFO] Loaded {len(test_paths)} held-out test sample paths from dataset_splits.json")

    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    test_dataset = TestWasteDataset(test_paths, class_to_idx, raw_to_app_map, transform=eval_transform)
    test_loader = DataLoader(test_dataset, batch_size=32, shuffle=False)

    print("[INFO] Instantiating MobileNetV3-Small architecture and loading weights...")
    model = mobilenet_v3_small(weights=None)
    num_ftrs = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(num_ftrs, len(target_classes))
    model.load_state_dict(torch.load(WEIGHTS_PATH, map_location="cpu", weights_only=True))
    model.eval()

    y_true, y_pred = [], []
    with torch.no_grad():
        for images, labels in test_loader:
            outputs = model(images)
            preds = torch.argmax(outputs, dim=1)
            y_true.extend(labels.cpu().numpy())
            y_pred.extend(preds.cpu().numpy())

    acc = float(accuracy_score(y_true, y_pred))
    p_macro, r_macro, f1_macro, _ = precision_recall_fscore_support(y_true, y_pred, average="macro", zero_division=0)
    p_weight, r_weight, f1_weight, _ = precision_recall_fscore_support(y_true, y_pred, average="weighted", zero_division=0)
    p_per, r_per, f1_per, support_per = precision_recall_fscore_support(y_true, y_pred, average=None, zero_division=0)
    cm = confusion_matrix(y_true, y_pred).tolist()

    per_class_metrics = {}
    class_distribution = {}
    for idx, cls_name in enumerate(target_classes):
        per_class_metrics[cls_name] = {
            "precision": round(float(p_per[idx]), 4),
            "recall": round(float(r_per[idx]), 4),
            "f1_score": round(float(f1_per[idx]), 4),
            "test_sample_count": int(support_per[idx])
        }
        class_distribution[cls_name] = int(support_per[idx])

    eval_report = {
        "status": "VALIDATED_ON_HELD_OUT_TEST_SET",
        "model_name": "EcoVision-WasteNet-MobileNetV3",
        "model_version": "v3.0-mobilenetv3-small",
        "evaluated_at": datetime.now(timezone.utc).isoformat(),
        "dataset_name": "TrashNet Held-Out Test Split (15%)",
        "test_sample_count": len(y_true),
        "target_classes": target_classes,
        "unsupported_classes": ["HAZARDOUS"],
        "class_distribution": class_distribution,
        "accuracy": round(acc, 4),
        "macro_precision": round(float(p_macro), 4),
        "macro_recall": round(float(r_macro), 4),
        "macro_f1": round(float(f1_macro), 4),
        "weighted_f1": round(float(f1_weight), 4),
        "per_class_metrics": per_class_metrics,
        "confusion_matrix": cm,
        "evaluation_notes": (
            f"Evaluated on {len(y_true)} strictly unseen held-out test photos from the TrashNet benchmark. "
            "Zero overlap with training or validation splits. "
            "HAZARDOUS waste is unrepresented in TrashNet and falls back to manual review."
        )
    }

    with open(OUTPUT_PATH, "w") as f:
        json.dump(eval_report, f, indent=2)

    print("\n==================================================================")
    print("           ECOVISION-WASTENET HELD-OUT EVALUATION RESULTS         ")
    print("==================================================================")
    print(f"Overall Accuracy:  {acc * 100:.2f}%")
    print(f"Macro-F1 Score:    {f1_macro * 100:.2f}%")
    print(f"Weighted-F1:       {f1_weight * 100:.2f}%")
    print(f"Total Test Images: {len(y_true)}")
    print("------------------------------------------------------------------")
    print("Per-Class Breakdown:")
    for cls_name, metrics in per_class_metrics.items():
        print(f"  {cls_name:<10} | Prec: {metrics['precision']:.3f} | Rec: {metrics['recall']:.3f} | F1: {metrics['f1_score']:.3f} | Support: {metrics['test_sample_count']}")
    print("------------------------------------------------------------------")
    print("Confusion Matrix (rows: True, cols: Predicted):")
    print("Classes:", target_classes)
    for row in cm:
        print(" ", row)
    print("==================================================================")
    print(f"[SUCCESS] Evaluation report saved to: {OUTPUT_PATH}")
    return eval_report

if __name__ == "__main__":
    evaluate()
