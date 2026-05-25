"""User profile endpoints.

The profile row is created automatically by a Supabase trigger when a
user signs up via OAuth. We expose getter/setter for the default home
postcode so the frontend can pre-fill the field when the user creates
or joins a new Holiday instead of asking them every time.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user

router = APIRouter()


class ProfileResponse(BaseModel):
    id: str
    email: Optional[str] = None
    display_name: Optional[str] = None
    avatar_url: Optional[str] = None
    default_home_postcode: Optional[str] = None


class ProfileUpdateRequest(BaseModel):
    default_home_postcode: Optional[str] = None
    display_name: Optional[str] = None


def _ensure_profile(db, user: UserInfo) -> dict:
    """Insert profile row if it doesn't already exist, then return the current state.

    Uses ignore_duplicates=True so that an existing user's custom display_name
    (set via PATCH /profile) is never overwritten by the Google OAuth name that
    lives in the JWT.  Email is kept in sync separately with a targeted UPDATE.
    """
    db.table("profiles").upsert(
        {
            "id": user.id,
            "email": user.email,
            "display_name": user.display_name or (user.email or "").split("@")[0],
        },
        on_conflict="id",
        ignore_duplicates=True,   # INSERT only — never overwrite existing rows
    ).execute()
    # Keep email in sync for existing users (e.g. if they changed their Google
    # address) without touching display_name or any other field.
    if user.email:
        db.table("profiles").update({"email": user.email}).eq("id", user.id).execute()
    res = db.table("profiles").select("*").eq("id", user.id).execute()
    return res.data[0] if res.data else {}


@router.get("", response_model=ProfileResponse)
def get_profile(user: UserInfo = Depends(current_user)):
    """Return the calling user's profile (including default postcode)."""
    db = get_client()
    p = _ensure_profile(db, user)
    return ProfileResponse(
        id=p.get("id", user.id),
        email=p.get("email"),
        display_name=p.get("display_name"),
        avatar_url=p.get("avatar_url"),
        default_home_postcode=p.get("default_home_postcode"),
    )


@router.patch("", response_model=ProfileResponse)
def update_profile(
    body: ProfileUpdateRequest,
    user: UserInfo = Depends(current_user),
):
    """Update the calling user's profile (postcode and/or display name).

    When default_home_postcode changes, the new value is also propagated to
    all room_members rows for this user so the flight optimiser picks it up
    immediately without requiring the user to re-enter it per-room.
    """
    db = get_client()
    _ensure_profile(db, user)
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if updates:
        db.table("profiles").update(updates).eq("id", user.id).execute()

    # Propagate new postcode to every room this user belongs to, so the
    # flight optimiser always uses the freshest value.
    if body.default_home_postcode:
        db.table("room_members").update(
            {"home_postcode": body.default_home_postcode}
        ).eq("user_id", user.id).execute()

    p = db.table("profiles").select("*").eq("id", user.id).execute().data[0]
    return ProfileResponse(
        id=p["id"],
        email=p.get("email"),
        display_name=p.get("display_name"),
        avatar_url=p.get("avatar_url"),
        default_home_postcode=p.get("default_home_postcode"),
    )
