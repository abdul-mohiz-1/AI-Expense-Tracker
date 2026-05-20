"""
services/ai_router.py — AI Fallback Router
===========================================
Routing logic:
  - image_b64 is None  → Groq Text  (llama-3.1-8b-instant)       [Quick Mode]
  - image_b64 exists   → Gemini Key 1
                           └─ 429/Error → Gemini Key 2
                                           └─ Error → Groq Vision (llama-3.2-11b-vision-preview)
"""

import logging
from typing import Optional

logger = logging.getLogger(__name__)

# ── CIRCULAR IMPORT FIX: Define Exception HERE before importing services ──────
class RateLimitError(Exception):
    """Raised by service modules when a 429 / quota error is detected."""

# Ab hum safe hain doosri files import karne ke liye!
from services.gemini_service import extract_with_gemini
from services.groq_service import extract_with_groq_text, extract_with_groq_vision


def route_to_ai(
    text_command: str,
    image_b64: Optional[str],
    account_type: str,
) -> dict:
    """
    Central dispatcher. Returns a normalised expense dict with an added
    'provider' key indicating which service produced the result.

    Args:
        text_command:  User's voice-to-text or typed input.
        image_b64:     Base64-encoded image string, or None for Quick Mode.
        account_type:  'household' | 'business' — passed to prompts.

    Returns:
        dict: {
            "type":     str,   # "Income" | "Expense"
            "amount":   float,
            "currency": str,
            "category": str,
            "date":     str,   # ISO date string
            "notes":    str,
            "provider": str,   # audit trail
        }

    Raises:
        RuntimeError: if every provider in the chain fails.
    """

    # ── Quick Mode: text only — bypass Gemini entirely ────────────────────────
    if image_b64 is None:
        logger.info("[ai_router] Quick Mode → Groq Text")
        result = extract_with_groq_text(text_command, account_type)
        result["provider"] = "groq_text"
        return result

    # ── Receipt Mode: image present — try Gemini cascade first ───────────────
    errors: list[str] = []

    # ── Attempt 1: Gemini Key 1 ───────────────────────────────────────────────
    try:
        logger.info("[ai_router] Receipt Mode → Gemini Key 1")
        result = extract_with_gemini(
            text_command=text_command,
            image_b64=image_b64,
            account_type=account_type,
            key_index=1,
        )
        result["provider"] = "gemini_key_1"
        return result
    except RateLimitError as exc:
        logger.warning("[ai_router] Gemini Key 1 rate-limited: %s", exc)
        errors.append(f"gemini_key_1: {exc}")
    except Exception as exc:
        logger.warning("[ai_router] Gemini Key 1 failed: %s", exc)
        errors.append(f"gemini_key_1: {exc}")

    # ── Attempt 2: Gemini Key 2 ───────────────────────────────────────────────
    try:
        logger.info("[ai_router] Falling back → Gemini Key 2")
        result = extract_with_gemini(
            text_command=text_command,
            image_b64=image_b64,
            account_type=account_type,
            key_index=2,
        )
        result["provider"] = "gemini_key_2"
        return result
    except RateLimitError as exc:
        logger.warning("[ai_router] Gemini Key 2 rate-limited: %s", exc)
        errors.append(f"gemini_key_2: {exc}")
    except Exception as exc:
        logger.warning("[ai_router] Gemini Key 2 failed: %s", exc)
        errors.append(f"gemini_key_2: {exc}")

    # ── Attempt 3: Groq Vision ────────────────────────────────────────────────
    try:
        logger.info("[ai_router] Falling back → Groq Vision")
        result = extract_with_groq_vision(
            text_command=text_command,
            image_b64=image_b64,
            account_type=account_type,
        )
        result["provider"] = "groq_vision"
        return result
    except Exception as exc:
        logger.error("[ai_router] Groq Vision also failed: %s", exc)
        errors.append(f"groq_vision: {exc}")

    # ── All providers exhausted ───────────────────────────────────────────────
    raise RuntimeError(
        "All AI providers failed. Chain errors: " + " | ".join(errors)
    )