"""Google Maps Directions API client for ground transport cost + time."""
from __future__ import annotations

import os
from dataclasses import dataclass
from typing import Optional

import diskcache
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

_CACHE = diskcache.Cache(".cache/ground")
_BASE = "https://maps.googleapis.com/maps/api"

# Cost per km by transit mode, in GBP (rough UK estimates for v0.1).
_COST_PER_KM = {
    "transit": 0.15,   # rail/bus average
    "driving": 0.25,   # fuel + wear
}
_DEFAULT_MODE = "transit"


@dataclass
class GroundLeg:
    origin: str
    destination: str
    mode: str
    duration_hours: float
    distance_km: float
    estimated_cost_gbp: float


def _api_key() -> str:
    key = os.getenv("GOOGLE_MAPS_API_KEY", "")
    if not key:
        raise RuntimeError("GOOGLE_MAPS_API_KEY not set — add it to your .env file")
    return key


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _get(url: str, params: dict) -> dict:
    with httpx.Client(timeout=30) as client:
        r = client.get(url, params=params)
        r.raise_for_status()
        return r.json()


def ground_leg(
    origin: str,
    destination: str,
    mode: str = _DEFAULT_MODE,
) -> Optional[GroundLeg]:
    """
    Return ground transport details between origin and destination.

    origin/destination can be postcodes, city names, or airport IATA codes.
    Returns None if no route is found.
    """
    cache_key = f"ground:{origin}:{destination}:{mode}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": _api_key(),
        "units": "metric",
        "region": "gb",
    }

    data = _get(f"{_BASE}/directions/json", params)
    status = data.get("status")

    if status == "ZERO_RESULTS" or not data.get("routes"):
        _CACHE.set(cache_key, None, expire=86400)
        return None

    if status != "OK":
        raise RuntimeError(f"Google Maps API error: {status}")

    leg = data["routes"][0]["legs"][0]
    distance_km = leg["distance"]["value"] / 1000
    duration_hours = leg["duration"]["value"] / 3600
    cost_per_km = _COST_PER_KM.get(mode, _COST_PER_KM["transit"])
    estimated_cost = round(distance_km * cost_per_km, 2)

    result = GroundLeg(
        origin=origin,
        destination=destination,
        mode=mode,
        duration_hours=round(duration_hours, 2),
        distance_km=round(distance_km, 1),
        estimated_cost_gbp=estimated_cost,
    )
    _CACHE.set(cache_key, result, expire=86400)
    return result


def nearest_airports(home: str, candidates: list[str], max_hours: float = 3.0) -> list[tuple[str, GroundLeg]]:
    """
    Filter candidate airport codes to those reachable within max_hours by transit.
    Returns list of (airport_code, GroundLeg) sorted by duration.
    """
    reachable = []
    for airport in candidates:
        # Google Maps resolves IATA codes like "MAN airport" or "LHR airport"
        leg = ground_leg(home, f"{airport} airport")
        if leg and leg.duration_hours <= max_hours:
            reachable.append((airport, leg))
    reachable.sort(key=lambda x: x[1].duration_hours)
    return reachable
