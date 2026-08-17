"""
APTLY API — SQLAlchemy Base Models

Provides the declarative base and common mixins for all ORM models.

Design rules:
- All IDs are UUIDs (generated server-side, never trusted from clients)
- All tables have created_at and updated_at timestamps
- Soft-delete is preferred for interview data (enable per-entity as needed)
- Media references are stored as storage keys, NOT file paths
"""

from __future__ import annotations

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import DateTime, Uuid, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """SQLAlchemy declarative base for all APTLY ORM models."""


class UUIDMixin:
    """
    Mixin that adds a UUID primary key.

    UUIDs are generated server-side using uuid4.
    Client-provided IDs are NEVER trusted.
    """

    id: Mapped[UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid4,
        index=True,
    )


class TimestampMixin:
    """
    Mixin that adds created_at and updated_at columns.

    Both are timezone-aware UTC timestamps.
    updated_at is automatically set on every UPDATE via server_onupdate.
    """

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )


class SoftDeleteMixin:
    """
    Mixin that adds soft-delete support.

    Records are marked deleted_at instead of physically removed.
    This is critical for interview data where:
    - User requests deletion should be auditable
    - Media can be deleted independently of metadata
    - Retention policies can be enforced asynchronously
    """

    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
        default=None,
        index=True,
    )

    @property
    def is_deleted(self) -> bool:
        """Return True if this record has been soft-deleted."""
        return self.deleted_at is not None
