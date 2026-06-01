"""Tests for rough_window parsing — including the 'Sept' regression and
exact-date windows that the backend previously couldn't parse at all.
"""
from __future__ import annotations

from datetime import date

from app.routes.availability import _parse_rough_window


def test_exact_date_window_with_sept():
    # Regression: "1 Aug 2026 – 17 Sept 2026" used to return None (no exact-date
    # rule + "Sept" not recognised), which broke the whole availability window.
    start, end = _parse_rough_window("1 Aug 2026 – 17 Sept 2026")
    assert start == date(2026, 8, 1)
    assert end == date(2026, 9, 17)


def test_exact_date_window_basic():
    start, end = _parse_rough_window("15 Jan 2027 - 28 Mar 2027")
    assert start == date(2027, 1, 15)
    assert end == date(2027, 3, 28)


def test_month_year_range():
    start, end = _parse_rough_window("August 2026 – October 2026")
    assert start == date(2026, 8, 1)
    assert end == date(2026, 10, 31)


def test_single_month():
    start, end = _parse_rough_window("September 2026")
    assert start == date(2026, 9, 1)
    assert end == date(2026, 9, 30)


def test_sept_abbreviation_in_month_range():
    start, end = _parse_rough_window("Sept 2026 – Oct 2026")
    assert start == date(2026, 9, 1)
    assert end == date(2026, 10, 31)


def test_unparseable_returns_none():
    assert _parse_rough_window("sometime next year") is None
    assert _parse_rough_window(None) is None
