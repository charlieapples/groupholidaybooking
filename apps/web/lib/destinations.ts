/**
 * IATA airport code → city / destination name.
 * Used in multiple pages; keep in sync with apps/api/app/core/destinations.py.
 */

export const DEST_NAMES: Record<string, string> = {
  // UK
  LHR: "London Heathrow", LGW: "London Gatwick", STN: "London Stansted",
  LTN: "London Luton", LCY: "London City", MAN: "Manchester",
  BHX: "Birmingham", EDI: "Edinburgh", GLA: "Glasgow", BRS: "Bristol",
  NCL: "Newcastle", LBA: "Leeds Bradford", MME: "Teesside", HUY: "Humberside",
  BFS: "Belfast", SOU: "Southampton", EXT: "Exeter", ABZ: "Aberdeen",
  // Ireland
  DUB: "Dublin", ORK: "Cork",
  // France
  CDG: "Paris", ORY: "Paris Orly", NCE: "Nice", TLS: "Toulouse",
  BOD: "Bordeaux", MRS: "Marseille", LYS: "Lyon", BIQ: "Biarritz",
  // Spain
  BCN: "Barcelona", MAD: "Madrid", PMI: "Palma", AGP: "Malaga",
  ALC: "Alicante", SVQ: "Seville", VLC: "Valencia", IBZ: "Ibiza",
  BIO: "Bilbao",
  TFS: "Tenerife South", TFN: "Tenerife North", LPA: "Gran Canaria",
  ACE: "Lanzarote", FUE: "Fuerteventura",
  // Portugal
  LIS: "Lisbon", OPO: "Porto", FAO: "Faro", FNC: "Madeira",
  // Italy
  FCO: "Rome Fiumicino", MXP: "Milan Malpensa", VCE: "Venice",
  NAP: "Naples", TRN: "Turin", BLQ: "Bologna", FLR: "Florence",
  PSA: "Pisa", CTA: "Catania", PMO: "Palermo", CAG: "Cagliari", BRI: "Bari",
  // Netherlands / Belgium
  AMS: "Amsterdam", BRU: "Brussels",
  // Germany
  MUC: "Munich", BER: "Berlin", HAM: "Hamburg", FRA: "Frankfurt",
  // Switzerland / Austria
  GVA: "Geneva", ZRH: "Zurich", VIE: "Vienna",
  // Scandinavia
  CPH: "Copenhagen", ARN: "Stockholm", OSL: "Oslo", HEL: "Helsinki",
  REK: "Reykjavik", KEF: "Reykjavik Keflavik",
  // Central / Eastern Europe
  PRG: "Prague", BUD: "Budapest", WAW: "Warsaw", KRK: "Krakow",
  GDN: "Gdansk", TLL: "Tallinn", RIX: "Riga", VNO: "Vilnius",
  BEG: "Belgrade", SOF: "Sofia", OTP: "Bucharest", ZAG: "Zagreb",
  LJU: "Ljubljana", BTS: "Bratislava", TIA: "Tirana", SKP: "Skopje",
  SJJ: "Sarajevo",
  // Greece / Cyprus / Malta
  ATH: "Athens", SKG: "Thessaloniki", HER: "Heraklion", RHO: "Rhodes",
  CFU: "Corfu", JMK: "Mykonos", JTR: "Santorini",
  LCA: "Larnaca", PFO: "Paphos", MLA: "Malta",
  // Croatia
  ZAD: "Zadar", SPU: "Split", DBV: "Dubrovnik",
  // North Africa / Middle East
  AGA: "Agadir", RAK: "Marrakech", CMN: "Casablanca", TUN: "Tunis",
  CAI: "Cairo", HRG: "Hurghada", SSH: "Sharm El Sheikh",
  IST: "Istanbul", SAW: "Istanbul Sabiha", AYT: "Antalya", ESB: "Ankara",
  DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha", AMM: "Amman",
  TLV: "Tel Aviv", BEY: "Beirut", JED: "Jeddah", RUH: "Riyadh",
  // Sub-Saharan Africa
  JNB: "Johannesburg", CPT: "Cape Town", NBO: "Nairobi",
  ZNZ: "Zanzibar", ADD: "Addis Ababa", LOS: "Lagos", DAR: "Dar es Salaam",
  MRU: "Mauritius", SEZ: "Seychelles",
  // Asia
  BKK: "Bangkok Suvarnabhumi", DMK: "Bangkok Don Mueang",
  HKT: "Phuket", CNX: "Chiang Mai",
  SIN: "Singapore", KUL: "Kuala Lumpur", DPS: "Bali",
  CGK: "Jakarta", MNL: "Manila",
  HAN: "Hanoi", SGN: "Ho Chi Minh City",
  HKG: "Hong Kong", TPE: "Taipei", ICN: "Seoul",
  NRT: "Tokyo Narita", HND: "Tokyo Haneda", KIX: "Osaka",
  PEK: "Beijing", PVG: "Shanghai", CTU: "Chengdu",
  DEL: "Delhi", BOM: "Mumbai", GOI: "Goa",
  CMB: "Colombo", MLE: "Maldives", KTM: "Kathmandu",
  // North America
  JFK: "New York JFK", LGA: "New York LaGuardia", EWR: "Newark",
  BOS: "Boston", PHL: "Philadelphia", DCA: "Washington DC",
  MIA: "Miami", FLL: "Fort Lauderdale", MCO: "Orlando", ATL: "Atlanta",
  ORD: "Chicago O'Hare", MSP: "Minneapolis", DEN: "Denver",
  LAX: "Los Angeles", SFO: "San Francisco", SAN: "San Diego",
  LAS: "Las Vegas", SEA: "Seattle", PDX: "Portland",
  YYZ: "Toronto", YUL: "Montreal", YVR: "Vancouver",
  MEX: "Mexico City", CUN: "Cancun", SJD: "Los Cabos", PVR: "Puerto Vallarta",
  // Central America / Caribbean
  PTY: "Panama City", SJO: "San Jose", HAV: "Havana",
  NAS: "Nassau", MBJ: "Montego Bay", PUJ: "Punta Cana",
  SDQ: "Santo Domingo", BGI: "Barbados", SXM: "St Maarten",
  // South America
  GRU: "Sao Paulo", GIG: "Rio de Janeiro", EZE: "Buenos Aires",
  SCL: "Santiago", LIM: "Lima", BOG: "Bogota", MVD: "Montevideo",
  UIO: "Quito", CUZ: "Cusco",
  // Australia / Pacific
  SYD: "Sydney", MEL: "Melbourne", BNE: "Brisbane", PER: "Perth",
  AKL: "Auckland", WLG: "Wellington", NAN: "Nadi", PPT: "Tahiti",
};

