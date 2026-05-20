"""
routes/expense_routes.py — Expense Processing Blueprint
========================================================
AI Expense Tracker

Endpoints:
  POST /api/expenses/process-expense
      Accepts multipart/form-data OR JSON:
        - text_command  (str, required)
        - image         (file upload OR base64 string, optional)
        - account_type  (str, optional — overrides user profile for testing)

      OAuth Flow:
        1. Authenticate via JWT
        2. Resolve user.google_sheet_id (set during OAuth sign-in)
        3. Build per-request gspread credentials from user.refresh_token
        4. Validate & parse inputs
        5. Delegate to ai_router for AI extraction
        6. Persist row to the user's own Google Sheet
        7. Return structured JSON to client

  GET /api/expenses/history
      Returns the user's Google Sheet URL and linked sheet ID.
      Now also returns local transaction history for Dashboard charts.
  
  GET /api/expenses/stats
      Returns cycle-based Income, Expense, and Net for the Dashboard cards.
"""

import base64
import io
import logging
import os
import calendar
from datetime import datetime, timezone

from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from PIL import Image, UnidentifiedImageError

from database.models import db, User

expense_bp = Blueprint("expenses", __name__)
logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
MAX_IMAGE_SIZE_MB  = 5
ALLOWED_MIME_TYPES = {"image/jpeg", "image/png", "image/webp", "image/gif"}
GOOGLE_TOKEN_URI   = "https://oauth2.googleapis.com/token"


# ── OAuth credential builder ──────────────────────────────────────────────────

def _build_oauth_credentials(refresh_token: str):
    """
    Build a google.oauth2.credentials.Credentials object from the user's
    stored refresh_token.  The object auto-refreshes the access_token on
    first use so no manual token-refresh step is needed.

    Returns:
        google.oauth2.credentials.Credentials — ready for gspread.authorize()

    Raises:
        EnvironmentError: if GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing
        RuntimeError:     if refresh_token is None / empty
    """
    from google.oauth2.credentials import Credentials

    client_id     = os.getenv("GOOGLE_CLIENT_ID")
    client_secret = os.getenv("GOOGLE_CLIENT_SECRET")

    if not client_id or not client_secret:
        raise EnvironmentError(
            "GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set in .env "
            "for OAuth-based Sheets access."
        )

    if not refresh_token:
        raise RuntimeError(
            "User has no stored refresh_token. "
            "They must re-authenticate via Google OAuth to grant Sheets access."
        )

    return Credentials(
        token=None,                  # no current access token — will be refreshed automatically
        refresh_token=refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=client_id,
        client_secret=client_secret,
        scopes=[
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive.file",
        ],
    )


def _get_gspread_client_for_user(user: "User"):
    """
    Build and return an authenticated gspread.Client scoped to this user's
    OAuth credentials.  Each request gets a fresh client so token refresh
    is always attempted with the latest stored refresh_token.

    Returns:
        gspread.Client

    Raises:
        EnvironmentError / RuntimeError — see _build_oauth_credentials
    """
    import gspread

    creds  = _build_oauth_credentials(user.refresh_token)
    client = gspread.authorize(creds)

    # If the credentials were refreshed, persist the new access token details
    # (the refresh_token itself doesn't change unless Google rotates it)
    return client


# ── Cycle Helper ──────────────────────────────────────────────────────────────

def _get_cycle_bounds(billing_start_day: int):
    """
    Calculate the exact start datetime for the current billing cycle.
    Handles edge cases like day 31 in months with 30 days.
    """
    today = datetime.now(timezone.utc)
    
    # If today's day is greater or equal to billing day, cycle started this month.
    # Otherwise, it started last month.
    start_month = today.month if today.day >= billing_start_day else today.month - 1
    start_year = today.year
    
    if start_month == 0:
        start_month = 12
        start_year -= 1
        
    # Handle edge cases (e.g., if user selects 31, but month is Feb)
    max_day_in_month = calendar.monthrange(start_year, start_month)[1]
    actual_start_day = min(billing_start_day, max_day_in_month)
    
    return datetime(start_year, start_month, actual_start_day, tzinfo=timezone.utc)


