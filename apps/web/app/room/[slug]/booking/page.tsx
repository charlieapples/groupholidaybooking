"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  getFlightResults,
  listMembers,
  advanceStep,
  type Room,
  type FlightResult,
  type Member,
} from "@/lib/api";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

// IATA → city name we hand to accommodation search sites. Any IATA we don't
// know explicitly falls back to passing the IATA itself, which most sites
// resolve correctly via fuzzy matching.
const DEST_TO_CITY: Record<string, string> = {
  AMS: "Amsterdam", BCN: "Barcelona", DUB: "Dublin", LIS: "Lisbon",
  FCO: "Rome", CDG: "Paris", ORY: "Paris", PMI: "Palma", AGP: "Malaga",
  FAO: "Faro", OPO: "Porto", NCE: "Nice", MAD: "Madrid", MXP: "Milan",
  VCE: "Venice", NAP: "Naples", MLA: "Malta", IBZ: "Ibiza", ALC: "Alicante",
  GVA: "Geneva", ZRH: "Zurich", MUC: "Munich", BER: "Berlin", HAM: "Hamburg",
  CPH: "Copenhagen", ARN: "Stockholm", OSL: "Oslo", HEL: "Helsinki",
  BIO: "Bilbao", SVQ: "Seville", VLC: "Valencia", TLS: "Toulouse",
  BOD: "Bordeaux", MRS: "Marseille", LYS: "Lyon", BIQ: "Biarritz",
  TRN: "Turin", BLQ: "Bologna", FLR: "Florence", PSA: "Pisa",
  CTA: "Catania", PMO: "Palermo", CAG: "Cagliari", BRI: "Bari",
  PRG: "Prague", VIE: "Vienna", BUD: "Budapest", KRK: "Krakow",
  WAW: "Warsaw", GDN: "Gdansk", TLL: "Tallinn", RIX: "Riga",
  VNO: "Vilnius", BEG: "Belgrade", SOF: "Sofia", OTP: "Bucharest",
  ZAG: "Zagreb", LJU: "Ljubljana", BTS: "Bratislava", TIA: "Tirana",
  SKP: "Skopje", SJJ: "Sarajevo",
  ATH: "Athens", SKG: "Thessaloniki", HER: "Heraklion", RHO: "Rhodes",
  CFU: "Corfu", JMK: "Mykonos", JTR: "Santorini",
  LCA: "Larnaca", PFO: "Paphos",
  ZAD: "Zadar", SPU: "Split", DBV: "Dubrovnik",
  TFS: "Tenerife", TFN: "Tenerife", LPA: "Gran Canaria",
  ACE: "Lanzarote", FUE: "Fuerteventura", FNC: "Madeira",
  REK: "Reykjavik", KEF: "Reykjavik",
  AGA: "Agadir", RAK: "Marrakech", CMN: "Casablanca", TUN: "Tunis",
  IST: "Istanbul", SAW: "Istanbul", AYT: "Antalya", ESB: "Ankara",
  DXB: "Dubai", AUH: "Abu Dhabi", DOH: "Doha", AMM: "Amman",
  TLV: "Tel Aviv", BEY: "Beirut", JED: "Jeddah", RUH: "Riyadh",
  BKK: "Bangkok", DMK: "Bangkok", HKT: "Phuket", CNX: "Chiang Mai",
  SIN: "Singapore", KUL: "Kuala Lumpur", DPS: "Bali",
  CGK: "Jakarta", MNL: "Manila", HAN: "Hanoi", SGN: "Ho Chi Minh City",
  HKG: "Hong Kong", TPE: "Taipei", ICN: "Seoul",
  NRT: "Tokyo", HND: "Tokyo", KIX: "Osaka",
  PEK: "Beijing", PVG: "Shanghai", CTU: "Chengdu",
  DEL: "Delhi", BOM: "Mumbai", GOI: "Goa",
  CMB: "Colombo", MLE: "Maldives", KTM: "Kathmandu",
  JFK: "New York", LGA: "New York", EWR: "New York",
  BOS: "Boston", PHL: "Philadelphia", DCA: "Washington DC",
  MIA: "Miami", FLL: "Fort Lauderdale", MCO: "Orlando", ATL: "Atlanta",
  ORD: "Chicago", MSP: "Minneapolis", DEN: "Denver", LAX: "Los Angeles",
  SFO: "San Francisco", SAN: "San Diego", LAS: "Las Vegas",
  SEA: "Seattle", PDX: "Portland", YYZ: "Toronto", YUL: "Montreal",
  YVR: "Vancouver", MEX: "Mexico City", CUN: "Cancun",
  SJD: "Los Cabos", PVR: "Puerto Vallarta",
  PTY: "Panama City", SJO: "San Jose Costa Rica", HAV: "Havana",
  NAS: "Nassau", MBJ: "Montego Bay", PUJ: "Punta Cana",
  SDQ: "Santo Domingo", BGI: "Barbados", SXM: "St Maarten",
  GRU: "Sao Paulo", GIG: "Rio de Janeiro", EZE: "Buenos Aires",
  SCL: "Santiago", LIM: "Lima", BOG: "Bogota", MVD: "Montevideo",
  UIO: "Quito", CUZ: "Cusco",
  CAI: "Cairo", HRG: "Hurghada", SSH: "Sharm El Sheikh",
  JNB: "Johannesburg", CPT: "Cape Town", NBO: "Nairobi",
  ZNZ: "Zanzibar", ADD: "Addis Ababa", LOS: "Lagos", DAR: "Dar es Salaam",
  MRU: "Mauritius", SEZ: "Seychelles",
  SYD: "Sydney", MEL: "Melbourne", BNE: "Brisbane", PER: "Perth",
  AKL: "Auckland", WLG: "Wellington", NAN: "Nadi", PPT: "Tahiti",
};

