"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  getFlightResults,
  runFlightOptimiser,
  advanceStep,
  type Room,
  type FlightResult,
} from "@/lib/api";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

export default function FlightsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [advancing, setAdvancing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      try {
        const r = await getRoom(t, slug);
        setRoom(r);
        // Try to load cached results
        const res = await getFlightResults(t, slug).catch(() => null);
        if (res) setResults(res);
      } catch {
        router.replace("/dashboard");
      }
      setLoading(false);
    });
  }, [slug, router, supabase]);

  async function handleRun() {
    if (!token) return;
    setRunning(true);
    setError(null);
    try {
      const res = await runFlightOptimiser(token, slug);
      setResults(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Flight search failed. Please check all prerequisites are complete.");
    } finally {
      setRunning(false);
    }
  }

  async function handleAdvance() {
    if (!token || !room?.is_admin) return;
    setAdvancing(true);
    try {
      await advanceStep(token, slug);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to advance");
      setAdvancing(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  const bestResult = results.find(r => r.is_fully_viable) ?? results[0];

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← {room.name}
          </button>
          <span className="font-semibold text-gray-900">✈️ Flights</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-10 space-y-8">

        {/* Room dates summary */}
        {(room.agreed_start || room.min_nights) && (
          <div className="rounded-xl border bg-white p-4 shadow-sm flex flex-wrap gap-6 text-sm">
            {room.agreed_start && (
              <div>
                <p className="text-gray-500">Travel window</p>
                <p className="font-semibold text-gray-900">{room.agreed_start} → {room.agreed_end}</p>
              </div>
            )}
            {room.min_nights && (
              <div>
                <p className="text-gray-500">Duration</p>
                <p className="font-semibold text-gray-900">{room.min_nights}–{room.max_nights} nights</p>
              </div>
            )}
            {room.budget_gbp && (
              <div>
                <p className="text-gray-500">Budget cap</p>
                <p className="font-semibold text-gray-900">£{room.budget_gbp.toLocaleString()} pp</p>
              </div>
            )}
          </div>
        )}

        {/* Run button */}
        {room.is_admin && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Flight optimiser</h2>
            <p className="text-sm text-gray-600 mb-4">
              Searches for the best flights from each member&apos;s nearest airport to all destination candidates.
              This can take 15–30 seconds.
            </p>
            {error && (
              <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <button
              onClick={handleRun}
              disabled={running}
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
            >
              {running ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Searching flights…
                </>
              ) : results.length > 0 ? (
                "🔄 Re-run search"
              ) : (
                "🔍 Find flights"
              )}
            </button>
          </div>
        )}

        {!room.is_admin && results.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">⏳</div>
            <p>Waiting for the admin to run the flight search…</p>
          </div>
        )}

        {/* Results */}
        {results.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Results</h2>
              <p className="text-sm text-gray-500">
                {results.filter(r => r.is_fully_viable).length} of {results.length} destinations work for everyone
              </p>
            </div>

            {results.map((r) => (
              <div
                key={r.destination}
                className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
                  r === bestResult ? "border-blue-400 ring-1 ring-blue-400" : ""
                }`}
              >
                {/* Summary header */}
                <button
                  className="w-full text-left p-5 flex items-center justify-between gap-4"
                  onClick={() => setExpanded(expanded === r.destination ? null : r.destination)}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-bold text-gray-900">{r.destination_name}</h3>
                        {r === bestResult && (
                          <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">Best</span>
                        )}
                        {!r.is_fully_viable && (
                          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                            {r.viable_count}/{room.member_count} can go
                          </span>
                        )}
                      </div>
                      {r.shared_out_date && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {r.shared_out_date} → {r.shared_return_date}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xl font-bold text-gray-900">
                      £{Math.round(r.avg_individual_cost).toLocaleString()}
                    </p>
                    <p className="text-xs text-gray-500">avg per person</p>
                  </div>
                  <span className="text-gray-400">{expanded === r.destination ? "▲" : "▼"}</span>
                </button>

                {/* Per-person breakdown */}
                {expanded === r.destination && (
                  <div className="border-t px-5 pb-5">
                    <div className="mt-4 space-y-3">
                      {r.people.map((p) => (
                        <div key={p.person_name} className={`rounded-lg p-3 ${p.viable ? "bg-gray-50" : "bg-red-50"}`}>
                          <div className="flex items-center justify-between mb-1">
                            <span className="font-medium text-gray-900 text-sm">
                              {p.person_name}
                              {!p.viable && <span className="ml-2 text-xs text-red-600">(no viable flight found)</span>}
                            </span>
                            <span className="font-semibold text-gray-900 text-sm">
                              £{Math.round(p.total_money_gbp).toLocaleString()}
                            </span>
                          </div>
                          {p.viable && (
                            <div className="text-xs text-gray-500 space-y-0.5">
                              {p.chosen_airport && <p>From: {p.chosen_airport}</p>}
                              {p.outbound_date && <p>Out: {p.outbound_date} · In: {p.inbound_date}</p>}
                              <div className="flex gap-3">
                                {p.outbound_cost_gbp > 0 && <span>Flights: £{Math.round(p.outbound_cost_gbp + p.inbound_cost_gbp)}</span>}
                                {p.ground_cost_gbp > 0 && <span>Ground: £{Math.round(p.ground_cost_gbp)}</span>}
                              </div>
                              {p.booking_link && (
                                <a
                                  href={p.booking_link}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-block mt-1 text-blue-600 hover:underline"
                                >
                                  Book outbound flight →
                                </a>
                              )}
                            </div>
                          )}
                          {p.note && <p className="text-xs text-gray-400 mt-1">{p.note}</p>}
                        </div>
                      ))}
                    </div>

                    {/* Group total */}
                    <div className="mt-4 rounded-lg bg-blue-50 px-4 py-3 flex justify-between text-sm">
                      <span className="font-medium text-blue-900">Group total</span>
                      <span className="font-bold text-blue-900">£{Math.round(r.total_group_money_cost).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Admin advance */}
        {room.is_admin && results.length > 0 && (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Ready to book?</h2>
            <p className="text-sm text-blue-700 mb-4">
              Share the flight links with the group and use the booking step to coordinate.
            </p>
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {advancing ? "Advancing…" : "Move to booking step →"}
            </button>
          </div>
        )}
      </div>

      {token && <ChatWidget token={token} roomSlug={slug} />}
    </main>
  );
}
