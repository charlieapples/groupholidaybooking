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

/** Airport code → display name (e.g. for "Flying from:" in flight results). */
export const AIRPORT_DISPLAY: Record<string, string> = {
  LHR: "Heathrow", LGW: "Gatwick", STN: "Stansted", LTN: "Luton",
  LCY: "London City", MAN: "Manchester", BHX: "Birmingham", EDI: "Edinburgh",
  GLA: "Glasgow", BRS: "Bristol", LBA: "Leeds Bradford", NCL: "Newcastle",
  BFS: "Belfast Intl", SOU: "Southampton", EXT: "Exeter", NWI: "Norwich",
  HUY: "Humberside", MME: "Teesside", ABZ: "Aberdeen", INV: "Inverness",
  DUB: "Dublin",
};