function cityFor(iata: string): string {
  return DEST_TO_CITY[iata] || iata;
}

function bookingComLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  const params = new URLSearchParams({
    ss: cityFor(iata),
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(guests),
    no_rooms: "1",
    order: "price",
  });
  return `https://www.booking.com/searchresults.html?${params}`;
}

function airbnbLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  return `https://www.airbnb.com/s/${encodeURIComponent(cityFor(iata))}/homes?checkin=${checkIn}&checkout=${checkOut}&adults=${guests}`;
}

function hotelsComLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  const params = new URLSearchParams({
    "q-destination": cityFor(iata),
    "q-check-in": checkIn,
    "q-check-out": checkOut,
    "q-rooms": "1",
    "q-room-0-adults": String(guests),
  });
  return `https://uk.hotels.com/Hotel-Search?${params}`;
}

function vrboLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  const params = new URLSearchParams({
    destination: cityFor(iata),
    startDate: checkIn,
    endDate: checkOut,
    adults: String(guests),
  });
  return `https://www.vrbo.com/search?${params}`;
}

function skyscannerHotelsLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  return `https://www.skyscanner.net/hotels/search?entity_name=${encodeURIComponent(cityFor(iata))}&checkin=${checkIn}&checkout=${checkOut}&adults=${guests}`;
}

// ── Train / Eurostar ──────────────────────────────────────────────────────────
// Destinations reachable by train from London (via Eurostar or direct rail).
// Each entry maps IATA → { trainCity, eurostar: bool }
const TRAIN_DESTINATIONS: Record<string, { city: string; eurostar: boolean }> = {
  CDG: { city: "Paris", eurostar: true },
  ORY: { city: "Paris", eurostar: true },
  AMS: { city: "Amsterdam", eurostar: true },
  BRU: { city: "Brussels", eurostar: true },
  LIL: { city: "Lille", eurostar: true },
  MRS: { city: "Marseille", eurostar: false },   // TGV via Paris
  LYS: { city: "Lyon", eurostar: false },
  TLS: { city: "Toulouse", eurostar: false },
  BOD: { city: "Bordeaux", eurostar: false },
  MUC: { city: "Munich", eurostar: false },
  BER: { city: "Berlin", eurostar: false },
  HAM: { city: "Hamburg", eurostar: false },
  CGN: { city: "Cologne", eurostar: false },
  PRG: { city: "Prague", eurostar: false },
  VIE: { city: "Vienna", eurostar: false },
  BUD: { city: "Budapest", eurostar: false },
  ZRH: { city: "Zurich", eurostar: false },
  GVA: { city: "Geneva", eurostar: false },
  BCN: { city: "Barcelona", eurostar: false },
  MAD: { city: "Madrid", eurostar: false },
  LIS: { city: "Lisbon", eurostar: false },
};

function trainlineLink(city: string, outDate: string, inDate: string) {
  // Trainline deep link — pre-fills origin as London, destination as city
  const params = new URLSearchParams({
    origin: "london",
    destination: city.toLowerCase(),
    outwardDate: outDate,
    returnDate: inDate,
    adults: "1",
  });
  return `https://www.thetrainline.com/book/results?${params}`;
}

function eurostarLink(city: string, outDate: string, inDate: string) {
  return `https://www.eurostar.com/uk-en/train/london-to-${city.toLowerCase()}?outwardDate=${outDate}&returnDate=${inDate}&adults=1`;
}

