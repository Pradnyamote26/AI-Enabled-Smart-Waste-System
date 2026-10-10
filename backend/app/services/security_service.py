import hashlib
import jwt
from werkzeug.security import generate_password_hash, check_password_hash
from app.config import Config

class SecurityService:
    @staticmethod
    def decode_jwt(token: str):
        """
        Decodes and verifies a JWT token using the application secret key.
        """
        if not token:
            return None
        try:
            return jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
        except Exception:
            return None
    @staticmethod
    def hash_password(password: str) -> str:
        """
        Hashes password using established, salted scrypt/pbkdf2 algorithm
        via werkzeug.security. Never uses raw SHA-256 for passwords.
        """
        if not password:
            raise ValueError("Password cannot be empty.")
        return generate_password_hash(password, method="scrypt")

    @staticmethod
    def verify_password(stored_hash: str, candidate_password: str) -> bool:
        """
        Verifies candidate password against stored hash with constant-time comparison.
        Supports automatic fallback for legacy SHA-256 hashes during migration.
        """
        if not stored_hash or not candidate_password:
            return False

        try:
            if check_password_hash(stored_hash, candidate_password):
                return True
        except Exception:
            pass

        # Legacy SHA-256 fallback (for pre-existing seed databases)
        legacy_hash = hashlib.sha256(candidate_password.encode()).hexdigest()
        if stored_hash == legacy_hash:
            return True

        return False
