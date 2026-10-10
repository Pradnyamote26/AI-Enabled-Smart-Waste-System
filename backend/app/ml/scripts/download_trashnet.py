import os
import sys
import zipfile
import requests

DATASET_URL = "https://huggingface.co/datasets/garythung/trashnet/resolve/main/dataset-resized.zip"
TARGET_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "..", "data", "trashnet"))
ZIP_PATH = os.path.join(TARGET_DIR, "dataset-resized.zip")

def download_and_extract():
    os.makedirs(TARGET_DIR, exist_ok=True)
    extracted_marker = os.path.join(TARGET_DIR, "dataset-resized")
    if os.path.exists(extracted_marker) and len(os.listdir(extracted_marker)) >= 6:
        print(f"[INFO] TrashNet dataset already downloaded and extracted at: {extracted_marker}")
        return extracted_marker

    print(f"[INFO] Downloading TrashNet dataset from: {DATASET_URL}...")
    headers = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"}
    resp = requests.get(DATASET_URL, headers=headers, stream=True, timeout=60)
    resp.raise_for_status()

    total_bytes = int(resp.headers.get("content-length", 0))
    downloaded = 0
    with open(ZIP_PATH, "wb") as f:
        for chunk in resp.iter_content(chunk_size=1024 * 1024):
            if chunk:
                f.write(chunk)
                downloaded += len(chunk)
                if total_bytes > 0:
                    pct = (downloaded / total_bytes) * 100
                    sys.stdout.write(f"\rDownloading: {downloaded / 1024 / 1024:.1f} MB / {total_bytes / 1024 / 1024:.1f} MB ({pct:.1f}%)")
                    sys.stdout.flush()

    print("\n[INFO] Extracting dataset-resized.zip...")
    with zipfile.ZipFile(ZIP_PATH, "r") as z:
        z.extractall(TARGET_DIR)

    if os.path.exists(ZIP_PATH):
        os.remove(ZIP_PATH)

    print(f"[SUCCESS] TrashNet extracted successfully to: {extracted_marker}")
    for folder in sorted(os.listdir(extracted_marker)):
        fpath = os.path.join(extracted_marker, folder)
        if os.path.isdir(fpath):
            count = len(os.listdir(fpath))
            print(f"  - Class '{folder}': {count} images")

    return extracted_marker

if __name__ == "__main__":
    download_and_extract()
