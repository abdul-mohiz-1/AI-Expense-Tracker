"""
services/sheets_manager.py — Google Sheets Manager
====================================================
Responsibilities:
  1. Authenticate with Google using a Service Account JSON file.
  2. Open the user's spreadsheet by the sheet_id parameter.
  3. Resolve the current month-year worksheet tab (e.g. "May-2026").
     - Create it with standard headers if it doesn't exist yet.
  4. Append the extracted expense row to that tab.

Public API:
  append_expense(sheet_id: str, row_data: dict) -> str
      Returns the worksheet tab name the row was written to.

  get_client() -> gspread.Client
      Returns the shared authenticated client (used by auth_routes for provisioning).
"""

import logging
import os
from datetime import datetime, timezone
from typing import Optional

import gspread
from gspread.exceptions import WorksheetNotFound, SpreadsheetNotFound

logger = logging.getLogger(__name__)

# ── Column headers written when a new tab is created ─────────────────────────
_HEADERS = ["Date", "Type", "Category", "Amount", "Currency", "Notes", "Timestamp", "Recorded By"]

# ── Module-level client cache (one authorised client per process) ─────────────
_gspread_client: Optional[gspread.Client] = None


def get_client() -> gspread.Client:
    """
    Return a cached, authenticated gspread client using the Master Service Account.
    Exported so auth_routes can reuse the same client for sheet provisioning.
    """
    global _gspread_client

    if _gspread_client is not None:
        return _gspread_client

    sa_json_path = os.getenv("GOOGLE_SERVICE_ACCOUNT_JSON")
    if not sa_json_path:
        raise EnvironmentError(
            "Environment variable 'GOOGLE_SERVICE_ACCOUNT_JSON' is not set. "
            "Point it to your service account JSON file path."
        )
    if not os.path.isfile(sa_json_path):
        raise FileNotFoundError(
            f"Service account file not found at: {sa_json_path!r}. "
            "Download it from Google Cloud Console → IAM → Service Accounts."
        )

    _gspread_client = gspread.service_account(filename=sa_json_path)
    logger.info("[sheets_manager] gspread client authorised successfully.")
    return _gspread_client


# Keep the private alias for internal use
_get_client = get_client


def _get_tab_name() -> str:
    """Return the current month-year string, e.g. 'May-2026'."""
    return datetime.now(timezone.utc).strftime("%B-%Y")


def _get_or_create_worksheet(
    spreadsheet: gspread.Spreadsheet,
    tab_name: str,
) -> gspread.Worksheet:
    """
    Return the worksheet named *tab_name*, creating it with headers if absent.
    """
    try:
        worksheet = spreadsheet.worksheet(tab_name)
        logger.debug("[sheets_manager] Found existing tab: %s", tab_name)
        return worksheet
    except WorksheetNotFound:
        logger.info("[sheets_manager] Tab '%s' not found — creating it.", tab_name)

    worksheet = spreadsheet.add_worksheet(
        title=tab_name,
        rows=1000,
        cols=len(_HEADERS),
    )

    worksheet.append_row(_HEADERS, value_input_option="USER_ENTERED")

    try:
        header_range = f"A1:{chr(ord('A') + len(_HEADERS) - 1)}1"
        worksheet.format(
            header_range,
            {
                "textFormat": {"bold": True},
                "backgroundColor": {"red": 0.82, "green": 0.87, "blue": 0.98},
            },
        )
    except Exception as fmt_exc:
        logger.warning("[sheets_manager] Could not format header row: %s", fmt_exc)

    logger.info("[sheets_manager] Created tab '%s' with headers.", tab_name)
    return worksheet


def _build_row(row_data: dict) -> list:
    """
    Map the internal row_data dict → ordered list matching _HEADERS.
    _HEADERS = ["Date","Type","Category","Amount","Currency","Notes","Timestamp","Recorded By"]
    """
    return [
        row_data.get("date",      ""),
        row_data.get("type",      "Expense"),
        row_data.get("category",  "Other"),
        row_data.get("amount",    0),
        row_data.get("currency",  "PKR"),
        row_data.get("notes",     ""),
        row_data.get("timestamp", datetime.now(timezone.utc).isoformat(timespec="seconds")),
        row_data.get("username",  ""),
    ]


def append_expense(sheet_id: str, row_data: dict) -> str:
    """
    Append one expense/income row to the correct monthly tab.

    Args:
        sheet_id:  Google Sheets document ID passed directly from the user record
                   (user.effective_sheet_id). No longer read from .env.
        row_data:  Dict produced by expense_routes._build_expense_row().

    Returns:
        str: The worksheet tab name the row was written to (e.g. "May-2026").

    Raises:
        ValueError:          if sheet_id is empty.
        SpreadsheetNotFound: if the sheet_id is invalid or the service account
                             has not been granted access.
        Exception:           on any other gspread / network error.
    """
    if not sheet_id:
        raise ValueError(
            "sheet_id is empty. Ensure the user has a linked or auto-provisioned "
            "Google Sheet (google_sheet_id or spreadsheet_id must be set)."
        )

    client = _get_client()

    try:
        spreadsheet = client.open_by_key(sheet_id)
    except SpreadsheetNotFound:
        raise SpreadsheetNotFound(
            f"Spreadsheet '{sheet_id}' not found or the service account "
            "does not have access. Share the sheet with the service account email."
        )
    except Exception as exc:
        logger.error("[sheets_manager] Failed to open spreadsheet '%s': %s", sheet_id, exc)
        raise

    tab_name  = _get_tab_name()
    worksheet = _get_or_create_worksheet(spreadsheet, tab_name)
    row       = _build_row(row_data)

    worksheet.append_row(
        row,
        value_input_option="USER_ENTERED",
        insert_data_option="INSERT_ROWS",
        table_range="A1",
    )

    logger.info(
        "[sheets_manager] Appended to '%s' in sheet '%s'. Amount: %s %s",
        tab_name, sheet_id,
        row_data.get("amount"),
        row_data.get("currency", "PKR"),
    )

    return tab_name