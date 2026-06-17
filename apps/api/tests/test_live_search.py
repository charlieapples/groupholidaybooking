"""Tests for the live flight-search signature construction.

We can't hit the live Travelpayouts API in tests, but the signature is the
fiddly, deterministic bit — so we lock its construction down here.
"""

import hashlib

from app.core.live_search import signature


def test_signature_value_order_and_md5():
    token = "TESTTOKEN"
    marker = "12345"
    passengers = {"adults": 2, "children": 0, "infants": 1}
    segments = [
        {"origin": "LON", "destination": "MAD", "date": "2026-08-09"},
        {"origin": "MAD", "destination": "LON", "date": "2026-08-16"},
    ]
    sig = signature(
        token, marker, "groupholidaybooking.com", "127.0.0.1", "en", "Y", passengers, segments,
    )

    # Reconstruct the documented order: host, locale, marker, adults, children,
    # infants, [seg: date, destination, origin]..., trip_class, user_ip.
    expected_parts = [
        "groupholidaybooking.com", "en", "12345",
        "2", "0", "1",
        "2026-08-09", "MAD", "LON",
        "2026-08-16", "LON", "MAD",
        "Y", "127.0.0.1",
    ]
    expected = hashlib.md5((token + ":" + ":".join(expected_parts)).encode()).hexdigest()
    assert sig == expected
    assert len(sig) == 32  # md5 hex digest


def test_signature_one_way_segment():
    sig = signature(
        "T", "1", "h.com", "127.0.0.1", "en", "Y",
        {"adults": 1, "children": 0, "infants": 0},
        [{"origin": "BHX", "destination": "MAD", "date": "2026-08-09"}],
    )
    expected_parts = ["h.com", "en", "1", "1", "0", "0", "2026-08-09", "MAD", "BHX", "Y", "127.0.0.1"]
    expected = hashlib.md5(("T:" + ":".join(expected_parts)).encode()).hexdigest()
    assert sig == expected
