"""Unit tests for pure core business logic — no external APIs, no DB.

Covers the revenue/UX-critical algorithms that previously had zero coverage:
  - baggage cost lookup (affects every flight total shown to users)
  - destination preference scoring (drives AI/algorithmic suggestions)
  - date-window validation (guards the optimiser inputs)
  - result aggregation (the numbers shown on the results page)
  - IATA label formatting
"""
from __future__ import annotations

from datetime import date

import pytest

from app.core.config import AIRLINE_BAGGAGE_GBP, DEFAULT_BAGGAGE_GBP, DateWindow, Config, Person
from app.core.destinations import label, score_destination
from app.core.optimiser import _baggage_for_fare, DestinationResult, PersonResult
from app.core.flights import Fare


# ── Baggage cost lookup ───────────────────────────────────────────────────────

def _fare(airline: str) -> Fare:
    return Fare(
        origin="STN", destination="BCN",
        departure_date=date(2026, 7, 1), price_gbp=50.0,
        airline=airline, return_date=date(2026, 7, 8),
    )


def test_baggage_none_fare_is_zero():
    assert _baggage_for_fare(None) == 0.0


def test_baggage_known_lowcost_airline():
    # Ryanair has a known cabin-bag charge
    assert _baggage_for_fare(_fare("FR")) == AIRLINE_BAGGAGE_GBP["FR"]


def test_baggage_full_service_airline_is_free():
    # BA includes cabin bag → £0
    assert _baggage_for_fare(_fare("BA")) == 0.0


def test_baggage_unknown_airline_uses_fallback():
    assert _baggage_for_fare(_fare("ZZ"), fallback=37.0) == 37.0


def test_baggage_airline_code_case_insensitive():
    # lowercase code must still match the uppercase table
    assert _baggage_for_fare(_fare("fr")) == AIRLINE_BAGGAGE_GBP["FR"]


def test_baggage_empty_airline_uses_fallback():
    assert _baggage_for_fare(_fare(""), fallback=DEFAULT_BAGGAGE_GBP) == DEFAULT_BAGGAGE_GBP


# ── Destination scoring ───────────────────────────────────────────────────────

def test_score_warm_climate_rewards_hot_destination():
    # Faro (FAO) is a warm/beach destination
    warm = score_destination("FAO", [{"climate": "warm"}])
    cold = score_destination("FAO", [{"climate": "cold"}])
    assert warm > cold


def test_score_avoid_penalises():
    prefs_neutral = [{"setting": "beach"}]
    prefs_avoid = [{"setting": "beach", "avoid": ["beach"]}]
    assert score_destination("FAO", prefs_avoid) < score_destination("FAO", prefs_neutral)


def test_score_unknown_iata_is_zero():
    # No tags for a nonsense code → neutral score
    assert score_destination("ZZZ", [{"climate": "warm"}]) == 0.0


def test_score_empty_prefs_is_zero():
    assert score_destination("FAO", []) == 0.0


def test_score_aggregates_multiple_members():
    # Two members both wanting warm should score >= one member
    one = score_destination("FAO", [{"climate": "warm"}])
    two = score_destination("FAO", [{"climate": "warm"}, {"climate": "warm"}])
    assert two >= one


# ── DateWindow validation ─────────────────────────────────────────────────────

def test_datewindow_valid():
    w = DateWindow(
        earliest_outbound=date(2026, 7, 1),
        latest_inbound=date(2026, 7, 31),
        min_nights=3, max_nights=7,
    )
    assert w.min_nights == 3


def test_datewindow_rejects_reversed_dates():
    with pytest.raises(ValueError):
        DateWindow(
            earliest_outbound=date(2026, 7, 31),
            latest_inbound=date(2026, 7, 1),
            min_nights=3, max_nights=7,
        )


def test_datewindow_rejects_min_gt_max_nights():
    with pytest.raises(ValueError):
        DateWindow(
            earliest_outbound=date(2026, 7, 1),
            latest_inbound=date(2026, 7, 31),
            min_nights=9, max_nights=3,
        )


def test_config_requires_at_least_one_person_and_destination():
    window = DateWindow(
        earliest_outbound=date(2026, 7, 1),
        latest_inbound=date(2026, 7, 31),
        min_nights=3, max_nights=7,
    )
    with pytest.raises(ValueError):
        Config(people=[], destinations=["BCN"], date_window=window)
    with pytest.raises(ValueError):
        Config(people=[Person(name="A", home="M1 1AE")], destinations=[], date_window=window)


# ── Result aggregation ────────────────────────────────────────────────────────

def _pr(name: str, total: float, viable: bool) -> PersonResult:
    return PersonResult(
        person_name=name, chosen_airport="STN", ground_leg=None,
        outbound=None, inbound=None,
        total_cost_gbp=total, flight_plus_ground_gbp=total, viable=viable,
    )


def test_total_group_cost_excludes_non_viable():
    r = DestinationResult(
        destination="BCN",
        person_results=[_pr("A", 100, True), _pr("B", 200, True), _pr("C", 999, False)],
    )
    assert r.total_group_cost == 300
    assert r.viable_count == 2


def test_is_fully_viable_false_when_one_member_cannot_fly():
    r = DestinationResult(
        destination="BCN",
        person_results=[_pr("A", 100, True), _pr("B", 200, False)],
    )
    assert r.is_fully_viable is False


def test_is_fully_viable_false_when_empty():
    assert DestinationResult(destination="BCN", person_results=[]).is_fully_viable is False


def test_avg_and_max_individual_cost():
    r = DestinationResult(
        destination="BCN",
        person_results=[_pr("A", 100, True), _pr("B", 300, True)],
    )
    assert r.avg_individual_cost == 200
    assert r.max_individual_cost == 300


def test_fairness_ratio_one_when_no_viable():
    r = DestinationResult(destination="BCN", person_results=[_pr("A", 0, False)])
    assert r.fairness_ratio == 1.0


# ── Label formatting ──────────────────────────────────────────────────────────

def test_label_name_and_code():
    assert label("BCN") == "Barcelona (BCN)"


def test_label_name_only():
    assert label("BCN", style="name") == "Barcelona"


def test_label_code_only():
    assert label("BCN", style="code") == "BCN"


def test_label_unknown_code_falls_back_to_code():
    assert label("ZZZ") == "ZZZ"
