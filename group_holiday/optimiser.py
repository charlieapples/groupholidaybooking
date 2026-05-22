"""Core optimisation algorithm."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from .airports import UK_AIRPORTS
from .config import Config, Person
from .flights import Fare, cheapest_return_pair
from .ground import GroundLeg, nearest_airports


@dataclass
class PersonResult:
    person_name: str
    chosen_airport: Optional[str]
    ground_leg: Optional[GroundLeg]
    outbound: Optional[Fare]
    inbound: Optional[Fare]
    total_cost_gbp: float        # includes time value if configured
    flight_plus_ground_gbp: float  # raw money cost only (no time value)
    viable: bool
    note: str = ""

    @property
    def ground_cost(self) -> float:
        return self.ground_leg.estimated_cost_gbp if self.ground_leg else 0.0

    @property
    def ground_hours(self) -> float:
        return self.ground_leg.duration_hours if self.ground_leg else 0.0

    @property
    def outbound_cost(self) -> float:
        return self.outbound.price_gbp if self.outbound else 0.0

    @property
    def inbound_cost(self) -> float:
        return self.inbound.price_gbp if self.inbound else 0.0


@dataclass
class DestinationResult:
    destination: str
    person_results: list[PersonResult] = field(default_factory=list)
    viable: bool = True
    note: str = ""

    @property
    def total_group_cost(self) -> float:
        return sum(p.total_cost_gbp for p in self.person_results if p.viable)

    @property
    def total_group_money_cost(self) -> float:
        """Raw money cost — no time value included."""
        return sum(p.flight_plus_ground_gbp for p in self.person_results if p.viable)

    @property
    def viable_count(self) -> int:
        return sum(1 for p in self.person_results if p.viable)

    @property
    def max_individual_cost(self) -> float:
        costs = [p.total_cost_gbp for p in self.person_results if p.viable]
        return max(costs) if costs else 0.0

    @property
    def avg_individual_cost(self) -> float:
        costs = [p.total_cost_gbp for p in self.person_results if p.viable]
        return sum(costs) / len(costs) if costs else 0.0

    @property
    def fairness_ratio(self) -> float:
        avg = self.avg_individual_cost
        return self.max_individual_cost / avg if avg else 1.0


def _best_option_for_person(
    person: Person,
    destination: str,
    config: Config,
) -> PersonResult:
    reachable = nearest_airports(person.home, UK_AIRPORTS, config.max_ground_hours)

    if not reachable:
        return PersonResult(
            person_name=person.name,
            chosen_airport=None,
            ground_leg=None,
            outbound=None,
            inbound=None,
            total_cost_gbp=0.0,
            flight_plus_ground_gbp=0.0,
            viable=False,
            note="No airports reachable",
        )

    dw = config.date_window
    best: Optional[PersonResult] = None

    for airport_code, ground in reachable:
        outbound, inbound = cheapest_return_pair(
            origin=airport_code,
            destination=destination,
            earliest_outbound=dw.earliest_outbound,
            latest_inbound=dw.latest_inbound,
            min_nights=dw.min_nights,
            max_nights=dw.max_nights,
        )

        if outbound is None or inbound is None:
            continue

        money_cost = ground.estimated_cost_gbp + outbound.price_gbp + inbound.price_gbp

        # Time value: charge for ground travel time both ways
        time_cost = ground.duration_hours * 2 * config.time_value_per_hour
        total = money_cost + time_cost

        if config.budget_cap_per_person and money_cost > config.budget_cap_per_person:
            continue

        if best is None or total < best.total_cost_gbp:
            best = PersonResult(
                person_name=person.name,
                chosen_airport=airport_code,
                ground_leg=ground,
                outbound=outbound,
                inbound=inbound,
                total_cost_gbp=round(total, 2),
                flight_plus_ground_gbp=round(money_cost, 2),
                viable=True,
            )

    if best is None:
        return PersonResult(
            person_name=person.name,
            chosen_airport=None,
            ground_leg=None,
            outbound=None,
            inbound=None,
            total_cost_gbp=0.0,
            flight_plus_ground_gbp=0.0,
            viable=False,
            note="No viable flights found",
        )

    return best


def optimise(config: Config) -> list[DestinationResult]:
    results: list[DestinationResult] = []

    for destination in config.destinations:
        dest_result = DestinationResult(destination=destination)

        for person in config.people:
            pr = _best_option_for_person(person, destination, config)
            dest_result.person_results.append(pr)

        non_viable = [p for p in dest_result.person_results if not p.viable]
        if non_viable:
            names = ", ".join(p.person_name for p in non_viable)
            dest_result.note = f"No flight data for: {names}"

        results.append(dest_result)

    # Sort: fully viable first, then by total group cost (includes time value)
    results.sort(key=lambda d: (
        not all(p.viable for p in d.person_results),
        d.total_group_cost,
    ))
    return results
