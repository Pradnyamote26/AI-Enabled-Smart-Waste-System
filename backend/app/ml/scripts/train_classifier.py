import os
import sys
import json
import random
import time
from datetime import datetime, timezone
from PIL import Image

import torch
import torch.nn as nn
from torch.utils.data import Dataset, DataLoader
import torchvision.transforms as transforms
from torchvision.models import mobilenet_v3_small, MobileNet_V3_Small_Weights
from sklearn.metrics import accuracy_score, precision_recall_fscore_support, confusion_matrix

# Directories
CURRENT_DIR = os.path.dirname(os.path.abspath(__file__))
BACKEND_DIR = os.path.abspath(os.path.join(CURRENT_DIR, "..", "..", ".."))
DATASET_DIR = os.path.join(BACKEND_DIR, "data", "trashnet", "dataset-resized")
MODELS_DIR = os.path.join(BACKEND_DIR, "app", "ml", "models")

# Class mapping from TrashNet folders to Application Classes
# Notice: TrashNet has 6 raw folders; 'cardboard' and 'paper' both map to 'PAPER'.
# 'trash' maps to 'ORGANIC' (mixed municipal residual waste).
# 'HAZARDOUS' is NOT present in TrashNet and is explicitly documented as unrepresented.
RAW_TO_APP_MAP = {
    "cardboard": "PAPER",
    "paper": "PAPER",
    "glass": "GLASS",
    "metal": "METAL",
    "plastic": "PLASTIC",
    "trash": "ORGANIC"
}

TARGET_CLASSES = ["GLASS", "PAPER", "PLASTIC", "METAL", "ORGANIC"]
CLASS_TO_IDX = {cls_name: idx for idx, cls_name in enumerate(TARGET_CLASSES)}
IDX_TO_CLASS = {idx: cls_name for idx, cls_name in enumerate(TARGET_CLASSES)}

class TrashNetDataset(Dataset):
    def __init__(self, samples, transform=None):
        self.samples = samples
        self.transform = transform

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label_idx = self.samples[idx]
        with Image.open(path) as img:
            img = img.convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label_idx

def prepare_splits(dataset_dir, seed=42, train_ratio=0.70, val_ratio=0.15, test_ratio=0.15):
    """
    Scans images, maps classes, and creates stratified train/val/test splits without leakage.
    """
    random.seed(seed)
    class_samples = {cls_name: [] for cls_name in TARGET_CLASSES}

    for raw_folder, app_class in RAW_TO_APP_MAP.items():
        folder_path = os.path.join(dataset_dir, raw_folder)
        if not os.path.exists(folder_path):
            continue
        for fname in sorted(os.listdir(folder_path)):
            if fname.lower().endswith((".jpg", ".jpeg", ".png")):
                full_path = os.path.join(folder_path, fname)
                class_samples[app_class].append(full_path)

    train_samples, val_samples, test_samples = [], [], []

    for app_class, paths in class_samples.items():
        random.shuffle(paths)
        n = len(paths)
        n_train = int(n * train_ratio)
        n_val = int(n * val_ratio)

        train_paths = paths[:n_train]
        val_paths = paths[n_train:n_train + n_val]
        test_paths = paths[n_train + n_val:]

        label_idx = CLASS_TO_IDX[app_class]
        train_samples.extend([(p, label_idx) for p in train_paths])
        val_samples.extend([(p, label_idx) for p in val_paths])
        test_samples.extend([(p, label_idx) for p in test_paths])

    random.shuffle(train_samples)
    random.shuffle(val_samples)
    random.shuffle(test_samples)

    return train_samples, val_samples, test_samples

