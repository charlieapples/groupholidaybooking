"""Step 5: flights. Wraps the existing optimiser as an HTTP endpoint.

For now this is a thin shim — the actual business logic still lives in
apps/streamlit-legacy/group_holiday/. We'll move it into apps/api/app/core/
in the next pass so both Streamlit and the API can use the same module.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/optimise")
def run_optimiser(slug: str):
    """Run the flight optimiser for the room's agreed parameters.

    Reads from DB: members (postcodes), agreed_start, agreed_end,
    min_nights, max_nights, destination shortlist. Writes results to
    flight_results table; returns the same."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring + core/ migration")


@router.get("/results")
def get_results(slug: str):
    """Latest cached flight results for this room."""
    raise HTTPException(501, "Not implemented — needs Supabase wiring")
