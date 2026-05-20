"""
services/gemini_service.py — Google Gemini 2.5 Flash Service
=============================================================
Uses the google-generativeai SDK to extract structured expense data
from a receipt image + text command.

Raises:
  RateLimitError  — on HTTP 429 / quota exhaustion
  ValueError      — if the model returns unparseable JSON
  Exception       — for any other SDK / network error
"""

import json
import logging
import os
import re
from datetime import datetime, timezone

import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, TooManyRequests

from services.ai_router import RateLimitError

logger = logging.getLogger(__name__)

# ── Model name ────────────────────────────────────────────────────────────────
GEMINI_MODEL = "gemini-2.5-flash"

# ── Category sets injected into the prompt based on account type ──────────────
_CATEGORIES = {
    "household": [
        "Groceries", "Rent", "Utilities", "Healthcare", "Education",
        "Transport", "Entertainment", "Clothing", "Household Supplies",
        "Personal Care", "Dining Out", "Savings", "Income", "Other",
    ],
    "business": [
        "Marketing", "Salaries", "Operations", "Rent & Office",
        "Technology", "Travel & Accommodation", "Legal & Professional",
        "Raw Materials", "Utilities", "Client Entertainment",
        "Sales Revenue", "Investment", "Tax", "Miscellaneous",
    ],
}


def _build_prompt(text_command: str, account_type: str) -> str:
    categories = ", ".join(_CATEGORIES.get(account_type, _CATEGORIES["household"]))
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    return f"""You are a financial data extraction assistant for a {account_type} account.
Today's date is {today}.

Analyse the attached receipt image AND the user's text command below, then extract
the financial transaction details.

USER COMMAND: "{text_command}"

INSTRUCTIONS:
1. Extract the transaction amount as a plain number (no currency symbols).
2. Determine the currency from the receipt or command. Default to "PKR" if unclear.
3. Choose the most appropriate category from this list: {categories}.
4. Determine the transaction date from the receipt. If absent, use today's date ({today}).
5. Classify as "Income" only if money was received; otherwise use "Expense".
6. Keep Notes concise (max 15 words). Include merchant name if visible.

RESPOND ONLY with a valid JSON object. No markdown, no explanation, no extra text.

Required format:
{{
  "Type":     "Income" or "Expense",
  "Amount":   <number>,
  "Currency": "<3-letter code>",
  "Category": "<category from list>",
  "Date":     "<YYYY-MM-DD>",
  "Notes":    "<brief note>"
}}"""


def _configure_client(key_index: int) -> None:
    """Configure the SDK with the appropriate API key (1 or 2)."""
    env_var = f"GEMINI_API_KEY_{key_index}"
    api_key = os.getenv(env_var)
    if not api_key:
        raise EnvironmentError(
            f"Environment variable '{env_var}' is not set. "
            "Add it to your .env file."
        )
    genai.configure(api_key=api_key)


def _parse_json_response(raw_text: str) -> dict:
    """
    Extract a JSON object from the model's response text.
    Handles cases where the model wraps JSON in markdown code fences.
    """
    # Strip markdown code fences if present
    cleaned = re.sub(r"```(?:json)?", "", raw_text).strip()

    # Attempt to locate the JSON object boundaries
    start = cleaned.find("{")
    end   = cleaned.rfind("}") + 1
    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in model response: {raw_text!r}")

    json_str = cleaned[start:end]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from model: {exc}. Raw: {json_str!r}")

    return _normalise(data)


def _normalise(data: dict) -> dict:
    """
    Map Gemini's Title-Case keys → lowercase snake_case keys used
    internally throughout the application.
    """
    return {
        "type":     str(data.get("Type", "Expense")).strip(),
        "amount":   float(data.get("Amount", 0)),
        "currency": str(data.get("Currency", "PKR")).strip().upper(),
        "category": str(data.get("Category", "Other")).strip(),
        "date":     str(data.get("Date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))).strip(),
        "notes":    str(data.get("Notes", "")).strip(),
    }


def extract_with_gemini(
    text_command: str,
    image_b64: str,
    account_type: str,
    key_index: int = 1,
) -> dict:
    """
    Call Gemini 2.5 Flash with the receipt image + text command.

    Args:
        text_command:  User instruction / voice command.
        image_b64:     Base64-encoded image (no data-URI prefix).
        account_type:  'household' | 'business'.
        key_index:     1 or 2 — selects which GEMINI_API_KEY_N env var to use.

    Returns:
        Normalised dict: {type, amount, currency, category, date, notes}

    Raises:
        RateLimitError: on 429 / quota exceeded.
        ValueError:     on bad JSON from model.
        Exception:      on SDK / network errors.
    """
    _configure_client(key_index)

    model = genai.GenerativeModel(
        model_name=GEMINI_MODEL,
        generation_config=genai.GenerationConfig(
            temperature=0.1,        # low temp = deterministic structured output
            max_output_tokens=512,
        ),
    )

    # Build the multimodal content parts: image + prompt
    image_part = {
        "inline_data": {
            "mime_type": "image/jpeg",   # Gemini accepts jpeg/png/webp/gif
            "data": image_b64,
        }
    }
    prompt = _build_prompt(text_command, account_type)

    logger.debug("[gemini_service] Sending request to %s (key %d)", GEMINI_MODEL, key_index)

    try:
        response = model.generate_content([image_part, prompt])
    except (ResourceExhausted, TooManyRequests) as exc:
        # HTTP 429 — bubble up as RateLimitError so ai_router can cascade
        raise RateLimitError(f"Gemini key {key_index} quota exceeded: {exc}") from exc
    except Exception as exc:
        # Re-raise generic errors as-is; ai_router will catch them
        logger.error("[gemini_service] SDK error with key %d: %s", key_index, exc)
        raise

    raw_text = response.text
    logger.debug("[gemini_service] Raw response: %s", raw_text)

    result = _parse_json_response(raw_text)
    logger.info("[gemini_service] Extracted: %s", result)
    return result