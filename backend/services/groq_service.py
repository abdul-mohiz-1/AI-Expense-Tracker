"""
services/groq_service.py — Groq LLM Service (Text + Vision)
============================================================
Two public functions:

  extract_with_groq_text()   — llama-3.1-8b-instant   (Quick Mode, text only)
  extract_with_groq_vision() — llama-3.2-11b-vision-preview (Receipt fallback)

Both enforce the identical JSON output contract as gemini_service.py.

Raises:
  ValueError  — if the model returns unparseable JSON
  Exception   — for SDK / network errors (caught by ai_router)
"""

import json
import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional

from groq import Groq

logger = logging.getLogger(__name__)

# ── Model identifiers ─────────────────────────────────────────────────────────
GROQ_TEXT_MODEL   = "llama-3.1-8b-instant"
GROQ_VISION_MODEL = "llama-3.2-11b-vision-preview"

# ── Category sets (mirrors gemini_service for prompt consistency) ─────────────
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


# ── Shared helpers ─────────────────────────────────────────────────────────────

def _get_client() -> Groq:
    """Instantiate the Groq SDK client using GROQ_API_KEY from env."""
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise EnvironmentError(
            "Environment variable 'GROQ_API_KEY' is not set. "
            "Add it to your .env file."
        )
    return Groq(api_key=api_key)


def _get_categories(account_type: str) -> str:
    return ", ".join(_CATEGORIES.get(account_type, _CATEGORIES["household"]))


def _parse_json_response(raw_text: str) -> dict:
    """
    Robustly extract a JSON object from the model's response.
    Handles markdown code fences (```json ... ```) and leading prose.
    """
    cleaned = re.sub(r"```(?:json)?", "", raw_text).strip()

    start = cleaned.find("{")
    end   = cleaned.rfind("}") + 1

    if start == -1 or end == 0:
        raise ValueError(f"No JSON object found in Groq response: {raw_text!r}")

    json_str = cleaned[start:end]

    try:
        data = json.loads(json_str)
    except json.JSONDecodeError as exc:
        raise ValueError(f"Invalid JSON from Groq model: {exc}. Raw: {json_str!r}")

    return _normalise(data)


def _normalise(data: dict) -> dict:
    """Map Title-Case keys from the prompt spec → internal snake_case keys."""
    return {
        "type":     str(data.get("Type", "Expense")).strip(),
        "amount":   float(data.get("Amount", 0)),
        "currency": str(data.get("Currency", "PKR")).strip().upper(),
        "category": str(data.get("Category", "Other")).strip(),
        "date":     str(data.get("Date", datetime.now(timezone.utc).strftime("%Y-%m-%d"))).strip(),
        "notes":    str(data.get("Notes", "")).strip(),
    }


def _system_prompt(account_type: str) -> str:
    categories = _get_categories(account_type)
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")

    return f"""You are a financial data extraction assistant for a {account_type} account.
Today's date is {today}.

Extract transaction details from the user's input and respond ONLY with a valid JSON
object. No markdown, no explanation, no extra text whatsoever.

Available categories: {categories}

Required JSON format:
{{
  "Type":     "Income" or "Expense",
  "Amount":   <number>,
  "Currency": "<3-letter code, default PKR>",
  "Category": "<one category from the list>",
  "Date":     "<YYYY-MM-DD, use today if unknown>",
  "Notes":    "<brief note, max 15 words>"
}}

Rules:
- Amount must be a plain number with no currency symbols.
- Use "Income" only if money was received; otherwise "Expense".
- If multiple items are mentioned, sum the amounts.
- If the date is unclear, use today: {today}."""


# ── Public functions ───────────────────────────────────────────────────────────

def extract_with_groq_text(text_command: str, account_type: str) -> dict:
    """
    Extract expense data from a text-only command using llama-3.1-8b-instant.
    This is the primary handler for Quick Mode (no image).

    Args:
        text_command:  User's typed or voice-to-text input.
        account_type:  'household' | 'business'.

    Returns:
        Normalised dict: {type, amount, currency, category, date, notes}

    Raises:
        ValueError:  on unparseable JSON from model.
        Exception:   on SDK / network errors.
    """
    client = _get_client()

    logger.debug("[groq_service] Text mode → %s", GROQ_TEXT_MODEL)

    response = client.chat.completions.create(
        model=GROQ_TEXT_MODEL,
        messages=[
            {"role": "system", "content": _system_prompt(account_type)},
            {"role": "user",   "content": text_command},
        ],
        temperature=0.1,
        max_tokens=512,
    )

    raw_text = response.choices[0].message.content or ""
    logger.debug("[groq_service] Text raw response: %s", raw_text)

    result = _parse_json_response(raw_text)
    logger.info("[groq_service] Text extracted: %s", result)
    return result


def extract_with_groq_vision(
    text_command: str,
    image_b64: str,
    account_type: str,
) -> dict:
    """
    Extract expense data from a receipt image using llama-3.2-11b-vision-preview.
    Called only as the final fallback after both Gemini keys fail.

    Args:
        text_command:  User instruction / voice command.
        image_b64:     Base64-encoded image string (no data-URI prefix).
        account_type:  'household' | 'business'.

    Returns:
        Normalised dict: {type, amount, currency, category, date, notes}

    Raises:
        ValueError:  on unparseable JSON from model.
        Exception:   on SDK / network errors.
    """
    client = _get_client()

    logger.debug("[groq_service] Vision fallback → %s", GROQ_VISION_MODEL)

    # Groq Vision expects a data-URI prefix in the image_url field
    data_uri = f"data:image/jpeg;base64,{image_b64}"

    user_content = [
        {
            "type": "image_url",
            "image_url": {"url": data_uri},
        },
        {
            "type": "text",
            "text": (
                f"User command: \"{text_command}\"\n\n"
                "Analyse the receipt image and the command above. "
                "Extract the transaction and respond ONLY with the required JSON."
            ),
        },
    ]

    response = client.chat.completions.create(
        model=GROQ_VISION_MODEL,
        messages=[
            {"role": "system", "content": _system_prompt(account_type)},
            {"role": "user",   "content": user_content},
        ],
        temperature=0.1,
        max_tokens=512,
    )

    raw_text = response.choices[0].message.content or ""
    logger.debug("[groq_service] Vision raw response: %s", raw_text)

    result = _parse_json_response(raw_text)
    logger.info("[groq_service] Vision extracted: %s", result)
    return result