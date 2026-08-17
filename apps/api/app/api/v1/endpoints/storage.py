"""
APTLY API — Media Storage Retrieval & Streaming Endpoint

Provides secure, authenticated media stream delivery for playback in review dashboards:
  GET /api/v1/storage/media/{storage_key:path}
  GET /api/v1/storage/sign/{storage_key:path}
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Response, status
from fastapi.responses import RedirectResponse, Response

from app.core.errors import StorageError
from app.core.logging import get_logger
from app.dependencies import get_storage
from app.services.storage.base import StorageProvider

logger = get_logger(__name__)

router = APIRouter(prefix="/storage", tags=["Storage & Media Playback"])


@router.get(
    "/media/{storage_key:path}",
    summary="Stream or redirect to stored media recording",
    description="Streams binary media object or redirects to a secure time-limited presigned URL.",
)
async def get_media_stream(
    storage_key: str,
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> Response:
    """Stream media file or redirect to temporary signed URL."""
    try:
        # Try generating a signed URL first
        presigned = await storage.generate_presigned_url(storage_key, expires_in_seconds=3600)
        if presigned.url.startswith("http"):
            return RedirectResponse(url=presigned.url, status_code=status.HTTP_307_TEMPORARY_REDIRECT)
    except Exception:
        pass

    # Direct binary download fallback
    try:
        data = await storage.download(storage_key)
        content_type = "video/webm"
        if storage_key.endswith(".wav"):
            content_type = "audio/wav"
        elif storage_key.endswith(".mp4"):
            content_type = "video/mp4"

        return Response(
            content=data,
            media_type=content_type,
            headers={
                "Accept-Ranges": "bytes",
                "Content-Length": str(len(data)),
                "Cache-Control": "private, max-age=3600",
            },
        )
    except StorageError as exc:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"code": "MEDIA_NOT_FOUND", "message": f"Media '{storage_key}' not found."},
        ) from exc
    except Exception as exc:
        logger.error("media_stream_error", key=storage_key, error=str(exc))
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "STORAGE_ERROR", "message": "Failed to stream media."},
        ) from exc


@router.get(
    "/sign/{storage_key:path}",
    summary="Get presigned playback URL",
    description="Returns a time-limited signed URL for private object access.",
)
async def sign_media_url(
    storage_key: str,
    storage: Annotated[StorageProvider, Depends(get_storage)],
) -> dict[str, str]:
    """Generate temporary signed URL for client playback."""
    try:
        presigned = await storage.generate_presigned_url(storage_key, expires_in_seconds=3600)
        return {
            "storage_key": storage_key,
            "url": presigned.url,
            "expires_at": presigned.expires_at.isoformat(),
        }
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={"code": "STORAGE_SIGN_FAILED", "message": str(exc)},
        ) from exc
