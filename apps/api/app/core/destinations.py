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
    # More Europe
    "REK": "Reykjavik",
    "KEF": "Reykjavik (Keflavik)",
    "LJU": "Ljubljana",
    "BTS": "Bratislava",
    "TIA": "Tirana",
    "SKP": "Skopje",
    "PRN": "Pristina",
    "SJJ": "Sarajevo",
    "KIV": "Chisinau",
    "LCA": "Larnaca",
    "PFO": "Paphos",
    "BIO": "Bilbao",
    "SVQ": "Seville",
    "VLC": "Valencia",
    "TLS": "Toulouse",
    "BOD": "Bordeaux",
    "MRS": "Marseille",
    "LYS": "Lyon",
    "BIQ": "Biarritz",
    "TRN": "Turin",
    "BLQ": "Bologna",
    "FLR": "Florence",
    "PSA": "Pisa",
    "CTA": "Catania",
    "PMO": "Palermo",
    "CAG": "Cagliari",
    "BRI": "Bari",
    "AGA": "Agadir",
    "RAK": "Marrakech",
    "CMN": "Casablanca",
    # Middle East
    "IST": "Istanbul",
    "SAW": "Istanbul (Sabiha Gokcen)",
    "AYT": "Antalya",
    "ESB": "Ankara",
    "DXB": "Dubai",
    "AUH": "Abu Dhabi",
    "DOH": "Doha",
    "AMM": "Amman",
    "TLV": "Tel Aviv",
    "BEY": "Beirut",
    "JED": "Jeddah",
    "RUH": "Riyadh",
    # Asia
    "BKK": "Bangkok",
    "DMK": "Bangkok (Don Mueang)",
    "HKT": "Phuket",
    "CNX": "Chiang Mai",
    "SIN": "Singapore",
    "KUL": "Kuala Lumpur",
    "DPS": "Bali (Denpasar)",
    "CGK": "Jakarta",
    "MNL": "Manila",
    "HAN": "Hanoi",
    "SGN": "Ho Chi Minh City",
    "HKG": "Hong Kong",
    "TPE": "Taipei",
    "ICN": "Seoul",
    "NRT": "Tokyo (Narita)",
    "HND": "Tokyo (Haneda)",
    "KIX": "Osaka",
    "PEK": "Beijing",
    "PVG": "Shanghai",
    "CTU": "Chengdu",
    "DEL": "Delhi",
    "BOM": "Mumbai",
    "GOI": "Goa",
    "CMB": "Colombo",
    "MLE": "Maldives (Male)",
    "KTM": "Kathmandu",
    # North America
    "JFK": "New York (JFK)",
    "LGA": "New York (LaGuardia)",
    "EWR": "New York (Newark)",
    "BOS": "Boston",
    "PHL": "Philadelphia",
    "DCA": "Washington DC",
    "MIA": "Miami",
    "FLL": "Fort Lauderdale",
    "MCO": "Orlando",
    "ATL": "Atlanta",
    "ORD": "Chicago",
    "MSP": "Minneapolis",
    "DEN": "Denver",
    "LAX": "Los Angeles",
    "SFO": "San Francisco",
    "SAN": "San Diego",
    "LAS": "Las Vegas",
    "SEA": "Seattle",
    "PDX": "Portland",
    "YYZ": "Toronto",
    "YUL": "Montreal",
    "YVR": "Vancouver",
    "MEX": "Mexico City",
    "CUN": "Cancun",
    "SJD": "Los Cabos",
    "PVR": "Puerto Vallarta",
    # Central America / Caribbean
    "PTY": "Panama City",
    "SJO": "San Jose (CR)",
    "HAV": "Havana",
    "NAS": "Nassau",
    "MBJ": "Montego Bay",
    "PUJ": "Punta Cana",
    "SDQ": "Santo Domingo",
    "BGI": "Barbados",
    "SXM": "St Maarten",
    # South America
    "GRU": "Sao Paulo",
    "GIG": "Rio de Janeiro",
    "EZE": "Buenos Aires",
    "SCL": "Santiago",
    "LIM": "Lima",
    "BOG": "Bogota",
    "MVD": "Montevideo",
    "UIO": "Quito",
    "CUZ": "Cusco",
    # Africa
    "CAI": "Cairo",
    "HRG": "Hurghada",
    "SSH": "Sharm El Sheikh",
    "JNB": "Johannesburg",
    "CPT": "Cape Town",
    "NBO": "Nairobi",
    "ZNZ": "Zanzibar",
    "ADD": "Addis Ababa",
    "LOS": "Lagos",
    "DAR": "Dar es Salaam",
    "TUN": "Tunis",
    # Indian Ocean
    "MRU": "Mauritius",
    "SEZ": "Seychelles",
    # Oceania
    "SYD": "Sydney",
    "MEL": "Melbourne",
    "BNE": "Brisbane",
    "PER": "Perth",
    "AKL": "Auckland",
    "WLG": "Wellington",
    "NAN": "Nadi (Fiji)",
    "PPT": "Tahiti",
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


