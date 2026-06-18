"""Self-calibration for flight-price predictions.

We log every predicted-vs-live fare into `price_checks`. Over time those samples
tell us whether our model runs systematically high or low. This module turns that
signal into a single multiplier we can apply to future estimates so they drift
toward the truth.

Design choices (deliberately conservative — a bad calibration is worse than none):

* **Gated on sample size.** With only a handful of checks the mean bias is noise.
  Below `min_samples` we return 1.0 (a no-op), so nothing changes until we have
  enough evidence. This is why it's safe to wire in immediately: it does nothing
  until the data earns it.
* **Clamped.** Even with lots of data we never move an estimate by more than
  `max_adjust` (default ±20%). A genuine model is never off by 2x on average; a
  large computed bias means bad data, not a bad model — so we refuse to chase it.
* **Trimmed.** We drop the most extreme samples before averaging so one absurd
  outlier (a £20 error-fare, a £4,000 last-minute one) can't swing the factor.
* **Bias, not magnitude.** We calibrate on the *signed* error (are we high or
  low?), not the absolute error (how wrong on average?). Absolute error can't be
  corrected by a multiplier; directional bias can.

The factor is applied to what we SHOW the user, never to what we LOG as the raw
prediction — otherwise calibration would feed on its own output and run away.
"""
from __future__ import annotations

from typing import Iterable, Optional

MIN_SAMPLES = 20
MAX_ADJUST = 0.20      # never move an estimate by more than ±20%
TRIM_FRACTION = 0.10   # drop the most extreme 10% at each tail before averaging


def _trimmed_mean(values: list[float], trim: float) -> float:
    """Mean after discarding the most extreme `trim` fraction at each tail."""
    if not values:
        return 0.0
    ordered = sorted(values)
    k = int(len(ordered) * trim)
    core = ordered[k: len(ordered) - k] if k > 0 else ordered
    if not core:
        core = ordered
    return sum(core) / len(core)


def signed_errors(rows: Iterable[dict]) -> list[float]:
    """Extract signed relative errors (actual-predicted)/predicted from price_checks rows."""
    out: list[float] = []
    for r in rows:
        p, a = r.get("predicted_gbp"), r.get("actual_gbp")
        try:
            p, a = float(p), float(a)
        except (TypeError, ValueError):
            continue
        if p > 0:
            out.append((a - p) / p)
    return out


def calibration_factor(
    errors: list[float],
    *,
    min_samples: int = MIN_SAMPLES,
    max_adjust: float = MAX_ADJUST,
    trim: float = TRIM_FRACTION,
) -> float:
    """Multiplier to apply to a raw prediction so it tracks observed live fares.

    `errors` are signed relative errors: (actual - predicted) / predicted. A
    positive mean means live fares come in ABOVE our prediction (we run low), so
    we return a factor > 1 to push estimates up; negative means we run high.

    Returns 1.0 (no change) when there aren't enough samples to trust the signal.
    The result is always within [1 - max_adjust, 1 + max_adjust].
    """
    if len(errors) < min_samples:
        return 1.0
    bias = _trimmed_mean(errors, trim)          # e.g. +0.08 means live is 8% above us
    factor = 1.0 + bias
    lo, hi = 1.0 - max_adjust, 1.0 + max_adjust
    return max(lo, min(hi, factor))


def calibrated(prediction: float, errors: list[float], **kwargs) -> float:
    """Apply the calibration factor to a single raw prediction."""
    return round(prediction * calibration_factor(errors, **kwargs), 2)


def calibration_summary(errors: list[float], **kwargs) -> dict[str, Optional[float]]:
    """Human-facing summary for the accuracy endpoint / owner UI."""
    factor = calibration_factor(errors, **kwargs)
    active = len(errors) >= kwargs.get("min_samples", MIN_SAMPLES)
    return {
        "samples": len(errors),
        "active": active,
        "factor": round(factor, 4),
        # +5.0 => we now nudge estimates up 5%; null until active
        "adjust_pct": round((factor - 1.0) * 100, 1) if active else None,
    }