export default function BookingPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [markingDone, setMarkingDone] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      try {
        const [r, m, res] = await Promise.all([
          getRoom(t, slug),
          listMembers(t, slug),
          getFlightResults(t, slug).catch(() => null),
        ]);
        setRoom(r);
        setMembers(m);
        if (res) setResults(res);
      } catch {
        router.replace("/dashboard");
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, router, supabase]);

  async function handleMarkDone() {
    if (!token || !room?.is_admin) return;
    setMarkingDone(true);
    try {
      await advanceStep(token, slug);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to mark as done"));
      setMarkingDone(false);
    }
  }

  function copyLink(url: string, key: string) {
    navigator.clipboard.writeText(url).then(
      () => {
        setCopied(key);
        toast.success("Link copied");
        setTimeout(() => setCopied(null), 2000);
      },
      () => toast.error("Could not copy link"),
    );
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  const destIata = room.destination_iata;
  const destResult = results.find(r => r.destination === destIata) ?? results[0] ?? null;
  // Prefer the SPECIFIC flight dates picked by the optimiser — those are when
  // the group will actually be there. Fall back to the room's wide agreed_start
  // window only if no flight result has narrowed it down yet.
  const checkIn = destResult?.shared_out_date ?? room.agreed_start ?? "";
  const checkOut = destResult?.shared_return_date ?? room.agreed_end ?? "";
  const guestCount = Math.max(members.length, 1);
  const providers = destIata
    ? [
        { name: "Booking.com", url: bookingComLink(destIata, checkIn, checkOut, guestCount), emoji: "🏨" },
        { name: "Airbnb", url: airbnbLink(destIata, checkIn, checkOut, guestCount), emoji: "🏠" },
        { name: "Hotels.com", url: hotelsComLink(destIata, checkIn, checkOut, guestCount), emoji: "🛏️" },
        { name: "Vrbo", url: vrboLink(destIata, checkIn, checkOut, guestCount), emoji: "🏡" },
        { name: "Skyscanner", url: skyscannerHotelsLink(destIata, checkIn, checkOut, guestCount), emoji: "🧭" },
      ]
    : [];

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← {room.name}
          </button>
          <span className="font-semibold text-gray-900">🎫 Booking</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">

        {/* Destination summary */}
        {destIata && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
            <div className="flex items-center gap-3">
              <span className="text-3xl">🎉</span>
              <div>
                <h2 className="text-xl font-bold text-green-900">
                  {destResult?.destination_name ?? destIata}
                </h2>
                {destResult?.shared_out_date && (
                  <p className="text-green-700 text-sm">
                    {destResult.shared_out_date} to {destResult.shared_return_date}
                    {" · "}
                    {members.length} people
                    {" · "}
                    ~£{Math.round(destResult.avg_individual_cost).toLocaleString()} avg pp
                  </p>
                )}
              </div>
            </div>
          </div>
        )}

        {!destIata && (
          <div className="rounded-xl border bg-amber-50 p-6 text-amber-800">
            No destination chosen yet. Go back to the flights step and pick one.
          </div>
        )}

        {/* Accommodation */}
        {providers.length > 0 && destIata && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🏨 Accommodation</h2>
            <p className="text-sm text-gray-600 mb-4">
              Searches are pre-filled for <strong>{cityFor(destIata)}</strong>,{" "}
              {checkIn} → {checkOut}, {guestCount} guest{guestCount !== 1 ? "s" : ""}.
              Compare a few — prices vary a lot between platforms.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {providers.map((p) => (
                <a
                  key={p.name}
                  href={p.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span>{p.name}</span>
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-gray-400">
              We don&apos;t take commission from these searches yet — pick whichever you trust.
            </p>
          </div>
        )}

        {/* Train alternatives — shown for Eurostar/rail-accessible destinations */}
        {destIata && TRAIN_DESTINATIONS[destIata] && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">🚄 Train alternatives</h2>
            <p className="text-sm text-gray-500 mb-4">
              {TRAIN_DESTINATIONS[destIata].city} is reachable by train from London —
              sometimes faster door-to-door and often cheaper than flying.
            </p>
            <div className="flex flex-wrap gap-2">
              {TRAIN_DESTINATIONS[destIata].eurostar && (
                <a
                  href={eurostarLink(TRAIN_DESTINATIONS[destIata].city, checkIn, checkOut)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50"
                >
                  <span className="text-lg">⭐</span>
                  <span>Eurostar</span>
                </a>
              )}
              <a
                href={trainlineLink(TRAIN_DESTINATIONS[destIata].city, checkIn, checkOut)}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50"
              >
                <span className="text-lg">🚆</span>
                <span>Trainline</span>
              </a>
            </div>
            <p className="mt-3 text-xs text-gray-400">
              Each person books separately. Trainline searches return via London unless you&apos;re already on the continent.
            </p>
          </div>
        )}

        {/* Flight links per person */}
        {destResult && destResult.people.length > 0 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-4">✈️ Flight links</h2>
            <p className="text-sm text-gray-500 mb-4">
              Each person books their own flights. Share these links with the group.
            </p>
            <div className="space-y-4">
              {destResult.people.map((p) => (
                <div key={p.person_name} className={`rounded-xl border p-4 ${p.viable ? "bg-gray-50" : "bg-red-50"}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-semibold text-gray-900">{p.person_name}</span>
                      {p.chosen_airport && (
                        <span className="ml-2 text-xs text-gray-500">from {p.chosen_airport}</span>
                      )}
                    </div>
                    <span className="font-bold text-gray-900">£{Math.round(p.total_money_gbp).toLocaleString()}</span>
                  </div>

                  {p.viable ? (
                    <div className="space-y-2">
                      <div className="text-xs text-gray-500 flex gap-4 flex-wrap">
                        {p.outbound_date && <span>Out: {p.outbound_date}</span>}
                        {p.inbound_date && <span>Return: {p.inbound_date}</span>}
                        {p.outbound_cost_gbp + p.inbound_cost_gbp > 0 && (
                          <span>Flights: £{Math.round(p.outbound_cost_gbp + p.inbound_cost_gbp)}</span>
                        )}
                        {p.baggage_cost_gbp > 0
                          ? <span title="Estimated carry-on/cabin bag add-on cost for this airline">Cabin bag est.: £{Math.round(p.baggage_cost_gbp)}</span>
                          : <span className="text-green-600">Cabin bag incl.</span>
                        }
                        {p.ground_cost_gbp > 0 && (
                          <span title="Estimated ground travel cost to/from the airport">Ground travel: £{Math.round(p.ground_cost_gbp)}</span>
                        )}
                      </div>
                      {p.booking_link ? (
                        <div className="space-y-1.5">
                          <div className="flex gap-2 flex-wrap">
                            <a
                              href={p.booking_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                            >
                              Book return on Aviasales
                            </a>
                            {p.chosen_airport && destIata && p.outbound_date && p.inbound_date && (
                              <a
                                href={`https://www.skyscanner.net/transport/flights/${p.chosen_airport.toLowerCase()}/${destIata.toLowerCase()}/${p.outbound_date.slice(2).replace(/-/g, "")}/${p.inbound_date.slice(2).replace(/-/g, "")}/`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                              >
                                Compare on Skyscanner
                              </a>
                            )}
                            <button
                              onClick={() => copyLink(p.booking_link!, p.person_name)}
                              className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                            >
                              {copied === p.person_name ? "Copied!" : "Copy link"}
                            </button>
                          </div>
                          <p className="text-[10px] text-gray-400">
                            Prices cached up to ~24h — live price on Aviasales may differ slightly.
                            Cabin bag estimate only — hold luggage is priced separately by the airline at checkout.
                          </p>
                        </div>
                      ) : (
                        <p className="text-xs text-gray-400">No direct booking link available — search manually.</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm text-red-600">No viable flights found from this person&apos;s location.</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Checklist */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">✅ Booking checklist</h2>
          <div className="space-y-2 text-sm text-gray-700">
            {[
              "Everyone has booked their flights",
              "Accommodation is booked",
              "Travel insurance sorted",
              "Airport transfers arranged",
              "Everyone has a valid passport",
            ].map((item) => (
              <label key={item} className="flex items-center gap-3 cursor-pointer">
                <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-blue-600" />
                {item}
              </label>
            ))}
          </div>
        </div>

        {/* Share results link — visible to everyone */}
        {destIata && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">📤 Share trip summary</h2>
            <p className="text-sm text-gray-500 mb-3">
              Send this link to anyone (no account needed) — they&apos;ll see the destination, dates, and estimated cost.
            </p>
            <button
              onClick={() => {
                const url = `${window.location.origin}/room/${slug}/results`;
                if (navigator.share) {
                  navigator.share({ title: room.name, url });
                } else {
                  navigator.clipboard.writeText(url).then(() =>
                    toast.success("Results link copied!")
                  );
                }
              }}
              className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
            >
              📋 Copy results link
            </button>
          </div>
        )}

        {/* Admin: mark done */}
        {room.is_admin && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
            <h2 className="text-lg font-bold text-green-900 mb-2">All booked?</h2>
            <p className="text-sm text-green-700 mb-4">
              Once everyone has booked their flights and accommodation, mark the holiday as done!
            </p>
            <button
              onClick={handleMarkDone}
              disabled={markingDone}
              className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white hover:bg-green-700 disabled:opacity-50"
            >
              {markingDone ? "Marking…" : "Mark holiday as booked! 🎉"}
            </button>
          </div>
        )}
      </div>

      {token && <ChatWidget token={token} roomSlug={slug} />}
    </main>
  );
}
