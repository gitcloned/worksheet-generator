"""
JWT middleware for Supabase authentication.

Supabase newer projects use ES256 (asymmetric ECDSA) instead of HS256.
We fetch the JWKS public keys via requests (handles SSL correctly on macOS)
and cache them for 1 hour. Falls back to HS256 if SUPABASE_URL is unset.
"""
import asyncio
import os
import time
from typing import Annotated

import jwt
import requests
from jwt import PyJWK
from jwt.exceptions import InvalidTokenError

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_JWT_SECRET = os.getenv("SUPABASE_JWT_SECRET", "")

_bearer = HTTPBearer(auto_error=False)

_jwks_cache: dict | None = None
_jwks_cache_time: float = 0.0
_JWKS_TTL = 3600  # re-fetch keys every hour


def _fetch_jwks() -> dict:
    """Fetch and cache Supabase JWKS. Runs in a thread pool to avoid blocking the event loop."""
    global _jwks_cache, _jwks_cache_time
    now = time.monotonic()
    if _jwks_cache and (now - _jwks_cache_time) < _JWKS_TTL:
        return _jwks_cache
    url = f"{SUPABASE_URL}/auth/v1/.well-known/jwks.json"
    resp = requests.get(url, timeout=5)
    resp.raise_for_status()
    _jwks_cache = resp.json()
    _jwks_cache_time = now
    return _jwks_cache


async def _decode_token(token: str) -> dict:
    """Decode and validate a Supabase JWT. Raises HTTPException on failure.

    The JWKS fetch (if needed) runs in a thread pool via asyncio.to_thread so it
    never blocks the event loop — even if Supabase is slow or unreachable.
    """
    try:
        header = jwt.get_unverified_header(token)
        alg = header.get("alg", "HS256")

        if alg in ("ES256", "RS256") and SUPABASE_URL:
            kid = header.get("kid")
            jwks_data = await asyncio.to_thread(_fetch_jwks)
            key_data = next(
                (k for k in jwks_data.get("keys", []) if k.get("kid") == kid),
                None,
            )
            if key_data is None:
                # kid rotated — clear cache and retry once
                global _jwks_cache
                _jwks_cache = None
                jwks_data = await asyncio.to_thread(_fetch_jwks)
                key_data = next(
                    (k for k in jwks_data.get("keys", []) if k.get("kid") == kid),
                    None,
                )
            if key_data is None:
                raise InvalidTokenError(f"No JWKS key found for kid: {kid}")

            signing_key = PyJWK(key_data).key
            payload = jwt.decode(
                token,
                signing_key,
                algorithms=["ES256", "RS256"],
                options={"verify_aud": False},
            )
        else:
            # HS256 fallback (older Supabase projects)
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                options={"verify_aud": False},
            )
        return payload

    except InvalidTokenError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid or expired token: {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )
    except Exception as exc:
        # JWKS fetch failed (network error, timeout, etc.) — treat as auth failure
        # so one bad request doesn't 500 the whole endpoint.
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Could not validate token (JWKS fetch failed): {exc}",
            headers={"WWW-Authenticate": "Bearer"},
        )


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str:
    """FastAPI dependency: returns user_id (UUID string) or raises 401."""
    if credentials is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Authorization header missing",
            headers={"WWW-Authenticate": "Bearer"},
        )
    payload = await _decode_token(credentials.credentials)
    user_id: str | None = payload.get("sub")
    if not user_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token missing subject claim",
        )
    return user_id


async def get_optional_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(_bearer)],
) -> str | None:
    """FastAPI dependency: returns user_id if auth header present, else None."""
    if credentials is None:
        return None
    try:
        payload = await _decode_token(credentials.credentials)
        return payload.get("sub")
    except HTTPException:
        return None
