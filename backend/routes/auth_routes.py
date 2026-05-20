"""
routes/auth_routes.py — Authentication Blueprint (Google OAuth only)
=====================================================================
AI Expense Tracker

The ONLY auth path is Google OAuth 2.0.
Email/password signup and login endpoints are removed.

Critical no-data-loss rule (POST /api/auth/google):
  - Lookup user by google_email.
  - If found: update refresh_token only. NEVER overwrite google_sheet_id,
    billing_start_day, income_type, fixed_salary_amount.
  - Account Type is updated if explicitly requested during login.
  - If new: create record, provision sheet, set account_type from payload.
"""

import logging
import os

from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token, get_jwt_identity, jwt_required
from sqlalchemy.exc import IntegrityError
from datetime import datetime, timezone

from database.models import db, User

logger  = logging.getLogger(__name__)
auth_bp = Blueprint("auth", __name__)

GOOGLE_TOKEN_URL    = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v3/userinfo"
GOOGLE_SCOPES = [
    "https://www.googleapis.com/auth/spreadsheets",
    "https://www.googleapis.com/auth/drive.file",
    "openid", "email", "profile",
]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _exchange_code_for_tokens(auth_code: str) -> dict:
    from google_auth_oauthlib.flow import Flow

    client_id     = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")
    redirect_uri  = os.getenv("GOOGLE_REDIRECT_URI", "postmessage")

    if not client_id or not client_secret:
        raise RuntimeError("GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env")

    flow = Flow.from_client_config(
        client_config={"web": {
            "client_id":     client_id,
            "client_secret": client_secret,
            "auth_uri":      "https://accounts.google.com/o/oauth2/auth",
            "token_uri":     GOOGLE_TOKEN_URL,
            "redirect_uris": [redirect_uri],
        }},
        scopes=GOOGLE_SCOPES,
        redirect_uri=redirect_uri,
    )
    flow.fetch_token(code=auth_code)
    creds = flow.credentials

    if not creds.refresh_token:
        logger.warning(
            "[auth/google] No refresh_token returned for this code exchange. "
            "Existing stored token (if any) will be kept. "
            "User may need to revoke app access at myaccount.google.com/permissions "
            "to force a new refresh_token on next login."
        )

    return {
        "access_token":  creds.token,
        "refresh_token": creds.refresh_token,
    }


