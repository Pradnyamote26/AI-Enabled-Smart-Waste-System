from flask import Flask, jsonify
from flask_cors import CORS
from app.config import Config

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Enable CORS for all routes across the entire application
    CORS(app, resources={r"/*": {"origins": "*"}}, allow_headers="*", methods=["GET", "HEAD", "POST", "OPTIONS", "PUT", "PATCH", "DELETE"])

    # Register blueprints
    from app.api.v1.auth_routes import auth_bp
    from app.api.v1.admin_routes import admin_bp
    from app.api.v1.route_routes import route_bp
    from app.api.v1.driver_routes import driver_bp
    from app.api.v1.report_routes import report_bp
    from app.api.v1.proof_routes import proof_bp
    from app.api.v1.ai_routes import ai_bp
    from app.api.v1.tracking_routes import tracking_bp

    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(admin_bp, url_prefix="/api/v1/admin")
    app.register_blueprint(route_bp, url_prefix="/api/v1/admin")
    app.register_blueprint(driver_bp, url_prefix="/api/v1")
    app.register_blueprint(report_bp, url_prefix="/api/v1")
    app.register_blueprint(proof_bp, url_prefix="/api/v1")
    app.register_blueprint(ai_bp, url_prefix="/api/v1")
    app.register_blueprint(tracking_bp, url_prefix="/api/v1")

    # Global Error Handlers
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "NOT_FOUND", "message": "The requested API resource does not exist."}), 404

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "INTERNAL_SERVER_ERROR", "message": "An unexpected server error occurred."}), 500

    @app.route("/api/v1/health", methods=["GET"])
    def health_check():
        return jsonify({"status": "HEALTHY", "service": "Smart Waste Operations API", "version": "1.0.0"})

    return app
