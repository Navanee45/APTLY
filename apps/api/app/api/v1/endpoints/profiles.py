"""
APTLY API — User Profiles & Account Management Endpoints
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.logging import get_logger
from app.dependencies import get_db, get_interview_service
from app.models.profile import Profile
from app.models.user_preference import UserPreference
from app.services.interview_service import InterviewService

logger = get_logger(__name__)

router = APIRouter(prefix="/profiles", tags=["User Profiles"])


class UpdateProfileRequest(BaseModel):
    display_name: str | None = None
    target_role: str | None = None
    target_seniority: str | None = None
    preferred_difficulty: str | None = None
    auto_record: bool | None = None
    camera_enabled: bool | None = None
    microphone_enabled: bool | None = None


@router.get(
    "/me",
    summary="Get current user profile",
    description="Returns profile details and preferences for the authenticated user.",
)
async def get_my_profile(
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    profile = await db.get(Profile, user.id)
    if not profile:
        profile = Profile(
            id=user.id,
            email=user.email,
            display_name=user.display_name or "Candidate",
        )
        db.add(profile)
        await db.commit()
        await db.refresh(profile)

    pref_stmt = select(UserPreference).where(UserPreference.user_id == user.id)
    pref = (await db.execute(pref_stmt)).scalar_one_or_none()

    return {
        "id": str(profile.id),
        "email": profile.email or user.email,
        "display_name": profile.display_name or user.display_name,
        "avatar_url": profile.avatar_url,
        "target_role": profile.target_role or "Software Engineer",
        "target_seniority": profile.target_seniority or "Mid-Level",
        "preferences": {
            "preferred_difficulty": pref.preferred_difficulty if pref else "medium",
            "auto_record": pref.auto_record if pref else True,
            "camera_enabled": pref.camera_enabled if pref else True,
            "microphone_enabled": pref.microphone_enabled if pref else True,
            "privacy_retention_days": pref.privacy_retention_days if pref else 90,
        },
        "created_at": profile.created_at.isoformat(),
    }


@router.put(
    "/me",
    summary="Update user profile",
    description="Updates display name, target role, and user preferences.",
)
async def update_my_profile(
    req: UpdateProfileRequest,
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    profile = await db.get(Profile, user.id)
    if not profile:
        profile = Profile(id=user.id, email=user.email, display_name=user.display_name)
        db.add(profile)

    if req.display_name is not None:
        profile.display_name = req.display_name
    if req.target_role is not None:
        profile.target_role = req.target_role
    if req.target_seniority is not None:
        profile.target_seniority = req.target_seniority

    pref_stmt = select(UserPreference).where(UserPreference.user_id == user.id)
    pref = (await db.execute(pref_stmt)).scalar_one_or_none()
    if not pref:
        pref = UserPreference(user_id=user.id)
        db.add(pref)

    if req.preferred_difficulty is not None:
        pref.preferred_difficulty = req.preferred_difficulty
    if req.auto_record is not None:
        pref.auto_record = req.auto_record
    if req.camera_enabled is not None:
        pref.camera_enabled = req.camera_enabled
    if req.microphone_enabled is not None:
        pref.microphone_enabled = req.microphone_enabled

    await db.commit()
    await db.refresh(profile)

    return {"status": "updated", "profile_id": str(profile.id)}


@router.delete(
    "/me",
    summary="Delete user account",
    description="Cascade deletes user profile, interview history, reports, progress, and all private media objects.",
)
async def delete_my_account(
    user: Annotated[UserContext, Depends(get_current_user)],
    interview_service: Annotated[InterviewService, Depends(get_interview_service)],
) -> dict[str, Any]:
    await interview_service.delete_user_account(user.id)
    return {"status": "deleted", "user_id": str(user.id)}
