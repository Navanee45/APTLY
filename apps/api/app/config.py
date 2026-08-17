"""
APTLY API — Application Configuration

All settings are loaded from environment variables.
In Phase 0, mock providers allow the app to start without any AI credentials.

Usage:
    from app.config import get_settings
    settings = get_settings()
"""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Typed application configuration loaded from environment variables.

    All fields have safe defaults for local development.
    Never put real secrets here — use .env or secrets management.
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",  # Ignore unknown env vars
    )

    # ── Application ────────────────────────────────────────────
    app_env: Literal["development", "staging", "production"] = "development"
    app_name: str = "APTLY"
    app_version: str = "0.1.0"

    # ── API ────────────────────────────────────────────────────
    api_v1_prefix: str = "/api/v1"
    cors_origins: list[str] = Field(
        default=[
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://[::1]:3000",
            "http://localhost:8000",
            "http://127.0.0.1:8000",
        ]
    )

    # ── Security ───────────────────────────────────────────────
    secret_key: str = Field(
        default="dev-insecure-secret-key-change-in-production",
        description="Must be overridden in production via SECRET_KEY env var",
    )

    # ── Database ───────────────────────────────────────────────
    database_url: str = Field(
        default="postgresql+asyncpg://aptly:aptly_dev_password@localhost:5432/aptly_dev"
    )

    # ── Redis ──────────────────────────────────────────────────
    redis_url: str = Field(default="redis://localhost:6379/0")

    # ── Storage ────────────────────────────────────────────────
    storage_provider: Literal["local", "s3", "supabase", "r2"] = "local"
    storage_bucket: str = "aptly-media"
    storage_endpoint: str = "./storage"
    storage_access_key: str = ""
    storage_secret_key: str = ""

    # ── Supabase ──────────────────────────────────────────────
    supabase_url: str = Field(
        default="",
        description="Supabase project URL e.g. https://[project-ref].supabase.co",
    )
    supabase_service_role_key: str = Field(
        default="",
        description="Supabase service role secret (kept server-side only)",
    )
    supabase_anon_key: str = Field(
        default="",
        description="Supabase anonymous key for public client operations",
    )

    # ── LLM Provider (Google Gemini Pure Engine) ──────────────
    llm_provider: Literal["mock", "gemini"] = "mock"
    gemini_api_key: str = Field(default="", description="Google Gemini API key")
    llm_api_key: str = ""
    llm_model: str = "gemini-flash-latest"
    llm_timeout_seconds: float = 30.0
    llm_temperature: float = 0.1

    # ── TTS Provider ──────────────────────────────────────────
    tts_provider: Literal["mock", "elevenlabs"] = "mock"
    tts_api_key: str = ""

    # ── Transcription Provider ────────────────────────────────
    transcription_provider: Literal["mock", "whisper", "whisperx", "deepgram"] = "mock"
    transcription_api_key: str = ""
    whisperx_model: str = "base.en"
    whisperx_device: str = "auto"
    whisperx_compute_type: str = "auto"
    whisperx_language: str = "en"

    # ── Feature Flags ─────────────────────────────────────────
    feature_realtime_interview: bool = False
    feature_audio_analysis: bool = False
    feature_vision_analysis: bool = False
    feature_llm_evaluation: bool = False

    # ── Computed Properties ───────────────────────────────────
    @property
    def is_production(self) -> bool:
        """True when running in production environment."""
        return self.app_env == "production"

    @property
    def is_development(self) -> bool:
        """True when running in development environment."""
        return self.app_env == "development"

    @property
    def using_mock_providers(self) -> bool:
        """True when all AI providers are in mock mode (no API keys needed)."""
        return (
            self.llm_provider == "mock"
            and self.tts_provider == "mock"
            and self.transcription_provider == "mock"
        )

    @field_validator("database_url", mode="before")
    @classmethod
    def normalize_database_url(cls, v: str) -> str:
        """Normalize database URL for asyncpg if raw postgres:// or postgresql:// is provided."""
        if isinstance(v, str):
            if v.startswith("postgres://"):
                return v.replace("postgres://", "postgresql+asyncpg://", 1)
            if v.startswith("postgresql://") and not v.startswith("postgresql+"):
                return v.replace("postgresql://", "postgresql+asyncpg://", 1)
        return v

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, v: str | list[str]) -> list[str]:
        """Parse CORS origins from comma-separated string or list."""
        if isinstance(v, str):
            return [origin.strip() for origin in v.split(",") if origin.strip()]
        return v

    @field_validator("secret_key")
    @classmethod
    def warn_insecure_secret(cls, v: str) -> str:
        """Warn if using the default insecure secret key."""
        if v == "dev-insecure-secret-key-change-in-production":
            import warnings

            warnings.warn(
                "Using default insecure SECRET_KEY. "
                "Set SECRET_KEY environment variable before deploying.",
                stacklevel=2,
            )
        return v


@lru_cache
def get_settings() -> Settings:
    """
    Returns a cached Settings instance.

    Uses lru_cache so the settings object is only created once per process.
    In tests, call get_settings.cache_clear() to reset between test cases.
    """
    return Settings()
