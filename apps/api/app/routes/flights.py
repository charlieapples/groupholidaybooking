"""Step 5: flights — room-aware wrapper around the core optimiser.

Reads room state from Supabase (members + postcodes, agreed dates,
destination shortlist), runs the optimiser, and caches results.
"""
from __future__ import annotations

import json
import logging
import traceback
from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException

log = logging.getLogger("flights")
from pydantic import BaseModel

import os

from ..core.config import Config, DateWindow, Person
from ..core.destinations import label as label_dest
from ..core.email import flights_ready_email, send_email
from ..core.flights import live_price_for_dates
from ..core.optimiser import optimise, DestinationResult
from ..db.supabase import get_client
from ..deps.auth import UserInfo, current_user
from .rooms import _assert_member, _get_room_by_slug

router = APIRouter()

# Cap how many windows we price in one run, to bound API calls + latency.
_MAX_SEARCH_WINDOWS = 4


def _resolve_search_windows(room: dict) -> list[tuple[date, date]]:
    """Return the list of (start, end) date windows the optimiser should price.

    Multi-window mode (default): every valid window in room.search_windows.
    Single/logistics mode, or no windows set: just the agreed window.
    Always falls back to the agreed window so a run never has zero windows.
    """
    multi = room.get("multi_window_search")
    multi = True if multi is None else bool(multi)
    windows: list[tuple[date, date]] = []

    if multi:
        for w in (room.get("search_windows") or []):
            try:
                s = date.fromisoformat(str(w["start_date"])[:10])
                e = date.fromisoformat(str(w["end_date"])[:10])
            except (KeyError, ValueError, TypeError):
                continue
            if e >= s:
                windows.append((s, e))

    if not windows:
        windows.append((
            date.fromisoformat(room["agreed_start"]),
            date.fromisoformat(room["agreed_end"]),
        ))

    # De-dupe and cap.
    seen: set[tuple[date, date]] = set()
    unique: list[tuple[date, date]] = []
    for w in windows:
        if w not in seen:
            seen.add(w)
            unique.append(w)
    return unique[:_MAX_SEARCH_WINDOWS]


def _better_result(a: Optional[DestinationResult], b: DestinationResult) -> DestinationResult:
    """Pick the better of two results for the SAME destination across windows:
    fully-viable beats partial, then more people covered, then cheaper group total."""
    if a is None:
        return b
    if a.is_fully_viable != b.is_fully_viable:
        return a if a.is_fully_viable else b
    if a.viable_count != b.viable_count:
        return a if a.viable_count > b.viable_count else b
    return a if a.total_group_cost <= b.total_group_cost else b


class LivePriceResponse(BaseModel):
    price_gbp: float
    airline: Optional[str] = None
    found_at: Optional[str] = None
    deep_link: str


@router.get("/live-price", response_model=LivePriceResponse)
def get_live_price(
    origin: str,
    destination: str,
    depart: str,           # ISO date YYYY-MM-DD
    return_date: str,      # ISO date YYYY-MM-DD
    user: UserInfo = Depends(current_user),
):
    """On-demand fresh price for ONE specific route + exact dates.

    Used by the booking page's "Check latest price" button. Far fresher than
    the bulk optimiser cache; the final fare is still confirmed on Aviasales at
    click-through (no meta-search can guarantee the airline's price at booking).
    """
    try:
        d_out = date.fromisoformat(depart)
        d_back = date.fromisoformat(return_date)
    except ValueError:
        raise HTTPException(422, "depart and return_date must be YYYY-MM-DD dates.")

    lp = live_price_for_dates(origin.upper(), destination.upper(), d_out, d_back)
    if lp is None:
        raise HTTPException(
            404,
            "No live fare found for that exact route and dates right now. "
            "Try the Aviasales link to search directly.",
        )
    return LivePriceResponse(
        price_gbp=lp.price_gbp,
        airline=lp.airline,
        found_at=lp.found_at,
        deep_link=lp.deep_link,
    )


# ── Helpers ───────────────────────────────────────────────────────────────────


def _parse_json_field(value) -> list:
    """Safely deserialise a DB field that may be a JSON string or already a Python object.

    Supabase JSONB columns can be returned as either a JSON-encoded string (older
    supabase-py versions) or as a Python list/dict (newer versions that deserialise
    JSONB automatically).  Calling json.loads() on a list would raise TypeError, so
    we guard against that here.
    """
    if value is None:
        return []
    if isinstance(value, (list, dict)):
        return value if isinstance(value, list) else [value]
    # Assume string — may raise json.JSONDecodeError on corrupt data, which is
    # intentional (caller can catch if needed).
    return json.loads(value)


# ── Schemas ──────────────────────────────────────────────────────────────────