# ── Image helpers ─────────────────────────────────────────────────────────────

def _validate_image_bytes(raw_bytes: bytes) -> None:
    """Raise ValueError for oversized or corrupt images."""
    size_mb = len(raw_bytes) / (1024 * 1024)
    if size_mb > MAX_IMAGE_SIZE_MB:
        raise ValueError(
            f"Image too large ({size_mb:.1f} MB). Max allowed: {MAX_IMAGE_SIZE_MB} MB"
        )
    try:
        Image.open(io.BytesIO(raw_bytes)).verify()
    except UnidentifiedImageError:
        raise ValueError("File does not appear to be a valid image")


def _extract_image_base64(request_obj) -> str | None:
    """
    Extract a base64-encoded image from the request.

    Accepts:
      1. Multipart file upload  (field name: "image")
      2. Raw base64 string in JSON body (key: "image_base64")

    Returns pure base64 string (no data-URI prefix) or None.
    """
    # Format 1: multipart file upload
    uploaded_file = request_obj.files.get("image")
    if uploaded_file:
        mime = uploaded_file.mimetype or ""
        if mime not in ALLOWED_MIME_TYPES:
            raise ValueError(
                f"Unsupported image type '{mime}'. Allowed: {ALLOWED_MIME_TYPES}"
            )
        raw_bytes = uploaded_file.read()
        _validate_image_bytes(raw_bytes)
        return base64.b64encode(raw_bytes).decode("utf-8")

    # Format 2: base64 string in JSON body
    json_body  = request_obj.get_json(silent=True) or {}
    b64_string = json_body.get("image_base64", "")
    if b64_string:
        if "," in b64_string:                          # strip data-URI prefix
            b64_string = b64_string.split(",", 1)[1]
        raw_bytes = base64.b64decode(b64_string)
        _validate_image_bytes(raw_bytes)
        return b64_string

    return None


def _parse_text_command(request_obj) -> str:
    """Pull text_command from multipart form OR JSON body."""
    cmd = (request_obj.form.get("text_command") or "").strip()
    if not cmd:
        body = request_obj.get_json(silent=True) or {}
        cmd  = body.get("text_command", "").strip()
    if not cmd:
        raise ValueError("text_command is required")
    return cmd


def _build_expense_row(ai_result: dict, user: "User") -> dict:
    """Merge AI output with request metadata into the final row dict."""
    now = datetime.now(timezone.utc)
    return {
        "timestamp":    now.isoformat(timespec="seconds"),
        "type":         ai_result.get("type",     "Expense"),
        "amount":       ai_result.get("amount",    0),
        "currency":     ai_result.get("currency",  "PKR"),
        "category":     ai_result.get("category",  "Uncategorised"),
        "date":         ai_result.get("date",       now.strftime("%Y-%m-%d")),
        "notes":        ai_result.get("notes",      ""),
        "account_type": user.account_type,
        "username":     user.username,
        "ai_provider":  ai_result.get("provider",  "unknown"),
    }


# ── Sheets append (OAuth-based) ───────────────────────────────────────────────