/** Look up a human-readable name for an IATA code. Falls back to the code itself. */
export function destName(iata: string): string {
  return DEST_NAMES[iata] ?? iata;
}

/** IATA airport code → country flag emoji. Used on destination cards and results pages. */
export const FLAG_BY_IATA: Record<string, string> = {
  // UK
  LHR: "🇬🇧", LGW: "🇬🇧", STN: "🇬🇧", LTN: "🇬🇧", LCY: "🇬🇧",
  MAN: "🇬🇧", BHX: "🇬🇧", EDI: "🇬🇧", GLA: "🇬🇧", BRS: "🇬🇧",
  NCL: "🇬🇧", LBA: "🇬🇧", ABZ: "🇬🇧", MME: "🇬🇧", HUY: "🇬🇧",
  BFS: "🇬🇧", SOU: "🇬🇧", EXT: "🇬🇧", NWI: "🇬🇧", INV: "🇬🇧",
  // Ireland
  DUB: "🇮🇪", ORK: "🇮🇪",
  // France
  CDG: "🇫🇷", ORY: "🇫🇷", NCE: "🇫🇷", TLS: "🇫🇷", BOD: "🇫🇷",
  MRS: "🇫🇷", LYS: "🇫🇷", BIQ: "🇫🇷",
  // Spain
  BCN: "🇪🇸", MAD: "🇪🇸", PMI: "🇪🇸", AGP: "🇪🇸", ALC: "🇪🇸",
  IBZ: "🇪🇸", BIO: "🇪🇸", SVQ: "🇪🇸", VLC: "🇪🇸",
  TFS: "🇪🇸", TFN: "🇪🇸", LPA: "🇪🇸", ACE: "🇪🇸", FUE: "🇪🇸",
  // Portugal
  LIS: "🇵🇹", OPO: "🇵🇹", FAO: "🇵🇹", FNC: "🇵🇹",
  // Italy
  FCO: "🇮🇹", MXP: "🇮🇹", VCE: "🇮🇹", NAP: "🇮🇹", TRN: "🇮🇹",
  BLQ: "🇮🇹", FLR: "🇮🇹", PSA: "🇮🇹", CTA: "🇮🇹", PMO: "🇮🇹",
  CAG: "🇮🇹", BRI: "🇮🇹",
  // Netherlands / Belgium
  AMS: "🇳🇱", BRU: "🇧🇪",
  // Germany
  MUC: "🇩🇪", BER: "🇩🇪", HAM: "🇩🇪", FRA: "🇩🇪",
  // Switzerland / Austria
  GVA: "🇨🇭", ZRH: "🇨🇭", VIE: "🇦🇹",
  // Scandinavia
  CPH: "🇩🇰", ARN: "🇸🇪", OSL: "🇳🇴", HEL: "🇫🇮",
  // Iceland
  REK: "🇮🇸", KEF: "🇮🇸",
  // Central / Eastern Europe
  PRG: "🇨🇿", BUD: "🇭🇺", WAW: "🇵🇱", KRK: "🇵🇱", GDN: "🇵🇱",
  TLL: "🇪🇪", RIX: "🇱🇻", VNO: "🇱🇹",
  BEG: "🇷🇸", SOF: "🇧🇬", OTP: "🇷🇴",
  ZAG: "🇭🇷", LJU: "🇸🇮", BTS: "🇸🇰", TIA: "🇦🇱", SKP: "🇲🇰", SJJ: "🇧🇦",
  // Greece / Cyprus / Malta
  ATH: "🇬🇷", SKG: "🇬🇷", HER: "🇬🇷", RHO: "🇬🇷", CFU: "🇬🇷",
  JMK: "🇬🇷", JTR: "🇬🇷",
  LCA: "🇨🇾", PFO: "🇨🇾", MLA: "🇲🇹",
  // Croatia
  ZAD: "🇭🇷", SPU: "🇭🇷", DBV: "🇭🇷",
  // North Africa
  AGA: "🇲🇦", RAK: "🇲🇦", CMN: "🇲🇦", TUN: "🇹🇳",
  CAI: "🇪🇬", HRG: "🇪🇬", SSH: "🇪🇬",
  // Turkey / Middle East
  IST: "🇹🇷", SAW: "🇹🇷", AYT: "🇹🇷", ESB: "🇹🇷",
  DXB: "🇦🇪", AUH: "🇦🇪", DOH: "🇶🇦", AMM: "🇯🇴",
  TLV: "🇮🇱", BEY: "🇱🇧", JED: "🇸🇦", RUH: "🇸🇦",
  // Sub-Saharan Africa
  JNB: "🇿🇦", CPT: "🇿🇦", NBO: "🇰🇪", ZNZ: "🇹🇿", DAR: "🇹🇿",
  ADD: "🇪🇹", LOS: "🇳🇬", MRU: "🇲🇺", SEZ: "🇸🇨",
  // Asia
  BKK: "🇹🇭", DMK: "🇹🇭", HKT: "🇹🇭", CNX: "🇹🇭",
  SIN: "🇸🇬", KUL: "🇲🇾", DPS: "🇮🇩", CGK: "🇮🇩", MNL: "🇵🇭",
  HAN: "🇻🇳", SGN: "🇻🇳", HKG: "🇭🇰", TPE: "🇹🇼", ICN: "🇰🇷",
  NRT: "🇯🇵", HND: "🇯🇵", KIX: "🇯🇵",
  PEK: "🇨🇳", PVG: "🇨🇳", CTU: "🇨🇳",
  DEL: "🇮🇳", BOM: "🇮🇳", GOI: "🇮🇳",
  CMB: "🇱🇰", MLE: "🇲🇻", KTM: "🇳🇵",
  // North America
  JFK: "🇺🇸", LGA: "🇺🇸", EWR: "🇺🇸", BOS: "🇺🇸", PHL: "🇺🇸",
  DCA: "🇺🇸", MIA: "🇺🇸", FLL: "🇺🇸", MCO: "🇺🇸", ATL: "🇺🇸",
  ORD: "🇺🇸", MSP: "🇺🇸", DEN: "🇺🇸", LAX: "🇺🇸", SFO: "🇺🇸",
  SAN: "🇺🇸", LAS: "🇺🇸", SEA: "🇺🇸", PDX: "🇺🇸",
  YYZ: "🇨🇦", YUL: "🇨🇦", YVR: "🇨🇦",
  MEX: "🇲🇽", CUN: "🇲🇽", SJD: "🇲🇽", PVR: "🇲🇽",
  // Central America / Caribbean
  PTY: "🇵🇦", SJO: "🇨🇷", HAV: "🇨🇺", NAS: "🇧🇸",
  MBJ: "🇯🇲", PUJ: "🇩🇴", SDQ: "🇩🇴", BGI: "🇧🇧", SXM: "🇸🇽",
  // South America
  GRU: "🇧🇷", GIG: "🇧🇷", EZE: "🇦🇷", SCL: "🇨🇱", LIM: "🇵🇪",
  BOG: "🇨🇴", MVD: "🇺🇾", UIO: "🇪🇨", CUZ: "🇵🇪",
  // Oceania
  SYD: "🇦🇺", MEL: "🇦🇺", BNE: "🇦🇺", PER: "🇦🇺",
  AKL: "🇳🇿", WLG: "🇳🇿", NAN: "🇫🇯", PPT: "🇵🇫",
};

