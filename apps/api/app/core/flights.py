"""Travelpayouts / Aviasales Data API client for cheapest fares.

API docs: https://travelpayouts.github.io/slate/
Prices come from Aviasales' cache (~24h freshness). Each call returns the
cheapest round-trip fare Aviasales has seen for a given route/month.

Strategy: query every calendar month in the outbound window, collect all
round-trip results, then pick the cheapest one whose dates fit (outbound
inside the window, return plausibly within max_nights * 2 as a soft cap).
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from datetime import date, timedelta
from typing import Optional

import diskcache
import httpx
from tenacity import RetryError, retry, stop_after_attempt, wait_exponential

log = logging.getLogger("flights.core")

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


def _marker() -> str:
    """Travelpayouts affiliate marker (Partner ID) for tracking clicks.

    This is DIFFERENT from the API token. The marker is a short numeric ID
    visible in the lower-left of the Travelpayouts dashboard. Without it,
    Aviasales clicks don't earn commission.

    Falls back to empty string (no tracking) rather than raising — flights
    still work, just without affiliate revenue.
    """
    return os.getenv("TRAVELPAYOUTS_MARKER", "")


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


def _fetch_route_bucket(
    origin: str,
    destination: Optional[str],
    month: str,
    currency: str,
) -> dict:
    """
    Query Travelpayouts for cheapest round-trip fares from origin in the given month.

    Returns the inner bucket for the destination — a dict of {index: flight_info}.
    When destination is provided, queries that route specifically.
    When destination is None, queries all destinations from origin (broader cache
    coverage for sparse routes).
    """
    cache_key = f"bucket:{origin}:{destination or 'ALL'}:{month}:{currency}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    params: dict = {"origin": origin, "depart_date": month, "currency": currency}
    if destination:
        params["destination"] = destination

    try:
        data = _get("/v1/prices/cheap", params)
        all_dests = data.get("data") or {}
        # API returns {dest_code: {idx: info}}. We want the inner dict.
        if destination:
            result = all_dests.get(destination, {})
        else:
            # When no destination specified, return the whole thing so caller
            # can pick its target. Caller code handles this case.
            result = all_dests
    except (httpx.HTTPStatusError, RetryError, httpx.RequestError) as exc:
        # Tenacity wraps the last HTTPStatusError in a RetryError after 3
        # failed attempts. Catch all three so a single bad route doesn't
        # crash the whole optimiser — just return empty for this bucket.
        log.warning(
            "Travelpayouts query failed for origin=%s dest=%s month=%s: %s",
            origin, destination, month, exc,
        )
        result = {}

    _CACHE.set(cache_key, result, expire=3600)
    return result


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
        # Primary query: specific route
        dest_bucket = _fetch_route_bucket(origin, destination, month, currency)

        # Fallback: if no data for specific route, query all destinations from
        # this origin and pick our target — catches sparse-cache routes (e.g. MAN)
        if not dest_bucket:
            all_dests = _fetch_route_bucket(origin, None, month, currency)
            dest_bucket = all_dests.get(destination, {}) if isinstance(all_dests, dict) else {}

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
                marker_val = _marker()
                deep = (
                    f"https://www.aviasales.com/search/"
                    f"{origin}{dep_date.strftime('%d%m')}"
                    f"{destination}{ret_date.strftime('%d%m')}1"
                )
                if marker_val:
                    deep = f"{deep}?marker={marker_val}"
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


def cheap_destination_codes(
    origin: str,
    earliest_outbound: date,
    latest_inbound: date,
    min_nights: int = 1,
    max_nights: int = 60,
    currency: str = "GBP",
) -> list[str]:
    """
    Return all destination IATA codes that have any viable cached fare from origin
    in the given window. Uses the all-destinations bucket query (no per-dest calls).

    This is used by the auto-discover mode to build a destination shortlist without
    the user having to specify one.
    """
    cache_key = f"discover:{origin}:{earliest_outbound}:{latest_inbound}:{currency}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    found: list[str] = []
    latest_viable_out = latest_inbound - timedelta(days=min_nights)

    for month in _months_in_window(earliest_outbound, latest_inbound):
        all_dests = _fetch_route_bucket(origin, None, month, currency)
        if not isinstance(all_dests, dict):
            continue
        for dest_code, bucket in all_dests.items():
            if dest_code in found:
                continue
            if not isinstance(bucket, dict):
                continue
            for info in bucket.values():
                dep_str = info.get("departure_at", "")
                ret_str = info.get("return_at", "")
                try:
                    dep_date = date.fromisoformat(dep_str[:10])
                    ret_date = date.fromisoformat(ret_str[:10])
                except (ValueError, TypeError):
                    continue
                if not (earliest_outbound <= dep_date <= latest_viable_out):
                    continue
                nights = (ret_date - dep_date).days
                if nights < min_nights or nights > max_nights * 2:
                    continue
                price = float(info.get("price", 0))
                if price > 0:
                    found.append(dest_code)
                    break

    _CACHE.set(cache_key, found, expire=3600)
    return found


def cheapest_prices_by_destination(
    origin: str,
    earliest_outbound: date,
    latest_inbound: date,
    min_nights: int = 1,
    max_nights: int = 60,
    currency: str = "GBP",
) -> dict[str, float]:
    """Return {destination_iata: cheapest round-trip total price} for every
    destination with a viable cached fare from `origin` in the window.

    Uses the all-destinations bucket query (a few HTTP calls per month, not one
    per destination), so it's cheap enough to price a whole candidate list at
    once. Result is cached for an hour. Prices are the round-trip total per
    person (Travelpayouts returns combined round-trip fares).
    """
    cache_key = (
        f"prices_by_dest:{origin}:{earliest_outbound}:{latest_inbound}"
        f":{min_nights}:{max_nights}:{currency}"
    )
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    best: dict[str, float] = {}
    latest_viable_out = latest_inbound - timedelta(days=min_nights)

    for month in _months_in_window(earliest_outbound, latest_inbound):
        all_dests = _fetch_route_bucket(origin, None, month, currency)
        if not isinstance(all_dests, dict):
            continue
        for dest_code, bucket in all_dests.items():
            if not isinstance(bucket, dict):
                continue
            for info in bucket.values():
                dep_str = info.get("departure_at", "")
                ret_str = info.get("return_at", "")
                try:
                    dep_date = date.fromisoformat(dep_str[:10])
                    ret_date = date.fromisoformat(ret_str[:10])
                except (ValueError, TypeError):
                    continue
                if not (earliest_outbound <= dep_date <= latest_viable_out):
                    continue
                nights = (ret_date - dep_date).days
                if nights < min_nights or nights > max_nights * 2:
                    continue
                price = float(info.get("price", 0))
                if price <= 0:
                    continue
                if dest_code not in best or price < best[dest_code]:
                    best[dest_code] = price

    _CACHE.set(cache_key, best, expire=3600)
    return best


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
        except (httpx.HTTPStatusError, RetryError, httpx.RequestError) as exc:
            log.warning("One-way query failed %s→%s %s: %s", origin, destination, month, exc)
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


@dataclass
class LivePrice:
    """A freshly-fetched price for one specific route + exact dates."""
    origin: str
    destination: str
    depart_date: date
    return_date: date
    price_gbp: float
    airline: str
    found_at: str            # ISO timestamp the fare was last seen by Travelpayouts
    deep_link: str           # Aviasales link with affiliate marker


def live_price_for_dates(
    origin: str,
    destination: str,
    depart: date,
    return_date: date,
    currency: str = "GBP",
) -> Optional[LivePrice]:
    """Fetch the freshest available price for ONE specific route + exact dates.

    Uses the date-specific /aviasales/v3/prices_for_dates endpoint, which is far
    fresher than the monthly /v1/prices/cheap cache used during bulk optimisation.
    Intended for an on-demand "check latest price" action on the booking page —
    NOT for scanning hundreds of combos. Cached only briefly (2 min) so repeated
    taps don't hammer the API while keeping the number current.
    """
    cache_key = f"live:{origin}:{destination}:{depart}:{return_date}:{currency}"
    if cache_key in _CACHE:
        return _CACHE[cache_key]

    try:
        data = _get("/aviasales/v3/prices_for_dates", {
            "origin": origin,
            "destination": destination,
            "departure_at": depart.isoformat(),
            "return_at": return_date.isoformat(),
            "currency": currency,
            "sorting": "price",
            "direct": "false",
            "limit": 1,
            "one_way": "false",
        })
    except (httpx.HTTPStatusError, RetryError, httpx.RequestError) as exc:
        log.warning("Live price query failed %s→%s: %s", origin, destination, exc)
        return None

    rows = data.get("data") or []
    if not rows:
        _CACHE.set(cache_key, None, expire=120)
        return None

    row = rows[0]
    price = float(row.get("price", 0))
    if price <= 0:
        _CACHE.set(cache_key, None, expire=120)
        return None

    # Build affiliate deep link (prefer the API-supplied link; fall back to search)
    marker = _marker()
    api_link = row.get("link", "")
    if api_link:
        deep = f"https://www.aviasales.com{api_link}"
        if marker:
            sep = "&" if "?" in deep else "?"
            deep = f"{deep}{sep}marker={marker}"
    else:
        deep = (
            f"https://www.aviasales.com/search/"
            f"{origin}{depart.strftime('%d%m')}{destination}{return_date.strftime('%d%m')}1"
        )
        if marker:
            deep = f"{deep}?marker={marker}"

    result = LivePrice(
        origin=origin,
        destination=destination,
        depart_date=depart,
        return_date=return_date,
        price_gbp=round(price, 2),
        airline=row.get("airline", "?"),
        found_at=row.get("found_at", ""),
        deep_link=deep,
    )
    _CACHE.set(cache_key, result, expire=120)
    return result