def train_model(epochs=4, batch_size=32, lr=1e-3, seed=42):
    torch.manual_seed(seed)
    random.seed(seed)

    os.makedirs(MODELS_DIR, exist_ok=True)
    if not os.path.exists(DATASET_DIR):
        raise FileNotFoundError(f"Dataset directory not found: {DATASET_DIR}. Please run download_trashnet.py first.")

    print(f"[INFO] Preparing dataset splits from {DATASET_DIR}...")
    train_samples, val_samples, test_samples = prepare_splits(DATASET_DIR, seed=seed)
    print(f"  - Train samples: {len(train_samples)}")
    print(f"  - Val samples:   {len(val_samples)}")
    print(f"  - Test samples:  {len(test_samples)}")

    # Save split filenames for reproducibility and audit
    splits_record = {
        "dataset_name": "TrashNet (Gary Thung, Mindy Yang, Stanford CS229)",
        "license": "MIT License",
        "created_at": datetime.now(timezone.utc).isoformat(),
        "seed": seed,
        "train_count": len(train_samples),
        "val_count": len(val_samples),
        "test_count": len(test_samples),
        "target_classes": TARGET_CLASSES,
        "test_sample_paths": [p for p, _ in test_samples]
    }
    with open(os.path.join(MODELS_DIR, "dataset_splits.json"), "w") as f:
        json.dump(splits_record, f, indent=2)

    # Preprocessing transforms (ImageNet standard)
    train_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.RandomHorizontalFlip(p=0.5),
        transforms.RandomRotation(15),
        transforms.ColorJitter(brightness=0.1, contrast=0.1),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    eval_transform = transforms.Compose([
        transforms.Resize((224, 224)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225])
    ])

    train_loader = DataLoader(TrashNetDataset(train_samples, transform=train_transform), batch_size=batch_size, shuffle=True)
    val_loader = DataLoader(TrashNetDataset(val_samples, transform=eval_transform), batch_size=batch_size, shuffle=False)

    print("[INFO] Loading pretrained MobileNetV3-Small backbone...")
    weights = MobileNet_V3_Small_Weights.DEFAULT
    model = mobilenet_v3_small(weights=weights)

    # Freeze feature extraction layers, train classifier head
    for param in model.features.parameters():
        param.requires_grad = False

    # Replace classifier output with 5 target classes
    num_ftrs = model.classifier[3].in_features
    model.classifier[3] = nn.Linear(num_ftrs, len(TARGET_CLASSES))

    criterion = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.classifier.parameters(), lr=lr)

    best_val_f1 = 0.0
    best_weights_path = os.path.join(MODELS_DIR, "ecovision_wastenet_mobilenetv3.pt")

    print(f"[INFO] Starting training for {epochs} epochs...")
    start_time = time.time()

    for epoch in range(1, epochs + 1):
        model.train()
        running_loss = 0.0
        for images, labels in train_loader:
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            running_loss += loss.item() * images.size(0)

        epoch_loss = running_loss / len(train_samples)

        # Validation
        model.eval()
        val_preds, val_targets = [], []
        with torch.no_grad():
            for images, labels in val_loader:
                outputs = model(images)
                preds = torch.argmax(outputs, dim=1)
                val_preds.extend(preds.cpu().numpy())
                val_targets.extend(labels.cpu().numpy())

        val_acc = accuracy_score(val_targets, val_preds)
        _, _, val_f1, _ = precision_recall_fscore_support(val_targets, val_preds, average="macro", zero_division=0)

        print(f"  Epoch [{epoch}/{epochs}] - Train Loss: {epoch_loss:.4f} | Val Acc: {val_acc:.4f} | Val Macro-F1: {val_f1:.4f}")

        if val_f1 >= best_val_f1 or epoch == 1:
            best_val_f1 = val_f1
            torch.save(model.state_dict(), best_weights_path)
            print(f"    --> Saved best model checkpoint to {best_weights_path}")

    train_duration = round(time.time() - start_time, 2)
    print(f"[SUCCESS] Training completed in {train_duration}s. Best Val Macro-F1: {best_val_f1:.4f}")

    # Save class mapping
    class_mapping = {
        "target_classes": TARGET_CLASSES,
        "class_to_idx": CLASS_TO_IDX,
        "idx_to_class": {str(k): v for k, v in IDX_TO_CLASS.items()},
        "unsupported_classes": ["HAZARDOUS"],
        "unsupported_policy": "Flagged for supervisor review (NEEDS_HUMAN_REVIEW) because HAZARDOUS waste is not represented in the TrashNet training dataset."
    }
    with open(os.path.join(MODELS_DIR, "class_mapping.json"), "w") as f:
        json.dump(class_mapping, f, indent=2)

    # Save model metadata
    model_metadata = {
        "model_name": "EcoVision-WasteNet-MobileNetV3",
        "model_version": "v3.0-mobilenetv3-small",
        "architecture": "MobileNetV3-Small (Transfer Learning)",
        "input_resolution": [224, 224, 3],
        "framework": f"PyTorch {torch.__version__}",
        "dataset_name": "TrashNet",
        "dataset_source": "Gary Thung & Mindy Yang, Stanford CS229 (HuggingFace garythung/trashnet)",
        "license": "MIT License",
        "training_samples": len(train_samples),
        "validation_samples": len(val_samples),
        "test_samples": len(test_samples),
        "training_epochs": epochs,
        "training_duration_seconds": train_duration,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "weights_file": "ecovision_wastenet_mobilenetv3.pt",
        "supported_classes": TARGET_CLASSES,
        "unsupported_classes": ["HAZARDOUS"]
    }
    with open(os.path.join(MODELS_DIR, "model_metadata.json"), "w") as f:
        json.dump(model_metadata, f, indent=2)

    print("[SUCCESS] All model artifacts and metadata saved to:", MODELS_DIR)
    return best_weights_path

if __name__ == "__main__":
    train_model(epochs=4, batch_size=32, lr=1e-3, seed=42)
