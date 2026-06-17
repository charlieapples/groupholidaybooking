"""Travelpayouts Flight Search API — LIVE fares.

The Data API we use elsewhere (/v1/prices/cheap) returns *cached* monthly
aggregates: fast, free, but sparse for minor airports / specific dates. This
module runs a real LIVE search instead:

  1. POST /v1/flight_search   (signed) → search_id
  2. GET  /v1/flight_search_results?uuid=…  (poll until results arrive)
  3. pick the cheapest proposal + build a bookable affiliate link

Slower (a few seconds per route, async polling) and rate-limited, but reflects
real current prices and availability. It's opt-in per Holiday (`live_fares`) and
fails soft — returns None on any problem so the optimiser falls back to cached
data and never breaks.

Docs: https://support.travelpayouts.com/hc/en-us/articles/203956163-Flight-search
"""
from __future__ import annotations

import hashlib
import logging
import os
import time
from datetime import date
from typing import Optional, TypedDict

import httpx

log = logging.getLogger("live_search")

_INIT_URL = "https://api.travelpayouts.com/v1/flight_search"
_RESULTS_URL = "https://api.travelpayouts.com/v1/flight_search_results"
_HOST = "groupholidaybooking.com"


def signature(
    token: str,
    marker: str,
    host: str,
    user_ip: str,
    locale: str,
    trip_class: str,
    passengers: dict,
    segments: list[dict],
) -> str:
    """Travelpayouts request signature.

    md5(token + ':' + all parameter VALUES joined by ':'), where values are
    taken in alphabetical order of their keys at every level (lists keep order).
    Top-level key order: host, locale, marker, passengers, segments, trip_class,
    user_ip. passengers: adults, children, infants. each segment: date,
    destination, origin.
    """
    parts: list[str] = [
        host,
        locale,
        str(marker),
        str(passengers["adults"]),
        str(passengers["children"]),
        str(passengers["infants"]),
    ]
    for seg in segments:
        parts += [seg["date"], seg["destination"], seg["origin"]]
    parts += [str(trip_class), user_ip]
    raw = str(token) + ":" + ":".join(parts)
    return hashlib.md5(raw.encode("utf-8")).hexdigest()


def _build_body(origin: str, destination: str, depart: date, return_date: Optional[date], currency: str):
    token = os.getenv("TRAVELPAYOUTS_TOKEN", "")
    marker = os.getenv("TRAVELPAYOUTS_MARKER", "") or "0"
    user_ip = "127.0.0.1"
    locale = "en"
    trip_class = "Y"
    passengers = {"adults": 1, "children": 0, "infants": 0}
    segments = [{"origin": origin, "destination": destination, "date": depart.isoformat()}]
    if return_date:
        segments.append({"origin": destination, "destination": origin, "date": return_date.isoformat()})
    sig = signature(token, marker, _HOST, user_ip, locale, trip_class, passengers, segments)
    body = {
        "signature": sig,
        "marker": marker,
        "host": _HOST,
        "user_ip": user_ip,
        "locale": locale,
        "trip_class": trip_class,
        "passengers": passengers,
        "segments": segments,
        "currency": currency.lower(),
    }
    return body, token


class LiveFare(TypedDict):
    price: float
    airline: str
    booking_url: str


def _aviasales_fallback_link(origin: str, destination: str, depart: date, return_date: Optional[date]) -> str:
    marker = os.getenv("TRAVELPAYOUTS_MARKER", "")
    base = (
        f"https://www.aviasales.com/search/"
        f"{origin}{depart.strftime('%d%m')}{destination}"
        + (f"{return_date.strftime('%d%m')}" if return_date else "")
        + "1?currency=gbp"
    )
    return f"{base}&marker={marker}" if marker else base


def live_cheapest_return(
    origin: str,
    destination: str,
    depart: date,
    return_date: Optional[date],
    currency: str = "gbp",
    max_polls: int = 8,
    poll_interval: float = 1.5,
) -> Optional[LiveFare]:
    """Cheapest LIVE round-trip fare for one route, or None on any failure."""
    token = os.getenv("TRAVELPAYOUTS_TOKEN", "")
    if not token:
        return None
    body, token = _build_body(origin, destination, depart, return_date, currency)

    try:
        with httpx.Client(timeout=30) as client:
            init = client.post(_INIT_URL, json=body)
            init.raise_for_status()
            search_id = init.json().get("search_id")
            if not search_id:
                return None

            cheapest: Optional[LiveFare] = None
            for _ in range(max_polls):
                time.sleep(poll_interval)
                r = client.get(_RESULTS_URL, params={"uuid": search_id})
                r.raise_for_status()
                chunks = r.json()
                if not isinstance(chunks, list):
                    continue
                got_terminator = False
                for chunk in chunks:
                    proposals = chunk.get("proposals") or []
                    # A chunk with no proposals (just the search_id echo) = done.
                    if not proposals and chunk.get("search_id"):
                        got_terminator = True
                    for prop in proposals:
                        terms = prop.get("terms") or {}
                        for term in terms.values():
                            price = term.get("unified_price") or term.get("price")
                            if price is None:
                                continue
                            price = float(price)
                            if cheapest is None or price < cheapest["price"]:
                                cheapest = LiveFare(
                                    price=price,
                                    airline=(prop.get("validating_carrier") or "?"),
                                    booking_url=_aviasales_fallback_link(origin, destination, depart, return_date),
                                )
                if got_terminator and cheapest is not None:
                    break
            return cheapest
    except Exception as exc:  # noqa: BLE001
        log.warning("live search failed for %s→%s: %s", origin, destination, exc)
        return None
