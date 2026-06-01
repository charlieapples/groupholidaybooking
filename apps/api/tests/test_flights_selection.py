"""Tests for cheapest_return_pair — the core flight-selection filter (date window,
min-nights, cheapest pick). Mocks the Travelpayouts fetch so it's deterministic.
"""
from __future__ import annotations

from datetime import date

import app.core.flights as fl


class _FakeCache(dict):
    """Minimal stand-in for diskcache.Cache (supports `in`, `[]`, `.set`)."""
    def set(self, key, value, expire=None):
        self[key] = value


def _patch_bucket(monkeypatch, bucket):
    monkeypatch.setattr(fl, "_CACHE", _FakeCache())
    monkeypatch.setattr(fl, "_marker", lambda: "")
    # Return the bucket only for the specific-route query (destination given)
    monkeypatch.setattr(
        fl, "_fetch_route_bucket",
        lambda origin, destination, month, currency: bucket if destination else {},
    )


def test_picks_cheapest_valid_fare(monkeypatch):
    bucket = {
        "0": {"departure_at": "2026-07-05", "return_at": "2026-07-12", "price": 200, "airline": "FR"},
        "1": {"departure_at": "2026-07-06", "return_at": "2026-07-13", "price": 150, "airline": "U2"},  # cheaper
    }
    _patch_bucket(monkeypatch, bucket)
    out, inn = fl.cheapest_return_pair(
        origin="STN", destination="BCN",
        earliest_outbound=date(2026, 7, 1), latest_inbound=date(2026, 7, 31),
        min_nights=5, max_nights=10,
    )
    assert out is not None and inn is not None
    assert out.airline == "U2"
    assert out.departure_date == date(2026, 7, 6)
    # price is split half/half across the two legs
    assert out.price_gbp == 75.0
    assert inn.price_gbp == 75.0


def test_rejects_trips_shorter_than_min_nights(monkeypatch):
    bucket = {
        "0": {"departure_at": "2026-07-10", "return_at": "2026-07-12", "price": 50, "airline": "FR"},  # 2 nights
    }
    _patch_bucket(monkeypatch, bucket)
    out, inn = fl.cheapest_return_pair(
        origin="STN", destination="BCN",
        earliest_outbound=date(2026, 7, 1), latest_inbound=date(2026, 7, 31),
        min_nights=5, max_nights=10,
    )
    assert out is None and inn is None


def test_rejects_outbound_outside_window(monkeypatch):
    bucket = {
        "0": {"departure_at": "2026-08-05", "return_at": "2026-08-12", "price": 50, "airline": "FR"},  # August, window is July
    }
    _patch_bucket(monkeypatch, bucket)
    out, inn = fl.cheapest_return_pair(
        origin="STN", destination="BCN",
        earliest_outbound=date(2026, 7, 1), latest_inbound=date(2026, 7, 31),
        min_nights=5, max_nights=10,
    )
    assert out is None and inn is None


def test_no_data_returns_none(monkeypatch):
    _patch_bucket(monkeypatch, {})
    out, inn = fl.cheapest_return_pair(
        origin="STN", destination="BCN",
        earliest_outbound=date(2026, 7, 1), latest_inbound=date(2026, 7, 31),
        min_nights=5, max_nights=10,
    )
    assert out is None and inn is None
