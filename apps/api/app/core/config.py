"""Internal data models used by the optimiser.

The Streamlit MVP loads these from YAML; the v2 API builds them from
Supabase row data. The models themselves are the same — only the source
of the data differs, so this module has no YAML loader.
"""
from __future__ import annotations

from datetime import date
from typing import Optional

from pydantic import BaseModel, Field, model_validator


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
