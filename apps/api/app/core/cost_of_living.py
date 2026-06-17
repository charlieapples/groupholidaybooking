"""Cost estimates per destination — for ballpark guidance when voting.

Two numbers per destination:
  * daily_living_gbp  — bare-minimum daily spend per person: budget/shared
                        accommodation + food + local transport. NO activities.
  * flight_return_gbp — rough return flight from the UK, per person. (Note: the
                        destinations page now shows LIVE flight prices from
                        Travelpayouts on top of this; this band is the fallback.)

DATA SOURCE
-----------
daily_living is a COUNTRY-level dataset grounded in real Numbeo "bare-minimum"
figures (budget bed + cheap food + local transport, no activities), converted to
GBP. Cost-of-living drifts slowly year to year, so a periodically-refreshed
dataset is accurate and avoids depending on a fragile free API. Last refreshed:
2026-06. To refresh: pull Numbeo's per-city/country indices and update
_DAILY_LIVING_GBP.

PLUGGING IN A LIVE API (optional)
---------------------------------
If you later want a live cost-of-living API (e.g. an official Numbeo key, or a
RapidAPI cost-of-living wrapper), implement `_api_daily_living(iata)` to fetch +
cache from it. It already takes priority over the static dataset in
`cost_estimate()`, so no other code changes are needed. Set the API key via env
(e.g. COST_OF_LIVING_API_KEY) and read it there.
"""
from __future__ import annotations

import os
from typing import Optional, TypedDict

# ── Flight bands (fallback only — live fares come from Travelpayouts) ──────────
# region -> (flight_low, flight_high) GBP return from the UK.
_REGION_FLIGHT_BANDS: dict[str, tuple[int, int]] = {
    "iberia": (45, 140), "france": (45, 140), "italy": (50, 150),
    "benelux_de_at": (45, 140), "nordic": (60, 170), "iceland": (70, 220),
    "swiss": (60, 160), "ireland_uk": (30, 110), "east_europe": (40, 140),
    "greece_med": (50, 160), "turkey": (60, 170), "n_africa": (50, 160),
    "gulf": (250, 560), "levant": (200, 460), "se_asia": (450, 820),
    "e_asia": (500, 880), "s_asia": (420, 780), "maldives": (600, 1050),
    "n_america": (350, 720), "mexico_carib": (400, 780), "s_america": (500, 950),
    "africa_sub": (450, 900), "indian_ocean": (600, 1050), "oceania": (800, 1350),
}

# ── Country -> bare-minimum daily living (GBP), Numbeo-grounded ────────────────
# budget/shared bed + cheap food (groceries + a cheap meal) + local transport.
# No activities, no mid-range hotels.
_DAILY_LIVING_GBP: dict[str, int] = {
    # Western Europe
    "Spain": 52, "Portugal": 48, "France": 68, "Italy": 60, "Netherlands": 70,
    "Germany": 60, "Austria": 64, "Switzerland": 110, "Ireland": 72,
    # Nordics
    "Denmark": 85, "Sweden": 76, "Norway": 95, "Finland": 78, "Iceland": 100,
    # Central / Eastern Europe
    "Czechia": 45, "Hungary": 42, "Poland": 42, "Estonia": 46, "Latvia": 44,
    "Lithuania": 44, "Serbia": 35, "Bulgaria": 35, "Romania": 38, "Croatia": 52,
    "Slovenia": 52, "Slovakia": 44, "Albania": 33, "North Macedonia": 33,
    "Kosovo": 32, "Bosnia": 34, "Moldova": 33,
    # Greece / Med
    "Greece": 50, "Malta": 55, "Cyprus": 52,
    # North Africa / Turkey
    "Turkey": 35, "Morocco": 32, "Tunisia": 30, "Egypt": 30,
    # Middle East
    "UAE": 75, "Qatar": 75, "Saudi Arabia": 58, "Jordan": 50, "Lebanon": 50,
    "Israel": 85,
    # Asia
    "Thailand": 28, "Singapore": 75, "Malaysia": 30, "Indonesia": 28,
    "Philippines": 30, "Vietnam": 26, "Hong Kong": 72, "Taiwan": 45,
    "South Korea": 55, "Japan": 60, "China": 45, "India": 24, "Sri Lanka": 26,
    "Maldives": 180, "Nepal": 24,
    # Americas
    "USA": 110, "Canada": 88, "Mexico": 45, "Panama": 55, "Costa Rica": 58,
    "Cuba": 45, "Bahamas": 100, "Jamaica": 60, "Dominican Republic": 50,
    "Barbados": 90, "Sint Maarten": 88, "Brazil": 46, "Argentina": 42,
    "Chile": 52, "Peru": 36, "Colombia": 36, "Uruguay": 52, "Ecuador": 36,
    # Africa (sub-Saharan) + Indian Ocean
    "South Africa": 45, "Kenya": 46, "Tanzania": 50, "Ethiopia": 35,
    "Nigeria": 46, "Mauritius": 70, "Seychelles": 120,
    # Oceania
    "Australia": 95, "New Zealand": 85, "Fiji": 60, "French Polynesia": 120,
}

