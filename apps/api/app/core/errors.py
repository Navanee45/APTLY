"""
APTLY API — Error Classes and Exception Handlers

Defines a hierarchy of domain-specific exceptions and ensures
every API error returns the standard APTLY error response shape:

    {
        "error": {
            "code": "INTERVIEW_NOT_FOUND",
            "message": "Interview does not exist",
            "request_id": "..."
        }
    }

Stack traces are NEVER exposed to clients in production.
"""

from __future__ import annotations

from http import HTTPStatus
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.logging import get_logger, get_request_id

logger = get_logger(__name__)


# ── Error Response Schema ─────────────────────────────────────────────────────


class ErrorDetail(BaseModel):
    """Standard error payload returned by all APTLY API errors."""

    code: str
    message: str
    request_id: str = ""
    details: dict[str, Any] | None = None


class ErrorResponse(BaseModel):
    """Top-level error envelope."""

    error: ErrorDetail


# ── Exception Hierarchy ───────────────────────────────────────────────────────


class AptlyException(Exception):
    """
    Base class for all APTLY domain exceptions.

    All subclasses produce the standard error response.
    Never expose internal details to clients in production.
    """

    status_code: int = HTTPStatus.INTERNAL_SERVER_ERROR
    error_code: str = "INTERNAL_ERROR"
    default_message: str = "An unexpected error occurred"

    def __init__(
        self,
        message: str | None = None,
        details: dict[str, Any] | None = None,
        code: str | None = None,
    ) -> None:
        self.message = message or self.default_message
        self.details = details
        if code:
            self.error_code = code
        super().__init__(self.message)


class NotFoundError(AptlyException):
    """Resource does not exist."""

    status_code = HTTPStatus.NOT_FOUND
    error_code = "NOT_FOUND"
    default_message = "The requested resource was not found"


class InterviewNotFoundError(NotFoundError):
    """Interview record does not exist."""

    error_code = "INTERVIEW_NOT_FOUND"
    default_message = "Interview does not exist"


class ValidationError(AptlyException):
    """Input validation failed (domain-level, not Pydantic schema)."""

    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "VALIDATION_ERROR"
    default_message = "Input validation failed"


class ProviderError(AptlyException):
    """An AI/ML provider call failed."""

    status_code = HTTPStatus.SERVICE_UNAVAILABLE
    error_code = "PROVIDER_ERROR"
    default_message = "An upstream provider is unavailable"


class StorageError(AptlyException):
    """A storage operation failed."""

    status_code = HTTPStatus.INTERNAL_SERVER_ERROR
    error_code = "STORAGE_ERROR"
    default_message = "A storage operation failed"


class MediaValidationError(AptlyException):
    """Uploaded media file failed validation."""

    status_code = HTTPStatus.UNPROCESSABLE_ENTITY
    error_code = "MEDIA_VALIDATION_ERROR"
    default_message = "The uploaded file is invalid"


class RateLimitError(AptlyException):
    """Rate limit exceeded."""

    status_code = HTTPStatus.TOO_MANY_REQUESTS
    error_code = "RATE_LIMIT_EXCEEDED"
    default_message = "Too many requests. Please slow down."


# ── Response Builders ─────────────────────────────────────────────────────────


def _build_error_response(
    code: str,
    message: str,
    details: dict[str, Any] | None = None,
) -> ErrorResponse:
    """Build a standardised ErrorResponse object."""
    return ErrorResponse(
        error=ErrorDetail(
            code=code,
            message=message,
            request_id=get_request_id(),
            details=details,
        )
    )


# ── Exception Handlers ────────────────────────────────────────────────────────


async def aptly_exception_handler(
    request: Request,
    exc: AptlyException,
) -> JSONResponse:
    """Handle all AptlyException subclasses."""
    logger.warning(
        "aptly_exception",
        error_code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
        path=str(request.url.path),
    )
    return JSONResponse(
        status_code=exc.status_code,
        content=_build_error_response(
            code=exc.error_code,
            message=exc.message,
            details=exc.details,
        ).model_dump(),
    )


async def validation_exception_handler(
    request: Request,
    exc: RequestValidationError,
) -> JSONResponse:
    """Handle Pydantic request validation errors."""
    # Extract field-level details safely — do NOT echo raw input
    field_errors: dict[str, Any] = {}
    for err in exc.errors():
        field = ".".join(str(loc) for loc in err["loc"])
        field_errors[field] = err["msg"]

    logger.warning(
        "request_validation_error",
        path=str(request.url.path),
        field_count=len(field_errors),
    )
    return JSONResponse(
        status_code=HTTPStatus.UNPROCESSABLE_ENTITY,
        content=_build_error_response(
            code="REQUEST_VALIDATION_ERROR",
            message="Request body or parameters are invalid",
            details={"fields": field_errors},
        ).model_dump(),
    )


async def unhandled_exception_handler(
    request: Request,
    exc: Exception,
) -> JSONResponse:
    """
    Catch-all for unhandled exceptions.

    Logs the full error server-side.
    Returns a safe generic message to the client, plus error details in development.
    """
    logger.exception(
        "unhandled_exception",
        path=str(request.url.path),
        exc_type=type(exc).__name__,
        error=str(exc),
    )
    details = {"error": str(exc), "exc_type": type(exc).__name__}
    return JSONResponse(
        status_code=HTTPStatus.INTERNAL_SERVER_ERROR,
        content=_build_error_response(
            code="INTERNAL_ERROR",
            message=f"Internal Server Error: {exc}",
            details=details,
        ).model_dump(),
    )


# ── Registration Helper ───────────────────────────────────────────────────────


def register_exception_handlers(app: FastAPI) -> None:
    """Register all exception handlers on the FastAPI application."""
    app.add_exception_handler(AptlyException, aptly_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(RequestValidationError, validation_exception_handler)  # type: ignore[arg-type]
    app.add_exception_handler(Exception, unhandled_exception_handler)
