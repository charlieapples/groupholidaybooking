"""Server-side calendar fetching for permanently-linked accounts.

Given a stored OAuth refresh token, mint a short-lived access token and pull the
account's busy days inside a date window. Google and Microsoft differ in their
token endpoints and event shapes, but both reduce to the same `Event` shape so
the busy-day maths lives in one tested place (`busy_days_from_events`).

All network helpers fail soft: a single account that errors returns [] rather
than breaking the whole "add my availability" action.
"""
from __future__ import annotations

import logging
import os
from datetime import date, datetime, timedelta
from typing import Iterable, Optional, TypedDict

import httpx

log = logging.getLogger("calendar_sync")

_GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
_MS_TOKEN_URL = "https://login.microsoftonline.com/common/oauth2/v2.0/token"


class Event(TypedDict):
    start: str      # 'YYYY-MM-DD'
    end: str        # 'YYYY-MM-DD'
    all_day: bool


def _d(s: str) -> date:
    return date.fromisoformat(s[:10])


def busy_days_from_events(
    events: Iterable[Event], window_start: date, window_end: date
) -> list[str]:
    """Set of ISO dates marked busy by any event, clipped to [start, end].

    Mirrors the frontend rule: all-day events have an EXCLUSIVE end date, while
    timed events end on an INCLUSIVE day — so a 9–5 meeting on Jul 15 has end
    Jul 15 and we add +1 day to avoid collapsing it to zero days.
    """
    busy: set[str] = set()
    for ev in events:
        try:
            start = _d(ev["start"])
            stop = _d(ev["end"])
        except (KeyError, ValueError):
            continue
        if not ev.get("all_day"):
            stop = stop + timedelta(days=1)
        cur = start
        while cur < stop:
            if window_start <= cur <= window_end:
                busy.add(cur.isoformat())
            cur += timedelta(days=1)
    return sorted(busy)


# ── Google ────────────────────────────────────────────────────────────────────

def google_refresh_access_token(refresh_token: str) -> Optional[str]:
    cid = os.getenv("GOOGLE_OAUTH_CLIENT_ID", "")
    secret = os.getenv("GOOGLE_OAUTH_CLIENT_SECRET", "")
    if not (cid and secret):
        return None
    try:
        with httpx.Client(timeout=20) as c:
            r = c.post(_GOOGLE_TOKEN_URL, data={
                "client_id": cid,
                "client_secret": secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            })
            r.raise_for_status()
            return r.json().get("access_token")
    except Exception as exc:  # noqa: BLE001
        log.warning("google token refresh failed: %s", exc)
        return None


def google_busy_days(access_token: str, start: date, end: date) -> list[str]:
    """Busy days across all of the account's readable calendars."""
    hdr = {"Authorization": f"Bearer {access_token}"}
    time_min = datetime(start.year, start.month, start.day).isoformat() + "Z"
    time_max = (datetime(end.year, end.month, end.day) + timedelta(days=1)).isoformat() + "Z"
    events: list[Event] = []
    try:
        with httpx.Client(timeout=25) as c:
            cal_list = c.get(
                "https://www.googleapis.com/calendar/v3/users/me/calendarList",
                headers=hdr, params={"minAccessRole": "reader"},
            )
            cal_list.raise_for_status()
            for cal in cal_list.json().get("items", []):
                cid = cal.get("id")
                if not cid or _is_noise_calendar(cid):
                    continue
                r = c.get(
                    f"https://www.googleapis.com/calendar/v3/calendars/{cid}/events",
                    headers=hdr,
                    params={
                        "timeMin": time_min, "timeMax": time_max,
                        "singleEvents": "true", "maxResults": 2500,
                    },
                )
                if not r.is_success:
                    continue
                for ev in r.json().get("items", []):
                    if ev.get("status") == "cancelled" or ev.get("transparency") == "transparent":
                        continue
                    s = ev.get("start", {})
                    e = ev.get("end", {})
                    all_day = "date" in s
                    sv = s.get("date") or s.get("dateTime")
                    evv = e.get("date") or e.get("dateTime")
                    if sv and evv:
                        events.append(Event(start=sv[:10], end=evv[:10], all_day=all_day))
    except Exception as exc:  # noqa: BLE001
        log.warning("google busy fetch failed: %s", exc)
    return busy_days_from_events(events, start, end)


def _is_noise_calendar(cid: str) -> bool:
    return any(t in cid for t in ("#holiday", "#contacts", "#weeknum", "#weather"))


# ── Microsoft ───────────────────────────────────────────────────────────────

def ms_refresh_access_token(refresh_token: str) -> Optional[str]:
    cid = os.getenv("MS_OAUTH_CLIENT_ID", "")
    secret = os.getenv("MS_OAUTH_CLIENT_SECRET", "")
    if not (cid and secret):
        return None
    try:
        with httpx.Client(timeout=20) as c:
            r = c.post(_MS_TOKEN_URL, data={
                "client_id": cid,
                "client_secret": secret,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
                "scope": "Calendars.Read offline_access",
            })
            r.raise_for_status()
            return r.json().get("access_token")
    except Exception as exc:  # noqa: BLE001
        log.warning("microsoft token refresh failed: %s", exc)
        return None


def ms_busy_days(access_token: str, start: date, end: date) -> list[str]:
    hdr = {
        "Authorization": f"Bearer {access_token}",
        "Prefer": 'outlook.timezone="UTC"',
    }
    events: list[Event] = []
    try:
        with httpx.Client(timeout=25) as c:
            r = c.get(
                "https://graph.microsoft.com/v1.0/me/calendarView",
                headers=hdr,
                params={
                    "startDateTime": datetime(start.year, start.month, start.day).isoformat(),
                    "endDateTime": (datetime(end.year, end.month, end.day) + timedelta(days=1)).isoformat(),
                    "$select": "start,end,showAs,isCancelled,isAllDay",
                    "$top": 1000,
                },
            )
            r.raise_for_status()
            for ev in r.json().get("value", []):
                if ev.get("isCancelled") or ev.get("showAs") == "free":
                    continue
                s = (ev.get("start") or {}).get("dateTime")
                e = (ev.get("end") or {}).get("dateTime")
                if s and e:
                    events.append(Event(start=s[:10], end=e[:10], all_day=bool(ev.get("isAllDay"))))
    except Exception as exc:  # noqa: BLE001
        log.warning("microsoft busy fetch failed: %s", exc)
    return busy_days_from_events(events, start, end)