# ── IATA -> country / region ──────────────────────────────────────────────────
# Each tuple: set of IATA codes, country (for living), region (for flight band).
_GROUPS: list[tuple[set[str], str, str]] = [
    ({"BCN", "MAD", "AGP", "PMI", "IBZ", "ALC", "SVQ", "VLC", "BIO",
      "TFS", "TFN", "LPA", "ACE", "FUE"}, "Spain", "iberia"),
    ({"LIS", "FAO", "OPO", "FNC"}, "Portugal", "iberia"),
    ({"CDG", "ORY", "NCE", "TLS", "BOD", "MRS", "LYS", "BIQ"}, "France", "france"),
    ({"FCO", "MXP", "VCE", "NAP", "TRN", "BLQ", "FLR", "PSA", "CTA", "PMO", "CAG", "BRI"},
     "Italy", "italy"),
    ({"AMS"}, "Netherlands", "benelux_de_at"),
    ({"MUC", "BER", "HAM"}, "Germany", "benelux_de_at"),
    ({"VIE"}, "Austria", "benelux_de_at"),
    ({"GVA", "ZRH"}, "Switzerland", "swiss"),
    ({"DUB"}, "Ireland", "ireland_uk"),
    ({"CPH"}, "Denmark", "nordic"),
    ({"ARN"}, "Sweden", "nordic"),
    ({"OSL"}, "Norway", "nordic"),
    ({"HEL"}, "Finland", "nordic"),
    ({"REK", "KEF"}, "Iceland", "iceland"),
    ({"PRG"}, "Czechia", "east_europe"),
    ({"BUD"}, "Hungary", "east_europe"),
    ({"KRK", "WAW", "GDN"}, "Poland", "east_europe"),
    ({"TLL"}, "Estonia", "east_europe"),
    ({"RIX"}, "Latvia", "east_europe"),
    ({"VNO"}, "Lithuania", "east_europe"),
    ({"BEG"}, "Serbia", "east_europe"),
    ({"SOF"}, "Bulgaria", "east_europe"),
    ({"OTP"}, "Romania", "east_europe"),
    ({"ZAG", "ZAD", "SPU", "DBV"}, "Croatia", "greece_med"),
    ({"LJU"}, "Slovenia", "east_europe"),
    ({"BTS"}, "Slovakia", "east_europe"),
    ({"TIA"}, "Albania", "east_europe"),
    ({"SKP"}, "North Macedonia", "east_europe"),
    ({"PRN"}, "Kosovo", "east_europe"),
    ({"SJJ"}, "Bosnia", "east_europe"),
    ({"KIV"}, "Moldova", "east_europe"),
    ({"ATH", "SKG", "HER", "RHO", "CFU", "JMK", "JTR"}, "Greece", "greece_med"),
    ({"MLA"}, "Malta", "greece_med"),
    ({"LCA", "PFO"}, "Cyprus", "greece_med"),
    ({"IST", "SAW", "AYT", "ESB"}, "Turkey", "turkey"),
    ({"AGA", "RAK", "CMN"}, "Morocco", "n_africa"),
    ({"TUN"}, "Tunisia", "n_africa"),
    ({"CAI", "HRG", "SSH"}, "Egypt", "n_africa"),
    ({"DXB", "AUH"}, "UAE", "gulf"),
    ({"DOH"}, "Qatar", "gulf"),
    ({"JED", "RUH"}, "Saudi Arabia", "gulf"),
    ({"AMM"}, "Jordan", "levant"),
    ({"BEY"}, "Lebanon", "levant"),
    ({"TLV"}, "Israel", "levant"),
    ({"BKK", "DMK", "HKT", "CNX"}, "Thailand", "se_asia"),
    ({"SIN"}, "Singapore", "e_asia"),
    ({"KUL"}, "Malaysia", "se_asia"),
    ({"DPS", "CGK"}, "Indonesia", "se_asia"),
    ({"MNL"}, "Philippines", "se_asia"),
    ({"HAN", "SGN"}, "Vietnam", "se_asia"),
    ({"HKG"}, "Hong Kong", "e_asia"),
    ({"TPE"}, "Taiwan", "e_asia"),
    ({"ICN"}, "South Korea", "e_asia"),
    ({"NRT", "HND", "KIX"}, "Japan", "e_asia"),
    ({"PEK", "PVG", "CTU"}, "China", "e_asia"),
    ({"DEL", "BOM", "GOI"}, "India", "s_asia"),
    ({"CMB"}, "Sri Lanka", "s_asia"),
    ({"MLE"}, "Maldives", "maldives"),
    ({"KTM"}, "Nepal", "s_asia"),
    ({"JFK", "LGA", "EWR", "BOS", "PHL", "DCA", "MIA", "FLL", "MCO", "ATL",
      "ORD", "MSP", "DEN", "LAX", "SFO", "SAN", "LAS", "SEA", "PDX"}, "USA", "n_america"),
    ({"YYZ", "YUL", "YVR"}, "Canada", "n_america"),
    ({"MEX", "CUN", "SJD", "PVR"}, "Mexico", "mexico_carib"),
    ({"PTY"}, "Panama", "mexico_carib"),
    ({"SJO"}, "Costa Rica", "mexico_carib"),
    ({"HAV"}, "Cuba", "mexico_carib"),
    ({"NAS"}, "Bahamas", "mexico_carib"),
    ({"MBJ"}, "Jamaica", "mexico_carib"),
    ({"PUJ", "SDQ"}, "Dominican Republic", "mexico_carib"),
    ({"BGI"}, "Barbados", "mexico_carib"),
    ({"SXM"}, "Sint Maarten", "mexico_carib"),
    ({"GRU", "GIG"}, "Brazil", "s_america"),
    ({"EZE"}, "Argentina", "s_america"),
    ({"SCL"}, "Chile", "s_america"),
    ({"LIM", "CUZ"}, "Peru", "s_america"),
    ({"BOG"}, "Colombia", "s_america"),
    ({"MVD"}, "Uruguay", "s_america"),
    ({"UIO"}, "Ecuador", "s_america"),
    ({"JNB", "CPT"}, "South Africa", "africa_sub"),
    ({"NBO"}, "Kenya", "africa_sub"),
    ({"ZNZ", "DAR"}, "Tanzania", "africa_sub"),
    ({"ADD"}, "Ethiopia", "africa_sub"),
    ({"LOS"}, "Nigeria", "africa_sub"),
    ({"MRU"}, "Mauritius", "indian_ocean"),
    ({"SEZ"}, "Seychelles", "indian_ocean"),
    ({"SYD", "MEL", "BNE", "PER"}, "Australia", "oceania"),
    ({"AKL", "WLG"}, "New Zealand", "oceania"),
    ({"NAN"}, "Fiji", "oceania"),
    ({"PPT"}, "French Polynesia", "oceania"),
]

