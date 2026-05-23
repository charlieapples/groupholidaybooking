"""UK airport list used as ground-transport candidates for each person."""
from __future__ import annotations

# Major UK airports with their IATA codes.
# The optimiser will check ground travel time from each person's home to each
# of these, then filter to those within the configured max_ground_hours limit.
UK_AIRPORTS = [
    "LHR",  # London Heathrow
    "LGW",  # London Gatwick
    "STN",  # London Stansted
    "LTN",  # London Luton
    "LCY",  # London City
    "MAN",  # Manchester
    "BHX",  # Birmingham
    "EDI",  # Edinburgh
    "GLA",  # Glasgow
    "BRS",  # Bristol
    "LBA",  # Leeds Bradford
    "NCL",  # Newcastle
    "BFS",  # Belfast International
    "SOU",  # Southampton
    "EXT",  # Exeter
    "NWI",  # Norwich
    "HUY",  # Humberside
    "MME",  # Durham Tees Valley
    "ABZ",  # Aberdeen
    "INV",  # Inverness
]
