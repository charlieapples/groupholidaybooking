"""CLI entry point."""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

from dotenv import load_dotenv
from rich.console import Console

from .config import load_config
from .optimiser import optimise
from .output import print_detail, print_summary, write_json

console = Console()


def main() -> None:
    load_dotenv()

    parser = argparse.ArgumentParser(
        prog="group-holiday",
        description="Find the cheapest group flight configuration from multiple UK origins.",
    )
    parser.add_argument("config", help="Path to YAML config file")
    parser.add_argument(
        "--detail",
        metavar="DEST",
        help="Print per-person breakdown for a specific destination (e.g. BCN)",
    )
    parser.add_argument(
        "--output",
        default="results.json",
        help="Path for JSON output file (default: results.json)",
    )
    args = parser.parse_args()

    config_path = Path(args.config)
    if not config_path.exists():
        console.print(f"[red]Config file not found: {config_path}[/red]")
        sys.exit(1)

    console.print(f"[bold]Loading config:[/bold] {config_path}")
    config = load_config(config_path)
    console.print(
        f"  {len(config.people)} people, {len(config.destinations)} destinations, "
        f"window {config.date_window.earliest_outbound} to {config.date_window.latest_inbound}"
    )
    console.print("\n[bold]Running optimiser…[/bold] (first run may take a while — results are cached)\n")

    results = optimise(config)
    print_summary(results)

    if args.detail:
        dest = args.detail.upper()
        match = next((r for r in results if r.destination.upper() == dest), None)
        if match:
            print_detail(match)
        else:
            console.print(f"[yellow]Destination '{dest}' not found in results.[/yellow]")

    write_json(results, args.output)


if __name__ == "__main__":
    main()