def _append_to_user_sheet(user: "User", row_data: dict) -> str:
    """
    Open the user's Google Sheet using their OAuth credentials and append
    one row to the current month-year tab (creating it with headers if absent).

    Returns:
        str — the worksheet tab name written to (e.g. "May-2026")

    Raises:
        RuntimeError / gspread exceptions on failure
    """
    from gspread.exceptions import WorksheetNotFound

    sheet_id = user.effective_sheet_id          # google_sheet_id or spreadsheet_id
    if not sheet_id:
        raise RuntimeError(
            "No Google Sheet ID found on user record. "
            "The user must complete Google OAuth so a sheet can be provisioned, "
            "or manually link one via PATCH /api/auth/me/spreadsheet."
        )

    gc          = _get_gspread_client_for_user(user)
    spreadsheet = gc.open_by_key(sheet_id)

    # ── Resolve the current month-year tab ───────────────────────────────────
    tab_name = datetime.now(timezone.utc).strftime("%B-%Y")   # e.g. "May-2026"

    try:
        worksheet = spreadsheet.worksheet(tab_name)
    except WorksheetNotFound:
        # Create the tab and write the standard header row
        headers   = ["Date", "Type", "Category", "Amount", "Currency",
                     "Notes", "Timestamp", "Recorded By"]
        worksheet = spreadsheet.add_worksheet(
            title=tab_name, rows=1000, cols=len(headers)
        )
        worksheet.append_row(headers, value_input_option="USER_ENTERED")
        try:
            hdr_range = f"A1:{chr(ord('A') + len(headers) - 1)}1"
            worksheet.format(hdr_range, {"textFormat": {"bold": True}})
        except Exception as fmt_err:
            logger.warning("[sheets] Header formatting failed (non-critical): %s", fmt_err)

        logger.info("[sheets] Created tab '%s' in sheet '%s'.", tab_name, sheet_id)

    # ── Build the ordered row matching the header columns ────────────────────
    row = [
        row_data.get("date",        ""),
        row_data.get("type",        "Expense"),
        row_data.get("category",    "Other"),
        row_data.get("amount",      0),
        row_data.get("currency",    "PKR"),
        row_data.get("notes",       ""),
        row_data.get("timestamp",   datetime.now(timezone.utc).isoformat(timespec="seconds")),
        row_data.get("username",    ""),
    ]

    worksheet.append_row(
        row,
        value_input_option="USER_ENTERED",
        insert_data_option="INSERT_ROWS",
        table_range="A1",
    )

    logger.info(
        "[sheets] Appended row to '%s' in sheet '%s'. Amount: %s %s",
        tab_name, sheet_id,
        row_data.get("amount"),
        row_data.get("currency", "PKR"),
    )
    return tab_name


# ── Routes ────────────────────────────────────────────────────────────────────