/** Return the country flag emoji for an IATA airport code. Falls back to 🌍. */
export function flagFor(iata: string): string {
  return FLAG_BY_IATA[iata] ?? "🌍";
}

/** Airport code → display name (e.g. for "Flying from:" in flight results). */
export const AIRPORT_DISPLAY: Record<string, string> = {
  LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", LTN: "Luton",
  LCY: "London City", MAN: "Manchester", BHX: "Birmingham", EDI: "Edinburgh",
  GLA: "Glasgow", BRS: "Bristol", LBA: "Leeds Bradford", NCL: "Newcastle",
  BFS: "Belfast Intl", SOU: "Southampton", EXT: "Exeter", NWI: "Norwich",
  HUY: "Humberside", MME: "Teesside", ABZ: "Aberdeen", INV: "Inverness",
  DUB: "Dublin",
};

/**
 * Static per-destination accommodation cost estimate: [budget, mid] per night
 * for a single room (to be split across the group).
 * Based on typical Booking.com prices for budget/mid hotels.
 */
export const ACCOMMODATION_TIER: Record<string, [number, number]> = {
  // Budget Eastern Europe
  SOF: [40, 70], BEG: [40, 70], OTP: [40, 70], SKP: [40, 70], TIA: [40, 70],
  SJJ: [40, 70], KRK: [45, 75], WAW: [45, 75], GDN: [45, 75],
  TLL: [50, 80], RIX: [50, 80], VNO: [50, 80], BTS: [45, 75],
  // Mid-range Mediterranean / Southern Europe
  ATH: [65, 110], HER: [55, 95], SKG: [55, 90], RHO: [60, 100],
  CFU: [65, 110], JMK: [80, 140], JTR: [80, 150],
  PRG: [60, 100], BUD: [55, 95], ZAG: [55, 90], LJU: [60, 100],
  LCA: [60, 100], PFO: [55, 90], MLA: [55, 90],
  LIS: [70, 120], OPO: [65, 110], FAO: [60, 100], FNC: [60, 100],
  BCN: [80, 140], MAD: [75, 130], AGP: [55, 100], ALC: [50, 90],
  PMI: [65, 110], IBZ: [80, 160], SVQ: [60, 100], VLC: [60, 100],
  TFS: [60, 110], TFN: [55, 100], LPA: [55, 100], ACE: [55, 95], FUE: [55, 95],
  FCO: [75, 130], NAP: [65, 110], TRN: [65, 100], BLQ: [65, 105],
  CTA: [60, 100], PMO: [55, 90], CAG: [55, 90], PSA: [60, 95], FLR: [75, 130],
  VCE: [85, 150], MXP: [70, 125], BRI: [55, 95],
  // North Africa / Middle East
  AGA: [40, 75], RAK: [45, 80], CMN: [45, 75], TUN: [35, 65],
  CAI: [40, 75], HRG: [40, 75], SSH: [40, 75],
  AYT: [50, 90], IST: [55, 95], SAW: [50, 85], ESB: [50, 85],
  DXB: [75, 140], AUH: [70, 130], DOH: [75, 140], AMM: [50, 90],
  TLV: [80, 150], BEY: [60, 110], JED: [60, 110],
  // Western Europe / Popular cities
  AMS: [90, 160], CDG: [90, 165], ORY: [80, 150], NCE: [85, 155],
  TLS: [70, 120], BOD: [70, 120], MRS: [70, 120], LYS: [70, 115],
  MUC: [90, 150], BER: [75, 130], HAM: [80, 130], FRA: [90, 155],
  VIE: [80, 140], BRU: [80, 140],
  DUB: [90, 160],
  CPH: [100, 175], ARN: [100, 175], HEL: [95, 160], OSL: [110, 185],
  // Very expensive
  GVA: [130, 220], ZRH: [130, 220],
  // Sub-Saharan Africa
  JNB: [60, 110], CPT: [65, 120], NBO: [55, 100], MRU: [75, 140], SEZ: [100, 200],
  // Long-haul Asia
  BKK: [35, 75], DMK: [35, 70], HKT: [45, 90], CNX: [35, 70],
  SIN: [80, 160], KUL: [40, 80], DPS: [45, 95], CGK: [40, 80],
  HAN: [40, 80], SGN: [40, 80], HKG: [80, 150], TPE: [55, 100], ICN: [60, 110],
  NRT: [70, 140], HND: [70, 140], KIX: [60, 120],
  DEL: [35, 70], BOM: [50, 100], GOI: [40, 80],
  // North America
  JFK: [120, 210], LGA: [110, 190], EWR: [100, 175],
  LAX: [110, 190], SFO: [110, 195], MIA: [95, 165], MCO: [70, 130],
  LAS: [70, 150], ORD: [90, 160], BOS: [100, 175], ATL: [80, 145],
  YYZ: [90, 155], YUL: [85, 145], YVR: [90, 155],
  MEX: [55, 100], CUN: [65, 130], PUJ: [60, 120],
  // South America
  GIG: [55, 100], GRU: [55, 95], EZE: [50, 90], SCL: [60, 110],
};

/**
 * Return [budgetNightly, midNightly] room price estimates for a destination.
 * Returns null if we don't have data for that IATA code.
 */
export function accomEstimate(iata: string): [number, number] | null {
  return ACCOMMODATION_TIER[iata] ?? null;
}

/**
 * Compute a total trip cost estimate per person:
 * flightCostPP + (nightly hotel rate × nights ÷ groupSize)
 * Returns null if no accommodation estimate is available.
 */
export function totalTripEstimate(
  iata: string,
  flightCostPP: number,
  nights: number,
  groupSize: number,
): { budget: number; mid: number } | null {
  const est = accomEstimate(iata);
  if (!est || nights <= 0 || groupSize <= 0) return null;
  const [budgetNight, midNight] = est;
  return {
    budget: Math.round(flightCostPP + (budgetNight * nights) / groupSize),
    mid: Math.round(flightCostPP + (midNight * nights) / groupSize),
  };
}
