"""Holiday room CRUD and membership.

A 'room' is a shared planning session. Anyone with the room slug can join.
The creator becomes admin. Members submit availability, preferences, and votes.
"""
from __future__ import annotations

import secrets
import string
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user

router = APIRouter()

# ── Schemas ──────────────────────────────────────────────────────────────────


class CreateRoomRequest(BaseModel):
    name: str
    rough_window: Optional[str] = None    # e.g. "September 2026"
    home_postcode: Optional[str] = None   # creator's postcode, stored on membership


class RoomResponse(BaseModel):
    id: str
    slug: str
    name: str
    current_step: str
    rough_window: Optional[str] = None
    member_count: int = 0
    is_admin: bool = False


class MemberResponse(BaseModel):
    user_id: str
    display_name: Optional[str]
    home_postcode: Optional[str]
    is_admin: bool
    joined_at: str


# ── Helpers ───────────────────────────────────────────────────────────────────


def _generate_slug(length: int = 8) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(length))


def _assert_member(db, room_id: str, user_id: str) -> dict:
    """Return the membership row or raise 403."""
    res = (
        db.table("room_members")
        .select("*")
        .eq("room_id", room_id)
        .eq("user_id", user_id)
        .execute()
    )
    if not res.data:
        raise HTTPException(403, "You are not a member of this room.")
    return res.data[0]


def _get_room_by_slug(db, slug: str) -> dict:
    """Return the room row or raise 404."""
    res = db.table("rooms").select("*").eq("slug", slug).execute()
    if not res.data:
        raise HTTPException(404, f"Room '{slug}' not found.")
    return res.data[0]


def _room_with_member_count(db, room: dict, user_id: str) -> RoomResponse:
    count_res = (
        db.table("room_members")
        .select("*", count="exact")
        .eq("room_id", room["id"])
        .execute()
    )
    member_count = count_res.count or 0

    # Fetch caller's membership to determine is_admin
    membership = (
        db.table("room_members")
        .select("is_admin")
        .eq("room_id", room["id"])
        .eq("user_id", user_id)
        .execute()
    )
    is_admin = bool(membership.data and membership.data[0].get("is_admin"))

    return RoomResponse(
        id=room["id"],
        slug=room["slug"],
        name=room["name"],
        current_step=room["current_step"],
        rough_window=room.get("rough_window"),
        member_count=member_count,
        is_admin=is_admin,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("", response_model=RoomResponse, status_code=status.HTTP_201_CREATED)
def create_room(
    body: CreateRoomRequest,
    user: UserInfo = Depends(current_user),
):
    """Create a new holiday planning room. Returns a shareable slug."""
    db = get_client()

    # Generate a unique slug (retry on collision)
    for _ in range(5):
        slug = _generate_slug()
        existing = db.table("rooms").select("id").eq("slug", slug).execute()
        if not existing.data:
            break
    else:
        raise HTTPException(500, "Could not generate a unique room slug. Try again.")

    # Create room
    room_res = (
        db.table("rooms")
        .insert(
            {
                "slug": slug,
                "name": body.name,
                "created_by": user.id,
                "rough_window": body.rough_window,
            }
        )
        .execute()
    )
    room = room_res.data[0]

    # Add creator as admin member
    db.table("room_members").insert(
        {
            "room_id": room["id"],
            "user_id": user.id,
            "is_admin": True,
            "home_postcode": body.home_postcode,
        }
    ).execute()

    return RoomResponse(
        id=room["id"],
        slug=room["slug"],
        name=room["name"],
        current_step=room["current_step"],
        rough_window=room.get("rough_window"),
        member_count=1,
        is_admin=True,
    )


@router.get("/{slug}", response_model=RoomResponse)
def get_room(slug: str, user: UserInfo = Depends(current_user)):
    """Fetch room state. Members only."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)
    return _room_with_member_count(db, room, user.id)


@router.post("/{slug}/join", response_model=RoomResponse)
def join_room(
    slug: str,
    home_postcode: Optional[str] = None,
    user: UserInfo = Depends(current_user),
):
    """Add the authenticated user to the room. Idempotent — safe to call again."""
    db = get_client()
    room = _get_room_by_slug(db, slug)

    # Check if already a member
    existing = (
        db.table("room_members")
        .select("*")
        .eq("room_id", room["id"])
        .eq("user_id", user.id)
        .execute()
    )
    if not existing.data:
        db.table("room_members").insert(
            {
                "room_id": room["id"],
                "user_id": user.id,
                "is_admin": False,
                "home_postcode": home_postcode,
            }
        ).execute()

    return _room_with_member_count(db, room, user.id)


@router.patch("/{slug}/join")
def update_postcode(
    slug: str,
    home_postcode: str,
    user: UserInfo = Depends(current_user),
):
    """Update the caller's home postcode for this room."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)
    db.table("room_members").update({"home_postcode": home_postcode}).eq(
        "room_id", room["id"]
    ).eq("user_id", user.id).execute()
    return {"ok": True}


@router.get("/{slug}/members", response_model=list[MemberResponse])
def list_members(slug: str, user: UserInfo = Depends(current_user)):
    """List room members and their home postcodes. Members only."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    members = (
        db.table("room_members")
        .select("*, profiles(display_name, email)")
        .eq("room_id", room["id"])
        .execute()
    )

    return [
        MemberResponse(
            user_id=m["user_id"],
            display_name=(m.get("profiles") or {}).get("display_name"),
            home_postcode=m.get("home_postcode"),
            is_admin=m["is_admin"],
            joined_at=m["joined_at"],
        )
        for m in members.data
    ]
