"""Tests for the free-window computation — the core 'when is everyone free'
algorithm — and the blind-reveal submission semantics.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.routes.availability import _compute_free_windows


# Anchor the test window to the future relative to *today* rather than a fixed
# calendar date. `_compute_free_windows` clamps away past dates, so hard-coded
# dates silently start failing once the real clock passes them. `d(n)` is the
# n-th day of the window (d(0) == START, d(13) == END → a 14-day window).
START = date.today() + timedelta(days=30)
END = START + timedelta(days=13)   # 14-day window


def d(n: int) -> date:
    return START + timedelta(days=n)


def test_all_free_is_one_window():
    windows = _compute_free_windows(START, END, {}, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 1
    assert windows[0].start_date == START
    assert windows[0].end_date == END
    assert windows[0].days == 14


def test_busy_day_splits_window():
    # Member A busy on d(7) → windows d(0)–d(6) (7d) and d(8)–d(13) (6d)
    busy = {d(7): {"A"}}
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 2
    # Longest first
    assert windows[0].days == 7
    assert windows[0].start_date == d(0)
    assert windows[0].end_date == d(6)
    assert windows[1].days == 6
    assert windows[1].start_date == d(8)


def test_stale_non_member_busy_is_ignored():
    # A date marked busy ONLY by a user who is no longer a member must not
    # break the window — the algorithm intersects busy users with member_ids.
    busy = {d(7): {"GHOST"}}  # GHOST not in members
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) == 1
    assert windows[0].days == 14


def test_min_days_filters_short_windows():
    # Busy on d(2) and d(4) → tiny gaps that are below min_days are dropped
    busy = {d(2): {"A"}, d(4): {"A"}}
    windows = _compute_free_windows(START, END, busy, {"A"}, min_days=4, top_n=10)
    # d(0)-d(1) (2d) dropped, d(3) (1d) dropped, d(5)-d(13) (9d) kept
    assert len(windows) == 1
    assert windows[0].start_date == d(5)
    assert windows[0].days == 9


def test_top_n_limits_results():
    # Alternating busy days create many 1-day gaps; with min_days=1 we'd get
    # several windows but top_n caps the count.
    busy = {d(n): {"A"} for n in (1, 3, 5, 7, 9, 11)}
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


def test_fallback_to_most_people_free():
    # A is busy every single day -> no window works for EVERYONE. Should fall back
    # to the most-people-free window (just B free) covering the whole range.
    busy = {d(n): {"A"} for n in range(14)}
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert len(windows) >= 1
    assert windows[0].members_free == 1   # only B free
    assert windows[0].days == 14


def test_everyone_free_preferred_over_longer_partial():
    # Everyone free d(0)-d(4); A busy d(5)-d(13) (a LONGER stretch where only B
    # is free). We must still return the (shorter) everyone-free window.
    busy = {d(n): {"A"} for n in range(5, 14)}
    windows = _compute_free_windows(START, END, busy, {"A", "B"}, min_days=4, top_n=10)
    assert all(w.members_free == 2 for w in windows)        # everyone-free only
    assert windows[0].start_date == d(0)
    assert windows[0].end_date == d(4)
