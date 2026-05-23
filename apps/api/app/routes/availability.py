"""Step 1: availability / time window.

Flow:
1. Room admin sets rough_window + search_start/end dates.
2. Each user submits their busy dates (manual or calendar import).
3. NOTHING is shown until every member has submitted (blind reveal).
4. Once all submitted, GET /windows computes ranked free windows.
"""
from __future__ import annotations

from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class AvailabilityBlock(BaseModel):
    block_date: date
    is_busy: bool = True
    source: str = "manual"   # manual | google_calendar | outlook
    note: Optional[str] = None


class SubmitAvailabilityRequest(BaseModel):
    blocks: list[AvailabilityBlock]
    mark_submitted: bool = True   # set False to save draft without locking in


class FreeWindow(BaseModel):
    start_date: date
    end_date: date
    days: int
    members_free: int


class SubmissionStatusResponse(BaseModel):
    submitted: int
    total: int
    members_pending: list[str]   # display names — safe to share
    all_submitted: bool


# ── Helpers ───────────────────────────────────────────────────────────────────


def _compute_free_windows(
    search_start: date,
    search_end: date,
    busy_by_date: dict,   # date → set[user_id]
    member_ids: set,
    min_days: int,
    top_n: int,
) -> list[FreeWindow]:
    """Find contiguous stretches where NO member is busy."""
    windows: list[FreeWindow] = []
    window_start: Optional[date] = None

    d = search_start
    while d <= search_end:
        busy = busy_by_date.get(d, set())
        anyone_busy = bool(busy & member_ids)

        if not anyone_busy:
            if window_start is None:
                window_start = d
        else:
            if window_start is not None:
                length = (d - window_start).days
                if length >= min_days:
                    windows.append(
                        FreeWindow(
                            start_date=window_start,
                            end_date=d - timedelta(days=1),
                            days=length,
                            members_free=len(member_ids),
                        )
                    )
                window_start = None
        d += timedelta(days=1)

    # Handle window that extends to search_end
    if window_start is not None:
        length = (search_end - window_start).days + 1
        if length >= min_days:
            windows.append(
                FreeWindow(
                    start_date=window_start,
                    end_date=search_end,
                    days=length,
                    members_free=len(member_ids),
                )
            )

    # Sort: longest first, then soonest
    windows.sort(key=lambda w: (-w.days, w.start_date))
    return windows[:top_n]


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("")
def submit_availability(
    slug: str,
    body: SubmitAvailabilityRequest,
    user: UserInfo = Depends(current_user),
):
    """Submit busy/free dates for the authenticated user.

    Idempotent: re-submitting replaces existing blocks. Set mark_submitted=True
    to lock in (enables the blind reveal once everyone has done the same).
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Upsert blocks (unique constraint: room_id, user_id, block_date)
    rows = [
        {
            "room_id": room["id"],
            "user_id": user.id,
            "block_date": b.block_date.isoformat(),
            "is_busy": b.is_busy,
            "source": b.source,
            "note": b.note,
        }
        for b in body.blocks
    ]
    if rows:
        db.table("availability_blocks").upsert(
            rows, on_conflict="room_id,user_id,block_date"
        ).execute()

    if body.mark_submitted:
        db.table("availability_submissions").upsert(
            {"room_id": room["id"], "user_id": user.id},
            on_conflict="room_id,user_id",
        ).execute()

    return {"ok": True, "blocks_saved": len(rows), "submitted": body.mark_submitted}


@router.get("/status", response_model=SubmissionStatusResponse)
def submission_status(slug: str, user: UserInfo = Depends(current_user)):
    """Returns how many members have submitted (safe to reveal before all done).

    Does NOT expose actual busy dates — only counts and names of who is pending.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # All members
    members_res = (
        db.table("room_members")
        .select("user_id, profiles(display_name)")
        .eq("room_id", room["id"])
        .execute()
    )
    all_members = {
        m["user_id"]: (m.get("profiles") or {}).get("display_name", "Unknown")
        for m in members_res.data
    }

    # Who has submitted
    submitted_res = (
        db.table("availability_submissions")
        .select("user_id")
        .eq("room_id", room["id"])
        .execute()
    )
    submitted_ids = {s["user_id"] for s in submitted_res.data}

    pending_names = [
        name for uid, name in all_members.items() if uid not in submitted_ids
    ]

    return SubmissionStatusResponse(
        submitted=len(submitted_ids),
        total=len(all_members),
        members_pending=pending_names,
        all_submitted=len(submitted_ids) == len(all_members),
    )


@router.get("/windows", response_model=list[FreeWindow])
def get_windows(
    slug: str,
    min_days: int = 4,
    top_n: int = 10,
    user: UserInfo = Depends(current_user),
):
    """Return ranked free windows (longest first, then soonest).

    Returns 412 Precondition Failed if not all members have submitted yet
    (blind reveal — no-one sees results until everyone is in).
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Get all members
    members_res = (
        db.table("room_members")
        .select("user_id")
        .eq("room_id", room["id"])
        .execute()
    )
    member_ids = {m["user_id"] for m in members_res.data}

    # Check all have submitted
    submitted_res = (
        db.table("availability_submissions")
        .select("user_id")
        .eq("room_id", room["id"])
        .execute()
    )
    submitted_ids = {s["user_id"] for s in submitted_res.data}

    if submitted_ids < member_ids:
        pending_count = len(member_ids) - len(submitted_ids)
        raise HTTPException(
            412,
            f"Waiting for {pending_count} more member(s) to submit their availability. "
            "Results are hidden until everyone has submitted.",
        )

    # Room must have a search window defined
    search_start = room.get("search_start")
    search_end = room.get("search_end")
    if not search_start or not search_end:
        raise HTTPException(
            422,
            "Room has no search window set. The room admin must set "
            "search_start and search_end first.",
        )

    start = date.fromisoformat(search_start)
    end = date.fromisoformat(search_end)

    # Load all BUSY blocks for this room
    blocks_res = (
        db.table("availability_blocks")
        .select("user_id, block_date")
        .eq("room_id", room["id"])
        .eq("is_busy", True)
        .execute()
    )

    busy_by_date: dict[date, set] = {}
    for b in blocks_res.data:
        d = date.fromisoformat(b["block_date"])
        busy_by_date.setdefault(d, set()).add(b["user_id"])

    return _compute_free_windows(start, end, busy_by_date, member_ids, min_days, top_n)
