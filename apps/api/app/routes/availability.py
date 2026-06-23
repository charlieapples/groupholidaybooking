"""Step 1: availability / time window.

Flow:
1. Room admin sets rough_window + search_start/end dates.
2. Each user submits their busy dates (manual or calendar import).
3. NOTHING is shown until every member has submitted (blind reveal).
4. Once all submitted, GET /windows computes ranked free windows.
"""
from __future__ import annotations

import re
import time
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

import os

# ── Rate limiting for the /remind endpoint ────────────────────────────────────
# Prevent admins from accidentally spamming pending members.
# In-memory per-room: at most 1 reminder per 5 minutes.
_REMIND_COOLDOWN_SEC = 300  # 5 minutes
_last_remind: dict[str, float] = {}  # room_id → last remind timestamp

from ..core.email import availability_complete_email, availability_reminder_email, send_email
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

_MONTH_MAP = {
    "january": 1, "february": 2, "march": 3, "april": 4, "may": 5, "june": 6,
    "july": 7, "august": 8, "september": 9, "october": 10, "november": 11, "december": 12,
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "sept": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _month(name: str) -> int | None:
    """Look up a month number, tolerant of en-GB abbreviations like 'Sept'."""
    k = name.lower()
    return _MONTH_MAP.get(k) or _MONTH_MAP.get(k[:3])


def _parse_rough_window(rough: str | None) -> tuple[date, date] | None:
    """Parse rough_window text into (start, end) dates.  Returns None if unparseable."""
    if not rough:
        return None
    sep = r"\s*[–—-]\s*"
    # "D Mon YYYY – D Mon YYYY"  (exact-date window — must be tried first)
    m = re.match(r"(\d{1,2})\s+(\w+)\s+(\d{4})" + sep + r"(\d{1,2})\s+(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, em = _month(m[2]), _month(m[5])
        if sm and em:
            return date(int(m[3]), sm, int(m[1])), date(int(m[6]), em, int(m[4]))
    # "Month YYYY – Month YYYY"
    m = re.match(r"(\w+)\s+(\d{4})" + sep + r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, sy, em, ey = _month(m[1]), int(m[2]), _month(m[3]), int(m[4])
        if sm and em:
            return date(sy, sm, 1), date(ey, em, _days_in_month(ey, em))
    # "Month–Month YYYY"
    m = re.match(r"(\w+)" + sep + r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, em, y = _month(m[1]), _month(m[2]), int(m[3])
        if sm and em:
            return date(y, sm, 1), date(y, em, _days_in_month(y, em))
    # "Month YYYY"
    m = re.match(r"(\w+)\s+(\d{4})", rough, re.I)
    if m:
        sm, y = _month(m[1]), int(m[2])
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
    # Never count days in the past — you can't book a holiday that's already
    # started, so the free window begins today at the earliest.
    today = date.today()
    if search_start < today:
        search_start = today
    if search_end < search_start:
        return []   # the whole window is in the past

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

    # Replace all existing blocks for this user in this room.
    # Using delete-then-insert rather than upsert so that dates the user
    # previously marked busy but has now un-marked are actually removed.
    # The React UI accumulates imports in local state; each Submit call
    # represents the user's complete, current availability picture.
    db.table("availability_blocks").delete().eq("room_id", room["id"]).eq("user_id", user.id).execute()

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
        db.table("availability_blocks").insert(rows).execute()

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
                        app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")
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


@router.post("/remind")
def remind_pending_members(slug: str, user: UserInfo = Depends(current_user)):
    """Admin: email all members who haven't submitted availability yet.

    Returns the count of reminders sent.  Rate-limited to 1 call per 5 minutes
    per room to avoid accidentally spamming members.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    membership = _assert_member(db, room["id"], user.id)
    if not membership.get("is_admin"):
        raise HTTPException(403, "Only room admins can send reminders.")

    # Rate limit: 1 reminder per COOLDOWN window per room
    room_id = room["id"]
    now = time.time()
    last = _last_remind.get(room_id, 0.0)
    wait = int(_REMIND_COOLDOWN_SEC - (now - last))
    if wait > 0:
        raise HTTPException(
            429,
            f"Reminders are rate-limited to once every 5 minutes. "
            f"Please wait {wait} more second{'s' if wait != 1 else ''} before sending again.",
        )
    _last_remind[room_id] = now

    # Get all members and who has submitted
    members_res = (
        db.table("room_members")
        .select("user_id, profiles(email, display_name)")
        .eq("room_id", room["id"])
        .execute()
    )
    submitted_res = (
        db.table("availability_submissions")
        .select("user_id")
        .eq("room_id", room["id"])
        .execute()
    )
    submitted_ids = {s["user_id"] for s in (submitted_res.data or [])}

    # Fetch the admin's display name for the email
    admin_profile = (
        db.table("profiles")
        .select("display_name")
        .eq("id", user.id)
        .single()
        .execute()
    )
    admin_name = (admin_profile.data or {}).get("display_name") or "the organiser"
    app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")

    sent = 0
    for m in (members_res.data or []):
        if m["user_id"] in submitted_ids:
            continue   # already submitted — skip
        if m["user_id"] == user.id:
            continue   # don't email yourself
        profile = m.get("profiles") or {}
        email_addr = profile.get("email")
        if not email_addr:
            continue
        member_name = profile.get("display_name") or email_addr.split("@")[0] or "there"
        subject, html = availability_reminder_email(
            member_name=member_name,
            room_name=room["name"],
            room_slug=slug,
            admin_name=admin_name,
            app_url=app_url,
        )
        if send_email(to=email_addr, subject=subject, html=html):
            sent += 1

    return {"ok": True, "reminders_sent": sent}


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

    # Only count submissions from CURRENT members — stale rows from people who
    # have left the room must not inflate the count or trip "all submitted"
    # (see the matching note in GET /windows).
    member_ids = set(all_members.keys())
    submitted_current = submitted_ids & member_ids

    pending_names = [
        name for uid, name in all_members.items() if uid not in submitted_ids
    ]

    return SubmissionStatusResponse(
        submitted=len(submitted_current),
        total=len(all_members),
        members_pending=pending_names,
        all_submitted=member_ids.issubset(submitted_ids),
        user_submitted=user.id in submitted_ids,
    )


@router.get("/my")
def get_my_availability(slug: str, user: UserInfo = Depends(current_user)):
    """Return the calling user's currently saved busy dates for this room.

    Used to pre-populate the calendar when revisiting after a prior submission
    so the user doesn't have to re-mark everything from scratch.

    Returns a list of ISO date strings (YYYY-MM-DD) that the user has marked busy.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    blocks_res = (
        db.table("availability_blocks")
        .select("block_date")
        .eq("room_id", room["id"])
        .eq("user_id", user.id)
        .eq("is_busy", True)
        .execute()
    )
    return [b["block_date"] for b in (blocks_res.data or [])]


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

    # Require every CURRENT member to have submitted. Use a subset test rather
    # than a count/strict-subset check, because availability_submissions rows
    # can linger for members who have since left the room (the table cascades on
    # room/profile deletion, not on leaving), which would otherwise let the blind
    # reveal fire before a newer member has submitted.
    if not member_ids.issubset(submitted_ids):
        pending_count = len(member_ids - submitted_ids)
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
