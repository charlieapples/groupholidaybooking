"""Step 1: availability / time window.

Flow:
1. Room admin sets rough_window + search_start/end dates.
2. Each user submits their busy dates (manual or calendar import).
3. NOTHING is shown until every member has submitted (blind reveal).
4. Once all submitted, GET /windows computes ranked free windows.
"""
from __future__ import annotations

import re
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import os

from ..core.email import availability_complete_email, send_email
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

def _parse_rough_window(rough: str | None) -> tuple[date, date] | None:
    """Parse rough_window text into (start, end) dates.  Returns None if unparseable."""
    if not rough:
        return None
    sep = r"\s*[–—-]\s*"
    # "Month YYYY – Month YYYY"
    m = re.match(r"(\w+)\s+(\d{4})" + sep + r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, sy, em, ey = _MONTH_MAP.get(m[1].lower()), int(m[2]), _MONTH_MAP.get(m[3].lower()), int(m[4])
        if sm and em:
            return date(sy, sm, 1), date(ey, em, _days_in_month(ey, em))
    # "Month–Month YYYY"
    m = re.match(r"(\w+)" + sep + r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, em, y = _MONTH_MAP.get(m[1].lower()), _MONTH_MAP.get(m[2].lower()), int(m[3])
        if sm and em:
            return date(y, sm, 1), date(y, em, _days_in_month(y, em))
    # "Month YYYY"
    m = re.match(r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, y = _MONTH_MAP.get(m[1].lower()), int(m[2])
        if sm:
            return date(y, sm, 1), date(y, sm, _days_in_month(y, sm))
    return None

def _days_in_month(year: int, month: int) -> int:
    if month == 12:
        return 31
    return (date(year, month + 1, 1) - timedelta(days=1)).day

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
    user_submitted: bool = False  # whether the calling user has already submitted


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

        # Check if everyone has now submitted — if so, email the admin.
        # Wrapped in try/except so a notification failure never breaks the submit.
        try:
            all_members = db.table("room_members").select("user_id, is_admin").eq("room_id", room["id"]).execute()
            submitted = db.table("availability_submissions").select("user_id").eq("room_id", room["id"]).execute()
            submitted_ids = {s["user_id"] for s in (submitted.data or [])}
            all_ids = {m["user_id"] for m in (all_members.data or [])}

            if submitted_ids >= all_ids and all_ids:
                # Find the admin's email
                admin_row = next((m for m in (all_members.data or []) if m.get("is_admin")), None)
                if admin_row:
                    admin_profile = (
                        db.table("profiles")
                        .select("email, display_name")
                        .eq("id", admin_row["user_id"])
                        .single()
                        .execute()
                    )
                    if admin_profile.data and admin_profile.data.get("email"):
                        admin_email = admin_profile.data["email"]
                        admin_name = admin_profile.data.get("display_name") or "there"
                        app_url = os.getenv("APP_URL", "https://groupholidaybooking.vercel.app")
                        subject, html = availability_complete_email(
                            admin_name=admin_name,
                            room_name=room["name"],
                            room_slug=slug,
                            member_count=len(all_ids),
                            app_url=app_url,
                        )
                        send_email(to=admin_email, subject=subject, html=html)
        except Exception:
            import logging
            logging.getLogger("availability").warning(
                "Failed to send availability-complete notification (continuing)"
            )

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
        user_submitted=user.id in submitted_ids,
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

    # Determine search window — use explicit dates if set, fall back to rough_window
    search_start = room.get("search_start")
    search_end = room.get("search_end")
    if search_start and search_end:
        start = date.fromisoformat(search_start)
        end = date.fromisoformat(search_end)
    else:
        parsed = _parse_rough_window(room.get("rough_window"))
        if not parsed:
            raise HTTPException(
                422,
                "Room has no time window set. The room admin must set a rough_window or exact dates.",
            )
        start, end = parsed

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
