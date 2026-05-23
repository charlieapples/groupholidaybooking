"""Step 4: destination picking.

Three modes (UI lets the admin choose):
1. Questionnaire → algorithm proposes → group votes
2. Manual propose → group votes
3. Random pick ('surprise us')

All modes feed into the same destination_candidates + destination_votes tables.
"""
from __future__ import annotations

import random
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from ..core.destinations import label as label_dest
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────────────────────


class DestinationPreferences(BaseModel):
    """Answers to the per-user destination questionnaire."""
    climate: Optional[str] = None          # 'warm' | 'cold' | 'temperate'
    setting: Optional[str] = None          # 'beach' | 'city' | 'mountains' | 'mixed'
    activity_level: Optional[str] = None   # 'relaxed' | 'active' | 'mixed'
    must_have: list[str] = []              # e.g. ['nightlife', 'culture']
    avoid: list[str] = []                  # e.g. ['long flights']
    max_total_per_person_gbp: Optional[float] = None


class DestinationCandidate(BaseModel):
    id: str
    iata_code: str
    name: str
    proposed_by: Optional[str] = None      # None = algorithm, else user display name
    total_cost_gbp: Optional[float] = None
    cost_breakdown: dict = {}
    vote_count: int = 0
    my_vote: int = 0                        # caller's current vote value


# ── Helpers ───────────────────────────────────────────────────────────────────


def _candidate_to_dto(c: dict, my_user_id: str, votes: list[dict]) -> DestinationCandidate:
    vote_count = sum(v["vote_value"] for v in votes if v["candidate_id"] == c["id"])
    my_vote = next(
        (v["vote_value"] for v in votes if v["candidate_id"] == c["id"] and v["user_id"] == my_user_id),
        0,
    )
    return DestinationCandidate(
        id=c["id"],
        iata_code=c["iata_code"],
        name=label_dest(c["iata_code"], "name"),
        proposed_by=c.get("proposed_by"),
        total_cost_gbp=c.get("total_cost_gbp"),
        cost_breakdown=c.get("cost_breakdown") or {},
        vote_count=vote_count,
        my_vote=my_vote,
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/preferences")
def submit_preferences(
    slug: str,
    body: DestinationPreferences,
    user: UserInfo = Depends(current_user),
):
    """Save one user's destination questionnaire answers."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    import json as _json

    db.table("trip_preferences").upsert(
        {
            "room_id": room["id"],
            "user_id": user.id,
            "pref_budget_gbp": body.max_total_per_person_gbp,
            # Store full questionnaire answers in the JSONB column
            "pref_destination_answers": _json.dumps({
                "climate": body.climate,
                "setting": body.setting,
                "activity_level": body.activity_level,
                "must_have": body.must_have,
                "avoid": body.avoid,
            }),
        },
        on_conflict="room_id,user_id",
    ).execute()

    return {"ok": True}


@router.get("", response_model=list[DestinationCandidate])
def list_candidates(slug: str, user: UserInfo = Depends(current_user)):
    """List all destination candidates for the room with vote counts."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    candidates_res = (
        db.table("destination_candidates")
        .select("*")
        .eq("room_id", room["id"])
        .execute()
    )
    votes_res = (
        db.table("destination_votes")
        .select("candidate_id, user_id, vote_value")
        .in_("candidate_id", [c["id"] for c in candidates_res.data] or ["none"])
        .execute()
    )

    results = [
        _candidate_to_dto(c, user.id, votes_res.data)
        for c in candidates_res.data
    ]
    results.sort(key=lambda x: -x.vote_count)
    return results


@router.post("/propose", response_model=DestinationCandidate)
def propose_destination(
    slug: str,
    iata_code: str,
    user: UserInfo = Depends(current_user),
):
    """User manually proposes a destination."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    iata_upper = iata_code.upper()

    # Upsert (in case it was already algorithm-proposed)
    res = (
        db.table("destination_candidates")
        .upsert(
            {
                "room_id": room["id"],
                "iata_code": iata_upper,
                "proposed_by": user.id,
            },
            on_conflict="room_id,iata_code",
        )
        .execute()
    )
    c = res.data[0]
    return _candidate_to_dto(c, user.id, [])


@router.post("/{candidate_id}/vote")
def vote(
    slug: str,
    candidate_id: str,
    vote_value: int = 1,
    user: UserInfo = Depends(current_user),
):
    """Cast or update a vote on a destination candidate.

    vote_value=0 removes the vote. Positive integers for upvotes.
    Future: 1-5 ranked voting.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Verify candidate belongs to this room
    cand_res = (
        db.table("destination_candidates")
        .select("id, room_id")
        .eq("id", candidate_id)
        .eq("room_id", room["id"])
        .execute()
    )
    if not cand_res.data:
        raise HTTPException(404, "Destination candidate not found in this room.")

    if vote_value == 0:
        db.table("destination_votes").delete().eq("candidate_id", candidate_id).eq(
            "user_id", user.id
        ).execute()
        return {"ok": True, "vote": 0}

    db.table("destination_votes").upsert(
        {
            "candidate_id": candidate_id,
            "user_id": user.id,
            "vote_value": vote_value,
        },
        on_conflict="candidate_id,user_id",
    ).execute()
    return {"ok": True, "vote": vote_value}


@router.get("/pick-random")
def pick_random(slug: str, user: UserInfo = Depends(current_user)):
    """'Surprise us' — pick a random destination from the room's candidates.

    If there are candidates with votes, weights toward higher vote counts.
    Falls back to unweighted random if no votes exist.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    candidates_res = (
        db.table("destination_candidates")
        .select("*")
        .eq("room_id", room["id"])
        .execute()
    )
    if not candidates_res.data:
        raise HTTPException(
            404,
            "No destination candidates in this room yet. "
            "Add some via /propose or /suggest first.",
        )

    votes_res = (
        db.table("destination_votes")
        .select("candidate_id, vote_value")
        .in_("candidate_id", [c["id"] for c in candidates_res.data])
        .execute()
    )

    # Weight by vote count (minimum weight 1 so unvoted candidates still eligible)
    vote_totals: dict[str, int] = {}
    for v in votes_res.data:
        vote_totals[v["candidate_id"]] = vote_totals.get(v["candidate_id"], 0) + v["vote_value"]

    candidates = candidates_res.data
    weights = [max(vote_totals.get(c["id"], 0), 1) for c in candidates]
    chosen = random.choices(candidates, weights=weights, k=1)[0]

    return {
        "iata_code": chosen["iata_code"],
        "name": label_dest(chosen["iata_code"], "name"),
        "total_cost_gbp": chosen.get("total_cost_gbp"),
    }
