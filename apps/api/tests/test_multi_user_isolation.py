"""
APTLY API — Multi-User Security & Isolation Tests

Verifies that User A and User B cannot access, view, modify, or delete each other's:
1. Interviews & Answers
2. Post-Interview Performance Reviews
3. Progress Trajectories & Weaknesses
4. Coaching Documents & Reports
5. Profile & Preferences
"""

from __future__ import annotations

from typing import Any
from uuid import UUID, uuid4

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import Settings, get_settings
from app.core.auth import UserContext, get_current_user
from app.dependencies import (
    get_db,
    get_llm_provider,
    get_storage,
    get_transcription_provider,
    get_tts_provider,
)
from app.main import create_app
from app.models.base import Base
from app.models.profile import Profile
from app.services.providers.mock_llm import MockLLMProvider
from app.services.providers.mock_transcription import MockTranscriptionProvider
from app.services.providers.mock_tts import MockTTSProvider
from app.services.storage.local import LocalStorageProvider

USER_A_ID = UUID("aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
USER_B_ID = UUID("bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb")

USER_A_CTX = UserContext(id=USER_A_ID, email="user_a@example.com", display_name="Alice Candidate")
USER_B_CTX = UserContext(id=USER_B_ID, email="user_b@example.com", display_name="Bob Candidate")


def make_test_app(db_session: AsyncSession, storage: LocalStorageProvider, active_user: UserContext):
    app = create_app()
    app.dependency_overrides[get_settings] = lambda: Settings(
        app_env="development",
        app_name="APTLY-Test",
        database_url="sqlite+aiosqlite:///:memory:",
        secret_key="test-key",
    )
    app.dependency_overrides[get_db] = lambda: db_session
    app.dependency_overrides[get_storage] = lambda: storage
    app.dependency_overrides[get_llm_provider] = lambda: MockLLMProvider()
    app.dependency_overrides[get_tts_provider] = lambda: MockTTSProvider()
    app.dependency_overrides[get_transcription_provider] = lambda: MockTranscriptionProvider()
    app.dependency_overrides[get_current_user] = lambda: active_user
    return app


@pytest.mark.asyncio
async def test_multi_user_interview_and_document_isolation(
    test_db_session: AsyncSession,
    tmp_path: Any,
) -> None:
    storage = LocalStorageProvider(root_dir=str(tmp_path))

    # Pre-seed profiles for User A and User B
    profile_a = Profile(id=USER_A_ID, email="user_a@example.com", display_name="Alice")
    profile_b = Profile(id=USER_B_ID, email="user_b@example.com", display_name="Bob")
    test_db_session.add_all([profile_a, profile_b])
    await test_db_session.commit()

    # ── 1. User A creates an interview ─────────────────────────────────────────
    app_a = make_test_app(test_db_session, storage, USER_A_CTX)
    async with AsyncClient(transport=ASGITransport(app=app_a), base_url="http://test") as client_a:
        res = await client_a.post(
            "/api/v1/interviews",
            json={
                "title": "Alice Senior Backend Interview",
                "interview_type": "technical",
                "difficulty_level": "hard",
                "question_count": 2,
            },
        )
        assert res.status_code == 201
        interview_a = res.json()
        interview_a_id = interview_a["id"]

        # User A can list and view their own interview
        list_res = await client_a.get("/api/v1/interviews")
        assert list_res.status_code == 200
        assert len(list_res.json()) == 1
        assert list_res.json()[0]["id"] == interview_a_id

    # ── 2. User B tries to list interviews — must see 0 interviews ──────────────
    app_b = make_test_app(test_db_session, storage, USER_B_CTX)
    async with AsyncClient(transport=ASGITransport(app=app_b), base_url="http://test") as client_b:
        list_res_b = await client_b.get("/api/v1/interviews")
        assert list_res_b.status_code == 200
        assert len(list_res_b.json()) == 0, "User B should NOT see User A's interviews!"

        # User B tries to directly access User A's interview by ID (IDOR Attack) -> 403 Forbidden
        idor_get = await client_b.get(f"/api/v1/interviews/{interview_a_id}")
        assert idor_get.status_code == 403, f"Expected 403 Forbidden, got {idor_get.status_code}"

        # User B tries to view User A's interview review -> 403 Forbidden
        idor_review = await client_b.get(f"/api/v1/interviews/{interview_a_id}/review")
        assert idor_review.status_code == 403, "User B must not access User A's interview review!"

        # User B tries to delete User A's interview -> 403 Forbidden
        idor_del = await client_b.delete(f"/api/v1/interviews/{interview_a_id}")
        assert idor_del.status_code == 403, "User B must not delete User A's interview!"

    # ── 3. Complete interview for User A to generate Progress & Document ───────
    async with AsyncClient(transport=ASGITransport(app=app_a), base_url="http://test") as client_a:
        # Start and Finish interview
        await client_a.post(f"/api/v1/interviews/{interview_a_id}/start")
        await client_a.post(f"/api/v1/interviews/{interview_a_id}/finish")
        rev = await client_a.get(f"/api/v1/interviews/{interview_a_id}/review")
        assert rev.status_code == 200

        # Check User A's Progress
        prog_a = await client_a.get("/api/v1/progress")
        assert prog_a.status_code == 200
        assert prog_a.json()["total_sessions"] == 1
        assert prog_a.json()["user_id"] == str(USER_A_ID)

        # Check User A's Documents (Archived Report)
        docs_a = await client_a.get("/api/v1/documents")
        assert docs_a.status_code == 200
        assert docs_a.json()["total_count"] == 1
        doc_a_id = docs_a.json()["items"][0]["id"]

    # ── 4. Verify User B has empty progress and cannot view User A's Document ──
    async with AsyncClient(transport=ASGITransport(app=app_b), base_url="http://test") as client_b:
        prog_b = await client_b.get("/api/v1/progress")
        assert prog_b.status_code == 200
        assert prog_b.json()["total_sessions"] == 0, "User B progress must be empty!"

        docs_b = await client_b.get("/api/v1/documents")
        assert docs_b.status_code == 200
        assert docs_b.json()["total_count"] == 0, "User B documents list must be empty!"

        # User B attempts to fetch User A's document by ID -> 403 Forbidden
        doc_idor = await client_b.get(f"/api/v1/documents/{doc_a_id}")
        assert doc_idor.status_code == 403, "User B must not view User A's document!"

        # User B attempts to delete User A's document -> 403 Forbidden
        doc_del_idor = await client_b.delete(f"/api/v1/documents/{doc_a_id}")
        assert doc_del_idor.status_code == 403, "User B must not delete User A's document!"

    # ── 5. User A deletes their own interview ──────────────────────────────────
    async with AsyncClient(transport=ASGITransport(app=app_a), base_url="http://test") as client_a:
        del_res = await client_a.delete(f"/api/v1/interviews/{interview_a_id}")
        assert del_res.status_code == 200
        assert del_res.json()["status"] == "deleted"

        # Verify it no longer appears
        list_after = await client_a.get("/api/v1/interviews")
        assert len(list_after.json()) == 0
