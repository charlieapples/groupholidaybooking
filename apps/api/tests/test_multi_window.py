"""Tests for multi-window flight search: window resolution + per-destination merge."""

from datetime import date

from app.routes.flights import _resolve_search_windows, _better_result
from app.core.optimiser import DestinationResult, PersonResult


def _person(name, cost, viable=True):
    return PersonResult(
        person_name=name, chosen_airport="LGW", ground_leg=None,
        outbound=None, inbound=None,
        total_cost_gbp=cost, flight_plus_ground_gbp=cost, viable=viable,
    )


def _dest(code, costs, viable=True):
    return DestinationResult(destination=code, person_results=[_person(f"p{i}", c, viable) for i, c in enumerate(costs)])


# ── window resolution ─────────────────────────────────────────────────────────

def test_multi_window_returns_all_valid_windows():
    room = {
        "multi_window_search": True,
        "search_windows": [
            {"start_date": "2026-07-17", "end_date": "2026-07-28"},
            {"start_date": "2026-08-13", "end_date": "2026-08-24"},
        ],
        "agreed_start": "2026-07-17", "agreed_end": "2026-07-28",
    }
    out = _resolve_search_windows(room)
    assert out == [
        (date(2026, 7, 17), date(2026, 7, 28)),
        (date(2026, 8, 13), date(2026, 8, 24)),
    ]


def test_single_window_mode_uses_only_agreed():
    room = {
        "multi_window_search": False,
        "search_windows": [
            {"start_date": "2026-07-17", "end_date": "2026-07-28"},
            {"start_date": "2026-08-13", "end_date": "2026-08-24"},
        ],
        "agreed_start": "2026-08-13", "agreed_end": "2026-08-24",
    }
    out = _resolve_search_windows(room)
    assert out == [(date(2026, 8, 13), date(2026, 8, 24))]


def test_falls_back_to_agreed_when_no_windows():
    room = {"multi_window_search": True, "search_windows": [],
            "agreed_start": "2026-09-01", "agreed_end": "2026-09-10"}
    out = _resolve_search_windows(room)
    assert out == [(date(2026, 9, 1), date(2026, 9, 10))]


def test_invalid_and_duplicate_windows_are_cleaned():
    room = {
        "multi_window_search": True,
        "search_windows": [
            {"start_date": "2026-07-17", "end_date": "2026-07-28"},
            {"start_date": "2026-07-17", "end_date": "2026-07-28"},   # dup
            {"start_date": "bad", "end_date": "2026-07-28"},          # invalid
            {"end_date": "2026-07-28"},                                # missing key
            {"start_date": "2026-08-30", "end_date": "2026-08-01"},   # end < start
        ],
        "agreed_start": "2026-07-17", "agreed_end": "2026-07-28",
    }
    out = _resolve_search_windows(room)
    assert out == [(date(2026, 7, 17), date(2026, 7, 28))]


def test_windows_are_capped():
    room = {
        "multi_window_search": True,
        "search_windows": [
            {"start_date": f"2026-0{m}-01", "end_date": f"2026-0{m}-09"} for m in range(1, 8)
        ],
        "agreed_start": "2026-01-01", "agreed_end": "2026-01-09",
    }
    out = _resolve_search_windows(room)
    assert len(out) == 4   # _MAX_SEARCH_WINDOWS


# ── per-destination merge across windows ──────────────────────────────────────

def test_better_result_prefers_cheaper_when_both_viable():
    a = _dest("BCN", [100, 100])   # 200
    b = _dest("BCN", [80, 90])     # 170
    assert _better_result(a, b) is b
    assert _better_result(b, a) is b


def test_better_result_prefers_fully_viable_over_cheaper_partial():
    cheap_partial = _dest("BCN", [50], viable=False)   # not viable
    pricier_full = _dest("BCN", [120, 120])            # fully viable
    assert _better_result(cheap_partial, pricier_full) is pricier_full


def test_better_result_handles_none():
    b = _dest("BCN", [100])
    assert _better_result(None, b) is b
