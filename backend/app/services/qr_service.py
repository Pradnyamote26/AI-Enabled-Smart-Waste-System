import io
import base64
import qrcode

class QRService:
    @staticmethod
    def generate_bin_qr(bin_code, qr_token, base_url="http://localhost:5173"):
        """
        Generates QR code for a public dustbin.
        Encodes link: {base_url}/report?qr_token={qr_token}&bin_code={bin_code}
        Returns data URI (PNG) and target URL.
        """
        target_url = f"{base_url}/report?qr_token={qr_token}&bin_code={bin_code}"
        
        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=3,
        )
        qr.add_data(target_url)
        qr.make(fit=True)

        img = qr.make_image(fill_color="#1b4332", back_color="#ffffff")
        
        buffered = io.BytesIO()
        img.save(buffered, format="PNG")
        img_bytes = buffered.getvalue()
        b64_str = base64.b64encode(img_bytes).decode("utf-8")
        data_uri = f"data:image/png;base64,{b64_str}"

        return {
            "target_url": target_url,
            "data_uri": data_uri,
            "bin_code": bin_code,
            "qr_token": qr_token
        }
