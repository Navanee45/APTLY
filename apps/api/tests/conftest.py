"""
APTLY API — Test Configuration and Fixtures

Provides pytest fixtures for:
- HTTPX async test client (no real server needed)
- In-memory SQLite database (no PostgreSQL needed in unit tests)
- Overridden settings (test-specific configuration)
- Mock providers (all AI providers mocked)
- Test storage (temporary directory)
"""

from __future__ import annotations

from collections.abc import AsyncGenerator
from typing import Any

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.config import Settings, get_settings
from app.dependencies import (
    get_db,
    get_llm_provider,
    get_storage,
    get_transcription_provider,
    get_tts_provider,
)
from app.main import create_app
from app.models.base import Base
import app.models  # Ensure all models are registered in Base.metadata
from app.services.providers.mock_llm import MockLLMProvider
from app.services.providers.mock_transcription import MockTranscriptionProvider
from app.services.providers.mock_tts import MockTTSProvider
from app.services.storage.local import LocalStorageProvider

# ── Test Settings ─────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def test_settings() -> Settings:
    """Settings with test-safe defaults. No real DB/Redis/AI required."""
    return Settings(
        app_env="development",
        app_name="APTLY-Test",
        database_url="sqlite+aiosqlite:///:memory:",
        redis_url="redis://localhost:6379/15",  # DB 15 for tests
        llm_provider="mock",
        tts_provider="mock",
        transcription_provider="mock",
        storage_provider="local",
        storage_endpoint="./test_storage",
        secret_key="test-secret-key-not-for-production",
        cors_origins=["http://localhost:3000"],
    )


# ── In-Memory Database ────────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="function")
async def test_db_session(
    test_settings: Settings,
) -> AsyncGenerator[AsyncSession, None]:
    """
    Provides an in-memory SQLite session for each test.

    Creates all tables fresh, runs the test, then drops everything.
    Tests are fully isolated — no shared state between tests.
    """
    engine = create_async_engine(
        "sqlite+aiosqlite:///:memory:",
        echo=False,
    )
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    session_factory = async_sessionmaker(
        engine,
        class_=AsyncSession,
        expire_on_commit=False,
    )
    async with session_factory() as session:
        yield session

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()


# ── Storage ───────────────────────────────────────────────────────────────────


@pytest.fixture(scope="function")
def test_storage_dir(tmp_path: Any) -> str:
    """Provide a temporary directory for storage tests."""
    return str(tmp_path / "test_storage")


@pytest.fixture(scope="function")
def local_storage(test_storage_dir: str) -> LocalStorageProvider:
    """Return a LocalStorageProvider using a temp directory."""
    return LocalStorageProvider(root_dir=test_storage_dir)


# ── Mock Providers ────────────────────────────────────────────────────────────


@pytest.fixture(scope="session")
def mock_llm() -> MockLLMProvider:
    return MockLLMProvider()


@pytest.fixture(scope="session")
def mock_tts() -> MockTTSProvider:
    return MockTTSProvider()


@pytest.fixture(scope="session")
def mock_transcription() -> MockTranscriptionProvider:
    return MockTranscriptionProvider()


# ── FastAPI Test Client ───────────────────────────────────────────────────────


@pytest_asyncio.fixture(scope="function")
async def client(
    test_settings: Settings,
    test_db_session: AsyncSession,
    local_storage: LocalStorageProvider,
    mock_llm: MockLLMProvider,
    mock_tts: MockTTSProvider,
    mock_transcription: MockTranscriptionProvider,
) -> AsyncGenerator[AsyncClient, None]:
    """
    HTTPX async test client with all dependencies overridden.

    - Uses in-memory SQLite (not PostgreSQL)
    - Uses temp directory storage (not real S3)
    - Uses all mock AI providers
    - No real network calls are made
    """
    app = create_app()

    # Override FastAPI dependencies
    app.dependency_overrides[get_settings] = lambda: test_settings
    app.dependency_overrides[get_db] = lambda: test_db_session
    app.dependency_overrides[get_storage] = lambda: local_storage
    app.dependency_overrides[get_llm_provider] = lambda: mock_llm
    app.dependency_overrides[get_tts_provider] = lambda: mock_tts
    app.dependency_overrides[get_transcription_provider] = lambda: mock_transcription

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="http://test",
    ) as ac:
        yield ac

    app.dependency_overrides.clear()
    get_settings.cache_clear()
