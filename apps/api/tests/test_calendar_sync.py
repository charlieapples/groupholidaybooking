"""Tests for busy-day extraction shared by Google + Microsoft calendar sync.

The tricky bit is the all-day vs timed end-date convention, and clipping to the
holiday window — same rules the frontend uses, now on the server.
"""
from datetime import date

from app.core.calendar_sync import busy_days_from_events
from app.core import crypto
import os
import pytest


WS = date(2026, 7, 1)
WE = date(2026, 7, 31)


def test_timed_same_day_event_counts_one_day():
    # A 9–5 meeting on Jul 15: start=end=Jul 15, timed -> +1 -> one busy day.
    evs = [{"start": "2026-07-15", "end": "2026-07-15", "all_day": False}]
    assert busy_days_from_events(evs, WS, WE) == ["2026-07-15"]


def test_all_day_event_exclusive_end():
    # All-day Jul 10 -> Jul 12 (exclusive) means Jul 10 and Jul 11 only.
    evs = [{"start": "2026-07-10", "end": "2026-07-12", "all_day": True}]
    assert busy_days_from_events(evs, WS, WE) == ["2026-07-10", "2026-07-11"]


def test_clipped_to_window():
    # Event spanning the window edge only contributes in-window days.
    evs = [{"start": "2026-06-29", "end": "2026-07-02", "all_day": True}]
    assert busy_days_from_events(evs, WS, WE) == ["2026-07-01"]


def test_multiple_events_merge_and_dedupe():
    evs = [
        {"start": "2026-07-15", "end": "2026-07-15", "all_day": False},
        {"start": "2026-07-15", "end": "2026-07-16", "all_day": False},  # overlaps + extends
    ]
    assert busy_days_from_events(evs, WS, WE) == ["2026-07-15", "2026-07-16"]


def test_bad_rows_skipped():
    evs = [
        {"start": "not-a-date", "end": "2026-07-15", "all_day": False},
        {"end": "2026-07-15", "all_day": False},  # missing start
        {"start": "2026-07-20", "end": "2026-07-20", "all_day": False},
    ]
    assert busy_days_from_events(evs, WS, WE) == ["2026-07-20"]


def test_crypto_roundtrip_with_key(monkeypatch):
    from cryptography.fernet import Fernet
    monkeypatch.setenv("CALENDAR_TOKEN_KEY", Fernet.generate_key().decode())
    crypto._fernet.cache_clear()
    assert crypto.is_configured() is True
    secret = "1//refresh-token-value"
    assert crypto.decrypt(crypto.encrypt(secret)) == secret
    state = {"uid": "abc", "rt": "https://x/y"}
    assert crypto.decrypt_state(crypto.encrypt_state(state)) == state
    crypto._fernet.cache_clear()


def test_crypto_not_configured(monkeypatch):
    monkeypatch.delenv("CALENDAR_TOKEN_KEY", raising=False)
    crypto._fernet.cache_clear()
    assert crypto.is_configured() is False
    with pytest.raises(crypto.CryptoNotConfigured):
        crypto.encrypt("x")
    crypto._fernet.cache_clear()
