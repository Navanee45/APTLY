"""
APTLY API — User Document Model

Database-backed private coaching documents, practice plans, and reports per user.
Protected by user tenancy and PostgreSQL RLS.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.interview import Interview
    from app.models.profile import Profile


class UserDocument(UUIDMixin, TimestampMixin, Base):
    """
    User-specific coaching summaries, practice plans, and archived performance reports.
    """

    __tablename__ = "user_documents"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interview_id: Mapped[UUID | None] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interviews.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )

    # Document types: INTERVIEW_REPORT | COACHING_SUMMARY | PROGRESS_SUMMARY | PRACTICE_PLAN | PERFORMANCE_REVIEW
    document_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    content_markdown: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict[str, Any]] = mapped_column(JSON, nullable=False, default=dict)

    # Versioning
    document_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")
    scoring_algorithm_version: Mapped[str] = mapped_column(String(20), nullable=False, default="1.0.0")

    # Relationships
    profile: Mapped[Profile] = relationship(
        "Profile", back_populates="documents", lazy="selectin"
    )
    interview: Mapped[Interview | None] = relationship(
        "Interview", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<UserDocument id={self.id} type={self.document_type} title={self.title}>"
