"""
APTLY API — User Progress Model

Maintains version-stable historical progress records for each user.
Scores are comparable only within the same scoring_algorithm_version.
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, Float, ForeignKey, Integer, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.interview import Interview
    from app.models.profile import Profile


class UserProgress(UUIDMixin, TimestampMixin, Base):
    """
    Historical progress entry stamped with scoring_algorithm_version.
    """

    __tablename__ = "user_progress"

    user_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("profiles.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    interview_id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("interviews.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    # Version Guarantee: Never mix scoring versions in progress trajectories
    scoring_algorithm_version: Mapped[str] = mapped_column(
        String(20), nullable=False, default="1.0.0", index=True
    )

    role_title: Mapped[str] = mapped_column(String(255), nullable=False, default="General")
    interview_type: Mapped[str] = mapped_column(String(50), nullable=False, default="mixed")

    # Core scores (0.0 to 100.0)
    overall_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    content_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    delivery_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    relevance_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    technical_depth_score: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)

    # Delivery metrics
    wpm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    filler_density: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    total_pauses_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    eye_contact_ratio: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)
    voice_energy_avg: Mapped[float | None] = mapped_column(Float, nullable=True, default=None)

    # Structured insights
    top_habits_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )
    strengths_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)
    weaknesses_json: Mapped[list[str]] = mapped_column(JSON, nullable=False, default=list)

    # Relationships
    profile: Mapped[Profile] = relationship(
        "Profile", back_populates="progress_records", lazy="selectin"
    )
    interview: Mapped[Interview] = relationship(
        "Interview", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<UserProgress user={self.user_id} score={self.overall_score} v={self.scoring_algorithm_version}>"
