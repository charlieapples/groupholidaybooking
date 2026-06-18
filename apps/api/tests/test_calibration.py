"""Tests for flight-price self-calibration.

The guiding principle under test: calibration must be a safe no-op until there's
enough trustworthy data, and even then must never swing an estimate wildly.
"""
from app.core.calibration import (
    calibration_factor,
    calibration_summary,
    calibrated,
    signed_errors,
)


def test_no_op_below_min_samples():
    # A few samples, even with a clear bias, must NOT move the estimate.
    errors = [0.10, 0.12, 0.08]  # live ~10% above prediction, but only 3 points
    assert calibration_factor(errors) == 1.0


def test_corrects_consistent_low_bias():
    # 20 samples all saying live is ~10% above us -> push estimates up ~10%.
    errors = [0.10] * 20
    f = calibration_factor(errors)
    assert 1.09 <= f <= 1.11


def test_corrects_consistent_high_bias():
    # We run high by 10% -> factor below 1.
    errors = [-0.10] * 20
    f = calibration_factor(errors)
    assert 0.89 <= f <= 0.91


def test_clamped_to_max_adjust():
    # An absurd average bias must be clamped, not chased.
    errors = [1.5] * 30  # "live is 150% above us" -> bad data, clamp to +20%
    assert calibration_factor(errors) == 1.20
    errors_low = [-0.9] * 30
    assert calibration_factor(errors_low) == 0.80


def test_trimming_resists_outliers():
    # 19 honest ~0% errors + one £-fare outlier shouldn't drag the factor far.
    errors = [0.0] * 19 + [5.0]
    f = calibration_factor(errors)
    assert 0.99 <= f <= 1.01


def test_calibrated_value():
    errors = [0.10] * 20
    assert calibrated(100.0, errors) == 110.0
    # Below threshold: unchanged.
    assert calibrated(100.0, [0.10] * 3) == 100.0


def test_signed_errors_parsing():
    rows = [
        {"predicted_gbp": 100, "actual_gbp": 110},   # +0.10
        {"predicted_gbp": 200, "actual_gbp": 180},   # -0.10
        {"predicted_gbp": 0, "actual_gbp": 50},      # skip (div by zero)
        {"predicted_gbp": None, "actual_gbp": 50},   # skip
        {"predicted_gbp": "bad", "actual_gbp": 50},  # skip
    ]
    errs = signed_errors(rows)
    assert errs == [0.10, -0.10]


def test_summary_inactive_then_active():
    inactive = calibration_summary([0.1] * 5)
    assert inactive["active"] is False
    assert inactive["adjust_pct"] is None
    assert inactive["factor"] == 1.0

    active = calibration_summary([0.1] * 20)
    assert active["active"] is True
    assert active["adjust_pct"] == 10.0
