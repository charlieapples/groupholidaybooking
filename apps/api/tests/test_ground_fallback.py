"""Tests for the free haversine ground-transport fallback.

These cover the pure logic that runs when the Google Maps Directions API is
unavailable (no key / billing off). No network calls — _geocode_postcode is
monkeypatched so tests are fast and offline.
"""
from __future__ import annotations

import app.core.ground as ground
from app.core.airports import AIRPORT_COORDS


def test_haversine_known_distance():
    # London Heathrow → Manchester is ~250 km straight-line.
    lhr = AIRPORT_COORDS["LHR"]
    man = AIRPORT_COORDS["MAN"]
    km = ground._haversine_km(*lhr, *man)
    assert 230 < km < 270


def test_haversine_zero_distance():
    assert ground._haversine_km(51.5, -0.1, 51.5, -0.1) == 0.0


def test_airport_code_extraction():
    assert ground._airport_code("MAN airport") == "MAN"
    assert ground._airport_code("LHR") == "LHR"
    assert ground._airport_code("edinburgh edi airport") == "EDI"


def test_airport_code_unknown_returns_none():
    assert ground._airport_code("somewhere random") is None
    assert ground._airport_code("XYZ airport") is None


def test_fallback_leg_estimates_sensible_values(monkeypatch):
    # Pretend the user's postcode geocodes to central London.
    monkeypatch.setattr(ground, "_geocode_postcode", lambda pc: (51.5074, -0.1278))
    leg = ground._fallback_leg("SW1A 1AA", "MAN airport", "transit")
    assert leg is not None
    assert leg.distance_km > 0
    assert leg.duration_hours > 0
    # Minimum cost floor always applies.
    assert leg.estimated_cost_gbp >= ground._MIN_COST_GBP


def test_fallback_leg_unknown_destination_returns_none(monkeypatch):
    monkeypatch.setattr(ground, "_geocode_postcode", lambda pc: (51.5, -0.1))
    assert ground._fallback_leg("SW1A 1AA", "Narnia", "transit") is None


def test_fallback_leg_ungeocodable_origin_returns_none(monkeypatch):
    monkeypatch.setattr(ground, "_geocode_postcode", lambda pc: None)
    assert ground._fallback_leg("ZZ99 9ZZ", "MAN airport", "transit") is None


def test_all_uk_airports_have_coords():
    from app.core.airports import UK_AIRPORTS
    for code in UK_AIRPORTS:
        assert code in AIRPORT_COORDS, f"{code} missing coordinates"
