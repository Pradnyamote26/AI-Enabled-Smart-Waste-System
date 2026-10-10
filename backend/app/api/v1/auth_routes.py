import functools
import hashlib
import jwt
from datetime import datetime, timedelta, timezone
from flask import Blueprint, request, jsonify
from app.config import Config
from app.repositories.data_store import DataStore
from app.services.security_service import SecurityService

auth_bp = Blueprint("auth_bp", __name__)

def generate_token(user):
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "role": user["role"],
        "full_name": user["full_name"],
        "exp": datetime.now(timezone.utc) + timedelta(days=7)
    }
    return jwt.encode(payload, Config.SECRET_KEY, algorithm="HS256")

def token_required(roles=None):
    def decorator(f):
        @functools.wraps(f)
        def decorated(*args, **kwargs):
            token = None
            auth_header = request.headers.get("Authorization")
            if auth_header and "Bearer " in auth_header:
                token = auth_header.split("Bearer ")[1].strip()
            
            if not token:
                return jsonify({"error": "UNAUTHORIZED", "message": "Authentication token missing."}), 401

            try:
                decoded = jwt.decode(token, Config.SECRET_KEY, algorithms=["HS256"])
                user = DataStore.get_instance().get("profiles", decoded["sub"])
                if not user or not user.get("is_active"):
                    return jsonify({"error": "FORBIDDEN", "message": "User inactive or revoked."}), 403
                if roles and user.get("role") not in roles:
                    return jsonify({"error": "ACCESS_DENIED", "message": f"Requires one of roles: {roles}"}), 403
                request.current_user = user
            except jwt.ExpiredSignatureError:
                return jsonify({"error": "TOKEN_EXPIRED", "message": "Token has expired."}), 401
            except Exception as e:
                return jsonify({"error": "INVALID_TOKEN", "message": f"Token verification failed: {str(e)}"}), 401

            return f(*args, **kwargs)
        return decorated
    return decorator

@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email or not password:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Email and password are required."}), 400

    store = DataStore.get_instance()
    profiles = store.list("profiles", lambda p: p.get("email", "").lower() == email)
    if not profiles:
        return jsonify({"error": "INVALID_CREDENTIALS", "message": "Invalid email or password."}), 401

    user = profiles[0]
    if not SecurityService.verify_password(user.get("password_hash"), password):
        return jsonify({"error": "INVALID_CREDENTIALS", "message": "Invalid email or password."}), 401

    token = generate_token(user)
    return jsonify({
        "token": token,
        "user": {
            "id": user["id"],
            "full_name": user["full_name"],
            "email": user["email"],
            "phone": user.get("phone"),
            "role": user["role"]
        }
    })

@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json() or {}
    email = data.get("email", "").strip().lower()
    password = data.get("password", "")
    full_name = data.get("full_name", "").strip()
    phone = data.get("phone", "").strip()

    if not email or not password or not full_name:
        return jsonify({"error": "VALIDATION_ERROR", "message": "Full name, email, and password are required."}), 400

    store = DataStore.get_instance()
    if store.list("profiles", lambda p: p.get("email", "").lower() == email):
        return jsonify({"error": "ALREADY_EXISTS", "message": "Email already registered."}), 409

    user_record = {
        "full_name": full_name,
        "email": email,
        "phone": phone,
        "role": "reporter", # Self-registration is restricted to reporter role (AC-02)
        "is_active": True,
        "password_hash": SecurityService.hash_password(password)
    }
    created = store.insert("profiles", user_record)
    token = generate_token(created)

    return jsonify({
        "token": token,
        "user": {
            "id": created["id"],
            "full_name": created["full_name"],
            "email": created["email"],
            "phone": created.get("phone"),
            "role": created["role"]
        }
    }), 201

@auth_bp.route("/me", methods=["GET"])
@token_required()
def me():
    u = request.current_user
    return jsonify({
        "id": u["id"],
        "full_name": u["full_name"],
        "email": u["email"],
        "phone": u.get("phone"),
        "role": u["role"]
    })
