"""
APTLY API — User Profile Model (Linked to auth.users.id)
"""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.interview import Interview
    from app.models.user_document import UserDocument
    from app.models.user_preference import UserPreference
    from app.models.progress import UserProgress


class Profile(UUIDMixin, TimestampMixin, Base):
    """
    User Profile linked directly to Supabase auth.users.id.
    Never stores passwords or authentication credentials.
    """

    __tablename__ = "profiles"

    # id matches Supabase auth.users.id
    email: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    display_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    avatar_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    target_role: Mapped[str | None] = mapped_column(String(100), nullable=True, default="Software Engineer")
    target_seniority: Mapped[str | None] = mapped_column(String(50), nullable=True, default="Mid-Level")

    # Relationships
    interviews: Mapped[list[Interview]] = relationship(
        "Interview",
        back_populates="profile",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    progress_records: Mapped[list[UserProgress]] = relationship(
        "UserProgress",
        back_populates="profile",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    documents: Mapped[list[UserDocument]] = relationship(
        "UserDocument",
        back_populates="profile",
        lazy="selectin",
        cascade="all, delete-orphan",
    )
    preferences: Mapped[UserPreference | None] = relationship(
        "UserPreference",
        back_populates="profile",
        uselist=False,
        lazy="selectin",
        cascade="all, delete-orphan",
    )

    def __repr__(self) -> str:
        return f"<Profile id={self.id} name={self.display_name}>"
