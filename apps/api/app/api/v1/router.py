"""
APTLY API — API v1 Router

Aggregates all v1 endpoint routers under /api/v1.
"""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1.endpoints import (
    ai,
    documents,
    interviews,
    jobs,
    profiles,
    progress,
    realtime,
    storage,
)

router = APIRouter()

# Register sub-routers
router.include_router(jobs.router)
router.include_router(interviews.router)
router.include_router(realtime.router)
router.include_router(ai.router)
router.include_router(storage.router)
router.include_router(progress.router)
router.include_router(documents.router)
router.include_router(profiles.router)