def _get_google_userinfo(access_token: str) -> dict:
    import requests
    resp = requests.get(
        GOOGLE_USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    resp.raise_for_status()
    return resp.json()


def _create_sheet_in_user_drive(access_token: str, username: str) -> str:
    from google.oauth2.credentials import Credentials
    import gspread

    creds = Credentials(
        token=access_token,
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        token_uri=GOOGLE_TOKEN_URL,
    )
    gc         = gspread.authorize(creds)
    sheet_name = f"AI Expense Tracker — {username}"
    sheet      = gc.create(sheet_name)

    try:
        ws = sheet.sheet1
        ws.append_row(
            ["Date", "Type", "Category", "Amount", "Currency", "Notes", "Timestamp", "Recorded By"],
            value_input_option="USER_ENTERED",
        )
        ws.format("A1:H1", {"textFormat": {"bold": True}})
        ws.update_title(datetime.now(timezone.utc).strftime("%B-%Y"))
    except Exception as e:
        logger.warning("[auth/google] Sheet header setup non-critical error: %s", e)

    logger.info("[auth/google] Created sheet '%s' id=%s", sheet_name, sheet.id)
    return sheet.id


# ── Routes ────────────────────────────────────────────────────────────────────

@auth_bp.post("/google")
def google_oauth():
    data = request.get_json(silent=True) or {}
    code = data.get("code", "").strip()
    if not code:
        return jsonify({"error": "Authorization code is required"}), 422

    account_type = data.get("account_type", "household")
    try:
        User.validate_account_type(account_type)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422

    # 1. Exchange code for tokens
    try:
        tokens = _exchange_code_for_tokens(code)
    except Exception as exc:
        logger.error("[auth/google] Token exchange failed: %s", exc)
        return jsonify({"error": f"Google token exchange failed: {exc}"}), 400

    google_access_token = tokens["access_token"]
    new_refresh_token   = tokens.get("refresh_token")

    # 2. Fetch Google profile
    try:
        profile = _get_google_userinfo(google_access_token)
    except Exception as exc:
        logger.error("[auth/google] Userinfo fetch failed: %s", exc)
        return jsonify({"error": "Could not fetch Google profile"}), 400

    google_email = profile.get("email", "").lower()
    google_name  = profile.get("name", "")

    if not google_email:
        return jsonify({"error": "Google did not return an email address"}), 400

    # 3. Find or create user
    user         = User.query.filter_by(email=google_email).first()
    sheet_created = False
    is_new_user  = user is None

    if is_new_user:
        base = (google_name.replace(" ", "").lower() or google_email.split("@")[0])[:30]
        username, counter = base, 1
        while User.query.filter_by(username=username).first():
            username = f"{base[:28]}{counter}"
            counter += 1

        user = User(
            username=username,
            email=google_email,
            google_email=google_email,
            account_type=account_type,     
            oauth_provider="google",
        )
        db.session.add(user)
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
            user = User.query.filter_by(email=google_email).first()
            if not user:
                return jsonify({"error": "Account conflict. Please try again."}), 409
    else:
        # YAHAN FIX KIYA HAI: Purane user ka account_type bhi update karein agar login pe new select kiya hai
        user.oauth_provider = "google"
        user.google_email   = google_email
        if "account_type" in data:
            user.account_type = account_type

    # 4. Refresh token logic
    if new_refresh_token:
        user.refresh_token = new_refresh_token
        logger.info("[auth/google] Stored new refresh_token for %s", google_email)
    elif not user.refresh_token:
        logger.warning("[auth/google] No refresh_token available for %s", google_email)

    # 5. Provision sheet
    if not user.google_sheet_id:
        try:
            user.google_sheet_id = _create_sheet_in_user_drive(
                google_access_token, user.username
            )
            sheet_created = True
        except Exception as exc:
            logger.error("[auth/google] Sheet creation failed: %s", exc)

    db.session.commit()

    app_jwt = create_access_token(identity=str(user.id))

    return jsonify({
        "access_token":  app_jwt,
        "user":          user.to_dict(),
        "sheet_created": sheet_created,
        "is_new_user":   is_new_user,
    }), 200


@auth_bp.get("/me")
@jwt_required()
def me():
    user_id = int(get_jwt_identity())
    user    = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404
    return jsonify({"user": user.to_dict()}), 200


@auth_bp.post("/logout")
@jwt_required()
def logout():
    return jsonify({"message": "Logged out."}), 200


@auth_bp.patch("/me/spreadsheet")
@jwt_required()
def update_spreadsheet():
    user_id = int(get_jwt_identity())
    user    = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data           = request.get_json(silent=True) or {}
    spreadsheet_id = data.get("spreadsheet_id", "").strip()
    if not spreadsheet_id:
        return jsonify({"error": "spreadsheet_id is required"}), 422

    user.spreadsheet_id = spreadsheet_id
    db.session.commit()
    return jsonify({"message": "Spreadsheet linked", "spreadsheet_id": spreadsheet_id}), 200


@auth_bp.patch("/me/settings")
@jwt_required()
def save_settings():
    from database.models import Transaction

    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "User not found"}), 404

    data = request.get_json(silent=True) or {}

    user.billing_start_day = data.get("billing_start_day", 1)
    user.income_type = data.get("income_type", "variable")

    try:
        user.fixed_salary_amount = float(data.get("fixed_salary_amount", 0))
    except (ValueError, TypeError):
        user.fixed_salary_amount = 0.0

    if user.income_type == 'fixed' and user.fixed_salary_amount > 0:
        try:
            new_income = Transaction(
                user_id=user.id,
                type="Income",
                amount=user.fixed_salary_amount,
                category="Salary",
                notes="Auto-added fixed salary",
                currency="PKR",
                transaction_date=datetime.now(timezone.utc).date(),
                source="system",
                account_type=user.account_type
            )
            db.session.add(new_income)
        except Exception as e:
            db.session.rollback()
            logger.error("[save_settings] Local DB salary injection failed: %s", e)

    db.session.commit()
    return jsonify({"message": "Settings updated and salary injected"}), 200