"""Holiday room CRUD and membership.

A 'room' is a shared planning session. Anyone with the room slug can join.
The creator becomes admin. Members submit availability, preferences, and votes.
"""
from __future__ import annotations

import json
import logging
import os
import secrets
import string
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from ..core.destinations import label as label_dest
from ..core.email import member_joined_email, member_welcome_email, send_email, step_advance_email
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user, optional_user

log = logging.getLogger("rooms")

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
    # Optional room settings
    search_start: Optional[str] = None
    search_end: Optional[str] = None
    agreed_start: Optional[str] = None
    agreed_end: Optional[str] = None
    min_nights: Optional[int] = None
    max_nights: Optional[int] = None
    budget_gbp: Optional[float] = None
    destination_iata: Optional[str] = None
    # Flight optimiser: £/hr the group puts on ground-travel time.
    # 0 = cheapest regardless of distance; higher = prefer shorter journeys.
    time_value_per_hour: float = 0.0


STEP_ORDER = ["availability", "duration", "budget", "destination", "flights", "booking", "done"]


class UpdateRoomRequest(BaseModel):
    name: Optional[str] = None
    rough_window: Optional[str] = None
    search_start: Optional[str] = None   # ISO date
    search_end: Optional[str] = None
    agreed_start: Optional[str] = None
    agreed_end: Optional[str] = None
    min_nights: Optional[int] = None
    max_nights: Optional[int] = None
    budget_gbp: Optional[float] = None
    destination_iata: Optional[str] = None
    time_value_per_hour: Optional[float] = None


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
        search_start=room.get("search_start"),
        search_end=room.get("search_end"),
        agreed_start=room.get("agreed_start"),
        agreed_end=room.get("agreed_end"),
        min_nights=room.get("min_nights"),
        max_nights=room.get("max_nights"),
        budget_gbp=room.get("budget_gbp"),
        destination_iata=room.get("destination_iata"),
        time_value_per_hour=room.get("time_value_per_hour") or 0.0,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("", response_model=list[RoomResponse])
