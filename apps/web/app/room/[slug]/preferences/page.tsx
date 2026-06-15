"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  getDurationBudget,
  submitDurationBudget,
  updateRoom,
  advanceStep,
  type Room,
  type DurationBudgetAggregate,
} from "@/lib/api";
import FeedbackButton from "@/components/FeedbackButton";
import AccountBadge from "@/components/AccountBadge";
import StepBar from "@/components/StepBar";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";

export default function PreferencesPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [data, setData] = useState<DurationBudgetAggregate | null>(null);
  const [loading, setLoading] = useState(true);

  // My inputs
  const [minNights, setMinNights] = useState("");
  const [maxNights, setMaxNights] = useState("");
  const [budget, setBudget] = useState("");
  // "cheapest" = no cap (just rank cheapest first); "cap" = a specific £ limit.
  const [budgetMode, setBudgetMode] = useState<"cheapest" | "cap">("cheapest");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Admin: set agreed values
  const [agreedMin, setAgreedMin] = useState("");
  const [agreedMax, setAgreedMax] = useState("");
  const [agreedBudget, setAgreedBudget] = useState("");
  const [agreedBudgetMode, setAgreedBudgetMode] = useState<"cheapest" | "cap">("cheapest");
  // Group's £/hr valuation of airport travel time (flight optimiser).
  // 0 = cheapest regardless of distance; 50 = strongly prefer nearby airports.
  const [timeValue, setTimeValue] = useState(0);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      const uid = s.session.user.id;
      setToken(t);
      try {
        const [r, d] = await Promise.all([getRoom(t, slug), getDurationBudget(t, slug)]);
        setRoom(r);
        setData(d);
        // Pre-fill admin fields: use saved room values if already set,
        // otherwise compute the overlap range from responses
        if (r.min_nights) setAgreedMin(String(r.min_nights));
        if (r.max_nights) setAgreedMax(String(r.max_nights));
        if (r.budget_gbp) { setAgreedBudget(String(r.budget_gbp)); setAgreedBudgetMode("cap"); }
        if (r.time_value_per_hour != null) setTimeValue(r.time_value_per_hour);
        // Pre-fill my personal preferences from saved answers
        const mine = d.responses.find((row) => row.user_id === uid);
        if (mine) {
          if (mine.min_nights) setMinNights(String(mine.min_nights));
          if (mine.max_nights) setMaxNights(String(mine.max_nights));
          if (mine.budget_gbp) { setBudget(String(mine.budget_gbp)); setBudgetMode("cap"); }
        }
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
    if (room?.name) document.title = `Duration & Budget – ${room.name} | Group Holiday Booking`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

  // Min nights must be ≤ max nights (you can't have a 6–5 night trip).
  const memberDurationInvalid =
    !!minNights && !!maxNights && Number(minNights) > Number(maxNights);
  const agreedDurationInvalid =
    !!agreedMin && !!agreedMax && Number(agreedMin) > Number(agreedMax);

  async function handleSave() {
    if (!token) return;
    if (memberDurationInvalid) {
      toast.error("Minimum nights can't be more than the maximum.");
      return;
    }
    setSaving(true);
    try {
      const body: { min_nights?: number; max_nights?: number; budget_gbp?: number } = {};
      if (minNights) body.min_nights = Number(minNights);
      if (maxNights) body.max_nights = Number(maxNights);
      if (budget) body.budget_gbp = Number(budget);
      await submitDurationBudget(token, slug, body);
      const d = await getDurationBudget(token, slug);
      setData(d);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save"));
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance() {
    if (!token || !room?.is_admin) return;
    if (!agreedMin || !agreedMax) {
      toast.error("Please set agreed min and max nights before advancing.");
      return;
    }
    if (agreedDurationInvalid) {
      toast.error("Minimum nights can't be more than the maximum.");
      return;
    }
    setAdvancing(true);
    try {
      await updateRoom(token, slug, {
        min_nights: Number(agreedMin),
        max_nights: Number(agreedMax),
        ...(agreedBudget ? { budget_gbp: Number(agreedBudget) } : {}),
        time_value_per_hour: timeValue,
      });
      // Advance through BOTH duration + budget steps into destination
      // (the preferences page handles both steps together)
      let updated = await advanceStep(token, slug);
      if (updated.current_step === "budget") {
        updated = await advanceStep(token, slug); // budget → destination
      }
      router.push(`/room/${slug}/destinations`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to advance"));
      setAdvancing(false);
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room || !data) return null;

  const responsesCount = data.responses.length;
  const totalMembers = data.members_total;

  // ── Duration statistics ────────────────────────────────────────────────────
  const allMin = data.responses.map(r => r.min_nights).filter(Boolean) as number[];
  const allMax = data.responses.map(r => r.max_nights).filter(Boolean) as number[];
  const allBudget = data.responses.map(r => r.budget_gbp).filter(Boolean) as number[];

  // Overlap range: the nights that work for EVERYONE
  // = max(all minimums) to min(all maximums)
  const overlapMin = allMin.length ? Math.max(...allMin) : null;
  const overlapMax = allMax.length ? Math.min(...allMax) : null;
  const hasOverlap = overlapMin !== null && overlapMax !== null && overlapMin <= overlapMax;
  const hasConflict = overlapMin !== null && overlapMax !== null && overlapMin > overlapMax;

  // Average range (softer suggestion)
  const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a,b)=>a+b,0)/arr.length) : null;
  const avgMin = avg(allMin);
  const avgMax = avg(allMax);

  const minBudget = allBudget.length ? Math.min(...allBudget) : null;
  const avgBudget = allBudget.length
    ? Math.round(allBudget.reduce((a, b) => a + b, 0) / allBudget.length)
    : null;

  // Auto-suggest the overlap range to admin; fall back to average if no overlap
  const suggestedMin = hasOverlap ? overlapMin : avgMin;
  const suggestedMax = hasOverlap ? overlapMax : avgMax;

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← {room.name}
          </button>
          <span className="font-semibold text-gray-900">Duration &amp; Budget</span>
          <div className="flex items-center gap-3">
            <AccountBadge className="hidden sm:flex" />
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Dashboard →
            </button>
          </div>
        </div>
      </nav>
      <StepBar slug={slug} currentStep={room.current_step} activeRoute="preferences" />

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">
        {/* Step badges */}
        <div className="flex gap-3">
          <span className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white">Step 2: Duration</span>
          <span className="rounded-full bg-blue-600 px-4 py-1.5 text-sm font-semibold text-white">Step 3: Budget</span>
        </div>

        {/* My preferences */}
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Your preferences</h2>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">Trip length (nights)</label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Minimum</p>
                <input
                  type="number"
                  min={1}
                  max={30}
                  placeholder="e.g. 5"
                  value={minNights}
                  onChange={(e) => setMinNights(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <span className="text-gray-400 pt-5">–</span>
              <div className="flex-1">
                <p className="text-xs text-gray-500 mb-1">Maximum</p>
                <input
                  type="number"
                  min={1}
                  max={30}
                  placeholder="e.g. 10"
                  value={maxNights}
                  onChange={(e) => setMaxNights(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className={`w-full rounded-lg border px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none ${
                    memberDurationInvalid ? "border-red-400 bg-red-50 focus:border-red-500" : "border-gray-300 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>
            {memberDurationInvalid && (
              <p className="mt-1.5 text-xs font-medium text-red-600">
                ⚠️ Minimum can&apos;t be more than the maximum — set it lowest first, then highest.
              </p>
            )}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Budget per person</label>
            <div className="mb-2 flex rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit">
              {([
                ["cheapest", "💸 Aim for cheapest"],
                ["cap", "🎯 Set a max budget"],
              ] as const).map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => { setBudgetMode(val); if (val === "cheapest") setBudget(""); }}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                    budgetMode === val ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {budgetMode === "cap" ? (
              <>
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 500"
                  value={budget}
                  onChange={(e) => setBudget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Total including flights, accommodation, and travel to airport.
                </p>
              </>
            ) : (
              <p className="text-xs text-gray-500">
                No cap — destinations will just be ranked from cheapest to most expensive for the group.
              </p>
            )}
          </div>

          <button
            onClick={handleSave}
            disabled={saving || memberDurationInvalid || (!minNights && !maxNights && !budget)}
            className="rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : saved ? "✓ Saved!" : "Save preferences"}
          </button>
        </div>

        {/* Group responses */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Group responses</h2>
            <span className="text-sm text-gray-500">
              {responsesCount} / {totalMembers} submitted
            </span>
          </div>

          {data.responses.length === 0 ? (
            <p className="text-sm text-gray-500">No responses yet.</p>
          ) : (
            <div className="divide-y">
              {data.responses.map((r) => (
                <div key={r.user_id} className="py-3 flex items-center justify-between">
                  <span className="text-sm font-medium text-gray-900">
                    {r.display_name || "Unknown"}
                  </span>
                  <div className="flex gap-4 text-sm text-gray-600">
                    {r.min_nights && r.max_nights && (
                      <span>{r.min_nights}–{r.max_nights} nights</span>
                    )}
                    {r.budget_gbp && (
                      <span>£{r.budget_gbp?.toLocaleString()}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Admin: set agreed values */}
        {room.is_admin && (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6 space-y-5">
            <h2 className="text-lg font-bold text-blue-900">Admin: set agreed values</h2>

            {/* Duration statistics */}
            {allMin.length > 0 && (
              <div className="space-y-2 text-sm">
                {hasOverlap && (
                  <div className="flex items-start gap-2 rounded-lg bg-green-100 border border-green-200 px-3 py-2 text-green-800">
                    <span>✅</span>
                    <span>
                      <strong>Universal overlap: {overlapMin}–{overlapMax} nights</strong>
                      {" "}— this range works for everyone
                    </span>
                  </div>
                )}
                {hasConflict && (
                  <div className="flex items-start gap-2 rounded-lg bg-amber-100 border border-amber-200 px-3 py-2 text-amber-800">
                    <span>⚠️</span>
                    <span>
                      <strong>No universal overlap</strong> — someone will need to compromise.
                      Shortest someone will go: {overlapMin} nights.
                      Longest someone can manage: {overlapMax} nights.
                    </span>
                  </div>
                )}
                <div className="grid grid-cols-2 gap-3 text-xs text-blue-700">
                  {avgMin && avgMax && (
                    <div className="rounded-lg bg-blue-100 px-3 py-2">
                      <p className="font-semibold text-blue-900">Group average</p>
                      <p>{avgMin}–{avgMax} nights</p>
                    </div>
                  )}
                  {minBudget && avgBudget && (
                    <div className="rounded-lg bg-blue-100 px-3 py-2">
                      <p className="font-semibold text-blue-900">Budget</p>
                      <p>Tightest: <strong>£{minBudget.toLocaleString()}</strong></p>
                      <p>Average: £{avgBudget.toLocaleString()}</p>
                    </div>
                  )}
                </div>
                {/* Individual ranges visualised */}
                {data.responses.filter(r => r.min_nights || r.max_nights).length > 0 && (
                  <div className="rounded-lg bg-white border border-blue-200 p-3 space-y-1.5">
                    <p className="text-xs font-semibold text-blue-800 mb-2">Individual responses</p>
                    {data.responses.map(r => (
                      r.min_nights || r.max_nights ? (
                        <div key={r.user_id} className="flex items-center gap-3">
                          <span className="text-xs text-gray-600 w-24 truncate">{r.display_name || "Unknown"}</span>
                          <div className="flex-1 h-4 bg-gray-100 rounded-full relative overflow-hidden">
                            {r.min_nights && r.max_nights && (
                              <div
                                className="absolute h-full bg-blue-400 rounded-full"
                                style={{
                                  left: `${Math.max(0, ((r.min_nights - 1) / 29) * 100)}%`,
                                  width: `${Math.max(4, ((r.max_nights - r.min_nights) / 29) * 100)}%`,
                                }}
                              />
                            )}
                          </div>
                          <span className="text-xs text-gray-500 w-16 text-right">
                            {r.min_nights}–{r.max_nights}n
                          </span>
                        </div>
                      ) : null
                    ))}
                    {/* Overlap marker */}
                    {hasOverlap && (
                      <div className="flex items-center gap-3 mt-1 pt-1 border-t border-blue-200">
                        <span className="text-xs font-semibold text-green-700 w-24">Overlap</span>
                        <div className="flex-1 h-4 bg-gray-100 rounded-full relative overflow-hidden">
                          <div
                            className="absolute h-full bg-green-400 rounded-full"
                            style={{
                              left: `${Math.max(0, ((overlapMin! - 1) / 29) * 100)}%`,
                              width: `${Math.max(4, ((overlapMax! - overlapMin!) / 29) * 100)}%`,
                            }}
                          />
                        </div>
                        <span className="text-xs font-semibold text-green-700 w-16 text-right">
                          {overlapMin}–{overlapMax}n ✅
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-800">Min nights</label>
                <input
                  type="number"
                  min={1}
                  value={agreedMin}
                  onChange={(e) => setAgreedMin(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-800">Max nights</label>
                <input
                  type="number"
                  min={agreedMin || 1}
                  value={agreedMax}
                  onChange={(e) => setAgreedMax(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
                  className={`w-full rounded-lg border bg-white px-3 py-2 text-sm text-gray-900 focus:outline-none ${
                    agreedDurationInvalid ? "border-red-400 bg-red-50 focus:border-red-500" : "border-blue-300 focus:border-blue-500"
                  }`}
                />
              </div>
            </div>
            {agreedDurationInvalid && (
              <p className="mt-2 text-xs font-medium text-red-600">
                ⚠️ Min nights can&apos;t be more than max — enter the smaller number on the left.
              </p>
            )}
            {(suggestedMin || suggestedMax) && (
              <button
                type="button"
                onClick={() => {
                  if (suggestedMin) setAgreedMin(String(suggestedMin));
                  if (suggestedMax) setAgreedMax(String(suggestedMax));
                  if (minBudget) { setAgreedBudget(String(minBudget)); setAgreedBudgetMode("cap"); }
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                ↑ Use {hasOverlap ? "overlap" : "average"} values ({suggestedMin}–{suggestedMax}n{minBudget ? `, £${minBudget}` : ""})
              </button>
            )}

            <div>
              <label className="mb-2 block text-sm font-medium text-blue-800">Group budget per person</label>
              <div className="mb-2 flex rounded-lg border border-blue-200 bg-white p-1 w-fit">
                {([
                  ["cheapest", "💸 Aim for cheapest"],
                  ["cap", "🎯 Set a max budget"],
                ] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => { setAgreedBudgetMode(val); if (val === "cheapest") setAgreedBudget(""); }}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                      agreedBudgetMode === val ? "bg-blue-600 text-white" : "text-blue-700 hover:bg-blue-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {agreedBudgetMode === "cap" ? (
                <input
                  type="number"
                  min={0}
                  placeholder="e.g. 500"
                  value={agreedBudget}
                  onChange={(e) => setAgreedBudget(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdvance()}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              ) : (
                <p className="text-xs text-blue-700">
                  No cap — the optimiser ranks destinations cheapest-first and shows every price (over-budget ones are just flagged, never hidden).
                </p>
              )}
            </div>

            {/* Travel-time vs money trade-off for the flight optimiser */}
            <div>
              <label className="mb-1 block text-sm font-medium text-blue-800">
                What is an hour of travel time worth? (£/hour)
              </label>
              <p className="mb-2 text-xs text-blue-700">
                The optimiser checks every airport each member can reach. Enter how much the group
                values <strong>time saved</strong> getting to the airport — any number works.
              </p>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-blue-800">£</span>
                <input
                  type="number"
                  min={0}
                  step={1}
                  value={timeValue}
                  onChange={(e) => setTimeValue(Math.max(0, Number(e.target.value) || 0))}
                  className="w-32 rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
                <span className="text-sm text-blue-700">/ hour</span>
              </div>
              <p className="mt-1.5 text-xs text-blue-700">
                {timeValue === 0
                  ? "£0 → cheapest option, no matter how far anyone travels to the airport."
                  : timeValue >= 40
                  ? `£${timeValue}/hr → strongly prefers shorter journeys (people take their closest airport).`
                  : `£${timeValue}/hr → balances ticket price against travel time.`}
              </p>
            </div>

            <button
              onClick={handleAdvance}
              disabled={advancing || !agreedMin || !agreedMax || agreedDurationInvalid}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {advancing ? "Saving…" : "Lock in & move to destinations →"}
            </button>
          </div>
        )}
      </div>
      {token && <FeedbackButton token={token} page="preferences" roomSlug={slug} />}
    </main>
  );
}
