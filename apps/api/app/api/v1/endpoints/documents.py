"""
APTLY API — User Documents Archive Endpoints

Manages private user coaching plans, reports, and summaries with strict ownership checks.
"""

from __future__ import annotations

from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import UserContext, get_current_user
from app.core.logging import get_logger
from app.dependencies import get_db
from app.models.user_document import UserDocument

logger = get_logger(__name__)

router = APIRouter(prefix="/documents", tags=["User Documents & Reports"])


@router.get(
    "",
    summary="List user documents",
    description="Returns all reports, practice plans, and coaching documents owned by the authenticated user.",
)
async def list_user_documents(
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
    document_type: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
) -> dict[str, Any]:
    stmt = (
        select(UserDocument)
        .where(UserDocument.user_id == user.id)
        .order_by(UserDocument.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    if document_type:
        stmt = stmt.where(UserDocument.document_type == document_type)

    res = await db.execute(stmt)
    docs = list(res.scalars().all())

    items = [
        {
            "id": str(d.id),
            "user_id": str(d.user_id),
            "interview_id": str(d.interview_id) if d.interview_id else None,
            "document_type": d.document_type,
            "title": d.title,
            "document_version": d.document_version,
            "scoring_algorithm_version": d.scoring_algorithm_version,
            "metadata": d.metadata_json,
            "created_at": d.created_at.isoformat(),
        }
        for d in docs
    ]

    return {
        "user_id": str(user.id),
        "total_count": len(items),
        "items": items,
    }


@router.get(
    "/{document_id}",
    summary="Get user document details",
    description="Returns full markdown content and metadata for a specific document.",
)
async def get_user_document(
    document_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    doc = await db.get(UserDocument, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": f"Document '{document_id}' not found."},
        )

    # IDOR Security Check: Document must belong strictly to current user
    if doc.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this document."},
        )

    return {
        "id": str(doc.id),
        "user_id": str(doc.user_id),
        "interview_id": str(doc.interview_id) if doc.interview_id else None,
        "document_type": doc.document_type,
        "title": doc.title,
        "content_markdown": doc.content_markdown,
        "metadata": doc.metadata_json,
        "document_version": doc.document_version,
        "scoring_algorithm_version": doc.scoring_algorithm_version,
        "created_at": doc.created_at.isoformat(),
        "updated_at": doc.updated_at.isoformat() if doc.updated_at else None,
    }


@router.delete(
    "/{document_id}",
    summary="Delete user document",
    description="Deletes a document owned by the authenticated user.",
)
async def delete_user_document(
    document_id: UUID,
    user: Annotated[UserContext, Depends(get_current_user)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> dict[str, Any]:
    doc = await db.get(UserDocument, document_id)
    if not doc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "DOCUMENT_NOT_FOUND", "message": f"Document '{document_id}' not found."},
        )

    if doc.user_id != user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"code": "FORBIDDEN", "message": "Access denied to this document."},
        )

    await db.delete(doc)
    await db.commit()

    return {"status": "deleted", "document_id": str(document_id)}
