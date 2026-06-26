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
  getVoteStatus,
  lockVotes,
  unlockVotes,
  updateRoom,
  getDestinationIdeas,
  getGroupRecommendation,
  submitRanking,
  getFlightEstimates,
  type Room,
  type DestinationCandidate,
  type DestinationIdea,
  type FlightEstimate,
  type VoteStatus,
} from "@/lib/api";
import dynamic from "next/dynamic";
import FeedbackButton from "@/components/FeedbackButton";
import NextStepButton from "@/components/NextStepButton";
import AccountBadge from "@/components/AccountBadge";
import StepBar from "@/components/StepBar";
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
  const [voteStatus, setVoteStatus] = useState<VoteStatus | null>(null);
  const [lockingVotes, setLockingVotes] = useState(false);
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
  // Auto-save plumbing: a signature of the current answers + the last one we saved.
  const lastSavedSig = useRef<string | null>(null);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // AI suggest
  const [suggesting, setSuggesting] = useState(false);

  // Ranked (Borda) mode state
  const [ideas, setIdeas] = useState<DestinationIdea[]>([]);
  const [loadingIdeas, setLoadingIdeas] = useState(false);
  const [aiReasoning, setAiReasoning] = useState<string | null>(null);
  const [groupRec, setGroupRec] = useState<import("@/lib/api").GroupRecommendation | null>(null);
  const [loadingRec, setLoadingRec] = useState(false);
  const [showCostMethod, setShowCostMethod] = useState(false);
  const [overriding, setOverriding] = useState(false);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [overrideSearch, setOverrideSearch] = useState("");
  const [rankOrder, setRankOrder] = useState<string[]>([]);
  const [submittingRank, setSubmittingRank] = useState(false);
  const [changingMode, setChangingMode] = useState(false);
  // Live flight prices per IATA (from Travelpayouts), merged over offline estimates.
  const [liveFlights, setLiveFlights] = useState<Record<string, FlightEstimate>>({});

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
      const [c, prefs, vs] = await Promise.all([
        listDestinations(t, slug).catch(() => [] as DestinationCandidate[]),
        getMyDestinationPreferences(t, slug).catch(() => null),
        getVoteStatus(t, slug).catch(() => null),
      ]);
      setCandidates(c);
      if (vs) setVoteStatus(vs);
      if (prefs) {
        if (prefs.climate) setClimate(prefs.climate);
        if (prefs.setting) setSetting(prefs.setting);
        if (prefs.activity_level) setActivityLevel(prefs.activity_level);
        if (prefs.must_have && prefs.must_have.length) setMustHave(prefs.must_have);
        if (prefs.avoid && prefs.avoid.length) setAvoid(prefs.avoid);
        if (prefs.free_text) setFreeText(prefs.free_text);
      }
      // Record what's already saved so auto-save only fires on real changes.
      lastSavedSig.current = JSON.stringify({
        climate: prefs?.climate || "",
        setting: prefs?.setting || "",
        activityLevel: prefs?.activity_level || "",
        mustHave: prefs?.must_have || [],
        avoid: prefs?.avoid || [],
        freeText: (prefs?.free_text || "").trim(),
      });
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, router, supabase, toast]);

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `Destinations – ${room.name} | Group Holiday Booking`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

  // ── Realtime: live vote count updates ─────────────────────────────────────────
  // Refresh the candidate list when any vote changes so all members see
  // live vote tallies without needing to reload the page.
  useEffect(() => {
    if (!room?.id) return;

    const refresh = async () => {
      const t = tokenRef.current;
      if (!t) return;
      // Refetch candidates (counts/order) AND reveal status so the banner and
      // the blind reveal update live as people vote and lock in.
      listDestinations(t, slug).then(setCandidates).catch(() => {});
      getVoteStatus(t, slug).then(setVoteStatus).catch(() => {});
    };

    const channel = supabase
      .channel(`dest-votes-${room.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "destination_votes" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "destination_vote_submissions" }, refresh)
      // Proposals (someone putting a destination forward / removing one) — so the
      // candidate list updates live for everyone, not just on a manual refresh.
      .on("postgres_changes", { event: "*", schema: "public", table: "destination_candidates" }, refresh)
      .subscribe();

    // Safety net: if realtime isn't enabled for a table, poll every 12s so the
    // page still stays roughly in sync for collaborators without a manual reload.
    const poll = setInterval(refresh, 12000);

    return () => { supabase.removeChannel(channel); clearInterval(poll); };
  }, [room?.id, supabase, slug]);

  async function handleLockVotes() {
    if (!token) return;
    setLockingVotes(true);
    try {
      const vs = voteStatus?.i_submitted
        ? await unlockVotes(token, slug)
        : await lockVotes(token, slug);
      setVoteStatus(vs);
      // Re-fetch candidates: if that lock-in triggered the full reveal, counts
      // and ordering change for everyone.
      listDestinations(token, slug).then(setCandidates).catch(() => {});
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't update your vote lock-in"));
    } finally {
      setLockingVotes(false);
    }
  }

  // Signature of the current answers — used to detect changes for auto-save.
  const questSig = JSON.stringify({
    climate, setting, activityLevel, mustHave, avoid, freeText: freeText.trim(),
  });

  async function handleSaveQuestionnaire(silent = false) {
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
      lastSavedSig.current = questSig;
      setQuestSaved(true);
      setTimeout(() => setQuestSaved(false), 2000);
    } catch (e: unknown) {
      if (!silent) toast.error(errorMessage(e, "Failed to save questionnaire"));
    } finally {
      setQuestSaving(false);
    }
  }

  // Auto-save ~1s after the last change (debounced) — no need to click Save.
  useEffect(() => {
    if (lastSavedSig.current === null || questSig === lastSavedSig.current) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => handleSaveQuestionnaire(true), 1000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questSig]);

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
      const res = await suggestDestinations(token, slug, 6);
      setCandidates(res.candidates);
      setAiReasoning(res.reasoning || null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to get suggestions"));
    } finally {
      setSuggesting(false);
    }
  }

  // ── Ranked (Borda) mode ───────────────────────────────────────────────────
  const votingStyle = room?.voting_style || "ranked";
  const isRanked = votingStyle === "ranked";
  // The candidate THIS member proposed (ranked mode = their one pick).
  const myPick = candidates.find((c) => c.proposed_by === myUserId) || null;

  // Trip length range for the "total pp" estimate (lower & upper bounds).
  const minNights = room?.min_nights ?? null;
  const maxNights = room?.max_nights ?? null;

  // How a candidate's origin is described ("Proposed by 2 members", etc.).
  function proposerLabel(c: DestinationCandidate): string {
    if (!c.proposed_by) return "AI suggestion";
    const n = c.proposer_count ?? 1;
    if (n > 1) return `Proposed by ${n} members`;
    if (c.proposed_by === myUserId) return "Your pick";
    return "Proposed by member";
  }

  // Small cost-guidance line shown under each destination.
  function CostLine({ c }: { c: DestinationCandidate }) {
    // Prefer the live fare (Travelpayouts) over the offline region estimate.
    const live = liveFlights[c.iata_code];
    // Flight low/high: real search cost if present, else live min/max, else offline band.
    const flightLow =
      c.total_cost_gbp != null ? c.total_cost_gbp
      : live ? live.flight_min_gbp
      : c.est_flight_low_gbp ?? c.est_flight_return_gbp ?? null;
    const flightHigh =
      c.total_cost_gbp != null ? c.total_cost_gbp
      : live ? live.flight_max_gbp
      : c.est_flight_high_gbp ?? c.est_flight_return_gbp ?? null;
    const dayLow = c.est_daily_living_low_gbp ?? c.est_daily_living_gbp ?? null;
    const dayHigh = c.est_daily_living_high_gbp ?? c.est_daily_living_gbp ?? null;

    if (flightLow == null && c.est_daily_living_gbp == null) return null;

    // Lower bound: cheapest flight + cheap daily × fewest nights.
    // Upper bound: dearest flight + higher daily × most nights.
    const nLow = minNights ?? maxNights;
    const nHigh = maxNights ?? minNights;
    const tripLow =
      flightLow != null && dayLow != null && nLow != null ? flightLow + dayLow * nLow : null;
    const tripHigh =
      flightHigh != null && dayHigh != null && nHigh != null ? flightHigh + dayHigh * nHigh : null;

    return (
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-gray-500">
        {c.total_cost_gbp != null ? (
          <span title="Actual flight cost found in the flight search">
            ✈️ £{Math.round(c.total_cost_gbp).toLocaleString()} flights
          </span>
        ) : live ? (
          <span className="text-emerald-600" title="Live return fares from London for your dates (Travelpayouts): cheapest–dearest currently cached. The per-person search at the Flights step is exact.">
            ✈️ £{live.flight_min_gbp.toLocaleString()}
            {live.flight_max_gbp > live.flight_min_gbp ? `–£${live.flight_max_gbp.toLocaleString()}` : ""} flights · live
          </span>
        ) : c.est_flight_low_gbp != null ? (
          <span title="Rough return flight pp from the UK (offline estimate)">
            ✈️ ~£{c.est_flight_low_gbp}–£{c.est_flight_high_gbp} flights
          </span>
        ) : null}
        {c.est_daily_living_gbp != null && (
          <span title={`Rough bare-minimum daily spend pp — budget bed + food + local transport, no activities (≈ £${c.est_daily_living_low_gbp}–£${c.est_daily_living_high_gbp}/day)`}>
            🛏️🍽️ ~£{c.est_daily_living_gbp}/day
          </span>
        )}
        {tripLow != null && tripHigh != null && (
          <span
            className="font-medium text-gray-600"
            title={`Rough total pp range over your ${minNights ?? "?"}–${maxNights ?? "?"} night trip: (cheapest flight + low daily × ${nLow} nights) to (dearest flight + higher daily × ${nHigh} nights). Flights + bare-minimum living, no activities.`}
          >
            ≈ £{Math.round(tripLow).toLocaleString()}–£{Math.round(tripHigh).toLocaleString()} pp total
          </span>
        )}
      </div>
    );
  }

  // Keep the local ranking order in sync with the candidate list. New
  // candidates are appended; removed ones drop out; the member's own order is
  // preserved as they reorder.
  useEffect(() => {
    const ids = candidates.map((c) => c.id);
    setRankOrder((prev) => {
      const kept = prev.filter((id) => ids.includes(id));
      if (kept.length === 0) {
        // First load: seed from any saved ranks, else insertion order.
        const ranked = [...candidates]
          .filter((c) => c.my_rank != null)
          .sort((a, b) => (a.my_rank! - b.my_rank!))
          .map((c) => c.id);
        const unranked = candidates.filter((c) => c.my_rank == null).map((c) => c.id);
        return [...ranked, ...unranked];
      }
      const added = ids.filter((id) => !kept.includes(id));
      return [...kept, ...added];
    });
  }, [candidates]);

  // Fetch live flight prices whenever the set of candidates changes. Loads in
  // the background — cards show offline region estimates until these land.
  const iataKey = candidates.map((c) => c.iata_code).sort().join(",");
  useEffect(() => {
    const t = tokenRef.current;
    if (!t || !iataKey) {
      setLiveFlights({});
      return;
    }
    getFlightEstimates(t, slug).then(setLiveFlights).catch(() => {});
  }, [iataKey, slug]);

  function moveRank(id: string, dir: -1 | 1) {
    setRankOrder((prev) => {
      const i = prev.indexOf(id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  }

  async function handleGetIdeas() {
    if (!token) return;
    setLoadingIdeas(true);
    try {
      const got = await getDestinationIdeas(token, slug, 6);
      setIdeas(got.ideas);
      setAiReasoning(got.reasoning || null);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't get AI ideas"));
    } finally {
      setLoadingIdeas(false);
    }
  }

  async function handleGroupRecommendation() {
    if (!token) return;
    setLoadingRec(true);
    try {
      const rec = await getGroupRecommendation(token, slug);
      setGroupRec(rec);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't get the group recommendation"));
    } finally {
      setLoadingRec(false);
    }
  }

  async function handleSubmitRanking() {
    if (!token || rankOrder.length === 0) return;
    setSubmittingRank(true);
    try {
      const rankings = rankOrder.map((id, i) => ({ candidate_id: id, rank: i + 1 }));
      const vs = await submitRanking(token, slug, rankings);
      setVoteStatus(vs);
      listDestinations(token, slug).then(setCandidates).catch(() => {});
      toast.success("Your ranking is locked in ✓");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't submit your ranking"));
    } finally {
      setSubmittingRank(false);
    }
  }

  async function handleEditRanking() {
    if (!token) return;
    setSubmittingRank(true);
    try {
      const vs = await unlockVotes(token, slug);
      setVoteStatus(vs);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't reopen your ranking"));
    } finally {
      setSubmittingRank(false);
    }
  }

  async function handleSetVotingStyle(style: "ranked" | "open") {
    if (!token || !room?.is_admin || style === votingStyle) return;
    setChangingMode(true);
    try {
      const r = await updateRoom(token, slug, { voting_style: style });
      setRoom(r);
      // Switching modes resets votes/lock-ins server-side — refresh so the UI
      // reflects the clean slate.
      listDestinations(token, slug).then(setCandidates).catch(() => {});
      getVoteStatus(token, slug).then(setVoteStatus).catch(() => {});
      toast.success(style === "ranked" ? "Switched to ranked voting." : "Switched to open voting.");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't change the voting mode"));
    } finally {
      setChangingMode(false);
    }
  }

  // Admin override: the destination is already decided, so skip the vote.
  async function handleSetDestinationDirectly(iata: string, name: string) {
    if (!token || !room?.is_admin) return;
    if (!window.confirm(`Skip voting and lock in ${name} as the destination? You can still change it on the Flights step.`)) return;
    setOverriding(true);
    try {
      await updateRoom(token, slug, { destination_iata: iata.toUpperCase() });
      // Move the group to the flights step (destination is decided).
      let r = await advanceStep(token, slug).catch(() => null);
      while (r && r.current_step !== "flights" && ["destination", "duration", "budget", "availability"].includes(r.current_step)) {
        r = await advanceStep(token, slug).catch(() => null);
      }
      toast.success(`${name} locked in. Continue to Flights.`);
      router.push(`/room/${slug}/flights`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't set the destination"));
    } finally {
      setOverriding(false);
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
      <StepBar slug={slug} currentStep={room.current_step} activeRoute="destinations" />

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">

        {/* Fairness mode selector */}
        <div className="rounded-xl border bg-white p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-sm font-bold text-gray-900">⚖️ How the group decides</h2>
              <p className="text-xs text-gray-500 mt-1 max-w-md">
                {isRanked
                  ? "Ranked vote: everyone puts forward one destination, then ranks the whole list from 1st to last. Lowest total score wins — the fairest for the group."
                  : "Open vote: get AI suggestions and react 👍 / 😐 / 👎 to each. Quicker, but a big group can end up with a long list."}
              </p>
            </div>
            {room.is_admin ? (
              <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1 shrink-0">
                {([["ranked", "🏆 Ranked"], ["open", "👍 Open"]] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => handleSetVotingStyle(val)}
                    disabled={changingMode}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-50 ${
                      votingStyle === val
                        ? "bg-white text-blue-700 shadow-sm"
                        : "text-gray-500 hover:text-gray-800"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            ) : (
              <span className="shrink-0 rounded-full bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                {isRanked ? "🏆 Ranked vote" : "👍 Open vote"}
              </span>
            )}
          </div>

          {/* Admin override: skip the vote if it's already decided. */}
          {room.is_admin && (
            <div className="mt-3 border-t pt-3">
              {!overrideOpen ? (
                <button onClick={() => setOverrideOpen(true)} className="text-xs text-gray-500 hover:text-gray-800 underline">
                  ✍️ Already decided? Skip voting & set the destination manually
                </button>
              ) : (
                <div className="relative">
                  <p className="text-xs text-gray-500 mb-1">Type a city or airport code to lock it in (skips voting):</p>
                  <input
                    type="text"
                    autoFocus
                    placeholder="e.g. Corfu or CFU"
                    value={overrideSearch}
                    onChange={(e) => setOverrideSearch(e.target.value)}
                    className="w-full rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-gray-900 focus:border-amber-500 focus:outline-none"
                  />
                  {overrideSearch.length >= 2 && (
                    <div className="absolute z-10 mt-1 w-full rounded-lg border bg-white shadow-lg max-h-56 overflow-y-auto">
                      {Object.entries(DEST_NAMES)
                        .filter(([iata, name]) =>
                          name.toLowerCase().includes(overrideSearch.toLowerCase()) ||
                          iata.toLowerCase().includes(overrideSearch.toLowerCase()) ||
                          countryFor(iata).toLowerCase().includes(overrideSearch.toLowerCase())
                        )
                        .slice(0, 8)
                        .map(([iata, name]) => (
                          <button
                            key={iata}
                            onClick={() => handleSetDestinationDirectly(iata, name)}
                            disabled={overriding}
                            className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-amber-50 disabled:opacity-50"
                          >
                            <span className="font-medium text-gray-900">{flagFor(iata)} {name}</span>
                            <span className="font-mono text-xs text-gray-400">{iata}</span>
                          </button>
                        ))}
                    </div>
                  )}
                  <button onClick={() => { setOverrideOpen(false); setOverrideSearch(""); }} className="mt-1 text-xs text-gray-400 hover:text-gray-600">Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Questionnaire */}
        <div className="rounded-xl border bg-white p-6 shadow-sm space-y-5">
          <h2 className="text-lg font-bold text-gray-900">Your destination preferences</h2>
          <p className="text-sm text-gray-500">Tell our AI what your perfect trip looks like — it weighs everyone&apos;s answers and suggests the best destinations for the whole group.</p>

          {/* ✨ The star: free-text ideal holiday — this is where the AI shines, so it
              leads the page and the quick-pick options below are framed as optional. */}
          <div className="rounded-xl border-2 border-blue-200 bg-blue-50 p-4 space-y-2">
            <label className="block text-base font-bold text-blue-900">✨ Describe your ideal holiday</label>
            <p className="text-sm text-blue-800">
              This is the most powerful box — say it in your own words and the AI does the rest. You can
              ask for <strong>anything</strong>: a vibe, a place you loved, the kind of food, &ldquo;near
              water, no bugs, good markets and art galleries&rdquo; — whatever matters to you. The more you
              write, the better the matches.
            </p>
            <textarea
              rows={4}
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              placeholder="e.g. &quot;18–25°C, near water, relaxed but able to walk and eat out, love the south of France, good markets and art galleries, no bugs.&quot;"
              className="w-full rounded-lg border border-blue-300 bg-white px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none resize-none"
            />
          </div>

          <p className="pt-2 text-sm font-medium text-gray-600">
            Optional quick prompts <span className="font-normal text-gray-400">— the box above already covers everything, but these help nudge the AI:</span>
          </p>

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

          <div className="flex items-center gap-3 pt-2 text-sm text-gray-500">
            {questSaving ? "💾 Saving…" : questSaved ? "✓ Saved" : "✓ Your answers save automatically as you go."}
          </div>
        </div>

        {/* Manual propose */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-1">
            {isRanked ? "Put forward your destination" : "Propose a destination"}
          </h2>
          {isRanked && (
            <p className="text-sm text-gray-500 mb-3">
              Each person picks <strong>one</strong> destination for everyone to rank. Choose your own
              below, or get a few AI ideas to pick from. Proposing again replaces your pick.
            </p>
          )}

          {/* Ranked mode: your current pick + AI ideas */}
          {isRanked && (
            <div className="mb-4 space-y-3">
              {myPick ? (
                <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm">
                  <span className="text-xl">{flagFor(myPick.iata_code)}</span>
                  <span className="font-semibold text-green-800">Your pick: {myPick.name}</span>
                </div>
              ) : (
                <p className="text-xs text-amber-600">You haven&apos;t put forward a destination yet.</p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleGetIdeas}
                  disabled={loadingIdeas}
                  className="rounded-lg border border-blue-300 bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-50"
                >
                  {loadingIdeas ? "Asking Gemini…" : "✨ Give me AI ideas to pick from"}
                </button>
                <button
                  onClick={handleGroupRecommendation}
                  disabled={loadingRec}
                  title="Weighs everyone's preferences and suggests ONE place for the whole group. Best once everyone has submitted their preferences."
                  className="rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                >
                  {loadingRec ? "Thinking…" : "🌍 AI pick for everyone"}
                </button>
              </div>
              <p className="text-[11px] text-gray-400">
                🌍 weighs <em>everyone&apos;s</em> preferences — best once all members have submitted theirs (it&apos;ll tell you how many have).
              </p>
              {groupRec?.iata_code && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-emerald-900">
                      🌍 AI pick for the whole group: {flagFor(groupRec.iata_code)} {groupRec.name}
                    </p>
                    <button onClick={() => setGroupRec(null)} className="text-xs text-emerald-400 hover:text-emerald-700" title="Dismiss">✕</button>
                  </div>
                  {groupRec.members_responded < groupRec.members_total && (
                    <p className="text-[11px] text-amber-600">
                      ⚠️ Only {groupRec.members_responded}/{groupRec.members_total} members have submitted preferences — this improves once everyone has.
                    </p>
                  )}
                  {groupRec.reasoning && (
                    <p className="text-xs text-emerald-800 whitespace-pre-wrap">{groupRec.reasoning}</p>
                  )}
                  <button
                    onClick={() => handlePropose(groupRec.iata_code!)}
                    disabled={proposing}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    Put this forward as my pick →
                  </button>
                </div>
              )}
              {ideas.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {ideas.map((idea) => (
                    <button
                      key={idea.iata_code}
                      onClick={() => handlePropose(idea.iata_code)}
                      disabled={proposing}
                      title={
                        idea.est_flight_return_gbp != null || idea.est_daily_living_gbp != null
                          ? `Rough: ✈️ ~£${idea.est_flight_return_gbp ?? "?"} flights · ~£${idea.est_daily_living_gbp ?? "?"}/day living`
                          : undefined
                      }
                      className="flex items-center gap-1.5 rounded-full border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
                    >
                      <span>{flagFor(idea.iata_code)}</span>
                      {idea.name}
                      {idea.est_daily_living_gbp != null && (
                        <span className="text-[11px] font-normal text-gray-400">~£{idea.est_daily_living_gbp}/day</span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              {/* Gemini's reasoning for these ideas — belongs here, since the
                  ideas are for THIS person to pick one from. */}
              {aiReasoning && (
                <div className="rounded-xl border border-purple-200 bg-purple-50 p-3">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <p className="text-xs font-semibold text-purple-900">🤖 Why the AI suggested these</p>
                    <button
                      onClick={() => setAiReasoning(null)}
                      className="text-xs text-purple-400 hover:text-purple-700"
                      title="Dismiss"
                    >
                      ✕
                    </button>
                  </div>
                  <p className="text-xs text-purple-800 whitespace-pre-wrap">{aiReasoning}</p>
                </div>
              )}
            </div>
          )}

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
            {!isRanked && (
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
            )}
          </div>
          <p className="text-xs text-gray-500 mb-2">
            {isRanked
              ? "Everyone's picks appear here. Drag them into your order of preference (1st at the top), then lock in your ranking. Scores stay hidden until everyone has ranked."
              : "Gemini picks destinations matched to the group's combined questionnaire answers, dates, and budget. Tap 👍 or 👎 to vote."}
          </p>
          {candidates.length > 0 && (
            <p className="mb-4 text-[11px] text-gray-400">
              💡 Costs are a rough guide.{" "}
              <button onClick={() => setShowCostMethod((s) => !s)} className="underline hover:text-gray-600">
                {showCostMethod ? "Hide" : "How are these worked out?"}
              </button>
            </p>
          )}
          {candidates.length > 0 && showCostMethod && (
            <div className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-[11px] text-gray-500 space-y-1">
              <p><strong>✈️ Flights</strong> = real cheapest–dearest <em>cached</em> return fares <strong>from London</strong> for your dates (Travelpayouts). It&apos;s a fair <em>comparison baseline</em>, not your personal price — your exact fare from your nearest airport is computed at the Flights step. The range narrows to live data once live fares are enabled.</p>
              <p><strong>🛏️🍽️ Daily living</strong> = a Numbeo-grounded per-country bare-minimum (budget bed + food + local transport, no activities), shown ±15%. Live cost-of-living is on the roadmap.</p>
              <p><strong>≈ total</strong> = cheapest flight + low daily × min nights, up to dearest flight + higher daily × max nights.</p>
            </div>
          )}

          {/* Blind-reveal banner */}
          {candidates.length > 0 && voteStatus && (
            <div className={`mb-4 rounded-xl border px-4 py-3 ${
              voteStatus.votes_revealed
                ? "bg-green-50 border-green-200"
                : "bg-indigo-50 border-indigo-200"
            }`}>
              {voteStatus.votes_revealed ? (
                <p className="text-sm text-green-800">
                  ✅ <strong>Results revealed</strong> — everyone has {isRanked ? "ranked" : "voted"}.{" "}
                  {isRanked ? "Winner = lowest total score (Borda)." : "Candidates are now ranked by votes."}
                </p>
              ) : (
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <p className="text-sm text-indigo-800">
                    🗳️ <strong>Blind {isRanked ? "ranking" : "vote"} in progress.</strong>{" "}
                    {isRanked
                      ? "Scores stay hidden so nobody's swayed — revealed once everyone has ranked."
                      : "Tallies stay hidden so nobody's swayed — revealed once everyone locks in."}{" "}
                    <span className="font-semibold">{voteStatus.voters_done}/{voteStatus.voters_total} {isRanked ? "ranked" : "locked in"}.</span>
                  </p>
                  {!isRanked && (
                    <button
                      onClick={handleLockVotes}
                      disabled={lockingVotes}
                      className={`shrink-0 rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50 ${
                        voteStatus.i_submitted
                          ? "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                          : "bg-indigo-600 text-white hover:bg-indigo-700"
                      }`}
                    >
                      {lockingVotes
                        ? "Saving…"
                        : voteStatus.i_submitted
                        ? "✓ Locked in — change my votes"
                        : "Lock in my votes"}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {candidates.length === 0 ? (
            <div className="py-10 text-center text-gray-500">
              <div className="text-3xl mb-2">🌍</div>
              <p>
                {isRanked
                  ? "No picks yet — put your destination forward above so the group can rank it."
                  : <>No destinations yet. Click <strong>Get suggestions</strong> above or propose one.</>}
              </p>
            </div>
          ) : isRanked ? (
            voteStatus?.votes_revealed ? (
              /* Ranked results — lowest Borda total wins. The server already
                 returns them in final order (ties broken by first-choice votes). */
              <div className="space-y-2">
                {candidates
                  .map((c, i) => (
                    <div
                      key={c.id}
                      className={`flex items-center justify-between rounded-xl border px-4 py-3 ${
                        i === 0 ? "border-yellow-300 bg-yellow-50" : "bg-gray-50"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="w-6 text-center text-sm font-bold text-gray-500">{i + 1}</span>
                        <span className="text-2xl shrink-0">{flagFor(c.iata_code)}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">
                            {c.name}
                            {i === 0 && (
                              <span className="ml-2 rounded-full bg-yellow-200 px-2 py-0.5 text-xs font-medium text-yellow-800">🏆 Winner</span>
                            )}
                          </p>
                          <p className="text-xs text-gray-400">
                            Your rank: {c.my_rank ?? "—"} · {proposerLabel(c)}
                          </p>
                          <CostLine c={c} />
                        </div>
                      </div>
                      <span className="text-sm font-bold text-gray-900 shrink-0">{c.borda_points} pts</span>
                    </div>
                  ))}
                <p className="pt-1 text-xs text-gray-400">
                  Lowest total score wins (everyone&apos;s ranks added up). Ties go to the
                  destination with more <strong>1st-choice</strong> votes.
                </p>
              </div>
            ) : (
              /* Ranked voting — arrange into your preferred order then lock in */
              <div className="space-y-2">
                {rankOrder.map((id, i) => {
                  const c = candidates.find((x) => x.id === id);
                  if (!c) return null;
                  const locked = voteStatus?.i_submitted;
                  return (
                    <div key={id} className="flex items-center justify-between rounded-xl border bg-gray-50 px-4 py-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-blue-600 text-sm font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="text-2xl shrink-0">{flagFor(c.iata_code)}</span>
                        <div className="min-w-0">
                          <p className="font-semibold text-gray-900 truncate">{c.name}</p>
                          <p className="text-xs text-gray-400">{proposerLabel(c)}</p>
                          <CostLine c={c} />
                        </div>
                      </div>
                      {!locked && (
                        <div className="flex flex-col gap-0.5 shrink-0">
                          <button
                            onClick={() => moveRank(id, -1)}
                            disabled={i === 0}
                            aria-label="Move up"
                            className="rounded px-2 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                          >
                            ▲
                          </button>
                          <button
                            onClick={() => moveRank(id, 1)}
                            disabled={i === rankOrder.length - 1}
                            aria-label="Move down"
                            className="rounded px-2 text-gray-500 hover:bg-gray-200 disabled:opacity-30"
                          >
                            ▼
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                <div className="pt-3">
                  {voteStatus?.i_submitted ? (
                    <button
                      onClick={handleEditRanking}
                      disabled={submittingRank}
                      className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    >
                      {submittingRank ? "Saving…" : "✓ Ranking locked in — edit"}
                    </button>
                  ) : (
                    <button
                      onClick={handleSubmitRanking}
                      disabled={submittingRank}
                      className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
                    >
                      {submittingRank ? "Saving…" : "Lock in my ranking"}
                    </button>
                  )}
                </div>
              </div>
            )
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
                      <p className="text-xs text-gray-400">{proposerLabel(c)}</p>
                      <CostLine c={c} />
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className="min-w-8 text-center text-sm font-bold text-gray-900"
                      title={voteStatus && !voteStatus.votes_revealed ? "Hidden until everyone has voted" : undefined}
                    >
                      {voteStatus && !voteStatus.votes_revealed
                        ? "🔒"
                        : c.vote_count > 0 ? `+${c.vote_count}` : c.vote_count}
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

          {/* Voting summary — only after the blind reveal (counts are hidden until then) */}
        {voteStatus?.votes_revealed && candidates.length > 0 && candidates.some(c => c.vote_count !== 0) && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="text-lg font-bold text-gray-900 mb-3">🗳️ Final votes</h2>
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
      <NextStepButton slug={slug} currentRoute="destinations" />
      {token && <FeedbackButton token={token} page="destinations" roomSlug={slug} />}
    </main>
  );
}
