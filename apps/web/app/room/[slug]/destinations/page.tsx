"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  listDestinations,
  suggestDestinations,
  proposeDestination,
  voteDestination,
  submitDestinationPreferences,
  getMyDestinationPreferences,
  advanceStep,
  type Room,
  type DestinationCandidate,
} from "@/lib/api";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

const MUST_HAVE_OPTIONS = [
  "nightlife", "culture", "food", "beach", "nature",
  "history", "art", "shopping", "romance", "skiing",
];

const AVOID_OPTIONS = [
  "long flights", "party crowds", "cold weather", "tourist traps",
  "expensive cities",
];

const DEST_NAMES: Record<string, string> = {
  AMS: "Amsterdam", BCN: "Barcelona", DUB: "Dublin", LIS: "Lisbon",
  FCO: "Rome", CDG: "Paris", PMI: "Palma", AGP: "Malaga", FAO: "Faro",
  OPO: "Porto", NCE: "Nice", MAD: "Madrid", MXP: "Milan", VCE: "Venice",
  NAP: "Naples", MLA: "Malta", IBZ: "Ibiza", ALC: "Alicante", GVA: "Geneva",
  ZRH: "Zurich", MUC: "Munich", BER: "Berlin", HAM: "Hamburg", CPH: "Copenhagen",
  ARN: "Stockholm", OSL: "Oslo", HEL: "Helsinki", PRG: "Prague", VIE: "Vienna",
  BUD: "Budapest", KRK: "Krakow", WAW: "Warsaw", ATH: "Athens", HER: "Heraklion",
  RHO: "Rhodes", CFU: "Corfu", JMK: "Mykonos", JTR: "Santorini", ZAD: "Zadar",
  SPU: "Split", DBV: "Dubrovnik", TFS: "Tenerife (S)", LPA: "Gran Canaria",
  ACE: "Lanzarote", FUE: "Fuerteventura", FNC: "Madeira", IST: "Istanbul",
};

