"""Stateless optimisation endpoint.

Mirrors the Streamlit MVP: takes a full Config in the request body, runs the
flight optimiser, returns ranked DestinationResults. No DB, no auth, no room
concept — useful for testing the Railway deploy before Supabase is wired and
for any clients that want to drive the optimiser directly.

Once rooms are wired up, the same logic is exposed at
POST /api/rooms/{slug}/flights/optimise (state pulled from DB instead).
"""
from __future__ import annotations

from dataclasses import asdict
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from ..core.config import Config, DateWindow, Person
from ..core.destinations import label as label_dest
from ..core.optimiser import DestinationResult, discover_destinations, optimise

router = APIRouter()


class OptimiseRequest(BaseModel):
    people: list[Person]
    destinations: Optional[list[str]] = None  # None or [] = discover mode
    date_window: DateWindow
    budget_cap_per_person: Optional[float] = None
    max_ground_hours: Optional[float] = None
    time_value_per_hour: float = 0.0
    shared_dates: bool = True
    discover_top_n: int = 20  # only used if destinations is None/empty


class PersonResultDTO(BaseModel):
    person_name: str
    viable: bool
    chosen_airport: Optional[str] = None
    ground_cost_gbp: float = 0.0
    ground_hours: float = 0.0
    outbound_cost_gbp: float = 0.0
    inbound_cost_gbp: float = 0.0
    outbound_date: Optional[str] = None
    inbound_date: Optional[str] = None
    total_money_gbp: float = 0.0
    total_inc_time_gbp: float = 0.0
    booking_link: Optional[str] = None
    note: str = ""


class DestinationResultDTO(BaseModel):
    destination: str
    destination_name: str
    is_fully_viable: bool
    viable_count: int
    total_group_money_cost: float
    total_group_cost: float
    avg_individual_cost: float
    max_individual_cost: float
    fairness_ratio: float
    shared_out_date: Optional[str] = None
    shared_return_date: Optional[str] = None
    date_spread_days: int = 0
    note: str = ""
    people: list[PersonResultDTO]


def _serialise(dr: DestinationResult) -> DestinationResultDTO:
    return DestinationResultDTO(
        destination=dr.destination,
        destination_name=label_dest(dr.destination, "name"),
        is_fully_viable=dr.is_fully_viable,
        viable_count=dr.viable_count,
        total_group_money_cost=dr.total_group_money_cost,
        total_group_cost=dr.total_group_cost,
        avg_individual_cost=dr.avg_individual_cost,
        max_individual_cost=dr.max_individual_cost,
        fairness_ratio=dr.fairness_ratio,
        shared_out_date=str(dr.shared_out_date) if dr.shared_out_date else None,
        shared_return_date=str(dr.shared_return_date) if dr.shared_return_date else None,
        date_spread_days=dr.date_spread_days,
        note=dr.note,
        people=[
            PersonResultDTO(
                person_name=p.person_name,
                viable=p.viable,
                chosen_airport=p.chosen_airport,
                ground_cost_gbp=p.ground_cost,
                ground_hours=p.ground_hours,
                outbound_cost_gbp=p.outbound_cost,
                inbound_cost_gbp=p.inbound_cost,
                outbound_date=str(p.out_date) if p.out_date else None,
                inbound_date=str(p.return_date) if p.return_date else None,
                total_money_gbp=p.flight_plus_ground_gbp,
                total_inc_time_gbp=p.total_cost_gbp,
                booking_link=p.outbound.deep_link if p.outbound else None,
                note=p.note,
            )
            for p in dr.person_results
        ],
    )


@router.post("", response_model=list[DestinationResultDTO])
def run_optimise(body: OptimiseRequest):
    """Run the flight optimiser. Stateless — no room/auth required.

    If `destinations` is empty or null, runs discover mode first to find the
    cheapest destinations across the group's nearest airports."""
    if not body.destinations:
        # Need a Config for discover_destinations — use placeholder destinations
        config_for_discover = Config(
            people=body.people,
            destinations=["PLACEHOLDER"],
            date_window=body.date_window,
            budget_cap_per_person=body.budget_cap_per_person,
            max_ground_hours=body.max_ground_hours,
            time_value_per_hour=body.time_value_per_hour,
            shared_dates=body.shared_dates,
        )
        discovered = discover_destinations(config_for_discover, top_n=body.discover_top_n)
        if not discovered:
            raise HTTPException(
                404,
                "No destinations found in the Aviasales cache for this group's "
                "airports and date window. Try widening the dates.",
            )
        destinations_to_use = discovered
    else:
        destinations_to_use = body.destinations

    config = Config(
        people=body.people,
        destinations=destinations_to_use,
        date_window=body.date_window,
        budget_cap_per_person=body.budget_cap_per_person,
        max_ground_hours=body.max_ground_hours,
        time_value_per_hour=body.time_value_per_hour,
        shared_dates=body.shared_dates,
    )
    results = optimise(config)
    return [_serialise(r) for r in results]
