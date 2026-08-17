"""
APTLY API — User Preference Model
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.profile import Profile


class UserPreference(UUIDMixin, TimestampMixin, Base):
    """
    User settings and preferences.
    """

    __tablename__ = "user_preferences"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    preferred_role: Mapped[str] = mapped_column(String(100), nullable=False, default="Software Engineer")
    preferred_seniority: Mapped[str] = mapped_column(String(50), nullable=False, default="Mid-Level")
    preferred_difficulty: Mapped[str] = mapped_column(String(20), nullable=False, default="medium")
    auto_record: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    camera_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    microphone_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    privacy_retention_days: Mapped[int] = mapped_column(Integer, nullable=False, default=90)

    # Relationships
    profile: Mapped[Profile] = relationship(
        "Profile", back_populates="preferences", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<UserPreference user={self.user_id} role={self.preferred_role}>"
