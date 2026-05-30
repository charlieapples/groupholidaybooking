"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  listDestinations,
  suggestDestinations,
  proposeDestination,
  voteDestination,
  deleteDestinationCandidate,
  submitDestinationPreferences,
  getMyDestinationPreferences,
  pickRandomDestination,
  advanceStep,
  type Room,
  type DestinationCandidate,
} from "@/lib/api";
import dynamic from "next/dynamic";
import FeedbackButton from "@/components/FeedbackButton";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import { DEST_NAMES, flagFor, countryFor } from "@/lib/destinations";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

const MUST_HAVE_OPTIONS = [
  "nightlife", "culture", "food", "beach", "nature",
  "history", "art", "shopping", "romance", "skiing",
];

const AVOID_OPTIONS = [
  "long flights", "party crowds", "cold weather", "tourist traps",
  "expensive cities",
];

// Flag emoji for destination cards — imported from shared lib

export default function DestinationsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [myUserId, setMyUserId] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [candidates, setCandidates] = useState<DestinationCandidate[]>([]);
  const [loading, setLoading] = useState(true);

  // Questionnaire state
  const [climate, setClimate] = useState("");
  const [setting, setSetting] = useState("");
  const [activityLevel, setActivityLevel] = useState("");
  const [mustHave, setMustHave] = useState<string[]>([]);
  const [avoid, setAvoid] = useState<string[]>([]);
  const [freeText, setFreeText] = useState("");
  const [questSaving, setQuestSaving] = useState(false);
  const [questSaved, setQuestSaved] = useState(false);

  // AI suggest
  const [suggesting, setSuggesting] = useState(false);

  // Pick random
  const [pickingRandom, setPickingRandom] = useState(false);

  // Manual propose
  const [proposeSearch, setProposeSearch] = useState("");
  const [proposing, setProposing] = useState(false);
  const [showProposeDropdown, setShowProposeDropdown] = useState(false);

  // Advance
  const [advancing, setAdvancing] = useState(false);

  // Keep a ref so realtime callbacks always have the latest token
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { tokenRef.current = token; }, [token]);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data: s }) => {
      if (!s.session) { router.replace("/"); return; }
      const t = s.session.access_token;
      setToken(t);
      setMyUserId(s.session.user.id);
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
        if (prefs.free_text) setFreeText(prefs.free_text);
      }
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, router, supabase, toast]);

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `Destinations – ${room.name} | Group Holiday`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

  // ── Realtime: live vote count updates ─────────────────────────────────────────
  // Refresh the candidate list when any vote changes so all members see
  // live vote tallies without needing to reload the page.
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`dest-votes-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "destination_votes",
        },
        async () => {
          const t = tokenRef.current;
          if (!t) return;
          // Refetch full candidate list so vote counts are accurate
          listDestinations(t, slug).then(setCandidates).catch(() => {});
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id, supabase, slug]);

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
        ...(freeText.trim() ? { free_text: freeText.trim() } : {}),
      } as Parameters<typeof submitDestinationPreferences>[2]);
      setQuestSaved(true);
      setTimeout(() => setQuestSaved(false), 3000);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to save questionnaire"));
    } finally {
      setQuestSaving(false);
    }
  }

  async function handlePickRandom() {
    if (!token || candidates.length === 0) return;
    setPickingRandom(true);
    try {
      const pick = await pickRandomDestination(token, slug);
      toast.success(`🎲 The random pick is: ${pick.name}!${pick.total_cost_gbp ? ` (~£${Math.round(pick.total_cost_gbp)}/person)` : ""}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't pick a random destination"));
    } finally {
      setPickingRandom(false);
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

  async function handleDeleteCandidate(candidateId: string, name: string) {
    if (!token) return;
    if (!window.confirm(`Remove ${name} from the candidates?`)) return;
    // Optimistic remove
    const prev = candidates;
    setCandidates((cs) => cs.filter((c) => c.id !== candidateId));
    try {
      await deleteDestinationCandidate(token, slug, candidateId);
    } catch (e: unknown) {
      setCandidates(prev);
      toast.error(errorMessage(e, "Failed to remove candidate"));
    }
  }

  async function handleVote(candidateId: string, value: number) {
    if (!token) return;
    // Optimistic update — adjust the UI immediately so taps feel instant.
    // If the request fails we revert and toast the error.
    const prev = candidates;
    setCandidates((cs) =>
      cs.map((c) => {
        if (c.id !== candidateId) return c;
        const oldVote = c.my_vote || 0;
        const newVote = value === oldVote ? 0 : value; // toggle off if same value clicked again
        return {
          ...c,
          my_vote: newVote,
          vote_count: c.vote_count - oldVote + newVote,
        };
      })
    );
    try {
      // Find what we set above so we send the same value to the API
      const target = candidates.find((c) => c.id === candidateId);
      const oldVote = target?.my_vote || 0;
      const newVote = value === oldVote ? 0 : value;
      await voteDestination(token, slug, candidateId, newVote);
      // Refetch in the background to stay in sync with other voters
      listDestinations(token, slug).then(setCandidates).catch(() => {});
    } catch (e: unknown) {
      setCandidates(prev); // revert
      toast.error(errorMessage(e, "Failed to vote"));
      return;
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

  // Search the curated destination list. If nothing matches but the user typed
  // a valid-looking 3-letter IATA code, offer to propose it as a custom code
  // (the backend accepts any iata_code, we just don't have the city name yet).
  const searchLower = proposeSearch.toLowerCase().trim();
  const curatedMatches: [string, string][] = proposeSearch.length >= 2
    ? Object.entries(DEST_NAMES).filter(([iata, name]) =>
        name.toLowerCase().includes(searchLower) ||
        iata.toLowerCase().includes(searchLower) ||
        // Country search: "Italy" → Rome/Milan/Venice, "Uruguay" → Montevideo
        countryFor(iata).toLowerCase().includes(searchLower)
      ).slice(0, 8)
    : [];
  // If no curated matches but the user typed exactly 3 letters, show a "use as custom code" option
  const customCode = /^[a-z]{3}$/i.test(proposeSearch.trim())
    ? proposeSearch.trim().toUpperCase()
    : null;
  const showCustomOption = customCode && !curatedMatches.some(([iata]) => iata === customCode);
  const filteredDests: [string, string][] = showCustomOption
    ? [...curatedMatches, [customCode!, `${customCode} (custom airport code)`] as [string, string]]
    : curatedMatches;

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

          {/* Free text — anything Gemini should know */}
          <div>
            <label className="mb-2 block text-sm font-medium text-gray-700">
              Anything else? <span className="text-gray-400">(optional, in your own words)</span>
            </label>
            <textarea
              rows={3}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="e.g. &quot;Would love somewhere with amazing food and good nightlife, ideally not too far — under 3h flight. Happy with Barcelona or similar vibes. No beach resorts.&quot;"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none"
            />
            <p className="mt-1 text-xs text-gray-400">
              This goes straight to the AI — describe your ideal trip, places you&apos;ve loved, or anything you&apos;d like to avoid.
            </p>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              onClick={handleSaveQuestionnaire}
              disabled={questSaving}
              className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {questSaving ? "Saving…" : questSaved ? "✓ Saved!" : "Save my answers"}
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
              onKeyDown={(e) => {
                if (e.key === "Enter" && filteredDests.length > 0) {
                  e.preventDefault();
                  handlePropose(filteredDests[0][0]);
                }
              }}
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
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-gray-900">
              Destination candidates
              {candidates.length > 0 && <span className="ml-2 text-sm font-normal text-gray-500">({candidates.length})</span>}
            </h2>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={handleSuggest}
                disabled={suggesting}
                className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {suggesting ? "Asking Gemini…" : candidates.length > 0 ? "✨ Refresh AI suggestions" : "✨ Get AI suggestions"}
              </button>
              {candidates.length > 0 && (
                <button
                  onClick={handlePickRandom}
                  disabled={pickingRandom}
                  title="Pick a random destination from the candidates, weighted by votes"
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {pickingRandom ? "Spinning…" : "🎲 Surprise us!"}
                </button>
              )}
            </div>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Gemini picks destinations matched to the group&apos;s combined questionnaire answers, dates, and budget. Tap 👍 or 👎 to vote — votes update live for everyone.
          </p>

          {candidates.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <div className="text-3xl mb-2">🌍</div>
              <p>No destinations yet. Click <strong>Get suggestions</strong> above or propose one.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {candidates.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-2xl shrink-0" aria-hidden="true">{flagFor(c.iata_code)}</span>
                    <div className="min-w-0">
                      <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                      <p className="text-xs text-gray-400">
                        {c.proposed_by ? "Proposed by member" : "AI suggestion"}
                        {c.total_cost_gbp ? ` · ~£${c.total_cost_gbp.toLocaleString()} pp` : ""}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
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
                      title="Yes, I'd go here"
                    >
                      👍
                    </button>
                    <button
                      onClick={() => handleVote(c.id, 0)}
                      className={`rounded-full p-1.5 transition-colors text-sm ${
                        c.my_vote === 0
                          ? "bg-gray-200 text-gray-600 border border-gray-400"
                          : "bg-white border border-gray-200 text-gray-400 hover:border-gray-400 hover:text-gray-600"
                      }`}
                      title="Neutral / clear my vote"
                    >
                      😐
                    </button>
                    <button
                      onClick={() => handleVote(c.id, c.my_vote === -1 ? 0 : -1)}
                      className={`rounded-full p-1.5 transition-colors ${
                        c.my_vote === -1
                          ? "bg-red-400 text-white"
                          : "bg-white border border-gray-300 text-gray-600 hover:border-red-300 hover:text-red-500"
                      }`}
                      title="No thanks"
                    >
                      👎
                    </button>
                    {/* Show delete button to admin OR the person who proposed it */}
                    {(room.is_admin || c.proposed_by === myUserId) && (
                      <button
                        onClick={() => handleDeleteCandidate(c.id, c.name)}
                        className="rounded-full p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                        title="Remove candidate"
                      >
                        🗑️
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

          {/* Voting summary — show when there are any votes */}
        {candidates.length > 0 && candidates.some(c => c.vote_count !== 0) && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🗳️ Voting so far</h2>
            <div className="space-y-2">
              {[...candidates]
                .sort((a, b) => b.vote_count - a.vote_count)
                .map((c, i) => (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-lg w-6 shrink-0">{flagFor(c.iata_code)}</span>
                    <span className="flex-1 text-sm font-medium text-gray-900 truncate">{c.name}</span>
                    <div className="flex items-center gap-1.5">
                      <div
                        className={`h-2 rounded-full transition-all ${
                          c.vote_count > 0 ? "bg-green-400" :
                          c.vote_count < 0 ? "bg-red-300" : "bg-gray-200"
                        }`}
                        style={{ width: `${Math.max(8, Math.abs(c.vote_count) * 16)}px` }}
                      />
                      <span className={`text-sm font-bold min-w-8 text-right ${
                        c.vote_count > 0 ? "text-green-600" :
                        c.vote_count < 0 ? "text-red-500" : "text-gray-400"
                      }`}>
                        {c.vote_count > 0 ? `+${c.vote_count}` : c.vote_count}
                      </span>
                    </div>
                    {i === 0 && c.vote_count > 0 && (
                      <span className="text-xs bg-yellow-100 text-yellow-700 rounded-full px-2 py-0.5 font-medium">Top pick</span>
                    )}
                  </div>
                ))
              }
            </div>
          </div>
        )}

          {/* Admin advance */}
        {room.is_admin && candidates.length > 0 && (
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-6">
            <h2 className="text-lg font-bold text-blue-900 mb-2">Ready to find flights?</h2>
            <p className="text-sm text-blue-700 mb-4">
              The top-voted destinations will be checked for flights from every airport each member can reach.
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
      {token && <FeedbackButton token={token} page="destinations" roomSlug={slug} />}
    </main>
  );
}
