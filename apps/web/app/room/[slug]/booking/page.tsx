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
import { destName, accomEstimate, totalTripEstimate, cityName } from "@/lib/destinations";
import FeedbackButton from "@/components/FeedbackButton";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

// City names imported from shared lib — cityName() returns clean names like
// "Rome" (not "Rome Fiumicino") for use in accommodation search deep-links.
function cityFor(iata: string): string {
  return cityName(iata);
}

// ── Affiliate IDs (baked in at build time via NEXT_PUBLIC_ env vars) ──────────
// Set these in Vercel → Project Settings → Environment Variables when approved.
//
// Booking.com:
//   - Direct Partner Hub: set NEXT_PUBLIC_BOOKING_COM_AID (e.g. "12345678")
//   - CJ Affiliate route: set NEXT_PUBLIC_CJ_PID + NEXT_PUBLIC_CJ_BOOKING_AID
//     (PID = your CJ publisher ID, AID = Booking.com UK advertiser ID 4297311)
//   Most new affiliates go via CJ — direct Partner Hub is increasingly selective.
const BOOKING_COM_AID = process.env.NEXT_PUBLIC_BOOKING_COM_AID ?? "";
const CJ_PID = process.env.NEXT_PUBLIC_CJ_PID ?? "";
const CJ_BOOKING_AID = process.env.NEXT_PUBLIC_CJ_BOOKING_AID ?? "4297311"; // Booking.com UK on CJ
// Trainline affiliate via Partnerize (moved off Awin in 2024).
// Sign up at join.partnerize.com/trainline/en
const TRAINLINE_CAMREF = process.env.NEXT_PUBLIC_TRAINLINE_CAMREF ?? "";

function bookingComLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  const params = new URLSearchParams({
    ss: cityFor(iata),
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(guests),
    no_rooms: "1",
    order: "price",
    ...(BOOKING_COM_AID ? { aid: BOOKING_COM_AID } : {}),
  });
  const directUrl = `https://www.booking.com/searchresults.html?${params}`;
  // If publisher is on CJ (not direct Partner Hub), wrap in CJ click-through URL.
  if (CJ_PID && !BOOKING_COM_AID) {
    return `https://www.anrdoezrs.net/click-${CJ_PID}-${CJ_BOOKING_AID}?url=${encodeURIComponent(directUrl)}`;
  }
  return directUrl;
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
  // Trainline deep link — pre-fills destination city and dates.
  // Wrapped in Partnerize tracking URL when NEXT_PUBLIC_TRAINLINE_CAMREF is set.
  // Sign up at join.partnerize.com/trainline/en to get your camref.
  const params = new URLSearchParams({
    origin: "london",
    destination: city.toLowerCase(),
    outwardDate: outDate,
    returnDate: inDate,
    adults: "1",
  });
  const dest = `https://www.thetrainline.com/book/results?${params}`;
  if (TRAINLINE_CAMREF) {
    return `https://prf.hn/click/camref:${TRAINLINE_CAMREF}/destination:${encodeURIComponent(dest)}`;
  }
  return dest;
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

  // Booking checklist — persisted to localStorage so it survives page refresh.
  const CHECKLIST_ITEMS = [
    "Everyone has booked their flights",
    "Accommodation is booked",
    "Travel insurance sorted",
    "Airport transfers arranged",
    "Everyone has a valid passport",
  ] as const;
  const checklistKey = `booking-checklist-${slug}`;
  const [checked, setChecked] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const saved = localStorage.getItem(checklistKey);
      return new Set(saved ? JSON.parse(saved) as string[] : []);
    } catch { return new Set(); }
  });

  function toggleChecked(item: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(item)) next.delete(item); else next.add(item);
      try { localStorage.setItem(checklistKey, JSON.stringify([...next])); } catch { /* ignore */ }
      return next;
    });
  }

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

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `Booking – ${room.name} | Group Holiday`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

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
              {BOOKING_COM_AID || CJ_PID || TRAINLINE_CAMREF
                ? "Some links may earn us a small commission at no extra cost to you."
                : "Comparison links — pick whichever you trust."}
            </p>

            {/* Static accommodation cost estimate */}
            {(() => {
              const est = accomEstimate(destIata!);
              if (!est) return null;
              const nights = (checkIn && checkOut)
                ? Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000)
                : null;
              const [budgetNight, midNight] = est;
              return (
                <div className="mt-4 rounded-lg bg-gray-50 border px-4 py-3 text-xs text-gray-600">
                  <p className="font-medium text-gray-800 mb-1">Typical accommodation cost for {cityFor(destIata!)}:</p>
                  <div className="flex flex-wrap gap-4">
                    <span>🏨 Budget hotel: ~£{budgetNight}–{midNight}/night</span>
                    {nights && (
                      <span className="font-medium">
                        = ~£{Math.round(budgetNight * nights)}–£{Math.round(midNight * nights)} for {nights} nights
                        {" "}(£{Math.round(budgetNight * nights / Math.max(guestCount, 1))}–£{Math.round(midNight * nights / Math.max(guestCount, 1))} pp)
                      </span>
                    )}
                  </div>
                  <p className="mt-1 text-gray-400">Based on typical Booking.com prices — actual cost depends on dates, room type, and group size.</p>
                </div>
              );
            })()}
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

        {/* Total trip cost estimate */}
        {destResult && destIata && checkIn && checkOut && (
          (() => {
            const nights = Math.round((new Date(checkOut).getTime() - new Date(checkIn).getTime()) / 86_400_000);
            const avgFlight = Math.round(destResult.avg_individual_cost);
            const est = totalTripEstimate(destIata, avgFlight, nights, Math.max(members.length, 1));
            if (!est || nights <= 0) return null;
            const accomEst = accomEstimate(destIata);
            const accomBudgetPP = accomEst ? Math.round(accomEst[0] * nights / Math.max(members.length, 1)) : 0;
            const accomMidPP = accomEst ? Math.round(accomEst[1] * nights / Math.max(members.length, 1)) : 0;
            return (
              <div className="rounded-xl border-2 border-blue-100 bg-blue-50 p-5 shadow-sm">
                <h2 className="text-base font-semibold text-blue-900 mb-3">💰 Estimated total cost per person</h2>
                <div className="grid grid-cols-2 gap-3 mb-2">
                  <div className="rounded-lg bg-white p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Budget trip</p>
                    <p className="text-2xl font-bold text-gray-900">~£{est.budget.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">flights + budget hotel</p>
                  </div>
                  <div className="rounded-lg bg-white p-3 text-center">
                    <p className="text-xs text-gray-500 mb-0.5">Mid-range trip</p>
                    <p className="text-2xl font-bold text-gray-900">~£{est.mid.toLocaleString()}</p>
                    <p className="text-xs text-gray-400">flights + mid hotel</p>
                  </div>
                </div>
                <p className="text-xs text-gray-500">
                  Avg flight: £{avgFlight} · Hotel est.: £{accomBudgetPP}–£{accomMidPP}/person · {nights} nights in {cityFor(destIata)}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  Estimates only — does not include spending money, activities, transfers, or hold luggage.
                </p>
              </div>
            );
          })()
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
                          <span
                            title="Estimated ground travel cost to/from the airport"
                            className={p.ground_hours > 2.5 ? "text-amber-700 font-medium" : ""}
                          >
                            Ground travel: £{Math.round(p.ground_cost_gbp)}
                            {p.ground_hours > 0 && ` (${p.ground_hours < 1 ? Math.round(p.ground_hours * 60) + "m" : Math.round(p.ground_hours * 10) / 10 + "h"})`}
                            {p.ground_hours > 3 && " ⚠️ long journey"}
                          </span>
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

        {/* Copy group plan */}
        {destResult && destResult.people.filter(p => p.viable).length > 0 && (
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-gray-900 mb-1">📋 Copy group plan</h2>
            <p className="text-sm text-gray-500 mb-3">
              One-tap copy of the full group booking summary — paste into WhatsApp, email, or Slack.
            </p>
            <CopyGroupPlanButton room={room} destResult={destResult} destIata={destIata ?? null} toast={toast} />
          </div>
        )}

        {/* Checklist — state persists in localStorage per room */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">✅ Booking checklist</h2>
            <span className="text-xs text-gray-400">
              {checked.size}/{CHECKLIST_ITEMS.length} done
            </span>
          </div>
          <div className="space-y-2 text-sm text-gray-700">
            {CHECKLIST_ITEMS.map((item) => (
              <label key={item} className="flex items-center gap-3 cursor-pointer group">
                <input
                  type="checkbox"
                  checked={checked.has(item)}
                  onChange={() => toggleChecked(item)}
                  className="h-4 w-4 rounded border-gray-300 text-blue-600"
                />
                <span className={checked.has(item) ? "line-through text-gray-400" : ""}>{item}</span>
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
      <FeedbackButton token={token} page="booking" roomSlug={slug} />
    </main>
  );
}

// ── Copy group plan button ─────────────────────────────────────────────────────

function CopyGroupPlanButton({
  room,
  destResult,
  destIata,
  toast,
}: {
  room: Room;
  destResult: FlightResult;
  destIata: string | null;
  toast: { success: (m: string) => void; error: (m: string) => void };
}) {
  function buildPlanText(): string {
    const lines: string[] = [];
    const destDisplay = destResult.destination_name ?? destIata ?? "TBC";
    lines.push(`✈️ ${room.name} — Group Holiday Plan`);
    lines.push(`📍 Destination: ${destDisplay}`);
    if (destResult.shared_out_date) {
      lines.push(`📅 Dates: ${destResult.shared_out_date} → ${destResult.shared_return_date}`);
    }
    lines.push("");
    lines.push("💰 Flights per person:");
    for (const p of destResult.people) {
      if (!p.viable) {
        lines.push(`  ${p.person_name}: ❌ no flights found`);
        continue;
      }
      const costParts: string[] = [`£${Math.round(p.total_money_gbp)}`];
      if (p.chosen_airport) costParts.push(`from ${p.chosen_airport}`);
      if (p.outbound_date) costParts.push(`out ${p.outbound_date}`);
      lines.push(`  ${p.person_name}: ${costParts.join(" · ")}`);
      if (p.booking_link) lines.push(`    🔗 ${p.booking_link}`);
    }
    const viable = destResult.people.filter(p => p.viable);
    if (viable.length > 1) {
      const total = viable.reduce((s, p) => s + p.total_money_gbp, 0);
      const avg = total / viable.length;
      lines.push(`  ─`);
      lines.push(`  Group total: £${Math.round(total)} · Avg: £${Math.round(avg)}/person`);
    }
    lines.push("");
    lines.push("Each person books their own flights using the links above.");
    lines.push("🏨 Compare accommodation: Booking.com, Airbnb, Hotels.com");
    return lines.join("\n");
  }

  return (
    <button
      onClick={() => {
        const text = buildPlanText();
        navigator.clipboard.writeText(text).then(
          () => toast.success("Plan copied to clipboard!"),
          () => toast.error("Clipboard copy failed — try manually selecting the text"),
        );
      }}
      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
    >
      📋 Copy group plan to clipboard
    </button>
  );
}