def list_rooms(user: UserInfo = Depends(current_user)):
    """List all rooms the authenticated user belongs to, newest first."""
    db = get_client()

    memberships = (
        db.table("room_members")
        .select("room_id, is_admin")
        .eq("user_id", user.id)
        .execute()
    )
    if not memberships.data:
        return []

    admin_map = {m["room_id"]: m["is_admin"] for m in memberships.data}
    room_ids = list(admin_map.keys())

    rooms_res = (
        db.table("rooms")
        .select("*")
        .in_("id", room_ids)
        .order("created_at", desc=True)
        .execute()
    )

    # Single query for all member counts — avoids N+1 (one DB hit per room).
    all_members_res = (
        db.table("room_members")
        .select("room_id")
        .in_("room_id", room_ids)
        .execute()
    )
    count_by_room: dict[str, int] = {}
    for m in (all_members_res.data or []):
        rid = m["room_id"]
        count_by_room[rid] = count_by_room.get(rid, 0) + 1

    result = []
    for room in rooms_res.data:
        result.append(RoomResponse(
            id=room["id"],
            slug=room["slug"],
            name=room["name"],
            current_step=room["current_step"],
            rough_window=room.get("rough_window"),
            member_count=count_by_room.get(room["id"], 0),
            is_admin=admin_map.get(room["id"], False),
            search_start=room.get("search_start"),
            search_end=room.get("search_end"),
            agreed_start=room.get("agreed_start"),
            agreed_end=room.get("agreed_end"),
            min_nights=room.get("min_nights"),
            max_nights=room.get("max_nights"),
            budget_gbp=room.get("budget_gbp"),
            destination_iata=room.get("destination_iata"),
            time_value_per_hour=room.get("time_value_per_hour") or 0.0,
        ))
    return result


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

    # Ensure the user has a profile row (the trigger may have missed them
    # if they signed up before the migration ran).
    # ignore_duplicates=True → INSERT only; never overwrite an existing
    # display_name that the user set via their profile page.
    profile_data: dict = {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name or (user.email or "").split("@")[0],
    }
    # If the caller passed a postcode, also save it as their default so we
    # can pre-fill the field on future Holidays they create or join.
    if body.home_postcode:
        profile_data["default_home_postcode"] = body.home_postcode
    db.table("profiles").upsert(profile_data, on_conflict="id", ignore_duplicates=True).execute()
    # Keep email in sync for existing users without touching other fields.
    if user.email:
        db.table("profiles").update({"email": user.email}).eq("id", user.id).execute()

    # If no postcode was passed, fall back to the user's stored default.
    home_postcode = body.home_postcode
    if not home_postcode:
        existing = (
            db.table("profiles")
            .select("default_home_postcode")
            .eq("id", user.id)
            .execute()
        )
        if existing.data:
            home_postcode = existing.data[0].get("default_home_postcode")

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
            "home_postcode": home_postcode,
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
        search_start=None, search_end=None,
        agreed_start=None, agreed_end=None,
        min_nights=None, max_nights=None,
        budget_gbp=None, destination_iata=None,
        time_value_per_hour=0.0,
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

    # Ensure the joining user has a profile row (the trigger may have missed
    # them if they signed up before the migration ran). Without this, they'd
    # appear as 'Unknown' to other members of the room. Also save the postcode
    # as their default if they passed one, so future Holidays pre-fill it.
    # ignore_duplicates=True → INSERT only; never overwrite an existing
    # display_name the user set via their profile page.
    profile_data: dict = {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name or (user.email or "").split("@")[0],
    }
    if home_postcode:
        profile_data["default_home_postcode"] = home_postcode
    db.table("profiles").upsert(profile_data, on_conflict="id", ignore_duplicates=True).execute()
    # Keep email in sync for existing users without touching other fields.
    if user.email:
        db.table("profiles").update({"email": user.email}).eq("id", user.id).execute()

    # Fall back to stored default if none was passed
    if not home_postcode:
        existing_profile = (
            db.table("profiles")
            .select("default_home_postcode")
            .eq("id", user.id)
            .execute()
        )
        if existing_profile.data:
            home_postcode = existing_profile.data[0].get("default_home_postcode")

    # Check if already a member
    existing = (
        db.table("room_members")
        .select("*")
        .eq("room_id", room["id"])
        .eq("user_id", user.id)
        .execute()
    )
    is_new_member = not existing.data
    if is_new_member:
        db.table("room_members").insert(
            {
                "room_id": room["id"],
                "user_id": user.id,
                "is_admin": False,
                "home_postcode": home_postcode,
            }
        ).execute()

    result = _room_with_member_count(db, room, user.id)

    # Fire-and-forget: notify the admin that a new member joined.
    # Only send for genuinely new joins (not idempotent re-joins).
    if is_new_member:
        try:
            admin_row = (
                db.table("room_members")
                .select("user_id, profiles(email, display_name)")
                .eq("room_id", room["id"])
                .eq("is_admin", True)
                .execute()
            )
            for a in (admin_row.data or []):
                if a["user_id"] == user.id:
                    continue  # admin joining their own room — skip
                profile = a.get("profiles") or {}
                admin_email = profile.get("email")
                admin_name = profile.get("display_name") or "there"
                if not admin_email:
                    continue
                app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")
                joiner_name = user.display_name or (user.email or "").split("@")[0] or "Someone"
                subject, html = member_joined_email(
                    admin_name=admin_name,
                    member_name=joiner_name,
                    room_name=room["name"],
                    room_slug=slug,
                    member_count=result.member_count,
                    app_url=app_url,
                )
                send_email(to=admin_email, subject=subject, html=html)
        except Exception:
            log.warning("Failed to send member-joined notification (continuing)")

        # Send a welcome confirmation to the new member themselves
        try:
            joiner_email = user.email
            if joiner_email:
                app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")
                joiner_name = user.display_name or joiner_email.split("@")[0] or "there"
                welcome_subject, welcome_html = member_welcome_email(
                    member_name=joiner_name,
                    room_name=room["name"],
                    room_slug=slug,
                    current_step=room["current_step"],
                    app_url=app_url,
                )
                send_email(to=joiner_email, subject=welcome_subject, html=welcome_html)
        except Exception:
            log.warning("Failed to send member-welcome email (continuing)")

    return result