@expense_bp.post("/process-expense")
@jwt_required()
def process_expense():
    """Main AI pipeline endpoint."""
    from services.ai_router import route_to_ai
    from datetime import datetime, timezone

    # ── 1. Load & validate the authenticated user ─────────────────────────────
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Authenticated user not found"}), 404

    # ── 2. Check that we have a sheet to write to ─────────────────────────────
    if not user.effective_sheet_id:
        return jsonify({
            "error": "No Google Sheet is linked to your account."
        }), 400

    # ── 3. Check that we can authenticate with Google Sheets ─────────────────
    if not user.refresh_token:
        return jsonify({
            "error": "Your account is not connected to Google."
        }), 400

    # ── 4. Parse request inputs ───────────────────────────────────────────────
    try:
        text_command = _parse_text_command(request)
        image_b64    = _extract_image_base64(request)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422

    override_type = (
        request.form.get("account_type")
        or (request.get_json(silent=True) or {}).get("account_type")
    )
    effective_account_type = (
        User.validate_account_type(override_type)
        if override_type
        else user.account_type
    )

    # ── 5. AI extraction ──────────────────────────────────────────────────────
    try:
        ai_result = route_to_ai(
            text_command=text_command,
            image_b64=image_b64,
            account_type=effective_account_type,
        )
    except Exception as exc:
        logger.exception("[process-expense] AI routing failed: %s", exc)
        return jsonify({"error": "AI extraction failed", "detail": str(exc)}), 502

    if not ai_result.get("amount"):
        return jsonify({
            "error":  "AI could not extract a valid amount from the input",
            "raw_ai": ai_result,
        }), 422

    # ── 6. Build the row and write to the user's Google Sheet ─────────────────
    expense_row = _build_expense_row(ai_result, user)

    try:
        sheet_tab = _append_to_user_sheet(user, expense_row)
    except Exception as exc:
        logger.exception("[process-expense] Sheets append failed: %s", exc)
        return jsonify({
            "success":        False,
            "extracted_data": ai_result,
            "error":          "Google Sheets append failed",
            "detail":         str(exc),
        }), 207

    # ── NEW: Save to Local SQLite for Dashboard Stats (WITH DATE FIX) ────────
    from database.models import Transaction
    try:
        raw_type = expense_row.get("type", "Expense").strip().lower()
        tx_type = "Income" if raw_type == "income" else "Expense"
        
        # Safe Date Parsing
        try:
            tx_date = datetime.strptime(expense_row.get("date"), "%Y-%m-%d").date()
        except:
            tx_date = datetime.now(timezone.utc).date()
            
        new_tx = Transaction(
            user_id=user.id,
            type=tx_type,
            amount=float(expense_row.get("amount", 0)),
            category=expense_row.get("category", "Uncategorised"),
            notes=expense_row.get("notes", ""),
            currency=expense_row.get("currency", "PKR"),
            transaction_date=tx_date,          # <-- YEH LINE MISSING THI!
            source="ai",
            ai_provider=expense_row.get("ai_provider", "unknown"),
            account_type=user.account_type
        )
        db.session.add(new_tx)
        db.session.commit()
    except Exception as e:
        db.session.rollback()  # <-- Yeh rollback zaroori hai warna API crash ho jati hai
        logger.error("[process-expense] Local DB save failed: %s", e)

    # ── 7. Return success ─────────────────────────────────────────────────────
    return jsonify({
        "success":        True,
        "extracted_data": expense_row,
        "sheet_tab":      sheet_tab,
        "provider_used":  ai_result.get("provider", "unknown"),
        "google_sheet_id": user.effective_sheet_id,
    }), 200
    from services.ai_router import route_to_ai

    # ── 1. Load & validate the authenticated user ─────────────────────────────
    user_id = int(get_jwt_identity())
    user: User | None = db.session.get(User, user_id)
    if not user:
        return jsonify({"error": "Authenticated user not found"}), 404

    # ── 2. Check that we have a sheet to write to ─────────────────────────────
    if not user.effective_sheet_id:
        return jsonify({
            "error": (
                "No Google Sheet is linked to your account. "
                "Sign in with Google OAuth to auto-create one, or manually link "
                "a sheet ID via PATCH /api/auth/me/spreadsheet."
            )
        }), 400

    # ── 3. Check that we can authenticate with Google Sheets ─────────────────
    if not user.refresh_token:
        return jsonify({
            "error": (
                "Your account is not connected to Google. "
                "Sign in with Google OAuth to enable automatic sheet logging."
            )
        }), 400

    # ── 4. Parse request inputs ───────────────────────────────────────────────
    try:
        text_command = _parse_text_command(request)
        image_b64    = _extract_image_base64(request)
    except ValueError as exc:
        return jsonify({"error": str(exc)}), 422

    override_type = (
        request.form.get("account_type")
        or (request.get_json(silent=True) or {}).get("account_type")
    )
    effective_account_type = (
        User.validate_account_type(override_type)
        if override_type
        else user.account_type
    )

    logger.info(
        "[process-expense] user=%s mode=%s account_type=%s sheet=%s",
        user.username,
        "receipt" if image_b64 else "quick",
        effective_account_type,
        user.effective_sheet_id,
    )

    # ── 5. AI extraction ──────────────────────────────────────────────────────
    try:
        ai_result = route_to_ai(
            text_command=text_command,
            image_b64=image_b64,
            account_type=effective_account_type,
        )
    except Exception as exc:
        logger.exception("[process-expense] AI routing failed: %s", exc)
        return jsonify({"error": "AI extraction failed", "detail": str(exc)}), 502

    if not ai_result.get("amount"):
        return jsonify({
            "error":  "AI could not extract a valid amount from the input",
            "raw_ai": ai_result,
        }), 422

    # ── 6. Build the row and write to the user's Google Sheet ─────────────────
    expense_row = _build_expense_row(ai_result, user)

    try:
        sheet_tab = _append_to_user_sheet(user, expense_row)
    except Exception as exc:
        logger.exception("[process-expense] Sheets append failed: %s", exc)
        return jsonify({
            "success":        False,
            "extracted_data": ai_result,
            "error":          "Google Sheets append failed",
            "detail":         str(exc),
        }), 207

    # ── NEW: Save to Local SQLite for Dashboard Stats ─────────────────────────
    from database.models import Transaction
    try:
        # Standardize type string
        raw_type = expense_row.get("type", "Expense").strip().lower()
        tx_type = "Income" if raw_type == "income" else "Expense"
        
        new_tx = Transaction(
            user_id=user.id,
            type=tx_type,
            amount=float(expense_row.get("amount", 0)),
            category=expense_row.get("category", "Uncategorised"),
            notes=expense_row.get("notes", ""),
            currency=expense_row.get("currency", "PKR")
        )
        db.session.add(new_tx)
        db.session.commit()
    except Exception as e:
        logger.error("[process-expense] Local DB save failed: %s", e)

    # ── 7. Return success ─────────────────────────────────────────────────────
    return jsonify({
        "success":        True,
        "extracted_data": expense_row,
        "sheet_tab":      sheet_tab,
        "provider_used":  ai_result.get("provider", "unknown"),
        "google_sheet_id": user.effective_sheet_id,
    }), 200


