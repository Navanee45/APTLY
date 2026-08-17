"""
APTLY API — FastAPI Dependency Injection

Provides reusable FastAPI dependencies for:
- Application settings
- Database sessions
- AI/ML providers (LLM, TTS, Transcription)
- Storage provider

All providers are selected based on configuration at startup.
In Phase 0, all AI providers default to mock implementations.

Usage in a route handler:
    @router.get("/example")
    async def example(
        settings: Annotated[Settings, Depends(get_settings)],
        db: Annotated[AsyncSession, Depends(get_db)],
        llm: Annotated[LLMProvider, Depends(get_llm_provider)],
    ):
        ...
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from functools import lru_cache
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)

from app.config import Settings, get_settings
from app.core.logging import get_logger
from app.services.providers.base import LLMProvider, TranscriptionProvider, TTSProvider
from app.services.providers.mock_llm import MockLLMProvider
from app.services.providers.mock_transcription import MockTranscriptionProvider
from app.services.providers.mock_tts import MockTTSProvider
from app.services.storage.base import StorageProvider
from app.services.storage.local import LocalStorageProvider

logger = get_logger(__name__)


# ── Database ──────────────────────────────────────────────────────────────────


@lru_cache
def get_async_engine(database_url: str) -> AsyncEngine:
    """Create and cache the async SQLAlchemy engine."""
    connect_args = {}
    if "asyncpg" in database_url:
        connect_args["timeout"] = 3.0
        connect_args["command_timeout"] = 5.0

    return create_async_engine(
        database_url,
        echo=False,
        pool_pre_ping=True,
        pool_recycle=3600,
        connect_args=connect_args,
    )


@lru_cache
def get_session_factory(database_url: str) -> async_sessionmaker[AsyncSession]:
    """Create and cache the async session factory."""
    engine = get_async_engine(database_url)
    return async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
        autocommit=False,
        autoflush=False,
    )


async def get_db(
    settings: Annotated[Settings, Depends(get_settings)],
) -> AsyncGenerator[AsyncSession, None]:
    """
    FastAPI dependency: yields a database session per request.

    The session is automatically committed on success
    and rolled back on exception.
    """
    session_factory = get_session_factory(settings.database_url)
    async with session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


# ── Storage Provider ──────────────────────────────────────────────────────────


@lru_cache
def _get_storage_provider_instance(
    provider: str,
    endpoint: str,
    supabase_url: str = "",
    supabase_service_role_key: str = "",
    bucket_name: str = "aptly-media",
) -> StorageProvider:
    """Create and cache the storage provider (singleton per configuration)."""
    if provider == "local":
        logger.info("storage_provider_init", provider="local", endpoint=endpoint)
        return LocalStorageProvider(root_dir=endpoint)
    if provider == "supabase":
        from app.services.storage.supabase import SupabaseStorageProvider

        logger.info("storage_provider_init", provider="supabase", bucket=bucket_name)
        return SupabaseStorageProvider(
            supabase_url=supabase_url,
            service_role_key=supabase_service_role_key,
            bucket_name=bucket_name,
        )
    # Future providers: s3, r2
    msg = f"Storage provider '{provider}' is not yet implemented"
    raise NotImplementedError(msg)


async def get_storage(
    settings: Annotated[Settings, Depends(get_settings)],
) -> StorageProvider:
    """FastAPI dependency: returns the configured storage provider."""
    return _get_storage_provider_instance(
        settings.storage_provider,
        settings.storage_endpoint,
        settings.supabase_url,
        settings.supabase_service_role_key,
        settings.storage_bucket,
    )


# ── LLM Provider (Google Gemini Pure Engine) ─────────────────────────────────


@lru_cache
def _get_llm_provider_instance(
    provider: str,
    api_key: str = "",
    model: str = "gemini-flash-latest",
) -> LLMProvider:
    """Create and cache the LLM provider (singleton)."""
    if provider == "mock":
        logger.info("llm_provider_init", provider="mock")
        return MockLLMProvider()
    if provider in ("gemini", "google"):
        from app.services.providers.gemini_llm import GeminiLLMProvider

        logger.info("llm_provider_init", provider="gemini", model=model)
        return GeminiLLMProvider(
            api_key=api_key,
            model=model or "gemini-flash-latest",
        )
    msg = f"LLM provider '{provider}' is not supported. Use 'gemini' or 'mock'."
    raise NotImplementedError(msg)


async def get_llm_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> LLMProvider:
    """FastAPI dependency: returns the configured LLM provider."""
    key = settings.gemini_api_key or settings.llm_api_key
    return _get_llm_provider_instance(
        settings.llm_provider,
        key,
        settings.llm_model,
    )


async def get_content_analysis_service(
    llm_provider: Annotated[LLMProvider, Depends(get_llm_provider)],
) -> Any:
    """FastAPI dependency: returns the ContentAnalysisService instance."""
    from app.services.content_intelligence.service import ContentAnalysisService

    return ContentAnalysisService(llm_provider=llm_provider)


# ── TTS Provider ──────────────────────────────────────────────────────────────


@lru_cache
def _get_tts_provider_instance(provider: str) -> TTSProvider:
    """Create and cache the TTS provider (singleton)."""
    if provider == "mock":
        logger.info("tts_provider_init", provider="mock")
        return MockTTSProvider()
    # Phase 1+: add elevenlabs, openai implementations here
    msg = f"TTS provider '{provider}' is not yet implemented"
    raise NotImplementedError(msg)


async def get_tts_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TTSProvider:
    """FastAPI dependency: returns the configured TTS provider."""
    return _get_tts_provider_instance(settings.tts_provider)


# ── Transcription Provider ────────────────────────────────────────────────────


@lru_cache
def _get_transcription_provider_instance(
    provider: str,
    model_size: str = "base.en",
    device: str = "auto",
    compute_type: str = "auto",
) -> TranscriptionProvider:
    """Create and cache the transcription provider (singleton)."""
    if provider == "mock":
        logger.info("transcription_provider_init", provider="mock")
        return MockTranscriptionProvider()
    if provider in ("whisperx", "whisper"):
        from app.services.providers.whisperx_transcription import (
            WhisperXTranscriptionProvider,
        )

        logger.info(
            "transcription_provider_init",
            provider="whisperx",
            model=model_size,
            device=device,
        )
        return WhisperXTranscriptionProvider(
            model_size=model_size,
            device=device,
            compute_type=compute_type,
        )
    # Phase 2+: deepgram, etc.
    msg = f"Transcription provider '{provider}' is not yet implemented"
    raise NotImplementedError(msg)


async def get_transcription_provider(
    settings: Annotated[Settings, Depends(get_settings)],
) -> TranscriptionProvider:
    """FastAPI dependency: returns the configured transcription provider."""
    return _get_transcription_provider_instance(
        settings.transcription_provider,
        settings.whisperx_model,
        settings.whisperx_device,
        settings.whisperx_compute_type,
    )


get_llm = get_llm_provider


async def get_interview_service(
    db: Annotated[AsyncSession, Depends(get_db)],
    llm: Annotated[LLMProvider, Depends(get_llm_provider)],
    transcription: Annotated[TranscriptionProvider, Depends(get_transcription_provider)],
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> Any:
    """FastAPI dependency: returns initialized InterviewService."""
    from app.services.interview_service import InterviewService
    return InterviewService(
        db_session=db,
        llm_provider=llm,
        transcription_provider=transcription,
        storage_provider=storage,
    )