_COUNTRY_BY_IATA: dict[str, str] = {}
_REGION_BY_IATA: dict[str, str] = {}
for _codes, _country, _region in _GROUPS:
    for _c in _codes:
        _COUNTRY_BY_IATA[_c] = _country
        _REGION_BY_IATA[_c] = _region


class CostEstimate(TypedDict):
    daily_living_low_gbp: int
    daily_living_high_gbp: int
    daily_living_gbp: int        # headline number
    flight_low_gbp: int
    flight_high_gbp: int
    flight_return_gbp: int       # headline number (fallback; live fares preferred)
    country: Optional[str]
    region: str
    is_estimate: bool
    source: str                  # "numbeo-dataset" | "live-api"


def _api_daily_living(iata: str) -> Optional[int]:
    """Optional live cost-of-living API hook. Returns a daily bare-minimum GBP
    figure for the destination, or None if no API is configured / it fails.

    To enable: set COST_OF_LIVING_API_KEY and implement the fetch below (e.g. a
    RapidAPI cost-of-living wrapper or the official Numbeo API), caching results.
    Returning a value here automatically overrides the static dataset.
    """
    if not os.getenv("COST_OF_LIVING_API_KEY"):
        return None
    # TODO: implement live fetch + caching for your chosen provider.
    return None


def cost_estimate(iata: Optional[str]) -> Optional[CostEstimate]:
    """Return a cost estimate for a destination IATA, or None if unknown."""
    if not iata:
        return None
    code = iata.upper()
    region = _REGION_BY_IATA.get(code)
    if region is None:
        return None

    country = _COUNTRY_BY_IATA.get(code)

    # Daily living: live API first, then the Numbeo-grounded dataset.
    source = "numbeo-dataset"
    daily = _api_daily_living(code)
    if daily is not None:
        source = "live-api"
    elif country is not None:
        daily = _DAILY_LIVING_GBP.get(country)
    if daily is None:
        return None

    # Tighter band than before (±~15%) to reduce the uncertainty spread.
    daily_low = round(daily * 0.85)
    daily_high = round(daily * 1.15)

    fl, fh = _REGION_FLIGHT_BANDS[region]
    return CostEstimate(
        daily_living_low_gbp=daily_low,
        daily_living_high_gbp=daily_high,
        daily_living_gbp=daily,
        flight_low_gbp=fl,
        flight_high_gbp=fh,
        flight_return_gbp=round((fl + fh) / 2),
        country=country,
        region=region,
        is_estimate=True,
        source=source,
    )