# Tags used by the suggestion algorithm.
# Each destination has a frozenset of descriptive tags.
DEST_TAGS: dict[str, frozenset] = {
    "AMS": frozenset(["city", "culture", "nightlife", "temperate", "short_flight", "food"]),
    "BCN": frozenset(["city", "beach", "warm", "nightlife", "culture", "food"]),
    "DUB": frozenset(["city", "cool", "nightlife", "culture", "short_flight"]),
    "LIS": frozenset(["city", "beach", "warm", "culture", "food", "nightlife"]),
    "FCO": frozenset(["city", "warm", "culture", "food", "romance", "history"]),
    "CDG": frozenset(["city", "temperate", "culture", "food", "romance", "nightlife", "short_flight", "shopping"]),
    "ORY": frozenset(["city", "temperate", "culture", "food", "short_flight"]),
    "PMI": frozenset(["beach", "warm", "nightlife", "party"]),
    "AGP": frozenset(["beach", "warm", "culture", "food"]),
    "FAO": frozenset(["beach", "warm", "relaxed", "golf"]),
    "OPO": frozenset(["city", "warm", "culture", "food", "nightlife"]),
    "NCE": frozenset(["beach", "warm", "romance", "culture", "luxury"]),
    "MAD": frozenset(["city", "warm", "nightlife", "culture", "food", "art"]),
    "MXP": frozenset(["city", "warm", "culture", "food", "shopping", "fashion"]),
    "VCE": frozenset(["city", "warm", "culture", "romance", "history", "art"]),
    "NAP": frozenset(["city", "warm", "culture", "food", "history"]),
    "MLA": frozenset(["beach", "warm", "history", "culture", "diving"]),
    "IBZ": frozenset(["beach", "warm", "nightlife", "party"]),
    "ALC": frozenset(["beach", "warm", "relaxed"]),
    "GVA": frozenset(["city", "mountains", "temperate", "culture", "luxury", "skiing"]),
    "ZRH": frozenset(["city", "mountains", "temperate", "culture", "luxury", "skiing"]),
    "MUC": frozenset(["city", "temperate", "culture", "nightlife", "food", "short_flight"]),
    "BER": frozenset(["city", "cool", "nightlife", "culture", "art", "short_flight"]),
    "HAM": frozenset(["city", "cool", "nightlife", "culture", "short_flight"]),
    "CPH": frozenset(["city", "cool", "culture", "food", "nightlife", "short_flight"]),
    "ARN": frozenset(["city", "cool", "culture", "food", "nature"]),
    "OSL": frozenset(["city", "cool", "culture", "food", "nature"]),
    "HEL": frozenset(["city", "cool", "culture", "nature", "design"]),
    "PRG": frozenset(["city", "temperate", "culture", "nightlife", "food", "history", "short_flight"]),
    "VIE": frozenset(["city", "temperate", "culture", "food", "romance", "history", "art", "short_flight"]),
    "BUD": frozenset(["city", "temperate", "culture", "nightlife", "food", "history", "short_flight"]),
    "KRK": frozenset(["city", "cool", "culture", "food", "history", "short_flight"]),
    "WAW": frozenset(["city", "cool", "culture", "food", "history", "short_flight"]),
    "GDN": frozenset(["beach", "cool", "culture", "history", "short_flight"]),
    "TLL": frozenset(["city", "cool", "culture", "history", "medieval"]),
    "RIX": frozenset(["city", "cool", "culture", "history", "nightlife"]),
    "VNO": frozenset(["city", "cool", "culture", "history"]),
    "BEG": frozenset(["city", "temperate", "nightlife", "culture", "party"]),
    "SOF": frozenset(["city", "temperate", "culture", "history"]),
    "OTP": frozenset(["city", "temperate", "culture", "history"]),
    "ZAG": frozenset(["city", "temperate", "culture", "history"]),
    "ATH": frozenset(["city", "hot", "culture", "history", "food", "art"]),
    "SKG": frozenset(["city", "hot", "culture", "history", "food"]),
    "HER": frozenset(["beach", "hot", "relaxed", "history"]),
    "RHO": frozenset(["beach", "hot", "history", "culture"]),
    "CFU": frozenset(["beach", "hot", "nature", "relaxed"]),
    "JMK": frozenset(["beach", "hot", "nightlife", "romance", "luxury", "party"]),
    "JTR": frozenset(["beach", "hot", "romance", "culture", "luxury", "sunset"]),
    "ZAD": frozenset(["beach", "warm", "history", "culture"]),
    "SPU": frozenset(["beach", "warm", "history", "culture", "islands"]),
    "DBV": frozenset(["beach", "warm", "history", "culture", "luxury", "islands"]),
    "TFS": frozenset(["beach", "hot", "relaxed", "warm_year_round"]),
    "TFN": frozenset(["beach", "hot", "nature", "hiking", "warm_year_round"]),
    "LPA": frozenset(["beach", "hot", "relaxed", "warm_year_round"]),
    "ACE": frozenset(["beach", "hot", "nature", "diving", "warm_year_round"]),
    "FUE": frozenset(["beach", "hot", "relaxed", "wind_sports", "warm_year_round"]),
    "FNC": frozenset(["nature", "mountains", "warm", "hiking", "culture"]),
    "IST": frozenset(["city", "warm", "culture", "history", "food", "shopping", "long_flight"]),
    "JFK": frozenset(["city", "temperate", "nightlife", "culture", "shopping", "long_flight"]),
    "DXB": frozenset(["city", "hot", "shopping", "nightlife", "luxury", "long_flight"]),
    "MRU": frozenset(["beach", "hot", "romance", "relaxed", "long_flight", "luxury"]),
    "MBJ": frozenset(["beach", "hot", "relaxed", "nightlife", "long_flight"]),
}


