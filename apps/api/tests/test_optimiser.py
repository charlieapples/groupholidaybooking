"""Integration tests for the flight optimiser's shared-date algorithm.

Mocks the external flight (Travelpayouts) and ground (Google Maps) calls so the
core decision logic is exercised deterministically — the heart of the product.
"""
from __future__ import annotations

from datetime import date

import pytest

import app.core.optimiser as opt_mod
from app.core.config import Config, DateWindow, Person
from app.core.flights import Fare
from app.core.ground import GroundLeg


def _ground(airport: str, hours: float = 1.0, cost: float = 20.0) -> GroundLeg:
    return GroundLeg(
        origin="home", destination=airport, mode="transit",
        duration_hours=hours, distance_km=50.0, estimated_cost_gbp=cost,
    )


def _config(destinations=("BCN",), shared=True) -> Config:
    return Config(
        people=[Person(name="A", home="M1 1AE"), Person(name="B", home="EH1 1AA")],
        destinations=list(destinations),
        date_window=DateWindow(
            earliest_outbound=date(2026, 7, 1),
            latest_inbound=date(2026, 7, 31),
            min_nights=5, max_nights=10,
        ),
        shared_dates=shared,
    )


def _patch(monkeypatch, pair_fn):
    """Patch ground (A→STN, B→EDI) and the flight-pair function."""
    def fake_nearest(home, candidates, max_hours):
        return [("STN", _ground("STN"))] if home == "M1 1AE" else [("EDI", _ground("EDI"))]
    monkeypatch.setattr(opt_mod, "nearest_airports", fake_nearest)
    monkeypatch.setattr(opt_mod, "cheapest_return_pair", pair_fn)


def test_shared_dates_both_viable(monkeypatch):
    out, back = date(2026, 7, 5), date(2026, 7, 12)

    def pair(origin, destination, earliest_outbound, latest_inbound, min_nights, max_nights):
        half = (50.0 if origin == "STN" else 40.0)
        return (
            Fare(origin=origin, destination=destination, departure_date=out, price_gbp=half, airline="FR", return_date=back),
            Fare(origin=destination, destination=origin, departure_date=back, price_gbp=half, airline="FR", return_date=None),
        )

    _patch(monkeypatch, pair)
    results = opt_mod.optimise(_config())
    assert len(results) == 1
    dr = results[0]
    assert dr.is_fully_viable
    assert dr.viable_count == 2
    assert dr.shared_out_date == out
    assert dr.shared_return_date == back


def test_picks_date_pair_that_works_for_everyone(monkeypatch):
    # A can only fly Jul 5; B can only fly Jul 6. There is NO common pair, so
    # the shared optimiser should pick the pair with the most viable people (1).
    def pair(origin, destination, earliest_outbound, latest_inbound, min_nights, max_nights):
        d = date(2026, 7, 5) if origin == "STN" else date(2026, 7, 6)
        b = date(2026, 7, 12) if origin == "STN" else date(2026, 7, 13)
        return (
            Fare(origin=origin, destination=destination, departure_date=d, price_gbp=50, airline="FR", return_date=b),
            Fare(origin=destination, destination=origin, departure_date=b, price_gbp=50, airline="FR", return_date=None),
        )

    _patch(monkeypatch, pair)
    dr = opt_mod.optimise(_config())[0]
    # Only one person can ever match a single chosen pair here
    assert dr.viable_count == 1
    assert not dr.is_fully_viable


def test_person_with_no_flights_is_non_viable(monkeypatch):
    out, back = date(2026, 7, 5), date(2026, 7, 12)

    def pair(origin, destination, earliest_outbound, latest_inbound, min_nights, max_nights):
        if origin == "EDI":
            return (None, None)   # B has no flights at all
        return (
            Fare(origin=origin, destination=destination, departure_date=out, price_gbp=50, airline="FR", return_date=back),
            Fare(origin=destination, destination=origin, departure_date=back, price_gbp=50, airline="FR", return_date=None),
        )

    _patch(monkeypatch, pair)
    dr = opt_mod.optimise(_config())[0]
    assert dr.viable_count == 1
    assert not dr.is_fully_viable
    names_viable = {p.person_name for p in dr.person_results if p.viable}
    assert names_viable == {"A"}


def test_results_sorted_fully_viable_first_then_cost(monkeypatch):
    # Two destinations: BCN (both viable, cheap), CDG (only A viable).
    out, back = date(2026, 7, 5), date(2026, 7, 12)

    def pair(origin, destination, earliest_outbound, latest_inbound, min_nights, max_nights):
        if destination == "CDG" and origin == "EDI":
            return (None, None)   # B can't reach CDG
        return (
            Fare(origin=origin, destination=destination, departure_date=out, price_gbp=50, airline="FR", return_date=back),
            Fare(origin=destination, destination=origin, departure_date=back, price_gbp=50, airline="FR", return_date=None),
        )

    _patch(monkeypatch, pair)
    results = opt_mod.optimise(_config(destinations=("BCN", "CDG")))
    # Fully-viable BCN must rank above partially-viable CDG
    assert results[0].destination == "BCN"
    assert results[0].is_fully_viable
    assert not results[1].is_fully_viable


def test_budget_cap_excludes_expensive_options(monkeypatch):
    out, back = date(2026, 7, 5), date(2026, 7, 12)

    def pair(origin, destination, earliest_outbound, latest_inbound, min_nights, max_nights):
        # £600 each way = £1200 round trip, way over a £200 cap
        return (
            Fare(origin=origin, destination=destination, departure_date=out, price_gbp=600, airline="FR", return_date=back),
            Fare(origin=destination, destination=origin, departure_date=back, price_gbp=600, airline="FR", return_date=None),
        )

    cfg = _config()
    cfg.budget_cap_per_person = 200.0
    _patch(monkeypatch, pair)
    dr = opt_mod.optimise(cfg)[0]
    # Everyone is over budget → nobody viable
    assert dr.viable_count == 0
