"""Core optimisation algorithm.

Two modes:
- "individual" — each person flies on their own cheapest dates (faster, but
  group members may not actually be on the same trip)
- "shared"    — pick one (out_date, return_date) per destination and use it
  for everyone, so the group genuinely travels together
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from typing import Optional

from .airports import UK_AIRPORTS
from .config import AIRLINE_BAGGAGE_GBP, DEFAULT_BAGGAGE_GBP, Config, Person
from .flights import Fare, cheap_destination_codes, cheapest_return_pair
from .ground import GroundLeg, nearest_airports


def _baggage_for_fare(outbound: Optional["Fare"], fallback: float = DEFAULT_BAGGAGE_GBP) -> float:
    """Return estimated round-trip carry-on cost for this airline.

    Uses the per-airline lookup table in config.  Falls back to ``fallback``
    (the room-level override set by the admin) when the airline code is unknown.
    """
    if outbound is None:
        return 0.0
    code = (outbound.airline or "").upper()
    if code in AIRLINE_BAGGAGE_GBP:
        return AIRLINE_BAGGAGE_GBP[code]
    return fallback


@dataclass
class PersonResult:
    person_name: str
    chosen_airport: Optional[str]
    ground_leg: Optional[GroundLeg]
    outbound: Optional[Fare]
    inbound: Optional[Fare]
    total_cost_gbp: float           # money + time value (used for ranking)
    flight_plus_ground_gbp: float   # raw money only (incl baggage uplift)
    viable: bool
    over_budget: bool = False       # a fare was found but it's above the budget cap
    baggage_cost_gbp: float = 0.0   # the carry-on/hold-bag uplift applied
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

    @property
    def out_date(self) -> Optional[date]:
        return self.outbound.departure_date if self.outbound else None

    @property
    def return_date(self) -> Optional[date]:
        return self.inbound.departure_date if self.inbound else None


@dataclass
class DestinationResult:
    destination: str
    person_results: list[PersonResult] = field(default_factory=list)
    note: str = ""
    # Group coordination info
    shared_out_date: Optional[date] = None
    shared_return_date: Optional[date] = None
    date_spread_days: int = 0   # max gap between people's outbound dates

    @property
    def total_group_cost(self) -> float:
        return sum(p.total_cost_gbp for p in self.person_results if p.viable)

    @property
    def total_group_money_cost(self) -> float:
        return sum(p.flight_plus_ground_gbp for p in self.person_results if p.viable)

    @property
    def viable_count(self) -> int:
        return sum(1 for p in self.person_results if p.viable)

    @property
    def is_fully_viable(self) -> bool:
        return all(p.viable for p in self.person_results) and bool(self.person_results)

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


def _options_for_person(
    person: Person,
    destination: str,
    config: Config,
) -> tuple[list[GroundLeg], list[tuple[str, GroundLeg, Fare, Fare, float, float]]]:
    """
    Return (reachable_airports, candidate_options) for the person.

    Each candidate option is:
        (airport_code, ground_leg, outbound_fare, inbound_fare, money_cost, total_cost)
    where total_cost includes time value (round-trip ground hours × £/hr).
    """
    reachable = nearest_airports(person.home, UK_AIRPORTS, config.max_ground_hours)
    if not reachable:
        return [], []

    dw = config.date_window
    options = []

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

        # Baggage uplift: Travelpayouts returns "personal item only" fares.
        # Use per-airline carry-on estimates where known; fall back to the
        # room-level baggage_uplift_gbp override set by the admin.
        baggage = _baggage_for_fare(outbound, fallback=config.baggage_uplift_gbp)
        money_cost = ground.estimated_cost_gbp + outbound.price_gbp + inbound.price_gbp + baggage
        time_cost = ground.duration_hours * 2 * config.time_value_per_hour
        total = money_cost + time_cost

        # NOTE: we do NOT discard options over the budget cap. Hiding them just
        # showed "no flights" with no explanation. Instead we keep the cheapest
        # real fare and flag it as over-budget so the group sees the actual price.

        options.append((airport_code, ground, outbound, inbound, money_cost, total))

    return [g for _, g in reachable], options


def _build_result(
    person_name: str,
    option: Optional[tuple[str, GroundLeg, Fare, Fare, float, float]],
    note: str = "",
    baggage_uplift_gbp: float = 0.0,  # kept for call-site compat; overridden below
    budget_cap: Optional[float] = None,
) -> PersonResult:
    if option is None:
        return PersonResult(
            person_name=person_name,
            chosen_airport=None,
            ground_leg=None,
            outbound=None,
            inbound=None,
            total_cost_gbp=0.0,
            flight_plus_ground_gbp=0.0,
            viable=False,
            note=note or "No fares found from this person's airports for these dates",
        )
    code, ground, out, inn, money, total = option
    # Derive the displayed baggage cost from the actual airline rather than
    # using the fallback passed in — the airline may have a £0 cabin-bag policy.
    displayed_baggage = _baggage_for_fare(out, fallback=baggage_uplift_gbp)
    over = bool(budget_cap) and money > budget_cap
    return PersonResult(
        person_name=person_name,
        chosen_airport=code,
        ground_leg=ground,
        outbound=out,
        inbound=inn,
        total_cost_gbp=round(total, 2),
        flight_plus_ground_gbp=round(money, 2),
        baggage_cost_gbp=round(displayed_baggage, 2),
        viable=True,
        over_budget=over,
        note=f"£{money:.0f} — over the £{budget_cap:.0f} budget" if over else "",
    )


def _optimise_destination_individual(
    destination: str, config: Config,
) -> DestinationResult:
    """Each person flies on their own cheapest dates."""
    dest_result = DestinationResult(destination=destination)

    out_dates: list[date] = []
    return_dates: list[date] = []

    for person in config.people:
        _, options = _options_for_person(person, destination, config)
        if not options:
            dest_result.person_results.append(_build_result(person.name, None))
            continue

        best = min(options, key=lambda o: o[5])
        pr = _build_result(person.name, best, baggage_uplift_gbp=config.baggage_uplift_gbp, budget_cap=config.budget_cap_per_person)
        dest_result.person_results.append(pr)
        if pr.out_date:
            out_dates.append(pr.out_date)
        if pr.return_date:
            return_dates.append(pr.return_date)

    if out_dates:
        spread = (max(out_dates) - min(out_dates)).days
        dest_result.date_spread_days = spread

    return dest_result


def _optimise_destination_shared(
    destination: str, config: Config,
) -> DestinationResult:
    """Pick one (out_date, return_date) and use it for everyone."""
    dest_result = DestinationResult(destination=destination)

    # Gather every option for every person
    all_person_options: list[tuple[Person, list]] = []
    for person in config.people:
        _, options = _options_for_person(person, destination, config)
        all_person_options.append((person, options))

    # Collect all candidate date pairs across everyone's options
    candidate_pairs: set[tuple[date, date]] = set()
    for _, options in all_person_options:
        for opt in options:
            _, _, out, inn, _, _ = opt
            candidate_pairs.add((out.departure_date, inn.departure_date))

    if not candidate_pairs:
        # No data at all for this destination
        for person in config.people:
            dest_result.person_results.append(
                _build_result(person.name, None, "No flight data for any airport"))
        return dest_result

    # For each candidate date pair, score the group's total cost.
    # Score is (-viable_count, group_total) — more viable people wins, ties broken by cost.
    best_pair: Optional[tuple[date, date]] = None
    best_choices: dict[str, Optional[tuple]] = {}
    best_score: tuple[int, float] = (0, float("inf"))

    for pair in candidate_pairs:
        group_total = 0.0
        choices: dict[str, Optional[tuple]] = {}
        viable_count = 0

        for person, options in all_person_options:
            matching = [
                o for o in options
                if (o[2].departure_date, o[3].departure_date) == pair
            ]
            if matching:
                cheapest = min(matching, key=lambda o: o[5])
                choices[person.name] = cheapest
                group_total += cheapest[5]
                viable_count += 1
            else:
                choices[person.name] = None

        score = (-viable_count, group_total)
        if score < best_score:
            best_score = score
            best_pair = pair
            best_choices = choices

    if best_pair is None:
        for person in config.people:
            dest_result.person_results.append(_build_result(person.name, None))
        return dest_result

    dest_result.shared_out_date, dest_result.shared_return_date = best_pair
    dest_result.date_spread_days = 0  # by construction

    for person, _ in all_person_options:
        opt = best_choices.get(person.name)
        if opt is None:
            note = (
                f"No flight matches the chosen group dates "
                f"({best_pair[0]:%d %b} → {best_pair[1]:%d %b})"
            )
            dest_result.person_results.append(_build_result(person.name, None, note))
        else:
            dest_result.person_results.append(_build_result(person.name, opt, baggage_uplift_gbp=config.baggage_uplift_gbp, budget_cap=config.budget_cap_per_person))

    return dest_result


def discover_destinations(config: Config, top_n: int = 25) -> list[str]:
    """
    Auto-discover destination codes without a user-specified shortlist.

    For each person's nearest airports, queries the Travelpayouts all-destinations
    bucket and collects every destination that has a viable fare in the window.
    Destinations are scored by how many people's airports have fare data for them
    (so popular routes beat obscure ones). Returns up to top_n codes.

    These are then passed to `optimise()` as normal.
    """
    UK_CODES = set(UK_AIRPORTS)
    dw = config.date_window
    dest_votes: dict[str, int] = {}  # dest_code → number of person-airports that see a fare

    for person in config.people:
        reachable = nearest_airports(person.home, UK_AIRPORTS, config.max_ground_hours)
        # Only check the 3 closest airports per person to bound API calls
        person_dests: set[str] = set()
        for airport, _ in reachable[:3]:
            codes = cheap_destination_codes(
                airport,
                dw.earliest_outbound,
                dw.latest_inbound,
                min_nights=dw.min_nights,
                max_nights=dw.max_nights,
            )
            person_dests.update(c for c in codes if c not in UK_CODES)
        for dest in person_dests:
            dest_votes[dest] = dest_votes.get(dest, 0) + 1

    # Prefer destinations where more people have available fares
    ranked = sorted(dest_votes, key=lambda d: -dest_votes[d])
    return ranked[:top_n]


def optimise(config: Config) -> list[DestinationResult]:
    """Compute results for all destinations. Returns list sorted by group total cost."""
    mode = "shared" if config.shared_dates else "individual"
    results: list[DestinationResult] = []

    for destination in config.destinations:
        if mode == "shared":
            dr = _optimise_destination_shared(destination, config)
        else:
            dr = _optimise_destination_individual(destination, config)

        non_viable = [p for p in dr.person_results if not p.viable]
        if non_viable:
            names = ", ".join(p.person_name for p in non_viable)
            dr.note = f"No flight data for: {names}"

        results.append(dr)

    results.sort(key=lambda d: (
        not d.is_fully_viable,
        d.total_group_cost if d.is_fully_viable else float("inf"),
    ))
    return results