@expense_bp.get("/stats")
@jwt_required()
def get_stats():
    """Dashboard Top Cards Data"""
    from database.models import Transaction
    user_id = int(get_jwt_identity())
    user = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    # YAHAN GHILTI THI: date ko day kar diya hai
    billing_day = user.billing_start_day if getattr(user, 'billing_start_day', None) else 1
    cycle_start_date = _get_cycle_bounds(billing_day)

    transactions = Transaction.query.filter(
        Transaction.user_id == user_id,
        Transaction.created_at >= cycle_start_date
    ).all()

    income = sum(t.amount for t in transactions if t.type == 'Income')
    expense = sum(t.amount for t in transactions if t.type == 'Expense')

    return jsonify({
        "income": income,
        "expense": expense,
        "net": income - expense
    }), 200
    income = sum(t.amount for t in transactions if t.type == 'Income')
    expense = sum(t.amount for t in transactions if t.type == 'Expense')

    return jsonify({
        "income": income,
        "expense": expense,
        "net": income - expense
    }), 200


@expense_bp.get("/history")
@jwt_required()
def history():
    """
    Returns the user's linked Google Sheet metadata AND 
    aggregated monthly data for the Dashboard Chart.
    """
    from database.models import Transaction
    user_id = int(get_jwt_identity())
    user: User | None = db.session.get(User, user_id)

    if not user:
        return jsonify({"error": "User not found"}), 404

    sheet_id = user.effective_sheet_id

    # If no sheet is linked, still return an empty history list so frontend doesn't crash
    if not sheet_id:
        return jsonify({
            "message": (
                "No Google Sheet is linked yet. "
                "Sign in with Google OAuth to auto-create one, or call "
                "PATCH /api/auth/me/spreadsheet to link manually."
            ),
            "has_sheet": False,
            "history": []
        }), 200

    # Fetch local transactions for the chart
    transactions = Transaction.query.filter_by(user_id=user_id).order_by(Transaction.created_at.asc()).all()

    monthly_data = {}
    for t in transactions:
        month_name = t.created_at.strftime('%b') # e.g. 'Jan', 'May'
        if month_name not in monthly_data:
            monthly_data[month_name] = {"cycle": month_name, "income": 0, "expense": 0}

        if t.type == 'Income':
            monthly_data[month_name]["income"] += t.amount
        else:
            monthly_data[month_name]["expense"] += t.amount

    history_list = list(monthly_data.values())

    return jsonify({
        "has_sheet":       True,
        "google_sheet_id": sheet_id,
        "sheet_url":       f"https://docs.google.com/spreadsheets/d/{sheet_id}",
        "oauth_connected": user.refresh_token is not None,
        "history":         history_list
    }), 200