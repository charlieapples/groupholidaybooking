"""Rough cost estimates per destination — for giving voters a ballpark only.

Two numbers per destination:
  * daily_living_gbp  — bare-minimum daily spend per person: budget/shared
                        accommodation + food + local transport. NO activities.
  * flight_return_gbp — rough return flight from the UK, per person.

These are deliberately coarse REGION-level estimates (with a few country
overrides) so we don't need a paid cost-of-living API. They're labelled as
"rough" everywhere in the UI. If we later want precision we can swap in a real
cost-of-living index API behind the same `cost_estimate()` function.
"""
from __future__ import annotations

from typing import Optional, TypedDict

# ── Region buckets ────────────────────────────────────────────────────────────
# Each region maps to (living_low, living_high, flight_low, flight_high) in GBP.
# living_* = per person per day (budget bed + food + local transport, no fun).
# flight_* = per person return from the UK.

_REGION_BANDS: dict[str, tuple[int, int, int, int]] = {
    "iberia":        (45, 75, 45, 140),    # Spain, Portugal, Canaries, Madeira
    "france":        (55, 90, 45, 140),
    "italy":         (50, 85, 50, 150),
    "benelux_de_at": (55, 95, 45, 140),    # Benelux, Germany, Austria
    "nordic":        (70, 120, 60, 170),
    "iceland":       (90, 150, 70, 220),
    "swiss":         (95, 150, 60, 160),
    "ireland_uk":    (60, 100, 30, 110),
    "east_europe":   (30, 55, 40, 140),
    "greece_med":    (40, 70, 50, 160),    # Greece, Cyprus, Malta, Croatia
    "turkey":        (25, 50, 60, 170),
    "n_africa":      (25, 55, 50, 160),    # Morocco, Tunisia, Egypt
    "gulf":          (60, 130, 250, 560),  # UAE, Qatar, Saudi
    "levant":        (45, 90, 200, 460),   # Jordan, Lebanon, Israel
    "se_asia":       (20, 45, 450, 820),
    "e_asia":        (55, 115, 500, 880),
    "s_asia":        (20, 45, 420, 780),
    "maldives":      (150, 420, 600, 1050),
    "n_america":     (80, 170, 350, 720),
    "mexico_carib":  (45, 100, 400, 780),
    "s_america":     (30, 75, 500, 950),
    "africa_sub":    (40, 95, 450, 900),
    "indian_ocean":  (110, 320, 600, 1050),
    "oceania":       (70, 145, 800, 1350),
}

# ── IATA → region ─────────────────────────────────────────────────────────────

