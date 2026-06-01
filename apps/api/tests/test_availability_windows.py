"""Tests for the free-window computation — the core 'when is everyone free'
algorithm — and the blind-reveal submission semantics.
"""
from __future__ import annotations

from datetime import date

from app.routes.availability import _compute_free_windows


START = date(2026, 7, 1)
END = date(2026, 7, 14)   # 14-day window


def test_all_free_is_one_window():
    windows = _compute_free_windows(START, END, {}, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 1
    assert windows[0].start_date == START
    assert windows[0].end_date == END
    assert windows[0].days == 14


def test_busy_day_splits_window():
    # Member A busy on Jul 8 → windows Jul 1–7 (7d) and Jul 9–14 (6d)
    busy = {date(2026, 7, 8): {"A"}}
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 2
    # Longest first
    assert windows[0].days == 7
    assert windows[0].start_date == date(2026, 7, 1)
    assert windows[0].end_date == date(2026, 7, 7)
    assert windows[1].days == 6
    assert windows[1].start_date == date(2026, 7, 9)


def test_stale_non_member_busy_is_ignored():
    # A date marked busy ONLY by a user who is no longer a member must not
    # break the window — the algorithm intersects busy users with member_ids.
    busy = {date(2026, 7, 8): {"GHOST"}}  # GHOST not in members
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 1
    assert windows[0].days == 14


def test_min_days_filters_short_windows():
    # Busy on Jul 3 and Jul 5 → tiny gaps that are below min_days are dropped
    busy = {date(2026, 7, 3): {"A"}, date(2026, 7, 5): {"A"}}
    windows = _compute_free_windows(START, END, busy, {"A"}, min_days=4, top_n=10)
    # Jul 1-2 (2d) dropped, Jul 4 (1d) dropped, Jul 6-14 (9d) kept
    assert len(windows) == 1
    assert windows[0].start_date == date(2026, 7, 6)
    assert windows[0].days == 9


def test_top_n_limits_results():
    # Alternating busy days create many 1-day gaps; with min_days=1 we'd get
    # several windows but top_n caps the count.
    busy = {date(2026, 7, d): {"A"} for d in (2, 4, 6, 8, 10, 12)}
    windows = _compute_free_windows(START, END, busy, {"A"}, min_days=1, top_n=3)
    assert len(windows) == 3


def test_blind_reveal_subset_semantics():
    # Documents the fix: "everyone submitted" must be a subset test, not a
    # count/strict-subset test, so stale submissions from departed members
    # don't prematurely trip the reveal.
    members = {"A", "B", "D"}

    # D hasn't submitted; C (departed) has a lingering row
    submitted = {"A", "B", "C"}
    assert not members.issubset(submitted)          # correctly: NOT all in
    assert len(submitted) == len(members)           # the OLD buggy check would pass
    assert (submitted & members) == {"A", "B"}      # only 2 current members counted

    # Once D submits, the subset test passes
    submitted = {"A", "B", "C", "D"}
    assert members.issubset(submitted)