@router.patch("/{slug}/join")
def update_postcode(
    slug: str,
    home_postcode: str,
    user: UserInfo = Depends(current_user),
):
    """Update the caller's home postcode for this room.

    Also updates profiles.default_home_postcode so both stores stay in sync
    and future rooms / the flight optimiser fallback always have fresh data.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)
    db.table("room_members").update({"home_postcode": home_postcode}).eq(
        "room_id", room["id"]
    ).eq("user_id", user.id).execute()
    # Keep profile default in sync
    db.table("profiles").update({"default_home_postcode": home_postcode}).eq(
        "id", user.id
    ).execute()
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


@router.patch("/{slug}", response_model=RoomResponse)
def update_room(
    slug: str,
    body: UpdateRoomRequest,
    user: UserInfo = Depends(current_user),
):
    """Update room settings. Admin only."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if not membership.get("is_admin"):
        raise HTTPException(403, "Only room admins can update room settings.")

    updates: dict[str, Any] = {
        k: v for k, v in body.model_dump().items() if v is not None
    }
    if not updates:
        return _room_with_member_count(db, room, user.id)

    updated = db.table("rooms").update(updates).eq("id", room["id"]).execute()
    return _room_with_member_count(db, updated.data[0], user.id)


@router.delete("/{slug}", status_code=status.HTTP_204_NO_CONTENT)
def delete_room(slug: str, user: UserInfo = Depends(current_user)):
    """Delete a Holiday (room) and all related rows (cascade). Admin only.

    Database FKs use ON DELETE CASCADE so members, availability blocks,
    preferences, destination candidates/votes, and flight results are
    all cleaned up automatically.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if not membership.get("is_admin"):
        raise HTTPException(403, "Only the Holiday admin can delete it.")

    db.table("rooms").delete().eq("id", room["id"]).execute()
    return None


def _purge_member_room_data(db, room_id: str, user_id: str) -> None:
    """Delete a member's per-room data when they leave or are removed.

    The availability/preference/vote tables cascade on room or profile deletion
    but NOT on a member simply leaving the room, so without this their stale
    availability submissions (and busy dates, votes, prefs) would linger — which
    can wrongly trip the blind-reveal "everyone submitted" check. Best-effort:
    a cleanup failure must not block the member removal itself.
    """
    # These tables are keyed by (room_id, user_id) — straightforward delete.
    for table in (
        "availability_blocks",
        "availability_submissions",
        "trip_preferences",
        "destination_vote_submissions",
    ):
        try:
            db.table(table).delete().eq("room_id", room_id).eq("user_id", user_id).execute()
        except Exception:
            log.warning("Failed to purge %s for user %s in room %s", table, user_id, room_id)

    # destination_votes is keyed by candidate_id (no room_id), so delete the
    # user's votes only for candidates belonging to this room.
    try:
        cands = (
            db.table("destination_candidates")
            .select("id")
            .eq("room_id", room_id)
            .execute()
        )
        candidate_ids = [c["id"] for c in (cands.data or [])]
        if candidate_ids:
            db.table("destination_votes").delete().in_(
                "candidate_id", candidate_ids
            ).eq("user_id", user_id).execute()
    except Exception:
        log.warning("Failed to purge destination_votes for user %s in room %s", user_id, room_id)


@router.delete("/{slug}/leave", status_code=status.HTTP_204_NO_CONTENT)
def leave_room(slug: str, user: UserInfo = Depends(current_user)):
    """Remove the calling user from a room.

    Admins cannot leave their own room — they must transfer admin or delete it.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if membership.get("is_admin"):
        raise HTTPException(
            400,
            "Admins cannot leave their own Holiday. "
            "Delete the Holiday instead, or ask another member to become admin.",
        )
    db.table("room_members").delete().eq("room_id", room["id"]).eq("user_id", user.id).execute()
    _purge_member_room_data(db, room["id"], user.id)
    return None