def score_destination(iata: str, prefs_list: list[dict]) -> float:
    """Score a destination against aggregated member preferences.

    prefs_list: list of pref_destination_answers dicts (one per member).
    Higher score = better match.
    """
    tags = DEST_TAGS.get(iata, frozenset())
    score = 0.0

    climates = [p.get("climate") for p in prefs_list if p.get("climate")]
    settings = [p.get("setting") for p in prefs_list if p.get("setting")]
    must_haves: list[str] = []
    avoids: list[str] = []
    for p in prefs_list:
        must_haves.extend(p.get("must_have") or [])
        avoids.extend(p.get("avoid") or [])

    # Climate
    for climate in climates:
        climate = climate.lower()
        if climate == "warm" and ("warm" in tags or "hot" in tags):
            score += 2
        elif climate == "cold" and "cool" in tags:
            score += 2
        elif climate == "temperate" and "temperate" in tags:
            score += 2

    # Setting
    for setting in settings:
        setting = setting.lower()
        if setting in tags:
            score += 2
        elif setting == "mixed":
            score += 1

    # Must-have features
    for mh in must_haves:
        mh_norm = mh.lower().replace(" ", "_")
        if mh_norm in tags or mh.lower() in tags:
            score += 2

    # Avoid penalties
    for av in avoids:
        av_lower = av.lower()
        if "long flight" in av_lower or "long_flight" in av_lower:
            if "long_flight" in tags:
                score -= 4
        else:
            av_norm = av_lower.replace(" ", "_")
            if av_norm in tags or av_lower in tags:
                score -= 3

    return score


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
