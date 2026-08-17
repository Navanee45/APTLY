"""
APTLY API — Supabase Authentication & User Identity Context

Enforces JWT verification, user identity extraction, and tenancy isolation.
Never trusts client-supplied user_id in payloads; user identity is derived strictly from auth.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from typing import Any
from uuid import UUID

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

# Development fallback user ID for unauthenticated local development if auth is bypassed
DEV_USER_ID = UUID("00000000-0000-0000-0000-000000000001")
DEV_USER_EMAIL = "developer@aptly.local"

security_bearer = HTTPBearer(auto_error=False)


@dataclass
class UserContext:
    """Represents the authenticated caller extracted from Supabase JWT."""

    id: UUID
    email: str | None
    role: str = "authenticated"
    display_name: str | None = None
    claims: dict[str, Any] | None = None

    @property
    def id_str(self) -> str:
        return str(self.id)


from datetime import datetime, timezone

def decode_supabase_jwt(token: str, settings: Settings) -> dict[str, Any]:
    """
    Decode and validate a Supabase Auth JWT token.
    """
    jwt_secret = settings.supabase_jwt_secret
    if jwt_secret:
        try:
            payload = jwt.decode(
                token,
                jwt_secret,
                algorithms=["HS256"],
                options={"verify_aud": False, "verify_exp": True},
            )
            return payload
        except JWTError as exc:
            logger.warning("supabase_jwt_signature_check_failed", error=str(exc))

    # In development/test mode or with Supabase RS256/ES256 public tokens:
    if settings.app_env in ("development", "test"):
        try:
            unverified = jwt.get_unverified_claims(token)
            if "sub" in unverified:
                exp = unverified.get("exp")
                if exp and datetime.now(timezone.utc).timestamp() > exp:
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail={"code": "TOKEN_EXPIRED", "message": "Auth token has expired."},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
                return unverified
        except HTTPException:
            raise
        except Exception as exc:
            logger.warning("supabase_jwt_unverified_fallback_failed", error=str(exc))

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"code": "INVALID_TOKEN", "message": "Could not validate auth credentials."},
        headers={"WWW-Authenticate": "Bearer"},
    )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_bearer),
    settings: Settings = Depends(get_settings),
) -> UserContext:
    """
    FastAPI dependency: Returns the authenticated user context.
    If no authorization header is passed and in development mode, supplies the default dev user.
    """
    if not credentials:
        if settings.app_env in ("development", "test"):
            return UserContext(
                id=DEV_USER_ID,
                email=DEV_USER_EMAIL,
                role="authenticated",
                display_name="Local Developer",
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "UNAUTHENTICATED", "message": "Authentication token is required."},
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    payload = decode_supabase_jwt(token, settings)

    sub = payload.get("sub")
    if not sub:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"code": "INVALID_TOKEN", "message": "Token missing subject claim."},
        )

    try:
        user_uuid = UUID(str(sub))
    except ValueError:
        # Create deterministic UUID from sub string if not standard UUID format
        user_uuid = uuid.uuid5(uuid.NAMESPACE_DNS, str(sub))

    email = payload.get("email")
    role = payload.get("role", "authenticated")
    user_metadata = payload.get("user_metadata", {})
    display_name = user_metadata.get("display_name") or user_metadata.get("full_name") or (email.split("@")[0] if email else "User")

    return UserContext(
        id=user_uuid,
        email=email,
        role=role,
        display_name=display_name,
        claims=payload,
    )


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Security(security_bearer),
    settings: Settings = Depends(get_settings),
) -> UserContext | None:
    """
    FastAPI dependency: Returns UserContext if authenticated, or None if anonymous.
    """
    if not credentials:
        return None
    try:
        return await get_current_user(credentials, settings)
    except HTTPException:
        return None
