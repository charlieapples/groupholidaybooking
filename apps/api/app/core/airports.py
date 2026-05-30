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

# Approximate (lat, lon) for each UK airport. Used by the ground-transport
# haversine fallback when the Google Maps Directions API is unavailable
# (e.g. billing not enabled). Precise enough for straight-line estimates.
AIRPORT_COORDS: dict[str, tuple[float, float]] = {
    "LHR": (51.4700, -0.4543),
    "LGW": (51.1537, -0.1821),
    "STN": (51.8860, 0.2389),
    "LTN": (51.8747, -0.3683),
    "LCY": (51.5048, 0.0495),
    "MAN": (53.3537, -2.2750),
    "BHX": (52.4539, -1.7480),
    "EDI": (55.9508, -3.3615),
    "GLA": (55.8719, -4.4331),
    "BRS": (51.3827, -2.7191),
    "LBA": (53.8659, -1.6606),
    "NCL": (55.0375, -1.6917),
    "BFS": (54.6575, -6.2158),
    "SOU": (50.9503, -1.3568),
    "EXT": (50.7344, -3.4139),
    "NWI": (52.6758, 1.2828),
    "HUY": (53.5744, -0.3508),
    "MME": (54.5092, -1.4294),
    "ABZ": (57.2019, -2.1978),
    "INV": (57.5425, -4.0475),
}

# Approximate (lat, lon) for each UK airport. Used by the ground-transport
# haversine fallback when the Google Maps Directions API is unavailable
# (e.g. billing not enabled). Coordinates are airport reference points —
# precise enough for straight-line distance estimates.
AIRPORT_COORDS: dict[str, tuple[float, float]] = {
    "LHR": (51.4700, -0.4543),
    "LGW": (51.1537, -0.1821),
    "STN": (51.8860, 0.2389),
    "LTN": (51.8747, -0.3683),
    "LCY": (51.5048, 0.0495),
    "MAN": (53.3537, -2.2750),
    "BHX": (52.4539, -1.7480),
    "EDI": (55.9508, -3.3615),
    "GLA": (55.8719, -4.4331),
    "BRS": (51.3827, -2.7191),
    "LBA": (53.8659, -1.6606),
    "NCL": (55.0375, -1.6917),
    "BFS": (54.6575, -6.2158),
    "SOU": (50.9503, -1.3568),
    "EXT": (50.7344, -3.4139),
    "NWI": (52.6758, 1.2828),
    "HUY": (53.5744, -0.3508),
    "MME": (54.5092, -1.4294),
    "ABZ": (57.2019, -2.1978),
    "INV": (57.5425, -4.0475),
}
