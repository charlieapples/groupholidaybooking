"""By-the-minute availability for local meet-ups.

A holiday picks whole days; a meet-up happens within a single day, so each
member marks the time RANGES they're free (minute precision). We compute the
window where EVERYONE is free, plus a "most people free" fallback when there's
no time that suits the whole group — mirroring the holiday availability logic.
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

router = APIRouter()


class Slot(BaseModel):
    start_min: int      # minutes from midnight, inclusive (e.g. 540 = 09:00)
    end_min: int        # exclusive (e.g. 1020 = 17:00)


class MySlotsRequest(BaseModel):
    meet_date: str                  # ISO date the meet-up is on
    slots: list[Slot] = []          # the ranges I'm free (empty = clears mine)


class MemberSlots(BaseModel):
    user_id: str
    display_name: Optional[str] = None
    slots: list[Slot] = []


class MeetupAvailability(BaseModel):
    meet_date: Optional[str] = None
    members_total: int = 0
    members_responded: int = 0
    per_member: list[MemberSlots] = []
    overlap: list[Slot] = []        # ranges where EVERYONE who responded is free
    best_effort: list[Slot] = []    # most-people-free ranges (when no full overlap)
    best_effort_free: int = 0       # how many members are free in best_effort


def _normalise(slots: list[Slot]) -> list[tuple[int, int]]:
    """Merge a member's overlapping/adjacent ranges into clean, sorted intervals."""
    cleaned = sorted(
        (max(0, s.start_min), min(1440, s.end_min))
        for s in slots
        if s.end_min > s.start_min
    )
    merged: list[list[int]] = []
    for start, end in cleaned:
        if merged and start <= merged[-1][1]:
            merged[-1][1] = max(merged[-1][1], end)
        else:
            merged.append([start, end])
    return [(a, b) for a, b in merged]


def _runs_at(coverage: list[int], threshold: int) -> list[Slot]:
    """Contiguous minute-runs where coverage >= threshold, as Slots."""
    out: list[Slot] = []
    start: Optional[int] = None
    for m in range(1440):
        if coverage[m] >= threshold:
            if start is None:
                start = m
        elif start is not None:
            out.append(Slot(start_min=start, end_min=m))
            start = None
    if start is not None:
        out.append(Slot(start_min=start, end_min=1440))
    return out


@router.get("", response_model=MeetupAvailability)
def get_meetup_availability(slug: str, user: UserInfo = Depends(current_user)):
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Roster (for the total + display names).
    members_res = (
        db.table("room_members")
        .select("user_id, profiles(display_name)")
        .eq("room_id", room["id"])
        .execute()
    )
    members = members_res.data or []
    members_total = len(members)
    name_by_id = {
        m["user_id"]: (m.get("profiles") or {}).get("display_name")
        for m in members
    }

    rows = (
        db.table("meetup_slots")
        .select("user_id, meet_date, start_min, end_min")
        .eq("room_id", room["id"])
        .execute()
    ).data or []

    if not rows:
        return MeetupAvailability(members_total=members_total)

    # The meet date is whichever date has the most entries (single-day meet-up).
    date_counts: dict[str, int] = {}
    for r in rows:
        date_counts[str(r["meet_date"])] = date_counts.get(str(r["meet_date"]), 0) + 1
    meet_date = max(date_counts, key=date_counts.get)

    by_member: dict[str, list[Slot]] = {}
    for r in rows:
        if str(r["meet_date"]) != meet_date:
            continue
        by_member.setdefault(r["user_id"], []).append(
            Slot(start_min=r["start_min"], end_min=r["end_min"])
        )

    per_member: list[MemberSlots] = []
    coverage = [0] * 1440
    for uid, slots in by_member.items():
        intervals = _normalise(slots)
        per_member.append(MemberSlots(
            user_id=uid,
            display_name=name_by_id.get(uid),
            slots=[Slot(start_min=a, end_min=b) for a, b in intervals],
        ))
        for a, b in intervals:
            for m in range(a, b):
                coverage[m] += 1

    responded = len(by_member)
    overlap = _runs_at(coverage, responded) if responded else []

    # Most-people-free fallback: the highest coverage actually achieved.
    best = max(coverage) if responded else 0
    best_effort = _runs_at(coverage, best) if best else []

    return MeetupAvailability(
        meet_date=meet_date,
        members_total=members_total,
        members_responded=responded,
        per_member=per_member,
        overlap=overlap,
        best_effort=best_effort,
        best_effort_free=best,
    )


@router.post("")
def set_my_slots(slug: str, body: MySlotsRequest, user: UserInfo = Depends(current_user)):
    """Replace the caller's free ranges for the meet-up day."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    for s in body.slots:
        if not (0 <= s.start_min < s.end_min <= 1440):
            raise HTTPException(400, "Each free range must be within a single day and end after it starts.")

    # Replace-all: clear my rows for this room, then insert the new set.
    db.table("meetup_slots").delete().eq("room_id", room["id"]).eq("user_id", user.id).execute()
    if body.slots:
        db.table("meetup_slots").insert([
            {
                "room_id": room["id"],
                "user_id": user.id,
                "meet_date": body.meet_date,
                "start_min": s.start_min,
                "end_min": s.end_min,
            }
            for s in body.slots
        ]).execute()
    return {"ok": True}
