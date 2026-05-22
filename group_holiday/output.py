"""Rich table output and JSON result writing."""
from __future__ import annotations

import json
from datetime import date
from pathlib import Path
from typing import Any

from rich.console import Console
from rich.table import Table
from rich import box

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
    table.add_column("Group Total", justify="right", style="green")
    table.add_column("Avg / person", justify="right")
    table.add_column("Max / person", justify="right")
    table.add_column("Fairness", justify="right")
    table.add_column("Notes", style="dim")

    for rank, dr in enumerate(results, 1):
        viable_all = all(p.viable for p in dr.person_results)
        group_total = _fmt_cost(dr.total_group_cost) if viable_all else "—"
        avg = _fmt_cost(dr.avg_individual_cost) if viable_all else "—"
        mx = _fmt_cost(dr.max_individual_cost) if viable_all else "—"
        fairness = f"{dr.fairness_ratio:.2f}x" if viable_all else "—"
        style = "" if viable_all else "dim red"
        table.add_row(
            str(rank), dr.destination, group_total, avg, mx, fairness, dr.note,
            style=style,
        )

    console.print(table)


def print_detail(dr: DestinationResult) -> None:
    table = Table(
        title=f"Per-person breakdown — {dr.destination}",
        box=box.SIMPLE_HEAD,
    )
    table.add_column("Person", style="bold")
    table.add_column("Airport")
    table.add_column("Ground", justify="right")
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
                _fmt_cost(pr.outbound_cost),
                _date_str(pr.outbound.departure_date if pr.outbound else None),
                _fmt_cost(pr.inbound_cost),
                _date_str(pr.inbound.departure_date if pr.inbound else None),
                _fmt_cost(pr.total_cost_gbp),
                pr.note,
            )
        else:
            table.add_row(
                pr.person_name, "—", "—", "—", "—", "—", "—", "—", pr.note,
                style="dim red",
            )

    console.print(table)


def write_json(results: list[DestinationResult], path: str | Path) -> None:
    def _serialise(dr: DestinationResult) -> dict[str, Any]:
        return {
            "destination": dr.destination,
            "viable": all(p.viable for p in dr.person_results),
            "total_group_cost_gbp": dr.total_group_cost,
            "avg_per_person_gbp": dr.avg_individual_cost,
            "max_per_person_gbp": dr.max_individual_cost,
            "fairness_ratio": dr.fairness_ratio,
            "note": dr.note,
            "people": [
                {
                    "name": p.person_name,
                    "viable": p.viable,
                    "chosen_airport": p.chosen_airport,
                    "ground_cost_gbp": p.ground_cost,
                    "ground_duration_hours": p.ground_leg.duration_hours if p.ground_leg else None,
                    "outbound_cost_gbp": p.outbound_cost,
                    "outbound_date": str(p.outbound.departure_date) if p.outbound else None,
                    "outbound_airline": p.outbound.airline if p.outbound else None,
                    "inbound_cost_gbp": p.inbound_cost,
                    "inbound_date": str(p.inbound.departure_date) if p.inbound else None,
                    "inbound_airline": p.inbound.airline if p.inbound else None,
                    "total_cost_gbp": p.total_cost_gbp,
                    "note": p.note,
                }
                for p in dr.person_results
            ],
        }

    data = [_serialise(dr) for dr in results]
    Path(path).write_text(json.dumps(data, indent=2), encoding="utf-8")
    console.print(f"\n[dim]Results written to {path}[/dim]")
