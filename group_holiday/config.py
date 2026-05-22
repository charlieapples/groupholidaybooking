from __future__ import annotations

from datetime import date
from pathlib import Path
from typing import Optional

import yaml
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


def load_config(path: str | Path) -> Config:
    raw = yaml.safe_load(Path(path).read_text(encoding="utf-8"))
    return Config.model_validate(raw)
