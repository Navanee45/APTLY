"""
APTLY API — SpeechMetrics ORM Model (Deterministic)
"""

from __future__ import annotations

from typing import TYPE_CHECKING, Any
from uuid import UUID

from sqlalchemy import JSON, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, TimestampMixin, UUIDMixin

if TYPE_CHECKING:
    from app.models.answer import Answer


class SpeechMetrics(UUIDMixin, TimestampMixin, Base):
    """
    Deterministic speech measurements derived directly from audio & timestamped words.
    """

    __tablename__ = "speech_metrics"

    answer_id: Mapped[UUID] = mapped_column(
        ForeignKey("answers.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    schema_version: Mapped[str] = mapped_column(
        String(20), nullable=False, default="1.0"
    )

    # Rate of speech
    wpm: Mapped[float] = mapped_column(Float, nullable=False, default=0.0)
    speaking_duration_seconds: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    total_words: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Filler words
    filler_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    filler_density: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    filler_words_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # Pauses & Dead Air
    pause_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_pause_seconds: Mapped[float] = mapped_column(
        Float, nullable=False, default=0.0
    )
    pauses_json: Mapped[list[dict[str, Any]]] = mapped_column(
        JSON, nullable=False, default=list
    )

    # Voice Energy Analysis
    voice_energy_json: Mapped[dict[str, Any] | None] = mapped_column(
        JSON, nullable=True, default=None
    )

    # Relationships
    answer: Mapped[Answer] = relationship(
        "Answer", back_populates="speech_metrics", lazy="selectin"
    )

    def __repr__(self) -> str:
        return f"<SpeechMetrics id={self.id} wpm={self.wpm} fillers={self.filler_count}>"
