"""Step 4: destination picking.

Per user's spec, three flavours offered (UI picks which):
1. Hybrid: each member does a short questionnaire → algorithm proposes 5-10 →
   total trip cost calculated → group votes.
2. Manual: someone proposes a destination, others vote.
3. Random pick from a known-liked shortlist (a 'pick for us' button).
"""
from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter()


class DestinationPreferences(BaseModel):
    """Answers to the destination questionnaire."""
    climate: Optional[str] = None        # 'warm' | 'cold' | 'temperate'
    setting: Optional[str] = None        # 'beach' | 'city' | 'mountains' | 'mixed'
    activity_level: Optional[str] = None # 'relaxed' | 'active' | 'mixed'
    must_have: list[str] = []            # e.g. ['nightlife', 'culture', 'good food']
    avoid: list[str] = []                # e.g. ['long flights']
    max_total_per_person_gbp: Optional[float] = None


class DestinationCandidate(BaseModel):
    iata_code: str
    name: str
    proposed_by: Optional[str] = None    # None = algorithm
    total_cost_gbp: Optional[float] = None
    cost_breakdown: dict = {}            # flights, ground, accom, daily × nights
    vote_count: int = 0


@router.post("/preferences")
def submit_preferences(slug: str, body: DestinationPreferences):
    """Submit one user's destination preferences."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/suggest", response_model=list[DestinationCandidate])
def suggest_destinations(slug: str, top_n: int = 10):
    """Algorithm-proposed destinations based on aggregated preferences and the
    group's flight reachability. Uses the legacy `discover_destinations` logic
    plus preference filters and total-cost ranking."""
    raise HTTPException(501, "Not implemented — needs preferences aggregator")


@router.post("/propose")
def propose_destination(slug: str, iata_code: str):
    """User proposes a destination manually."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.post("/{candidate_id}/vote")
def vote(slug: str, candidate_id: str, vote_value: int = 1):
    """Upvote (or weighted vote) a candidate."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")


@router.get("/pick-random")
def pick_random(slug: str):
    """'Surprise us' — pick a random destination from the room's shortlist
    (or from members' historical favourites once we have that data)."""
    raise HTTPException(501, "Not implemented")
