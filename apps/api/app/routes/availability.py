"""Step 1: availability / time window.

The flow:
1. Room sets a rough_window (e.g. "September 2026" or "July–September 2026").
2. Each user submits busy dates inside that window — manually or imported
   from Google Calendar (OAuth scope: calendar.readonly).
3. NOTHING is shown until every member has submitted (blind voting).
4. Once all in, the API computes ranked free windows (largest gap first,
   ties broken by 'soonest').
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class AvailabilityBlock(BaseModel):
    block_date: date
    is_busy: bool = True
    source: str = "manual"  # manual | google_calendar | outlook
    note: Optional[str] = None


class SubmitAvailabilityRequest(BaseModel):
    blocks: list[AvailabilityBlock]


class FreeWindow(BaseModel):
    start_date: date
    end_date: date
    days: int
    members_free: int  # how many members are free for the entire window


@router.post("")
def submit_availability(slug: str, body: SubmitAvailabilityRequest):
    """Submit busy dates for the authenticated user. Marks them as submitted.
    Subsequent GET windows will only return data once everyone has submitted."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/windows", response_model=list[FreeWindow])
def get_windows(slug: str, min_days: int = 4, top_n: int = 10):
    """Return ranked free windows (largest first, then soonest).
    Returns 412 Precondition Failed if not all members have submitted yet."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/status")
def submission_status(slug: str):
    """Returns {submitted: int, total: int, members_pending: [names]} — safe to
    call before everyone has submitted (does NOT leak actual availability)."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")