class PersonResultDTO(BaseModel):
    person_name: str
    viable: bool
    chosen_airport: Optional[str] = None
    ground_cost_gbp: float = 0.0
    ground_hours: float = 0.0
    outbound_cost_gbp: float = 0.0
    inbound_cost_gbp: float = 0.0
    baggage_cost_gbp: float = 0.0
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
    computed_at: Optional[str] = None
    people: list[PersonResultDTO]


# ── Serialiser (shared with stateless /api/optimise) ─────────────────────────


def _serialise(dr) -> DestinationResultDTO:
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
        computed_at=None,  # freshly computed — no cache timestamp
        people=[
            PersonResultDTO(
                person_name=p.person_name,
                viable=p.viable,
                chosen_airport=p.chosen_airport,
                ground_cost_gbp=p.ground_cost,
                ground_hours=p.ground_hours,
                outbound_cost_gbp=p.outbound_cost,
                inbound_cost_gbp=p.inbound_cost,
                baggage_cost_gbp=p.baggage_cost_gbp,
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


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.post("/optimise", response_model=list[DestinationResultDTO])
def run_optimiser(slug: str, user: UserInfo = Depends(current_user)):
    """Run the flight optimiser for the room's agreed parameters.

    Reads from DB:
    - room_members (postcodes)
    - rooms (agreed_start, agreed_end, min_nights, max_nights, budget_gbp)
    - destination_candidates (the shortlist)

    Writes results to flight_results table. Returns ranked DestinationResults.
    """
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    # Validate room has required fields
    required = ["agreed_start", "agreed_end", "min_nights", "max_nights"]
    missing = [f for f in required if not room.get(f)]
    if missing:
        raise HTTPException(
            422,
            f"Room is missing: {', '.join(missing)}. "
            "Complete earlier steps (availability + duration) first.",
        )

    # Load members and postcodes
    # Join profiles so we can fall back to default_home_postcode if the
    # per-room postcode was never set (e.g. user updated profile after joining).
    members_res = (
        db.table("room_members")
        .select("user_id, home_postcode, profiles(display_name, default_home_postcode)")
        .eq("room_id", room["id"])
        .execute()
    )
    people: list[Person] = []
    for m in members_res.data:
        profile = m.get("profiles") or {}
        name = profile.get("display_name", "Unknown")
        # Prefer per-room postcode; fall back to profile default
        postcode = m.get("home_postcode") or profile.get("default_home_postcode")
        if not postcode:
            raise HTTPException(
                422,
                f"Member '{name}' has no home postcode set. "
                "All members must enter their postcode in their profile before running the optimiser.",
            )
        # If we used the fallback, backfill it so future runs don't need the join
        if not m.get("home_postcode") and postcode:
            try:
                db.table("room_members").update({"home_postcode": postcode}).eq(
                    "room_id", room["id"]
                ).eq("user_id", m["user_id"]).execute()
            except Exception:
                pass  # non-fatal
        people.append(Person(name=name, home=postcode))

    # Load destination candidates
    candidates_res = (
        db.table("destination_candidates")
        .select("iata_code")
        .eq("room_id", room["id"])
        .execute()
    )
    destinations = [c["iata_code"] for c in candidates_res.data]
    if not destinations:
        raise HTTPException(
            422,
            "No destination candidates in this room. Add some via the destinations endpoints.",
        )

    # Work out which date windows to price. When multi-window search is on and
    # the group selected several windows, we price flights across ALL of them and
    # keep the cheapest per destination — more candidate days = cheaper fares.
    # Otherwise we just use the single locked agreed window.
    windows = _resolve_search_windows(room)

    def _make_config(start: date, end: date) -> Config:
        return Config(
            people=people,
            destinations=destinations,
            date_window=DateWindow(
                earliest_outbound=start,
                latest_inbound=end,
                min_nights=room["min_nights"],
                max_nights=room["max_nights"],
            ),
            budget_cap_per_person=room.get("budget_gbp"),
            shared_dates=True,
            # Group's £/hr valuation of ground-travel time. 0 = pure cheapest;
            # higher weights toward airports closer to each member's home.
            time_value_per_hour=float(room.get("time_value_per_hour") or 0.0),
        )

    # Surface optimiser failures with a useful message instead of generic 500.
    # Common causes: Travelpayouts token missing/quota exhausted, Google Maps
    # geocoding failed on a postcode, no flights found for the date window.
    try:
        best_by_dest: dict[str, "DestinationResult"] = {}
        for (w_start, w_end) in windows:
            for r in optimise(_make_config(w_start, w_end)):
                best_by_dest[r.destination] = _better_result(
                    best_by_dest.get(r.destination), r
                )
        results = list(best_by_dest.values())
        # Re-sort after the merge: fully-viable first, then cheapest group total.
        results.sort(key=lambda d: (
            not d.is_fully_viable,
            d.total_group_cost if d.is_fully_viable else float("inf"),
        ))
    except Exception as exc:
        log.exception("Flight optimiser failed for room %s", slug)
        raise HTTPException(
            502,
            f"Flight search failed: {type(exc).__name__}: {exc}. "
            "Check that all postcodes are valid UK postcodes and that "
            "the date window has enough days for the trip length.",
        ) from exc

    try:
        dtos = [_serialise(r) for r in results]
    except Exception as exc:
        log.exception("Failed to serialise optimiser results: %s", traceback.format_exc())
        raise HTTPException(500, f"Couldn't format flight results: {exc}") from exc

    # Cache results in DB — one row per destination. Don't let a cache failure
    # break the response; just log and return.
    for dto in dtos:
        try:
            db.table("flight_results").upsert(
                {
                    "room_id": room["id"],
                    "destination_iata": dto.destination,
                    "shared_out_date": dto.shared_out_date,
                    "shared_return_date": dto.shared_return_date,
                    "total_group_cost_gbp": dto.total_group_cost,
                    "per_person_results": json.dumps([p.model_dump() for p in dto.people]),
                },
                on_conflict="room_id,destination_iata",
            ).execute()
        except Exception:
            log.warning("Failed to cache flight result for %s (continuing)", dto.destination)

    # Fire-and-forget: notify all non-admin members that flight results are ready.
    # This runs after caching so a notification failure never breaks the API response.
    try:
        best = next((d for d in dtos if d.is_fully_viable), dtos[0] if dtos else None)
        if best:
            app_url = os.getenv("APP_URL", "https://groupholidaybooking.com")
            # Fetch all member emails (join profiles)
            member_emails_res = (
                db.table("room_members")
                .select("user_id, is_admin, profiles(display_name, email)")
                .eq("room_id", room["id"])
                .execute()
            )
            for m in member_emails_res.data:
                if m.get("is_admin"):
                    continue  # don't notify the person who just ran it
                profile = m.get("profiles") or {}
                email_addr = profile.get("email")
                member_name = profile.get("display_name") or "there"
                if not email_addr:
                    continue
                subject, html = flights_ready_email(
                    member_name=member_name,
                    room_name=room["name"],
                    room_slug=slug,
                    best_dest_name=best.destination_name,
                    best_avg_cost=best.avg_individual_cost,
                    app_url=app_url,
                )
                send_email(to=email_addr, subject=subject, html=html)
    except Exception:
        log.warning("Failed to send flight results notification emails (continuing)")

    return dtos


@router.get("/results", response_model=list[DestinationResultDTO])
def get_results(slug: str, user: UserInfo = Depends(current_user)):
    """Return the latest cached flight results for this room (all destinations)."""
    db = get_client()
    room = _get_room_by_slug(db, slug)
    _assert_member(db, room["id"], user.id)

    res = (
        db.table("flight_results")
        .select("*")
        .eq("room_id", room["id"])
        .order("total_group_cost_gbp")
        .execute()
    )
    if not res.data:
        raise HTTPException(404, "No flight results yet. Run /optimise first.")

    # Reconstruct DTOs from cached per_person_results
    dtos = []
    for row in res.data:
        people_data = _parse_json_field(row.get("per_person_results"))
        viable_people = [p for p in people_data if p.get("viable")]
        # Compute avg from actual money costs (not time-weighted total_group_cost)
        money_costs = [p.get("total_money_gbp", 0) for p in viable_people]
        avg_money_cost = sum(money_costs) / len(money_costs) if money_costs else 0
        max_money_cost = max(money_costs, default=0)
        group_money_total = sum(money_costs)
        # fairness_ratio = max / avg — ratio of 1.0 means perfectly equal cost
        fairness_ratio = (max_money_cost / avg_money_cost) if avg_money_cost > 0 else 1.0
        dtos.append(
            DestinationResultDTO(
                destination=row["destination_iata"],
                destination_name=label_dest(row["destination_iata"], "name"),
                is_fully_viable=all(p.get("viable", False) for p in people_data),
                viable_count=len(viable_people),
                total_group_money_cost=group_money_total,
                total_group_cost=row.get("total_group_cost_gbp") or group_money_total,
                avg_individual_cost=avg_money_cost,
                max_individual_cost=max_money_cost,
                fairness_ratio=fairness_ratio,
                shared_out_date=str(row["shared_out_date"]) if row.get("shared_out_date") else None,
                shared_return_date=str(row["shared_return_date"]) if row.get("shared_return_date") else None,
                computed_at=str(row.get("computed_at") or ""),
                people=[PersonResultDTO(**p) for p in people_data],
            )
        )
    return dtos