_IBERIA = {
    "BCN", "MAD", "AGP", "PMI", "IBZ", "ALC", "SVQ", "VLC", "BIO",
    "LIS", "FAO", "OPO",
    "TFS", "TFN", "LPA", "ACE", "FUE", "FNC",  # Canaries + Madeira
}
_FRANCE = {"CDG", "ORY", "NCE", "TLS", "BOD", "MRS", "LYS", "BIQ"}
_ITALY = {"FCO", "MXP", "VCE", "NAP", "TRN", "BLQ", "FLR", "PSA", "CTA", "PMO", "CAG", "BRI"}
_BENELUX_DE_AT = {"AMS", "MUC", "BER", "HAM", "VIE"}
_NORDIC = {"CPH", "ARN", "OSL", "HEL"}
_ICELAND = {"REK", "KEF"}
_SWISS = {"GVA", "ZRH"}
_IRELAND_UK = {"DUB"}
_EAST_EUROPE = {
    "PRG", "BUD", "KRK", "WAW", "GDN", "TLL", "RIX", "VNO", "BEG", "SOF",
    "OTP", "ZAG", "LJU", "BTS", "TIA", "SKP", "PRN", "SJJ", "KIV",
}
_GREECE_MED = {
    "ATH", "SKG", "HER", "RHO", "CFU", "JMK", "JTR",   # Greece
    "MLA", "LCA", "PFO",                                 # Malta, Cyprus
    "ZAD", "SPU", "DBV",                                 # Croatia
}
_TURKEY = {"IST", "SAW", "AYT", "ESB"}
_N_AFRICA = {"AGA", "RAK", "CMN", "TUN", "CAI", "HRG", "SSH"}
_GULF = {"DXB", "AUH", "DOH", "JED", "RUH"}
_LEVANT = {"AMM", "BEY", "TLV"}
_SE_ASIA = {"BKK", "DMK", "HKT", "CNX", "KUL", "DPS", "CGK", "MNL", "HAN", "SGN"}
_E_ASIA = {"HKG", "TPE", "ICN", "NRT", "HND", "KIX", "PEK", "PVG", "CTU", "SIN"}
_S_ASIA = {"DEL", "BOM", "GOI", "CMB", "KTM"}
_MALDIVES = {"MLE"}
_N_AMERICA = {
    "JFK", "LGA", "EWR", "BOS", "PHL", "DCA", "MIA", "FLL", "MCO", "ATL",
    "ORD", "MSP", "DEN", "LAX", "SFO", "SAN", "LAS", "SEA", "PDX",
    "YYZ", "YUL", "YVR",
}
_MEXICO_CARIB = {
    "MEX", "CUN", "SJD", "PVR", "PTY", "SJO", "HAV", "NAS", "MBJ",
    "PUJ", "SDQ", "BGI", "SXM",
}
_S_AMERICA = {"GRU", "GIG", "EZE", "SCL", "LIM", "BOG", "MVD", "UIO", "CUZ"}
_AFRICA_SUB = {"JNB", "CPT", "NBO", "ZNZ", "ADD", "LOS", "DAR"}
_INDIAN_OCEAN = {"MRU", "SEZ"}
_OCEANIA = {"SYD", "MEL", "BNE", "PER", "AKL", "WLG", "NAN", "PPT"}

_REGION_BY_IATA: dict[str, str] = {}
for _region, _codes in [
    ("iberia", _IBERIA), ("france", _FRANCE), ("italy", _ITALY),
    ("benelux_de_at", _BENELUX_DE_AT), ("nordic", _NORDIC), ("iceland", _ICELAND),
    ("swiss", _SWISS), ("ireland_uk", _IRELAND_UK), ("east_europe", _EAST_EUROPE),
    ("greece_med", _GREECE_MED), ("turkey", _TURKEY), ("n_africa", _N_AFRICA),
    ("gulf", _GULF), ("levant", _LEVANT), ("se_asia", _SE_ASIA), ("e_asia", _E_ASIA),
    ("s_asia", _S_ASIA), ("maldives", _MALDIVES), ("n_america", _N_AMERICA),
    ("mexico_carib", _MEXICO_CARIB), ("s_america", _S_AMERICA),
    ("africa_sub", _AFRICA_SUB), ("indian_ocean", _INDIAN_OCEAN), ("oceania", _OCEANIA),
]:
    for _c in _codes:
        _REGION_BY_IATA[_c] = _region


class CostEstimate(TypedDict):
    daily_living_low_gbp: int
    daily_living_high_gbp: int
    daily_living_gbp: int        # midpoint, the headline number
    flight_low_gbp: int
    flight_high_gbp: int
    flight_return_gbp: int       # midpoint, the headline number
    region: str
    is_estimate: bool


def cost_estimate(iata: Optional[str]) -> Optional[CostEstimate]:
    """Return a rough cost estimate for a destination IATA, or None if unknown."""
    if not iata:
        return None
    region = _REGION_BY_IATA.get(iata.upper())
    if region is None:
        return None
    ll, lh, fl, fh = _REGION_BANDS[region]
    return CostEstimate(
        daily_living_low_gbp=ll,
        daily_living_high_gbp=lh,
        daily_living_gbp=round((ll + lh) / 2),
        flight_low_gbp=fl,
        flight_high_gbp=fh,
        flight_return_gbp=round((fl + fh) / 2),
        region=region,
        is_estimate=True,
    )
