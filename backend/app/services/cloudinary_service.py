import os
import uuid
import base64
import requests
from app.config import Config

class CloudinaryService:
    @classmethod
    def upload_image(cls, file_or_b64, folder="smart_waste_reports"):
        """
        Uploads image payload to Cloudinary if configured, otherwise stores locally.
        Returns: {secure_url, asset_id, provider, upload_status}
        """
        cloud_name = Config.CLOUDINARY_CLOUD_NAME
        api_key = Config.CLOUDINARY_API_KEY
        api_secret = Config.CLOUDINARY_API_SECRET

        # If Cloudinary is configured
        if cloud_name and api_key and api_secret:
            try:
                # Prepare payload
                upload_url = f"https://api.cloudinary.com/v1_1/{cloud_name}/image/upload"
                data = {"upload_preset": "smart_waste_preset", "folder": folder}
                # For signed or basic upload
                files = {"file": file_or_b64}
                resp = requests.post(upload_url, data=data, files=files, timeout=8.0)
                if resp.status_code == 200:
                    res_json = resp.json()
                    return {
                        "secure_url": res_json.get("secure_url"),
                        "asset_id": res_json.get("public_id"),
                        "provider": "CLOUDINARY",
                        "upload_status": "COMPLETED"
                    }
            except Exception as e:
                print(f"Cloudinary upload failed: {e}. Falling back to local storage.")

        # Local fallback storage
        os.makedirs(Config.UPLOAD_FOLDER, exist_ok=True)
        asset_id = f"waste_img_{uuid.uuid4().hex[:12]}"
        
        # Determine image bytes
        if isinstance(file_or_b64, str):
            data_str = file_or_b64
            if "base64," in data_str:
                header, data_str = data_str.split("base64,", 1)
            raw_bytes = base64.b64decode(data_str)
            ext = "png" if "png" in file_or_b64[:30] else "jpg"
        elif hasattr(file_or_b64, "read"):
            raw_bytes = file_or_b64.read()
            ext = "jpg"
        else:
            raw_bytes = file_or_b64
            ext = "jpg"

        filename = f"{asset_id}.{ext}"
        filepath = os.path.join(Config.UPLOAD_FOLDER, filename)
        with open(filepath, "wb") as f:
            f.write(raw_bytes)

        # Return local accessible URL or base64 representation
        # Also return a base64 data URL for instant frontend preview
        b64_preview = f"data:image/{ext};base64,{base64.b64encode(raw_bytes).decode('utf-8')}"

        return {
            "secure_url": b64_preview,
            "asset_id": asset_id,
            "provider": "LOCAL_STORAGE",
            "upload_status": "COMPLETED",
            "file_name": filename
        }
