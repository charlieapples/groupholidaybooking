"""Ground transport cost + time.

Primary source is the Google Maps Directions API (real routes). When that is
unavailable — no API key, billing disabled (REQUEST_DENIED), or quota
exhausted — we fall back to a free straight-line (haversine) estimate using
postcodes.io for UK postcode geocoding and built-in airport coordinates.

The fallback keeps the flight optimiser working without any paid Google Maps
setup; it's less precise but good enough to rank nearest airports.
"""
from __future__ import annotations

import logging
import math
import os
import re
from dataclasses import dataclass
from typing import Optional

import diskcache
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

from .airports import AIRPORT_COORDS

log = logging.getLogger(__name__)

_CACHE = diskcache.Cache(".cache/ground")
_BASE = "https://maps.googleapis.com/maps/api"
_POSTCODES_IO = "https://api.postcodes.io/postcodes"

# Fallback estimate tuning.
_ROAD_FACTOR = 1.3          # straight-line km → approx road km
_AVG_SPEED_KMH = 65.0       # blended UK road/rail average speed

# Cost per km by transit mode, in GBP (rough UK estimates for v0.1).
_COST_PER_KM = {
    "transit": 0.15,   # rail/bus average
    "driving": 0.25,   # fuel + wear
}
_DEFAULT_MODE = "transit"
_MIN_COST_GBP = 8.0   # minimum ground cost — even a short taxi/bus is at least £8


@dataclass
class GroundLeg:
    origin: str
    destination: str
    mode: str
    duration_hours: float
    distance_km: float
    estimated_cost_gbp: float
    # Where the numbers came from, so the UI can be honest:
    #   "google_maps" = real route from Google Maps Directions
    #   "estimate"    = straight-line distance ÷ avg speed (no Maps key/quota)
    source: str = "estimate"


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


# ── Free haversine fallback (no Google Maps required) ──────────────────────────

def _haversine_km(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in km between two lat/lon points."""
    radius = 6371.0
    d_lat = math.radians(lat2 - lat1)
    d_lon = math.radians(lon2 - lon1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lon / 2) ** 2
    )
    return radius * 2 * math.asin(math.sqrt(a))


def _airport_code(text: str) -> Optional[str]:
    """Extract a known 3-letter airport code from a string like 'MAN airport'."""
    for token in re.findall(r"[A-Za-z]{3}", text):
        code = token.upper()
        if code in AIRPORT_COORDS:
            return code
    return None


def _geocode_postcode(postcode: str) -> Optional[tuple[float, float]]:
    """Look up (lat, lon) for a UK postcode via the free postcodes.io API."""
    cache_key = f"pc:{postcode.upper().replace(' ', '')}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]
    try:
        clean = postcode.strip().replace(" ", "")
        data = _get(f"{_POSTCODES_IO}/{clean}", {})
        result = data.get("result") or {}
        lat, lon = result.get("latitude"), result.get("longitude")
        coords = (lat, lon) if lat is not None and lon is not None else None
    except Exception as exc:  # noqa: BLE001
        log.warning("postcodes.io geocode failed for %s: %s", postcode, exc)
        coords = None
    _CACHE.set(cache_key, coords, expire=2_592_000)  # 30 days — postcodes don't move
    return coords


def _fallback_leg(origin: str, destination: str, mode: str) -> Optional[GroundLeg]:
    """Estimate a ground leg from straight-line distance when Maps is unavailable."""
    dest_code = _airport_code(destination)
    if not dest_code:
        return None  # can only estimate to known airports
    dest_coords = AIRPORT_COORDS[dest_code]

    origin_coords = _geocode_postcode(origin)
    if not origin_coords:
        return None

    straight_km = _haversine_km(*origin_coords, *dest_coords)
    distance_km = straight_km * _ROAD_FACTOR
    duration_hours = distance_km / _AVG_SPEED_KMH
    cost_per_km = _COST_PER_KM.get(mode, _COST_PER_KM["transit"])
    estimated_cost = round(max(distance_km * cost_per_km, _MIN_COST_GBP), 2)

    return GroundLeg(
        origin=origin,
        destination=destination,
        mode=mode,
        duration_hours=round(duration_hours, 2),
        distance_km=round(distance_km, 1),
        estimated_cost_gbp=estimated_cost,
        source="estimate",
    )


def ground_leg(
    origin: str,
    destination: str,
    mode: str = _DEFAULT_MODE,
) -> Optional[GroundLeg]:
    """
    Return ground transport details between origin and destination.

    origin/destination can be postcodes, city names, or airport IATA codes.
    Uses Google Maps Directions when configured/working, otherwise falls back
    to a free haversine estimate. Returns None if no route can be estimated.
    """
    cache_key = f"ground:{origin}:{destination}:{mode}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    # No API key → go straight to the free fallback (don't raise).
    if not os.getenv("GOOGLE_MAPS_API_KEY"):
        result = _fallback_leg(origin, destination, mode)
        _CACHE.set(cache_key, result, expire=86400)
        return result

    params = {
        "origin": origin,
        "destination": destination,
        "mode": mode,
        "key": _api_key(),
        "units": "metric",
        "region": "gb",
    }

    try:
        data = _get(f"{_BASE}/directions/json", params)
        status = data.get("status")

        if status == "ZERO_RESULTS" or not data.get("routes"):
            _CACHE.set(cache_key, None, expire=86400)
            return None

        if status != "OK":
            # e.g. REQUEST_DENIED (billing off), OVER_QUERY_LIMIT — degrade gracefully.
            raise RuntimeError(f"Google Maps API status: {status}")

        leg = data["routes"][0]["legs"][0]
        distance_km = leg["distance"]["value"] / 1000
        duration_hours = leg["duration"]["value"] / 3600
        cost_per_km = _COST_PER_KM.get(mode, _COST_PER_KM["transit"])
        estimated_cost = round(max(distance_km * cost_per_km, _MIN_COST_GBP), 2)

        result = GroundLeg(
            origin=origin,
            destination=destination,
            mode=mode,
            duration_hours=round(duration_hours, 2),
            distance_km=round(distance_km, 1),
            estimated_cost_gbp=estimated_cost,
            source="google_maps",
        )
        _CACHE.set(cache_key, result, expire=86400)
        return result

    except Exception as exc:  # noqa: BLE001
        # Maps failed (network, billing, quota) — fall back to free estimate.
        log.warning("Google Maps ground_leg failed (%s); using haversine fallback", exc)
        result = _fallback_leg(origin, destination, mode)
        _CACHE.set(cache_key, result, expire=86400)
        return result


def nearest_airports(
    home: str,
    candidates: list[str],
    max_hours: Optional[float] = None,
) -> list[tuple[str, GroundLeg]]:
    """
    Return candidate airports reachable from home, sorted by travel duration.
    If max_hours is None (no limit), all reachable airports are returned.
    """
    reachable = []
    for airport in candidates:
        leg = ground_leg(home, f"{airport} airport")
        if leg is None:
            continue
        if max_hours is None or leg.duration_hours <= max_hours:
            reachable.append((airport, leg))
    reachable.sort(key=lambda x: x[1].duration_hours)
    return reachable
