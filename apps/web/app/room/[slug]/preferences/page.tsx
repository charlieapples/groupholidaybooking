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
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

export default function PreferencesPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [data, setData] = useState<DurationBudgetAggregate | null>(null);
  const [loading, setLoading] = useState(true);

  // My inputs
  const [minNights, setMinNights] = useState("");
  const [maxNights, setMaxNights] = useState("");
  const [budget, setBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Admin: set agreed values
  const [agreedMin, setAgreedMin] = useState("");
  const [agreedMax, setAgreedMax] = useState("");
  const [agreedBudget, setAgreedBudget] = useState("");
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      try {
        const [r, d] = await Promise.all([getRoom(t, slug), getDurationBudget(t, slug)]);
        setRoom(r);
        setData(d);
        // Pre-fill admin fields with room values if already set
        if (r.min_nights) setAgreedMin(String(r.min_nights));
        if (r.max_nights) setAgreedMax(String(r.max_nights));
        if (r.budget_gbp) setAgreedBudget(String(r.budget_gbp));
      } catch {
        router.replace("/dashboard");
      }
      setLoading(false);
    });
  }, [slug, router, supabase]);

  async function handleSave() {
    if (!token) return;
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
      alert(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleAdvance() {
    if (!token || !room?.is_admin) return;
    if (!agreedMin || !agreedMax) {
      alert("Please set agreed min and max nights before advancing.");
      return;
    }
    setAdvancing(true);
    try {
      await updateRoom(token, slug, {
        min_nights: Number(agreedMin),
        max_nights: Number(agreedMax),
        ...(agreedBudget ? { budget_gbp: Number(agreedBudget) } : {}),
      });
      // Advance through BOTH duration + budget steps into destination
      // (the preferences page handles both steps together)
      let updated = await advanceStep(token, slug);
      if (updated.current_step === "budget") {
        updated = await advanceStep(token, slug); // budget → destination
      }
      router.push(`/room/${slug}/destinations`);
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

  if (!room || !data) return null;

  const responsesCount = data.responses.length;
  const totalMembers = data.members_total;

  // Suggest agreed values: median
  const allMin = data.responses.map(r => r.min_nights).filter(Boolean) as number[];
  const allMax = data.responses.map(r => r.max_nights).filter(Boolean) as number[];
  const allBudget = data.responses.map(r => r.budget_gbp).filter(Boolean) as number[];
  const median = (arr: number[]) => arr.length ? arr.sort((a,b)=>a-b)[Math.floor(arr.length/2)] : null;
  const suggestedMin = median(allMin);
  const suggestedMax = median(allMax);
  const minBudget = allBudget.length ? Math.min(...allBudget) : null;

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← {room.name}
          </button>
          <span className="font-semibold text-gray-900">Duration &amp; Budget</span>
          <div />
        </div>
      </nav>

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
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Max budget per person (£)
            </label>
            <input
              type="number"
              min={0}
              placeholder="e.g. 800"
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Total including flights, accommodation, and travel to airport.
            </p>
          </div>

          <button
            onClick={handleSave}
            disabled={saving || (!minNights && !maxNights && !budget)}
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
            {suggestedMin && (
              <p className="text-sm text-blue-700">
                💡 Suggested: {suggestedMin}–{suggestedMax} nights
                {minBudget ? `, max budget £${minBudget?.toLocaleString()} (lowest submitted)` : ""}
              </p>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-800">Min nights</label>
                <input
                  type="number"
                  min={1}
                  value={agreedMin}
                  onChange={(e) => setAgreedMin(e.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-blue-800">Max nights</label>
                <input
                  type="number"
                  min={1}
                  value={agreedMax}
                  onChange={(e) => setAgreedMax(e.target.value)}
                  className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-sm font-medium text-blue-800">Budget cap per person (£)</label>
              <input
                type="number"
                min={0}
                placeholder="Leave blank for no cap"
                value={agreedBudget}
                onChange={(e) => setAgreedBudget(e.target.value)}
                className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
              />
            </div>

            <button
              onClick={handleAdvance}
              disabled={advancing || !agreedMin || !agreedMax}
              className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {advancing ? "Saving…" : "Lock in & move to destinations →"}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
