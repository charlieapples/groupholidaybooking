"""Tests for the by-the-minute meet-up overlap logic."""
from __future__ import annotations

from app.routes.meetup import Slot, _normalise, _runs_at


def _coverage(members: list[list[tuple[int, int]]]) -> list[int]:
    """Build a per-minute coverage count from members' free intervals."""
    cov = [0] * 1440
    for intervals in members:
        # union per member (each member counts once per minute)
        free = [False] * 1440
        for a, b in intervals:
            for m in range(a, b):
                free[m] = True
        for m in range(1440):
            if free[m]:
                cov[m] += 1
    return cov


def test_normalise_merges_overlaps():
    slots = [Slot(start_min=540, end_min=660), Slot(start_min=600, end_min=720)]
    assert _normalise(slots) == [(540, 720)]


def test_normalise_drops_empty_and_sorts():
    slots = [Slot(start_min=800, end_min=800), Slot(start_min=120, end_min=180)]
    assert _normalise(slots) == [(120, 180)]


def test_everyone_free_overlap():
    # A free 09:00-17:00, B free 12:00-20:00 -> everyone free 12:00-17:00.
    cov = _coverage([[(540, 1020)], [(720, 1200)]])
    overlap = _runs_at(cov, 2)
    assert overlap == [Slot(start_min=720, end_min=1020)]


def test_no_full_overlap_falls_back_to_most_people():
    # A free 09:00-11:00, B free 15:00-17:00 -> no common time; best = 1 free.
    cov = _coverage([[(540, 660)], [(900, 1020)]])
    assert _runs_at(cov, 2) == []
    best = max(cov)
    assert best == 1
    partial = _runs_at(cov, best)
    assert Slot(start_min=540, end_min=660) in partial
    assert Slot(start_min=900, end_min=1020) in partial


def test_split_overlap_returns_multiple_windows():
    # Everyone free in two separate blocks.
    cov = _coverage([[(540, 600), (900, 960)], [(540, 600), (900, 960)]])
    assert _runs_at(cov, 2) == [
        Slot(start_min=540, end_min=600),
        Slot(start_min=900, end_min=960),
    ]
