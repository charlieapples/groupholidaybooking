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

// Destination → approx Booking.com city name for search
const DEST_TO_BOOKING: Record<string, string> = {
  AMS: "Amsterdam", BCN: "Barcelona", DUB: "Dublin", LIS: "Lisbon",
  FCO: "Rome", CDG: "Paris", PMI: "Palma", AGP: "Malaga", FAO: "Faro",
  OPO: "Porto", NCE: "Nice", MAD: "Madrid", MXP: "Milan", VCE: "Venice",
  NAP: "Naples", MLA: "Malta", IBZ: "Ibiza", ALC: "Alicante",
  PRG: "Prague", VIE: "Vienna", BUD: "Budapest", KRK: "Krakow",
  ATH: "Athens", HER: "Heraklion", RHO: "Rhodes", JMK: "Mykonos", JTR: "Santorini",
  DBV: "Dubrovnik", SPU: "Split", ZAD: "Zadar",
  TFS: "Tenerife", LPA: "Gran Canaria", ACE: "Lanzarote", FUE: "Fuerteventura",
  FNC: "Madeira", IST: "Istanbul",
};

function bookingComLink(iata: string, checkIn: string, checkOut: string, guests: number) {
  const city = DEST_TO_BOOKING[iata] || iata;
  const params = new URLSearchParams({
    ss: city,
    checkin: checkIn,
    checkout: checkOut,
    group_adults: String(guests),
    no_rooms: "1",
    order: "price",
  });
  return `https://www.booking.com/searchresults.html?${params}`;
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
  const checkIn = room.agreed_start ?? destResult?.shared_out_date ?? "";
  const checkOut = room.agreed_end ?? destResult?.shared_return_date ?? "";
  const accommodationLink = destIata
    ? bookingComLink(destIata, checkIn, checkOut, members.length)
    : null;

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
        {accommodationLink && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🏨 Accommodation</h2>
            <p className="text-sm text-gray-600 mb-4">
              Search for {DEST_TO_BOOKING[destIata!] ?? destIata} accommodation for {members.length}{" "}
              people — {checkIn} to {checkOut}.
            </p>
            <div className="flex gap-3 flex-wrap">
              <a
                href={accommodationLink}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Search on Booking.com
              </a>
              <button
                onClick={() => copyLink(accommodationLink, "accommodation")}
                className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                {copied === "accommodation" ? "Copied!" : "Copy link"}
              </button>
            </div>
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
                      <div className="text-xs text-gray-500 flex gap-4">
                        {p.outbound_date && <span>Out: {p.outbound_date}</span>}
                        {p.inbound_date && <span>Return: {p.inbound_date}</span>}
                        {p.outbound_cost_gbp + p.inbound_cost_gbp > 0 && (
                          <span>Flights: £{Math.round(p.outbound_cost_gbp + p.inbound_cost_gbp)}</span>
                        )}
                      </div>
                      {p.booking_link ? (
                        <div className="flex gap-2">
                          <a
                            href={p.booking_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            Book outbound flight
                          </a>
                          <button
                            onClick={() => copyLink(p.booking_link!, p.person_name)}
                            className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50"
                          >
                            {copied === p.person_name ? "Copied!" : "Copy link"}
                          </button>
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
