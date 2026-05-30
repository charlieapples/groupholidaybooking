"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  getFlightResults,
  runFlightOptimiser,
  advanceStep,
  updateRoom,
  type Room,
  type FlightResult,
} from "@/lib/api";
import { totalTripEstimate, destName, AIRPORT_DISPLAY } from "@/lib/destinations";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import FeedbackButton from "@/components/FeedbackButton";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

export default function FlightsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [results, setResults] = useState<FlightResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [choosingDest, setChoosingDest] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [partialExpanded, setPartialExpanded] = useState(false);
  const [excludedPerson, setExcludedPerson] = useState<string | null>(null);
  // Rotating progress hint while the optimiser is running (15-30s).
  // Cosmetic only — doesn't reflect actual progress, just keeps the user engaged.
  const [hintIdx, setHintIdx] = useState(0);
  const HINTS = useMemo(() => [
    "Checking every airport option for each member…",
    "Asking Travelpayouts for cheapest fares in the date window…",
    "Comparing every member's airport options…",
    "Picking the date pair that minimises group total cost…",
    "Adding ground travel + baggage to each person's total…",
    "Ranking destinations by group spend…",
  ], []);
  useEffect(() => {
    if (!running) return;
    setHintIdx(0);
    const id = setInterval(() => setHintIdx((i) => (i + 1) % HINTS.length), 3500);
    return () => clearInterval(id);
  }, [running, HINTS.length]);

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
    // Keep token fresh when Supabase silently refreshes the JWT
    // (fires every ~50 min; without this the captured token expires).
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, router, supabase]);

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `Flights – ${room.name} | Group Holiday`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

  async function handleRun() {
    if (!token) return;
    setRunning(true);
    setError(null);
    try {
      // Always grab a fresh token before slow calls — Supabase JWTs expire
      // after 1 hour and the captured `token` may have gone stale while the
      // user sat on the page. getSession() returns the auto-refreshed value.
      const { data } = await supabase.auth.getSession();
      const freshToken = data.session?.access_token;
      if (!freshToken) {
        router.replace("/");
        return;
      }
      setToken(freshToken);
      const res = await runFlightOptimiser(freshToken, slug);
      setResults(res);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Flight search failed. Please check all prerequisites are complete.");
    } finally {
      setRunning(false);
    }
  }

  async function handleChooseDestination(iata: string) {
    if (!token || !room?.is_admin) return;
    setChoosingDest(iata);
    try {
      await updateRoom(token, slug, { destination_iata: iata });
      await advanceStep(token, slug);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to choose destination"));
      setChoosingDest(null);
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  // Partition results: hide destinations where nobody can go
  const viableResults = results.filter(r => r.viable_count > 0);
  const fullyViable = viableResults.filter(r => r.is_fully_viable);
  const partial = viableResults.filter(r => !r.is_fully_viable);
  const hiddenCount = results.length - viableResults.length;

  // Contingency: when no fully-viable destination exists, allow excluding one person
  const allPeople = results.length > 0
    ? Array.from(new Set(results.flatMap(r => r.people.map(p => p.person_name))))
    : [];

  // Destinations that work for everyone *except* the excluded person
  const contingencyResults = excludedPerson
    ? viableResults.filter(r =>
        r.people.every(p => p.person_name === excludedPerson || p.viable)
      )
    : [];

  const bestResult = fullyViable[0] ?? (excludedPerson ? contingencyResults[0] : null);

  // Compute typical trip nights from best result's dates or room min_nights
  const tripNights = (() => {
    const r = results[0];
    if (r?.shared_out_date && r?.shared_return_date) {
      return Math.round((new Date(r.shared_return_date).getTime() - new Date(r.shared_out_date).getTime()) / 86_400_000);
    }
    return room.min_nights ?? undefined;
  })();

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

        {/* Baggage info banner */}
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900 flex items-start gap-2">
          <span className="text-lg leading-none">🧳</span>
          <p>
            Prices include a per-airline <strong>carry-on estimate</strong> —
            Travelpayouts returns rock-bottom &ldquo;personal item only&rdquo; fares. Airlines
            like BA &amp; easyJet include cabin bags; Ryanair/Wizz Air charge extra.
            Hold luggage can be added at checkout.
          </p>
        </div>

        {/* Run button */}
        {room.is_admin && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-2">Flight optimiser</h2>
            <p className="text-sm text-gray-600 mb-4">
              Checks every UK airport each member can reach (not just the closest) against all destination candidates, and picks the cheapest overall combination.
              This can take 15–30 seconds.
            </p>

            {/* Pre-flight checklist */}
            {!running && (
              <div className="mb-4 grid gap-1.5">
                {[
                  {
                    ok: !!room.agreed_start,
                    label: "Agreed travel dates",
                    fix: "availability",
                    fixLabel: "Set availability",
                  },
                  {
                    ok: !!room.min_nights,
                    label: "Trip duration set",
                    fix: "preferences",
                    fixLabel: "Set duration",
                  },
                ].map(({ ok, label, fix, fixLabel }) => (
                  <div key={label} className={`flex items-center gap-2 text-xs rounded-lg px-3 py-1.5 ${ok ? "text-green-700 bg-green-50" : "text-amber-700 bg-amber-50"}`}>
                    <span>{ok ? "✓" : "⚠"}</span>
                    <span className="flex-1">{label}</span>
                    {!ok && (
                      <button
                        onClick={() => router.push(`/room/${slug}/${fix}`)}
                        className="underline font-medium hover:opacity-75"
                      >
                        {fixLabel} →
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

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
            {running && (
              <p className="mt-3 text-sm text-gray-500 italic" key={hintIdx}>
                {HINTS[hintIdx]}
              </p>
            )}
          </div>
        )}

        {!room.is_admin && results.length === 0 && (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
            <div className="text-3xl mb-2">⏳</div>
            <p>Waiting for the admin to run the flight search…</p>
          </div>
        )}

        {/* Empty results after a run finished — admin-side only */}
        {room.is_admin && !running && results.length === 0 && !error && (
          <div className="rounded-xl border bg-white p-8 text-center text-gray-600 space-y-2">
            <div className="text-3xl">🔍</div>
            <p className="font-medium text-gray-900">No results yet — click <strong>Find flights</strong> above.</p>
            <p className="text-sm">
              You need: agreed dates (from availability), trip length (from duration & budget),
              at least one destination candidate, and every member&apos;s postcode set.
            </p>
          </div>
        )}

        {/* Results */}
        {viableResults.length > 0 && (
          <div className="space-y-4">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <h2 className="text-xl font-bold text-gray-900">Results</h2>
              <div className="text-right">
                <p className="text-sm text-gray-500">
                  {fullyViable.length} of {results.length} {results.length === 1 ? "destination" : "destinations"} work for everyone
                  {hiddenCount > 0 && ` · ${hiddenCount} hidden (no flights)`}
                </p>
                {(() => {
                  const ts = results.find(r => r.computed_at)?.computed_at;
                  if (!ts) return null;
                  const d = new Date(ts);
                  const minsAgo = Math.round((Date.now() - d.getTime()) / 60000);
                  const label = minsAgo < 2 ? "just now" : minsAgo < 60 ? `${minsAgo}m ago` : `${Math.round(minsAgo/60)}h ago`;
                  return <p className="text-xs text-gray-400">Prices from {label} — may vary at checkout</p>;
                })()}
              </div>
            </div>

            {/* Fully viable destinations */}
            {fullyViable.length > 0 ? (
              <ResultsList
                results={fullyViable}
                bestResult={bestResult}
                expanded={expanded}
                setExpanded={setExpanded}
                isAdmin={!!room.is_admin}
                memberCount={room.member_count ?? 0}
                nights={tripNights}
                budgetGbp={room.budget_gbp}
                choosingDest={choosingDest}
                handleChooseDestination={handleChooseDestination}
              />
            ) : (
              /* No fully-viable destinations — contingency panel */
              <div className="rounded-xl border-2 border-amber-200 bg-amber-50 p-6 space-y-4">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <h3 className="font-bold text-amber-900">No destination works for everyone right now</h3>
                    <p className="text-sm text-amber-800 mt-1">
                      Some flights couldn&apos;t be found for one or more people. You can:
                    </p>
                  </div>
                </div>
                <ul className="text-sm text-amber-900 space-y-2 ml-10 list-disc">
                  <li>
                    <button
                      onClick={() => router.push(`/room/${slug}/destinations`)}
                      className="underline hover:text-amber-700"
                    >
                      Add more destination candidates
                    </button>
                    {" "}— a wider list increases the chance of finding viable flights for everyone.
                  </li>
                  <li>Check that everyone has set their postcode in their profile (needed for ground travel calculation).</li>
                  <li>Try the &ldquo;What if someone can&apos;t make it?&rdquo; tool below to see options for a smaller group.</li>
                </ul>

                {/* What-if tool */}
                {allPeople.length > 0 && (
                  <div className="rounded-lg border border-amber-300 bg-white p-4 space-y-3">
                    <p className="text-sm font-semibold text-gray-900">What if someone can&apos;t make it?</p>
                    <p className="text-xs text-gray-500">
                      Select a person to see which destinations work for everyone else. This does not change the plan — it&apos;s just a what-if view.
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {allPeople.map(name => (
                        <button
                          key={name}
                          onClick={() => setExcludedPerson(excludedPerson === name ? null : name)}
                          className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                            excludedPerson === name
                              ? "bg-amber-600 text-white border-amber-600"
                              : "bg-white text-gray-700 border-gray-300 hover:border-amber-400"
                          }`}
                        >
                          {excludedPerson === name ? "✕ " : ""}{name}
                        </button>
                      ))}
                    </div>
                    {excludedPerson && (
                      <div className="mt-2">
                        {contingencyResults.length > 0 ? (
                          <>
                            <p className="text-sm text-green-700 font-medium mb-3">
                              ✅ {contingencyResults.length} destination{contingencyResults.length !== 1 ? "s" : ""} work for everyone except {excludedPerson}:
                            </p>
                            <ResultsList
                              results={contingencyResults}
                              bestResult={contingencyResults[0]}
                              expanded={expanded}
                              setExpanded={setExpanded}
                              isAdmin={!!room.is_admin}
                              memberCount={room.member_count ?? 0}
                              nights={tripNights}
                              budgetGbp={room.budget_gbp}
                              choosingDest={choosingDest}
                              handleChooseDestination={handleChooseDestination}
                            />
                          </>
                        ) : (
                          <p className="text-sm text-red-700">
                            No destinations found even without {excludedPerson}. Try adding more candidates.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Partial results — collapsed by default */}
            {partial.length > 0 && (
              <div className="space-y-2">
                <button
                  onClick={() => setPartialExpanded(!partialExpanded)}
                  className="flex items-center gap-2 text-sm font-medium text-gray-600 hover:text-gray-900"
                >
                  <span>{partialExpanded ? "▼" : "▶"}</span>
                  <span>
                    Partial results ({partial.length}) — destinations where not everyone can get a flight
                  </span>
                </button>
                {partialExpanded && (
                  <div className="space-y-3 pl-4 border-l-2 border-amber-200">
                    <p className="text-xs text-gray-500">
                      These are shown for reference. Consider them if your group is flexible about who attends.
                    </p>
                    <ResultsList
                      results={partial}
                      bestResult={null}
                      expanded={expanded}
                      setExpanded={setExpanded}
                      isAdmin={!!room.is_admin}
                      memberCount={room.member_count ?? 0}
                      nights={tripNights}
                      budgetGbp={room.budget_gbp}
                      choosingDest={choosingDest}
                      handleChooseDestination={handleChooseDestination}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Admin: pick destination note */}
        {room.is_admin && results.length > 0 && !room.destination_iata && (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Ready to choose?</h2>
            <p className="text-sm text-blue-700">
              Click <strong>Choose this</strong> on your preferred destination above to lock it in and move to the booking step.
            </p>
          </div>
        )}
        {room.destination_iata && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-6">
            <p className="font-semibold text-green-800">✅ Destination locked in: {destName(room.destination_iata)}</p>
            <p className="text-xs text-green-600 font-mono mt-0.5">{room.destination_iata}</p>
          </div>
        )}
      </div>

      {token && <ChatWidget token={token} roomSlug={slug} />}
      <FeedbackButton token={token} page="flights" roomSlug={slug} />
    </main>
  );
}

// Airport display names imported from shared lib (AIRPORT_DISPLAY)

// ── Sub-component: renders a list of FlightResult cards ───────────────────────

interface ResultsListProps {
  results: FlightResult[];
  bestResult: FlightResult | null;
  expanded: string | null;
  setExpanded: (key: string | null) => void;
  isAdmin: boolean;
  memberCount: number;
  nights?: number;
  budgetGbp?: number | null;
  choosingDest: string | null;
  handleChooseDestination: (iata: string) => void;
}

function ResultsList({
  results,
  bestResult,
  expanded,
  setExpanded,
  isAdmin,
  memberCount,
  nights,
  budgetGbp,
  choosingDest,
  handleChooseDestination,
}: ResultsListProps) {
  return (
    <div className="space-y-3">
      {results.map((r) => (
        <div
          key={r.destination}
          className={`rounded-xl border bg-white shadow-sm overflow-hidden ${
            r === bestResult ? "border-blue-400 ring-1 ring-blue-400" : ""
          }`}
        >
          {/* Summary header */}
          <div className="p-5 flex items-center justify-between gap-4">
            <button
              className="flex items-center gap-3 flex-1 min-w-0 text-left"
              onClick={() => setExpanded(expanded === r.destination ? null : r.destination)}
            >
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-gray-900">{r.destination_name}</h3>
                  {r === bestResult && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 text-xs font-semibold text-white">Best</span>
                  )}
                  {!r.is_fully_viable && (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
                      {r.viable_count}/{memberCount} can go
                    </span>
                  )}
                  {budgetGbp && Math.round(r.avg_individual_cost) > budgetGbp && (
                    <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                      Over budget
                    </span>
                  )}
                </div>
                {r.shared_out_date && (
                  <p className="text-xs text-gray-500 mt-0.5">
                    {r.shared_out_date} → {r.shared_return_date}
                  </p>
                )}
              </div>
            </button>
            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <p className="text-xl font-bold text-gray-900">
                  ~£{Math.round(r.avg_individual_cost).toLocaleString()}
                </p>
                <p className="text-xs text-gray-500">flights avg/person</p>
                {nights && nights > 0 && (() => {
                  const est = totalTripEstimate(r.destination, Math.round(r.avg_individual_cost), nights, memberCount);
                  if (!est) return null;
                  return (
                    <p className="text-xs text-gray-400" title="Estimated total including typical accommodation cost">
                      ~£{est.budget}–£{est.mid} incl. hotel
                    </p>
                  );
                })()}
              </div>
              {isAdmin && (
                <button
                  onClick={() => handleChooseDestination(r.destination)}
                  disabled={choosingDest !== null}
                  className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-green-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {choosingDest === r.destination ? "Choosing…" : "Choose this"}
                </button>
              )}
              <button
                onClick={() => setExpanded(expanded === r.destination ? null : r.destination)}
                className="text-gray-400"
              >
                {expanded === r.destination ? "▲" : "▼"}
              </button>
            </div>
          </div>

          {/* Per-person breakdown */}
          {expanded === r.destination && (
            <div className="border-t px-5 pb-5">
              <div className="mt-4 space-y-3">
                {r.people.map((p) => (
                  <div key={p.person_name} className={`rounded-lg p-3 ${p.viable ? "bg-gray-50" : "bg-red-50"}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-gray-900 text-sm">
                        {p.person_name}
                        {!p.viable && (
                          <span className="ml-2 text-xs text-red-600">no viable flight found</span>
                        )}
                      </span>
                      {p.viable && (
                        <span className="font-semibold text-gray-900 text-sm">
                          £{Math.round(p.total_money_gbp).toLocaleString()}
                        </span>
                      )}
                    </div>
                    {p.viable && (
                      <div className="text-xs text-gray-500 space-y-0.5">
                        {p.chosen_airport && <p>Flying from: <strong>{AIRPORT_DISPLAY[p.chosen_airport] ?? p.chosen_airport}</strong> ({p.chosen_airport})</p>}
                        {p.outbound_date && <p>Out: {p.outbound_date} · In: {p.inbound_date}</p>}
                        <div className="flex gap-3 flex-wrap">
                          {p.outbound_cost_gbp > 0 && (
                            <span>Flights: £{Math.round(p.outbound_cost_gbp + p.inbound_cost_gbp)}</span>
                          )}
                          {p.baggage_cost_gbp > 0
                            ? <span title="Estimated cabin bag add-on for this airline">Cabin bag est.: £{Math.round(p.baggage_cost_gbp)}</span>
                            : <span className="text-green-600">Cabin bag incl.</span>
                          }
                          {p.ground_cost_gbp > 0 && (
                            <span className={p.ground_hours > 2.5 ? "text-amber-700 font-medium" : ""}>
                              Ground: £{Math.round(p.ground_cost_gbp)}
                              {p.ground_hours > 0 && ` (${p.ground_hours < 1 ? Math.round(p.ground_hours * 60) + "m" : Math.round(p.ground_hours * 10) / 10 + "h"})`}
                              {p.ground_hours > 3 && " ⚠️"}
                            </span>
                          )}
                        </div>
                        {p.booking_link && (
                          <a
                            href={p.booking_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block mt-1 text-blue-600 hover:underline"
                          >
                            Book return on Aviasales →
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
                <span className="font-bold text-blue-900">
                  £{Math.round(r.total_group_money_cost).toLocaleString()}
                </span>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
