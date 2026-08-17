"""
APTLY API — AI Provider Health Check Endpoint

Provides a safe diagnostic:
  GET /api/v1/ai/health

Returns:
- provider name
- whether API key is configured (without revealing the key)
- whether the provider is reachable
- current model
- latency in ms

Never returns API keys, transcripts, or candidate data.
"""

from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter, Depends
from typing_extensions import Annotated

from app.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

router = APIRouter(prefix="/ai", tags=["AI Health"])


@router.get(
    "/health",
    summary="AI provider health check",
    description="Returns the configured AI provider status without exposing secrets.",
)
async def ai_health_check(
    settings: Annotated[Settings, Depends(get_settings)],
) -> dict[str, Any]:
    """Check if the AI (Gemini) provider is configured and reachable."""
    provider = settings.llm_provider
    model = settings.llm_model
    api_key_configured = bool(settings.gemini_api_key or settings.llm_api_key)

    result: dict[str, Any] = {
        "provider": provider,
        "model": model,
        "api_key_configured": api_key_configured,
        "reachable": False,
        "latency_ms": None,
        "error": None,
    }

    if provider == "mock":
        result["reachable"] = True
        result["note"] = "Mock provider always succeeds — no real AI calls made."
        return result

    if not api_key_configured:
        result["error"] = "GEMINI_API_KEY is not configured."
        return result

    # Perform a real lightweight Gemini call to verify reachability
    try:
        from google import genai
        from google.genai import types

        api_key = settings.gemini_api_key or settings.llm_api_key
        client = genai.Client(api_key=api_key)

        start = time.monotonic()
        import asyncio

        response = await asyncio.to_thread(
            client.models.generate_content,
            model=model,
            contents="Say 'OK' in exactly one word.",
            config=types.GenerateContentConfig(
                max_output_tokens=5,
                temperature=0.0,
            ),
        )
        latency_ms = round((time.monotonic() - start) * 1000, 1)

        result["reachable"] = True
        result["latency_ms"] = latency_ms
        result["response_preview"] = (response.text or "")[:20].strip()
        logger.info(
            "ai_health_check_ok",
            provider=provider,
            model=model,
            latency_ms=latency_ms,
        )

    except Exception as exc:
        result["reachable"] = False
        # Safe error — do NOT include any secrets or prompts in the error
        result["error"] = f"{type(exc).__name__}: {str(exc)[:200]}"
        logger.warning(
            "ai_health_check_failed",
            provider=provider,
            error=type(exc).__name__,
        )

    return result