@router.delete("/{slug}/members/{member_user_id}", status_code=status.HTTP_204_NO_CONTENT)
def kick_member(
    slug: str,
    member_user_id: str,
    user: UserInfo = Depends(current_user),
):
    """Admin: remove a specific member from the room.

    Admins cannot kick themselves — use leave or delete instead.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if not membership.get("is_admin"):
        raise HTTPException(403, "Only room admins can remove members.")
    if member_user_id == user.id:
        raise HTTPException(400, "Admins cannot remove themselves. Delete the Holiday instead.")
    # Check the target is actually in the room
    target = (
        db.table("room_members")
        .select("*")
        .eq("room_id", room["id"])
        .eq("user_id", member_user_id)
        .execute()
    )
    if not target.data:
        raise HTTPException(404, "That user is not a member of this room.")
    db.table("room_members").delete().eq("room_id", room["id"]).eq("user_id", member_user_id).execute()
    _purge_member_room_data(db, room["id"], member_user_id)
    return None


@router.post("/{slug}/advance", response_model=RoomResponse)
def advance_step(slug: str, user: UserInfo = Depends(current_user)):
    """Advance the room to the next planning step. Admin only."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if not membership.get("is_admin"):
        raise HTTPException(403, "Only room admins can advance the step.")

    current = room.get("current_step", "availability")
    try:
        next_step = STEP_ORDER[STEP_ORDER.index(current) + 1]
    except (ValueError, IndexError):
        raise HTTPException(400, "Room is already at the final step.")

    updated = (
        db.table("rooms")
        .update({"current_step": next_step})
        .eq("id", room["id"])
        .execute()
    )

    # Fire-and-forget: notify all non-admin members of the step change.
    # step_advance_email() returns None for steps that don't warrant an email.
    try:
        app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")
        members_res = (
            db.table("room_members")
            .select("user_id, is_admin, profiles(email, display_name)")
            .eq("room_id", room["id"])
            .execute()
        )
        for m in (members_res.data or []):
            if m["user_id"] == user.id:
                continue  # don't email the admin who triggered the advance
            profile = m.get("profiles") or {}
            email_addr = profile.get("email")
            if not email_addr:
                continue
            member_name = profile.get("display_name") or email_addr.split("@")[0] or "there"
            result = step_advance_email(
                member_name=member_name,
                room_name=room["name"],
                room_slug=slug,
                new_step=next_step,
                app_url=app_url,
            )
            if result:
                send_email(to=email_addr, subject=result[0], html=result[1])
    except Exception:
        log.warning("Failed to send step-advance notifications (continuing)")

    return _room_with_member_count(db, updated.data[0], user.id)


# ── Public shareable summary (no auth required) ───────────────────────────────

class PublicRoomSummary(BaseModel):
    name: str
    destination_iata: Optional[str]
    agreed_start: Optional[str]
    agreed_end: Optional[str]
    member_count: int
    avg_cost_pp: Optional[float]
    destination_name: Optional[str]


@router.get("/{slug}/summary", response_model=PublicRoomSummary)
def get_public_summary(slug: str, _user=Depends(optional_user)):
    """Return a sanitised public summary of a Holiday — no auth required.

    Omits member names, postcodes, and individual flight costs.
    Safe to share with people outside the group.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)

    count_res = db.table("room_members").select("*", count="exact").eq("room_id", room["id"]).execute()
    member_count = count_res.count or 0

    avg_cost = None
    dest_name = None
    dest_iata = room.get("destination_iata")
    # Query per-destination rows (one row per destination, not a single JSON blob)
    results_res = (
        db.table("flight_results")
        .select("destination_iata, total_group_cost_gbp, per_person_results")
        .eq("room_id", room["id"])
        .order("total_group_cost_gbp")
        .execute()
    )
    if results_res.data:
        # Prefer the locked destination; fall back to cheapest
        match = next((r for r in results_res.data if r.get("destination_iata") == dest_iata), None)
        if match is None:
            match = results_res.data[0]
        if match:
            _ppr = match.get("per_person_results")
            people_data = _ppr if isinstance(_ppr, list) else (json.loads(_ppr) if _ppr else [])
            # Only average over viable people (same logic as flights GET /results)
            viable = [p for p in people_data if p.get("viable")]
            if viable:
                avg_cost = sum(p.get("total_money_gbp", 0) for p in viable) / len(viable)
            dest_name = label_dest(match.get("destination_iata", ""), "name")

    return PublicRoomSummary(
        name=room["name"],
        destination_iata=room.get("destination_iata"),
        agreed_start=room.get("agreed_start"),
        agreed_end=room.get("agreed_end"),
        member_count=member_count,
        avg_cost_pp=avg_cost,
        destination_name=dest_name,
    )