export default function DestinationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [candidates, setCandidates] = useState<DestinationCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Questionnaire state
  const [climate, setClimate] = useState("");
  const [setting, setSetting] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [questSaving, setQuestSaving] = useState(false);
  const [questSaved, setQuestSaved] = useState(false);

  // AI suggest
  const [suggesting, setSuggesting] = useState(false);

  // Manual propose
  const [proposeSearch, setProposeSearch] = useState("");
  const [proposing, setProposing] = useState(false);
  const [showProposeDropdown, setShowProposeDropdown] = useState(false);

  // Advance
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      // Load room first — if THIS fails we know they shouldn't be here.
      // Then load candidates + preferences separately; failures on those
      // don't kick the user out, they just leave the questionnaire blank.
      try {
        const r = await getRoom(t, slug);
        setRoom(r);
      } catch (e: unknown) {
        toast.error(errorMessage(e, "Couldn't load this Holiday"));
        router.replace("/dashboard");
        return;
      }
      const [c, prefs] = await Promise.all([
        listDestinations(t, slug).catch(() => [] as DestinationCandidate[]),
        getMyDestinationPreferences(t, slug).catch(() => null),
      ]);
      setCandidates(c);
      if (prefs) {
        if (prefs.climate) setClimate(prefs.climate);
        if (prefs.setting) setSetting(prefs.setting);
        if (prefs.activity_level) setActivityLevel(prefs.activity_level);
        if (prefs.must_have && prefs.must_have.length) setMustHave(prefs.must_have);
        if (prefs.avoid && prefs.avoid.length) setAvoid(prefs.avoid);
      }
      setLoading(false);
    });
  }, [slug, router, supabase, toast]);

  async function handleSaveQuestionnaire() {
    if (!token) return;
    setQuestSaving(true);
    try {
      await submitDestinationPreferences(token, slug, {
        climate: climate || undefined,
        setting: setting || undefined,
        activity_level: activityLevel || undefined,
        must_have: mustHave,
        avoid,
      });
      setQuestSaved(true);
      setTimeout(() => setQuestSaved(false), 3000);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save questionnaire"));
    } finally {
      setQuestSaving(false);
    }
  }

  async function handleSuggest() {
    if (!token) return;
    setSuggesting(true);
    try {
      const results = await suggestDestinations(token, slug, 6);
      setCandidates(results);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to get suggestions"));
    } finally {
      setSuggesting(false);
    }
  }

  async function handlePropose(iata: string) {
    if (!token) return;
    setProposing(true);
    try {
      await proposeDestination(token, slug, iata);
      const c = await listDestinations(token, slug);
      setCandidates(c);
      setProposeSearch("");
      setShowProposeDropdown(false);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to propose destination"));
    } finally {
      setProposing(false);
    }
  }

  async function handleVote(candidateId: string, value: number) {
    if (!token) return;
    try {
      await voteDestination(token, slug, candidateId, value);
      const c = await listDestinations(token, slug);
      setCandidates(c);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to vote"));
    }
  }

  async function handleAdvance() {
    if (!token || !room?.is_admin) return;
    setAdvancing(true);
    try {
      await advanceStep(token, slug);
      router.push(`/room/${slug}/flights`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to advance"));
      setAdvancing(false);
    }
  }

  function toggleMustHave(tag: string) {
    setMustHave(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }
  function toggleAvoid(tag: string) {
    setAvoid(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  }

  const filteredDests = proposeSearch.length >= 2
    ? Object.entries(DEST_NAMES).filter(([iata, name]) =>
        name.toLowerCase().includes(proposeSearch.toLowerCase()) ||
        iata.toLowerCase().includes(proposeSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← {room.name}
          </button>
          <span className="font-semibold text-gray-900">🗺️ Destinations</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">

        {/* Questionnaire */}
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Your destination preferences</h2>
          <p className="text-sm text-gray-500">Answer these questions and our algorithm will suggest the best matches for the group.</p>

          {/* Climate */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Climate</label>
            <div className="flex flex-wrap gap-2">
              {[["warm", "☀️ Warm & sunny"], ["temperate", "🌤️ Mild"], ["cold", "❄️ Cool/cold"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setClimate(climate === val ? "" : val)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    climate === val
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Setting */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Setting</label>
            <div className="flex flex-wrap gap-2">
              {[["beach", "🏖️ Beach"], ["city", "🏙️ City"], ["mountains", "⛰️ Mountains"], ["mixed", "🌍 Mixed"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setSetting(setting === val ? "" : val)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    setting === val
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Activity level */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Activity level</label>
            <div className="flex flex-wrap gap-2">
              {[["relaxed", "😴 Relaxed"], ["mixed", "🧘 Mixed"], ["active", "🏃 Active"]].map(([val, label]) => (
                <button
                  key={val}
                  onClick={() => setActivityLevel(activityLevel === val ? "" : val)}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium border transition-colors ${
                    activityLevel === val
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-700 border-gray-300 hover:border-blue-400"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Must-haves */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Must-haves <span className="text-gray-400">(pick any)</span></label>
            <div className="flex flex-wrap gap-2">
              {MUST_HAVE_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleMustHave(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    mustHave.includes(tag)
                      ? "bg-green-600 text-white border-green-600"
                      : "bg-white text-gray-600 border-gray-300 hover:border-green-400"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          {/* Avoid */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">Would rather avoid <span className="text-gray-400">(pick any)</span></label>
            <div className="flex flex-wrap gap-2">
              {AVOID_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  onClick={() => toggleAvoid(tag)}
                  className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                    avoid.includes(tag)
                      ? "bg-red-500 text-white border-red-500"
                      : "bg-white text-gray-600 border-gray-300 hover:border-red-300"
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveQuestionnaire}
              disabled={questSaving}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {questSaving ? "Saving…" : questSaved ? "✓ Saved!" : "Save my answers"}
            </button>
            <button
              onClick={handleSuggest}
              disabled={suggesting}
              className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {suggesting ? "Finding matches…" : "✨ Get AI suggestions"}
            </button>
          </div>
        </div>

        {/* Manual propose */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-3">Propose a destination</h2>
          <div className="relative">
            <input
              type="text"
              placeholder="Search city or airport code…"
              value={proposeSearch}
              onChange={(e) => { setProposeSearch(e.target.value); setShowProposeDropdown(true); }}
              onFocus={() => setShowProposeDropdown(true)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            {showProposeDropdown && filteredDests.length > 0 && (
              <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg">
                {filteredDests.map(([iata, name]) => (
                  <button
                    key={iata}
                    onClick={() => handlePropose(iata)}
                    disabled={proposing}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-gray-50 disabled:opacity-50"
                  >
                    <span className="font-medium text-gray-900">{name}</span>
                    <span className="font-mono text-xs text-gray-400">{iata}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Candidates list */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4">
            Destination candidates
            {candidates.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({candidates.length})</span>}
          </h2>

          {candidates.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <div className="text-3xl mb-2">🌍</div>
              <p>No destinations yet. Get AI suggestions or propose one above.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3"
                >
                  <div>
                    <p className="font-semibold text-gray-900">{c.name}</p>
                    <p className="text-xs text-gray-400">
                      {c.proposed_by ? "Proposed by member" : "Algorithm suggestion"}
                      {c.total_cost_gbp ? ` · ~£${c.total_cost_gbp.toLocaleString()} pp` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="min-w-8 text-center text-sm font-bold text-gray-900">
                      {c.vote_count > 0 ? `+${c.vote_count}` : c.vote_count}
                    </span>
                    <button
                      onClick={() => handleVote(c.id, c.my_vote === 1 ? 0 : 1)}
                      className={`rounded-full p-1.5 transition-colors ${
                        c.my_vote === 1
                          ? "bg-green-500 text-white"
                          : "bg-white border border-gray-300 text-gray-600 hover:border-green-400 hover:text-green-600"
                      }`}
                      title="Upvote"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleVote(c.id, c.my_vote === -1 ? 0 : -1)}
                      className={`rounded-full p-1.5 transition-colors ${
                        c.my_vote === -1
                          ? "bg-red-400 text-white"
                          : "bg-white border border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-500"
                      }`}
                      title="Downvote"
                    >
                      👎
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          {/* Admin advance */}
        {room.is_admin && candidates.length > 0 && (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Ready to find flights?</h2>
            <p className="text-sm text-blue-700 mb-4">
              The top-voted destinations will be checked for flights from everyone&apos;s nearest airport.
              Candidates with the most votes will be prioritised.
            </p>
            <button
              onClick={handleAdvance}
              disabled={advancing}
              className="rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {advancing ? "Advancing…" : "Search flights for these destinations →"}
            </button>
          </div>
        )}
      </div>

      {token && <ChatWidget token={token} roomSlug={slug} />}
    </main>
  );
}
