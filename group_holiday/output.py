"""Rich table output and JSON result writing (used by the CLI)."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from rich import box
from rich.console import Console
from rich.table import Table

from .destinations import label
from .optimiser import DestinationResult

console = Console()


def _fmt_cost(v: float) -> str:
    return f"£{v:,.2f}"


def _date_str(d: date | None) -> str:
    return d.strftime("%d %b") if d else "—"


def print_summary(results: list[DestinationResult]) -> None:
    table = Table(
        title="Group Holiday — Destination Ranking",
        box=box.ROUNDED,
        show_lines=True,
    )
    table.add_column("#", style="dim", width=3)
    table.add_column("Destination", style="bold cyan")
    table.add_column("Group total", justify="right", style="green")
    table.add_column("Avg / person", justify="right")
    table.add_column("Max / person", justify="right")
    table.add_column("Fairness", justify="right")
    table.add_column("Trip dates")
    table.add_column("Notes", style="dim")

    for rank, dr in enumerate(results, 1):
        dest_label = label(dr.destination, "name_and_code")
        if dr.is_fully_viable:
            group_total = _fmt_cost(dr.total_group_money_cost)
            avg = _fmt_cost(dr.avg_individual_cost)
            mx = _fmt_cost(dr.max_individual_cost)
            fairness = f"{dr.fairness_ratio:.2f}x"
            if dr.shared_out_date and dr.shared_return_date:
                trip = f"{dr.shared_out_date:%d %b} → {dr.shared_return_date:%d %b}"
            elif dr.date_spread_days:
                trip = f"spread {dr.date_spread_days}d"
            else:
                trip = "—"
            row_style = ""
        else:
            group_total = avg = mx = fairness = trip = "—"
            row_style = "dim red"

        table.add_row(
            str(rank), dest_label, group_total, avg, mx, fairness, trip, dr.note,
            style=row_style,
        )

    console.print(table)


def print_detail(dr: DestinationResult) -> None:
    title = f"Per-person breakdown — {label(dr.destination, 'name_and_code')}"
    if dr.shared_out_date and dr.shared_return_date:
        title += f"  ({dr.shared_out_date:%d %b} → {dr.shared_return_date:%d %b})"

    table = Table(title=title, box=box.SIMPLE_HEAD)
    table.add_column("Person", style="bold")
    table.add_column("Airport")
    table.add_column("Ground", justify="right")
    table.add_column("Travel", justify="right")
    table.add_column("Outbound", justify="right")
    table.add_column("Out date")
    table.add_column("Inbound", justify="right")
    table.add_column("In date")
    table.add_column("Total", justify="right", style="green")
    table.add_column("Note", style="dim")

    for pr in dr.person_results:
        if pr.viable:
            table.add_row(
                pr.person_name,
                pr.chosen_airport or "—",
                _fmt_cost(pr.ground_cost),
                f"{pr.ground_hours:.1f}h",
                _fmt_cost(pr.outbound_cost),
                _date_str(pr.out_date),
                _fmt_cost(pr.inbound_cost),
                _date_str(pr.return_date),
                _fmt_cost(pr.flight_plus_ground_gbp),
                pr.note,
            )
        else:
            table.add_row(
                pr.person_name, "—", "—", "—", "—", "—", "—", "—", "—", pr.note,
                style="dim red",
            )

    console.print(table)


def write_json(results: list[DestinationResult], path: str | Path) -> None:
    def _serialise(dr: DestinationResult) -> dict[str, Any]:
        return {
            "destination": dr.destination,
            "destination_name": label(dr.destination, "name"),
            "fully_viable": dr.is_fully_viable,
            "group_total_money_gbp": dr.total_group_money_cost,
            "group_total_inc_time_gbp": dr.total_group_cost,
            "avg_per_person_gbp": dr.avg_individual_cost,
            "max_per_person_gbp": dr.max_individual_cost,
            "fairness_ratio": dr.fairness_ratio,
            "shared_out_date": str(dr.shared_out_date) if dr.shared_out_date else None,
            "shared_return_date": str(dr.shared_return_date) if dr.shared_return_date else None,
            "date_spread_days": dr.date_spread_days,
            "note": dr.note,
            "people": [
                {
                    "name": p.person_name,
                    "viable": p.viable,
                    "chosen_airport": p.chosen_airport,
                    "ground_cost_gbp": p.ground_cost,
                    "ground_duration_hours": p.ground_hours,
                    "outbound_cost_gbp": p.outbound_cost,
                    "outbound_date": str(p.out_date) if p.out_date else None,
                    "outbound_airline": p.outbound.airline if p.outbound else None,
                    "inbound_cost_gbp": p.inbound_cost,
                    "inbound_date": str(p.return_date) if p.return_date else None,
                    "inbound_airline": p.inbound.airline if p.inbound else None,
                    "total_money_gbp": p.flight_plus_ground_gbp,
                    "total_inc_time_gbp": p.total_cost_gbp,
                    "booking_link": p.outbound.deep_link if p.outbound else None,
                    "note": p.note,
                }
                for p in dr.person_results
            ],
        }

    data = [_serialise(dr) for dr in results]
    Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
    console.print(f"\n[dim]Results written to {path}[/dim]")
