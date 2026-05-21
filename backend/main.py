"""
main.py — Application entry point & factory
============================================
Responsibilities:
  - Create and configure the Flask app
  - Initialise extensions (SQLAlchemy, JWT, CORS)
  - Register all Blueprints
  - Create DB tables on first run
"""

import os
os.environ['OAUTHLIB_RELAX_TOKEN_SCOPE'] = '1'

from flask import Flask, jsonify
from flask_cors import CORS
from flask_jwt_extended import JWTManager
from dotenv import load_dotenv

from database.models import db          # SQLAlchemy instance
from routes.auth_routes import auth_bp
from routes.expense_routes import expense_bp

# ── Load environment variables from .env ──────────────────────────────────────
load_dotenv()


def create_app() -> Flask:
    """
    Application factory pattern — makes testing and multiple
    configs (dev / staging / prod) straightforward.
    """
    app = Flask(__name__)

    # ── Core config ───────────────────────────────────────────────────────────
    app.config["SECRET_KEY"] = os.getenv("SECRET_KEY", "change-me-in-production")

    # SQLite for development; replace DATABASE_URL in .env for Postgres in prod
    app.config["SQLALCHEMY_DATABASE_URI"] = os.getenv(
        "DATABASE_URL", "sqlite:///expense_tracker.db"
    )
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    # ── JWT config ────────────────────────────────────────────────────────────
    app.config["JWT_SECRET_KEY"] = os.getenv("JWT_SECRET_KEY", "jwt-secret-change-me")
    app.config["JWT_ACCESS_TOKEN_EXPIRES"] = int(
        os.getenv("JWT_ACCESS_TOKEN_EXPIRES_HOURS", 24)
    ) * 3600  # seconds

    # ── Extensions ────────────────────────────────────────────────────────────
    db.init_app(app)
    JWTManager(app)

    # CORS: tighten origins in production via the CORS_ORIGINS env var
    allowed_origins = os.getenv("CORS_ORIGINS", "*").split(",")
    CORS(app, resources={r"/api/*": {"origins": allowed_origins}})

    # ── Blueprints ────────────────────────────────────────────────────────────
    app.register_blueprint(auth_bp,    url_prefix="/api/auth")
    app.register_blueprint(expense_bp, url_prefix="/api/expenses")

    # ── Health-check endpoint ─────────────────────────────────────────────────
    @app.get("/api/health")
    def health():
        return jsonify({"status": "ok", "service": "AI Expense Tracker"}), 200

    # ── Global error handlers ─────────────────────────────────────────────────
    @app.errorhandler(404)
    def not_found(e):
        return jsonify({"error": "Resource not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(e):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(500)
    def internal_error(e):
        return jsonify({"error": "Internal server error"}), 500

    # ── Create tables (idempotent) ────────────────────────────────────────────
    with app.app_context():
        db.create_all()
        print("[DB] Tables verified / created.")

    return app


# Yeh line Render ke gunicorn ke liye global app object expose karti hai
app = create_app()

# ── Run directly (dev only) ───────────────────────────────────────────────────
if __name__ == "__main__":
    app.run(
        host=os.getenv("FLASK_HOST", "0.0.0.0"),
        port=int(os.getenv("FLASK_PORT", 5000)),
        debug=os.getenv("FLASK_DEBUG", "true").lower() == "true",
    )