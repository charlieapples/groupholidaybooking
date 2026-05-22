"""Travelpayouts / Aviasales Data API client for cheapest fares.

API docs: https://travelpayouts.github.io/slate/
Prices come from Aviasales' cache (~24h freshness). Each call returns the
cheapest round-trip fare Aviasales has seen for a given route/month.

Strategy: query every calendar month in the outbound window, collect all
round-trip results, then pick the cheapest one whose dates fit (outbound
inside the window, return plausibly within max_nights * 2 as a soft cap).
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import diskcache
import httpx
from tenacity import retry, stop_after_attempt, wait_exponential

_CACHE = diskcache.Cache(".cache/flights")
_BASE = "https://api.travelpayouts.com"


@dataclass
class Fare:
    origin: str
    destination: str
    departure_date: date
    price_gbp: float          # for round-trip results this is HALF the combined price
    airline: str
    return_date: Optional[date] = None   # populated for round-trip results
    deep_link: str = ""


def _token() -> str:
    token = os.getenv("TRAVELPAYOUTS_TOKEN", "")
    if not token:
        raise RuntimeError(
            "TRAVELPAYOUTS_TOKEN not set — add it to your .env file.\n"
            "Find it at app.travelpayouts.com/profile"
        )
    return token


@retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
def _get(path: str, params: dict) -> dict:
    params = {**params, "token": _token(), "currency": params.get("currency", "GBP")}
    with httpx.Client(timeout=30) as client:
        r = client.get(f"{_BASE}{path}", params=params)
        r.raise_for_status()
        return r.json()


def _months_in_window(date_from: date, date_to: date) -> list[str]:
    """Return list of 'YYYY-MM' strings covering date_from..date_to."""
    months: list[str] = []
    d = date_from.replace(day=1)
    while d <= date_to:
        months.append(d.strftime("%Y-%m"))
        d = (d.replace(day=28) + timedelta(days=4)).replace(day=1)
    return months


def cheapest_return_pair(
    origin: str,
    destination: str,
    earliest_outbound: date,
    latest_inbound: date,
    min_nights: int,
    max_nights: int,
    currency: str = "GBP",
) -> tuple[Optional[Fare], Optional[Fare]]:
    """
    Return (outbound_fare, inbound_fare) for the cheapest round trip found,
    or (None, None) if no usable data exists.

    Travelpayouts returns round-trip fares with both departure_at and return_at.
    We split the combined price 50/50 across both legs.
    Night-range constraint is applied as a soft filter (up to max_nights * 2)
    because the cache has limited options per route.
    """
    cache_key = (
        f"rt:{origin}:{destination}:{earliest_outbound}:{latest_inbound}"
        f":{min_nights}:{max_nights}:{currency}"
    )
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    best_out: Optional[Fare] = None
    best_in: Optional[Fare] = None
    best_total = float("inf")

    # Latest viable outbound date = must leave enough time for min_nights return
    latest_viable_out = latest_inbound - timedelta(days=min_nights)

    for month in _months_in_window(earliest_outbound, latest_inbound):
        try:
            data = _get("/v1/prices/cheap", {
                "origin": origin,
                "destination": destination,
                "depart_date": month,
                "currency": currency,
                # No one_way flag → round-trip results with return_at included
            })
        except httpx.HTTPStatusError:
            continue

        dest_bucket = (data.get("data") or {}).get(destination, {})

        for info in dest_bucket.values():
            dep_str = info.get("departure_at", "")
            ret_str = info.get("return_at", "")

            try:
                dep_date = date.fromisoformat(dep_str[:10])
                ret_date = date.fromisoformat(ret_str[:10])
            except (ValueError, TypeError):
                continue

            # Outbound must be inside the allowed window
            if not (earliest_outbound <= dep_date <= latest_viable_out):
                continue

            # Return must be after the minimum stay
            nights = (ret_date - dep_date).days
            if nights < min_nights:
                continue
            # Soft cap: allow up to 2x max_nights so sparse cache still yields results
            if nights > max_nights * 2:
                continue
            # Return must not be wildly past the latest_inbound
            if ret_date > latest_inbound + timedelta(days=max_nights):
                continue

            price = float(info.get("price", 0))
            if price <= 0:
                continue

            if price < best_total:
                best_total = price
                airline = info.get("airline", "?")
                half = round(price / 2, 2)
                deep = (
                    f"https://www.aviasales.com/search/"
                    f"{origin}{dep_date.strftime('%d%m')}"
                    f"{destination}{ret_date.strftime('%d%m')}2"
                    f"?marker={_token()}"
                )
                best_out = Fare(
                    origin=origin, destination=destination,
                    departure_date=dep_date, price_gbp=half,
                    airline=airline, return_date=ret_date, deep_link=deep,
                )
                best_in = Fare(
                    origin=destination, destination=origin,
                    departure_date=ret_date, price_gbp=half,
                    airline=airline, return_date=None, deep_link=deep,
                )

    result = (best_out, best_in)
    _CACHE.set(cache_key, result, expire=3600)
    return result


def cheapest_one_way(
    origin: str,
    destination: str,
    date_from: date,
    date_to: date,
    currency: str = "GBP",
) -> Optional[Fare]:
    """
    Return cheapest one-way fare in the window (used for one-way only scenarios).
    Kept for compatibility; main optimiser uses cheapest_return_pair.
    """
    cache_key = f"oneway:{origin}:{destination}:{date_from}:{date_to}:{currency}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    best: Optional[Fare] = None

    for month in _months_in_window(date_from, date_to):
        try:
            data = _get("/v1/prices/cheap", {
                "origin": origin,
                "destination": destination,
                "depart_date": month,
                "one_way": "true",
                "currency": currency,
            })
        except httpx.HTTPStatusError:
            continue

        dest_bucket = (data.get("data") or {}).get(destination, {})
        for info in dest_bucket.values():
            dep_str = info.get("departure_at", "")
            try:
                dep_date = date.fromisoformat(dep_str[:10])
            except (ValueError, TypeError):
                continue
            if not (date_from <= dep_date <= date_to):
                continue
            price = float(info.get("price", 0))
            if price <= 0:
                continue
            if best is None or price < best.price_gbp:
                best = Fare(
                    origin=origin, destination=destination,
                    departure_date=dep_date, price_gbp=price,
                    airline=info.get("airline", "?"),
                )

    _CACHE.set(cache_key, best, expire=3600)
    return best
