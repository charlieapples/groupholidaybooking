"""FastAPI dependency: authenticated Supabase user.

The frontend (Next.js) obtains a JWT from Supabase Auth after Google Sign-In
and passes it as `Authorization: Bearer <jwt>` on every API request.

We validate it by calling supabase.auth.get_user(token) — this is a single
network hop to Supabase and returns the full user object or raises AuthApiError.

Usage in a route:
    from ..deps.auth import current_user, UserInfo

    @router.post("")
    def my_route(user: UserInfo = Depends(current_user)):
        ...
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from fastapi import Depends, HTTPException, Header
from gotrue.errors import AuthApiError

from ..db.supabase import get_client


@dataclass
class UserInfo:
    id: str
    email: Optional[str]
    display_name: Optional[str]


def current_user(authorization: str = Header(...)) -> UserInfo:
    """Validate the Supabase JWT and return lightweight user info."""
    if not authorization.startswith("Bearer "):
        raise HTTPException(401, "Authorization header must be 'Bearer <token>'")
    token = authorization[7:].strip()
    try:
        resp = get_client().auth.get_user(token)
        u = resp.user
        return UserInfo(
            id=u.id,
            email=u.email,
            display_name=(u.user_metadata or {}).get("full_name"),
        )
    except AuthApiError as exc:
        raise HTTPException(401, f"Invalid or expired token: {exc}") from exc
    except Exception as exc:
        raise HTTPException(500, f"Auth check failed: {exc}") from exc


def optional_user(authorization: Optional[str] = Header(None)) -> Optional[UserInfo]:
    """Like current_user but returns None instead of 401 when no token is provided.
    Use for endpoints that work both authenticated and unauthenticated."""
    if not authorization:
        return None
    try:
        return current_user(authorization)
    except HTTPException:
        return None
