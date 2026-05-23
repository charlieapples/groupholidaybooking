"""Lookup tables for destination IATA codes and display names.

Single source of truth used by both the CLI output and the Streamlit app.
"""
from __future__ import annotations

# IATA airport code → display name (city, country implied)
DEST_NAMES: dict[str, str] = {
    # Western Europe
    "AMS": "Amsterdam",
    "BCN": "Barcelona",
    "DUB": "Dublin",
    "LIS": "Lisbon",
    "FCO": "Rome",
    "CDG": "Paris",
    "ORY": "Paris-Orly",
    "PMI": "Palma",
    "AGP": "Malaga",
    "FAO": "Faro",
    "OPO": "Porto",
    "NCE": "Nice",
    "MAD": "Madrid",
    "MXP": "Milan",
    "VCE": "Venice",
    "NAP": "Naples",
    "MLA": "Malta",
    "IBZ": "Ibiza",
    "ALC": "Alicante",
    "GVA": "Geneva",
    "ZRH": "Zurich",
    "MUC": "Munich",
    "BER": "Berlin",
    "HAM": "Hamburg",
    "CPH": "Copenhagen",
    "ARN": "Stockholm",
    "OSL": "Oslo",
    "HEL": "Helsinki",
    # Central / Eastern Europe
    "PRG": "Prague",
    "VIE": "Vienna",
    "BUD": "Budapest",
    "KRK": "Krakow",
    "WAW": "Warsaw",
    "GDN": "Gdansk",
    "TLL": "Tallinn",
    "RIX": "Riga",
    "VNO": "Vilnius",
    "BEG": "Belgrade",
    "SOF": "Sofia",
    "OTP": "Bucharest",
    "ZAG": "Zagreb",
    # Greece / Med islands
    "ATH": "Athens",
    "SKG": "Thessaloniki",
    "HER": "Heraklion",
    "RHO": "Rhodes",
    "CFU": "Corfu",
    "JMK": "Mykonos",
    "JTR": "Santorini",
    # Croatia
    "ZAD": "Zadar",
    "SPU": "Split",
    "DBV": "Dubrovnik",
    # Canaries / Atlantic
    "TFS": "Tenerife (South)",
    "TFN": "Tenerife (North)",
    "LPA": "Gran Canaria",
    "ACE": "Lanzarote",
    "FUE": "Fuerteventura",
    "FNC": "Madeira",
    # Beyond Europe (sometimes cheap)
    "IST": "Istanbul",
    "JFK": "New York",
    "DXB": "Dubai",
    "MRU": "Mauritius",
    "MBJ": "Montego Bay",
}


# Subset to surface in the Streamlit "popular destinations" multiselect.
POPULAR_LABELS: dict[str, str] = {
    f"{name} ({code})": code
    for code, name in [
        ("AMS", "Amsterdam"), ("BCN", "Barcelona"), ("DUB", "Dublin"),
        ("LIS", "Lisbon"),    ("PRG", "Prague"),    ("FCO", "Rome"),
        ("CDG", "Paris"),     ("PMI", "Palma"),     ("ATH", "Athens"),
        ("AGP", "Malaga"),    ("BUD", "Budapest"),  ("KRK", "Krakow"),
        ("FAO", "Faro"),      ("TFS", "Tenerife (South)"),
        ("VIE", "Vienna"),    ("NCE", "Nice"),      ("OPO", "Porto"),
        ("IBZ", "Ibiza"),     ("DBV", "Dubrovnik"), ("SPU", "Split"),
        ("MAD", "Madrid"),    ("CPH", "Copenhagen"),
    ]
}


def label(code: str, style: str = "name_and_code") -> str:
    """Format an IATA code for display.

    Styles: "code" | "name" | "name_and_code"
    Falls back gracefully if name unknown.
    """
    name = DEST_NAMES.get(code)
    if style == "code" or not name:
        return code
    if style == "name":
        return name
    return f"{name} ({code})"
