"""Internal data models used by the optimiser.

The Streamlit MVP loads these from YAML; the v2 API builds them from
Supabase row data. The models themselves are the same — only the source
of the data differs, so this module has no YAML loader.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator

# ---------------------------------------------------------------------------
# Per-airline carry-on baggage estimates (round-trip, GBP)
# ---------------------------------------------------------------------------
# Travelpayouts fares are typically "personal item / hand baggage only".
# Real travellers usually want to take more; these figures are approximate
# 2024/25 carry-on (cabin bag) add-on prices for a one-way segment × 2
# to give a round-trip estimate.  Falls back to DEFAULT_BAGGAGE_GBP when
# the airline IATA code is not in the table.
#
# Sources: airline bag-fee pages (May 2025)
DEFAULT_BAGGAGE_GBP: float = 40.0   # conservative fallback

AIRLINE_BAGGAGE_GBP: dict[str, float] = {
    # Ultra-low-cost (seat-only; cabin bag charged separately)
    "FR": 42.0,   # Ryanair   ~£21/segment
    "W6": 48.0,   # Wizz Air  ~£24/segment
    "U2": 40.0,   # easyJet   ~£20/segment (flexi not included)
    "VY": 44.0,   # Vueling
    "LS": 34.0,   # Jet2 — cabin bag free, 22 kg hold add-on est ~£17/seg
    # Low-cost with cabin bag included in base fare
    "BA": 0.0,    # British Airways — cabin bag included in all fares
    "LH": 0.0,    # Lufthansa
    "AF": 0.0,    # Air France
    "KL": 0.0,    # KLM
    "IB": 0.0,    # Iberia
    "AY": 0.0,    # Finnair
    "SK": 0.0,    # SAS
    "LX": 0.0,    # Swiss
    "OS": 0.0,    # Austrian
    "SN": 0.0,    # Brussels Airlines
    "TP": 0.0,    # TAP Portugal
    "TK": 0.0,    # Turkish Airlines (cabin bag included)
    "EK": 0.0,    # Emirates
    "QR": 0.0,    # Qatar Airways
    "EY": 0.0,    # Etihad
    "SV": 0.0,    # Saudi
    "MS": 0.0,    # EgyptAir
    "ET": 0.0,    # Ethiopian
    # Mid-tier / charter (cabin bag included, hold bag usually extra)
    "BE": 0.0,    # Flybe (successor ops)
    "EZS": 0.0,   # easyJet Switzerland
    "PC": 24.0,   # Pegasus — cabin bag free, 20 kg hold ~£12/seg
    "BV": 36.0,   # Blue Air
    "D8": 40.0,   # Norwegian (cabin bag included in LowFare+ but not LowFare)
    "DY": 40.0,   # Norwegian (same code family)
    "SY": 30.0,   # Sun Country
    "XR": 30.0,   # Corendon
}


class Person(BaseModel):
    name: str
    home: str  # UK postcode or city name


class DateWindow(BaseModel):
    earliest_outbound: date
    latest_inbound: date
    min_nights: int = Field(ge=1)
    max_nights: int = Field(ge=1)

    @model_validator(mode="after")
    def check_order(self) -> "DateWindow":
        if self.earliest_outbound >= self.latest_inbound:
            raise ValueError("earliest_outbound must be before latest_inbound")
        if self.min_nights > self.max_nights:
            raise ValueError("min_nights must be <= max_nights")
        return self


class Config(BaseModel):
    people: list[Person] = Field(min_length=1)
    destinations: list[str] = Field(min_length=1)
    date_window: DateWindow
    budget_cap_per_person: Optional[float] = None
    max_ground_hours: Optional[float] = None   # None = no limit
    time_value_per_hour: float = 0.0           # £/hr — cost of travel time
    shared_dates: bool = True                  # group flies together on same dates
    # Baggage uplift in £ — added to each person's round-trip flight total to
    # reflect realistic prices (Travelpayouts returns "personal item only" fares
    # which most travellers will upgrade). Default = £40 carry-on for the
    # round trip; admin can change per-Holiday via the API.
    baggage_uplift_gbp: float = 40.0
