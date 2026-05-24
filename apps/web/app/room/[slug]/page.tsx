"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  listMembers,
  getSubmissionStatus,
  updateMyPostcode,
  deleteRoom,
  leaveRoom,
  kickMember,
  remindPendingMembers,
  type Room,
  type Member,
  type SubmissionStatus,
} from "@/lib/api";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import { normalisePostcode } from "@/lib/postcode";
import { destName } from "@/lib/destinations";
import FeedbackButton from "@/components/FeedbackButton";

// Lazy-load the chat widget so it doesn't block initial render
const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

const STEPS = [
  { key: "availability", label: "Availability", icon: "📅" },
  { key: "duration", label: "Duration", icon: "🗓️" },
  { key: "budget", label: "Budget", icon: "💷" },
  { key: "destination", label: "Destination", icon: "🗺️" },
  { key: "flights", label: "Flights", icon: "✈️" },
  { key: "booking", label: "Booking", icon: "🎫" },
];

// Maps step key → the page to navigate to when user clicks the CTA
const STEP_ROUTES: Record<string, string> = {
  availability: "availability",
  duration: "preferences",
  budget: "preferences",
  destination: "destinations",
  flights: "flights",
  booking: "booking",
};

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [myPostcode, setMyPostcode] = useState("");
  const [savingPostcode, setSavingPostcode] = useState(false);
  const [showPostcodeEdit, setShowPostcodeEdit] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [reminding, setReminding] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      setToken(t);
      setUserId(data.session.user.id);
      try {
        const [r, m] = await Promise.all([
          getRoom(t, slug),
          listMembers(t, slug),
        ]);
        setRoom(r);
        setMembers(m);
        // Pre-fill postcode from my membership
        const myMembership = m.find(mb => mb.user_id === data.session!.user.id);
        if (myMembership?.home_postcode) setMyPostcode(myMembership.home_postcode);

        // Load availability submission status if on that step
        if (r.current_step === "availability") {
          const status = await getSubmissionStatus(t, slug).catch(() => null);
          setSubmissionStatus(status);
        }
      } catch {
        router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });
    // Keep token fresh as Supabase silently refreshes the 1h JWT
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    // Refresh room + members + submission status when the user comes back to
    // the tab — so they see new joiners and new availability submissions
    // without having to manually reload.
    function handleVisibilityChange() {
      if (document.visibilityState !== "visible") return;
      supabase.auth.getSession().then(async ({ data }) => {
        if (!data.session) return;
        const t = data.session.access_token;
        try {
          const [r, m] = await Promise.all([
            getRoom(t, slug),
            listMembers(t, slug),
          ]);
          setRoom(r);
          setMembers(m);
          if (r.current_step === "availability") {
            const status = await getSubmissionStatus(t, slug).catch(() => null);
            if (status) setSubmissionStatus(status);
          }
        } catch {
          // Don't kick the user out on a transient refresh failure.
        }
      });
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      sub.subscription.unsubscribe();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [slug, router, supabase]);

  async function handleSavePostcode() {
    if (!token || !myPostcode.trim()) return;
    const normalised = normalisePostcode(myPostcode);
    if (!normalised) {
      toast.error("That doesn't look like a UK postcode (e.g. M1 1AE)");
      return;
    }
    setSavingPostcode(true);
    try {
      await updateMyPostcode(token, slug, normalised);
      // Refresh members list
      const m = await listMembers(token, slug);
      setMembers(m);
      setShowPostcodeEdit(false);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to update postcode"));
    } finally {
      setSavingPostcode(false);
    }
  }


  async function handleDelete() {
    if (!token || !room) return;
    if (!window.confirm(`Delete "${room.name}"? This permanently removes the Holiday and all its data — this cannot be undone.`)) return;
    try {
      await deleteRoom(token, slug);
      toast.success(`Deleted "${room.name}"`);
      router.replace("/dashboard");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to delete Holiday"));
    }
  }

  async function handleLeave() {
    if (!token || !room) return;
    if (!window.confirm(`Leave "${room.name}"? You won't be able to rejoin unless re-invited.`)) return;
    try {
      await leaveRoom(token, slug);
      toast.success(`Left "${room.name}"`);
      router.replace("/dashboard");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to leave Holiday"));
    }
  }

  async function handleKick(member: Member) {
    if (!token || !room) return;
    const name = member.display_name || "this member";
    if (!window.confirm(`Remove ${name} from "${room.name}"? They will need a new invite link to rejoin.`)) return;
    try {
      await kickMember(token, slug, member.user_id);
      toast.success(`Removed ${name} from the Holiday`);
      // Refresh member list
      const m = await listMembers(token, slug);
      setMembers(m);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to remove member"));
    }
  }

  async function handleRemind() {
    if (!token || reminding) return;
    setReminding(true);
    try {
      const result = await remindPendingMembers(token, slug);
      if (result.reminders_sent === 0) {
        toast.info("No pending members to remind — everyone has already submitted.");
      } else {
        toast.success(`Reminder sent to ${result.reminders_sent} member${result.reminders_sent === 1 ? "" : "s"}`);
      }
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to send reminders"));
    } finally {
      setReminding(false);
    }
  }

  async function shareLink() {
    const url = `${window.location.origin}/room/${slug}/join`;
    const shareText = `Join my holiday planning room "${room?.name ?? slug}" on Group Holiday`;

    // Use Web Share API on supported devices (mobile gets a native share sheet)
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "Group Holiday invite", text: shareText, url });
        return;
      } catch (err) {
        // User cancelled — only fall through to clipboard if it wasn't a cancellation
        if (err instanceof Error && err.name === "AbortError") return;
      }
    }

    // Fallback: copy to clipboard
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied to clipboard");
    } catch {
      toast.error("Could not copy link — try again");
    }
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  const stepIdx = STEPS.findIndex((s) => s.key === room.current_step);
  const activeStep = STEPS[stepIdx];
  const canAdvance = room.is_admin && room.current_step !== "done";

  // Availability-step copy
  const availabilityReady =
    submissionStatus?.all_submitted ||
    (submissionStatus && submissionStatus.submitted === submissionStatus.total);

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <button onClick={() => router.push("/dashboard")} className="text-sm text-gray-500 hover:text-gray-900">
            ← Dashboard
          </button>
          <span className="font-semibold text-gray-900">{room.name}</span>
          <button
            onClick={shareLink}
            className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
          >
            Invite friends
          </button>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-8">
        {/* Step progress */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <div className="flex items-center gap-2 overflow-x-auto pb-2">
            {STEPS.map((step, i) => {
              // All steps are clickable — users can jump anywhere in the flow
              const isPast = i < stepIdx;
              const isCurrent = i === stepIdx;
              const isFuture = i > stepIdx;
              const route = STEP_ROUTES[step.key];

              const pill = (
                <div
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors ${
                    isCurrent
                      ? "bg-blue-600 text-white"
                      : isPast
                      ? "bg-green-100 text-green-700 hover:bg-green-200 cursor-pointer"
                      : "bg-gray-100 text-gray-400 hover:bg-gray-200 hover:text-gray-600 cursor-pointer"
                  }`}
                >
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                  {isFuture && <span className="text-xs opacity-60">🔒</span>}
                </div>
              );

              return (
                <div key={step.key} className="flex items-center">
                  {route ? (
                    <button
                      onClick={() => router.push(`/room/${slug}/${route}`)}
                      title={
                        isPast ? `Revisit ${step.label}` :
                        isCurrent ? step.label :
                        `Jump to ${step.label} (admin may need to unlock first)`
                      }
                    >
                      {pill}
                    </button>
                  ) : (
                    pill
                  )}
                  {i < STEPS.length - 1 && (
                    <div className={`mx-1 h-0.5 w-6 ${i < stepIdx ? "bg-green-400" : "bg-gray-200"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current step card */}
            <div className="rounded-xl border bg-white p-8 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-4xl">{activeStep?.icon}</span>
                  <h2 className="mt-2 text-xl font-bold text-gray-900">
                    Step {stepIdx + 1}: {activeStep?.label}
                  </h2>
                </div>
              </div>

              {/* Availability step */}
              {room.current_step === "availability" && (
                <div className="space-y-4">
                  {submissionStatus && (
                    <div className={`rounded-lg px-4 py-3 text-sm ${
                      availabilityReady ? "bg-green-50 text-green-800" : "bg-blue-50 text-blue-800"
                    }`}>
                      {availabilityReady
                        ? "✅ All members have submitted! Admin can now view the results and advance."
                        : `⏳ ${submissionStatus.submitted} of ${submissionStatus.total} members have submitted.`}
                      {!availabilityReady && submissionStatus.members_pending.length > 0 && (
                        <p className="mt-1 text-xs opacity-75">
                          Waiting for: {submissionStatus.members_pending.join(", ")}
                        </p>
                      )}
                    </div>
                  )}
                  <p className="text-gray-600">
                    Everyone needs to mark their busy dates. Results are hidden until all {room.member_count} members have submitted.
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/availability`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Submit my availability →
                  </button>
                  {canAdvance && !availabilityReady && submissionStatus && submissionStatus.members_pending.length > 0 && (
                    <button
                      onClick={handleRemind}
                      disabled={reminding}
                      className="rounded-xl border border-amber-300 bg-amber-50 px-5 py-2.5 text-sm font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                    >
                      {reminding ? "Sending…" : `⏰ Remind ${submissionStatus.members_pending.length} pending member${submissionStatus.members_pending.length === 1 ? "" : "s"}`}
                    </button>
                  )}
                  {canAdvance && availabilityReady && (
                    <div className="pt-2">
                      <p className="text-xs text-gray-500 mb-2">
                        Once everyone&apos;s submitted, click <strong>Use these dates</strong>{" "}
                        on one of the free windows to lock in dates and move to the next step.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* Duration step */}
              {room.current_step === "duration" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Everyone submits their preferred trip length. The admin will agree on final min/max nights.
                    {room.min_nights && ` (Current: ${room.min_nights}–${room.max_nights} nights)`}
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/preferences`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Set trip length →
                  </button>
                </div>
              )}

              {/* Budget step */}
              {room.current_step === "budget" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Tell us your maximum budget per person including flights and travel.
                    {room.budget_gbp && ` (Current cap: £${room.budget_gbp.toLocaleString()})`}
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/preferences`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Set budget →
                  </button>
                </div>
              )}

              {/* Destination step */}
              {room.current_step === "destination" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Answer a quick questionnaire and our algorithm will suggest destinations. You can also propose and vote on any destination.
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/destinations`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Vote on destinations →
                  </button>
                </div>
              )}

              {/* Flights step */}
              {room.current_step === "flights" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Find the cheapest combination of flights from everyone&apos;s nearest airport to the shortlisted destinations.
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/flights`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Find flights →
                  </button>
                </div>
              )}

              {/* Booking step */}
              {room.current_step === "booking" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Time to book! Everyone books their own flights and you coordinate accommodation together.
                    {room.destination_iata && (
                      <span className="font-semibold"> Destination: {destName(room.destination_iata)}</span>
                    )}
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/booking`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Go to booking page
                  </button>
                </div>
              )}

              {/* Done! */}
              {room.current_step === "done" && (
                <div className="text-center py-6">
                  <div className="text-6xl mb-4 animate-bounce">🎉</div>
                  <h3 className="text-2xl font-bold text-green-700">Holiday booked!</h3>
                  <p className="text-gray-600 mt-2 max-w-md mx-auto">
                    {room.destination_iata && room.agreed_start ? (
                      <>
                        See you in <span className="font-semibold">{destName(room.destination_iata)}</span>{" "}
                        on{" "}
                        <span className="font-semibold">
                          {new Date(room.agreed_start).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}
                        </span>
                        {" "}— have an amazing time! 🌴
                      </>
                    ) : (
                      <>Enjoy your trip! 🌴</>
                    )}
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3 justify-center">
                    <button
                      onClick={() => router.push(`/room/${slug}/booking`)}
                      className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      View booking details
                    </button>
                    <button
                      onClick={shareLink}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Share with the group
                    </button>
                  </div>
                </div>
              )}

              {/* The previous "Skip to next step" admin shortcut was removed —
                  it let admins advance past required data (no agreed dates /
                  no duration etc.) which caused the flights page to fail with
                  "Room is missing: agreed_start, agreed_end…". Each step now
                  has its own advance button on its dedicated page that only
                  fires once the required data is set. */}
            </div>

            {/* Room info */}
            <div className="grid grid-cols-2 gap-4">
              {room.rough_window && !room.agreed_start && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Target window</h3>
                  <p className="font-semibold text-gray-900 text-sm">{room.rough_window}</p>
                </div>
              )}
              {room.agreed_start && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Agreed dates</h3>
                  <p className="font-semibold text-gray-900 text-sm">
                    {new Date(room.agreed_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}
                    {" – "}
                    {new Date(room.agreed_end!).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                  </p>
                </div>
              )}
              {(room.min_nights || room.budget_gbp) && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Trip details</h3>
                  {room.min_nights && (
                    <p className="text-sm font-semibold text-gray-900">{room.min_nights}–{room.max_nights} nights</p>
                  )}
                  {room.budget_gbp && (
                    <p className="text-sm text-gray-600">£{room.budget_gbp.toLocaleString()} budget pp</p>
                  )}
                </div>
              )}
              {room.destination_iata && (
                <div className="rounded-xl border bg-green-50 p-4 shadow-sm">
                  <h3 className="text-xs font-medium text-green-600 mb-1">Chosen destination</h3>
                  <p className="font-semibold text-green-900 text-sm">{destName(room.destination_iata)}</p>
                  <p className="text-xs text-green-600 font-mono">{room.destination_iata}</p>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar — members */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">
                Members ({members.length})
              </h3>
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3 group">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {(m.display_name || "?")[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900">
                        {m.display_name || "Unknown"}
                        {m.is_admin && (
                          <span className="ml-1 text-xs text-gray-400">(admin)</span>
                        )}
                      </p>
                      {m.home_postcode
                        ? <p className="text-xs text-gray-500">{m.home_postcode}</p>
                        : <p className="text-xs text-amber-600">⚠️ No postcode</p>
                      }
                    </div>
                    {/* Admin kick button — hidden unless hovering, only shown for non-admin members */}
                    {room.is_admin && !m.is_admin && m.user_id !== userId && (
                      <button
                        onClick={() => handleKick(m)}
                        title={`Remove ${m.display_name || "this member"}`}
                        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 rounded p-1 text-gray-300 hover:text-red-500 hover:bg-red-50"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    )}
                  </li>
                ))}
              </ul>
              {/* Admin alert if anyone is missing a postcode */}
              {room?.is_admin && members.some(m => !m.home_postcode) && (
                <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800">
                  ⚠️ <strong>{members.filter(m => !m.home_postcode).map(m => m.display_name || "Someone").join(", ")}</strong> {members.filter(m => !m.home_postcode).length === 1 ? "hasn't" : "haven't"} set a postcode — the flight search will fail until they do.
                </div>
              )}
            </div>

            {/* Postcode update */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">Your postcode</h3>
                <button
                  onClick={() => setShowPostcodeEdit(!showPostcodeEdit)}
                  className="text-xs text-blue-600 hover:underline"
                >
                  {showPostcodeEdit ? "Cancel" : "Edit"}
                </button>
              </div>
              {showPostcodeEdit ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="e.g. M1 1AE"
                    value={myPostcode}
                    onChange={(e) => setMyPostcode(e.target.value)}
                    className="flex-1 rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                  />
                  <button
                    onClick={handleSavePostcode}
                    disabled={savingPostcode || !myPostcode.trim()}
                    className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                  >
                    {savingPostcode ? "…" : "Save"}
                  </button>
                </div>
              ) : (
                <p className="text-sm text-gray-600">
                  {members.find(m => m.user_id === userId)?.home_postcode || (
                    <span className="text-amber-600">Not set — needed for flight search ⚠️</span>
                  )}
                </p>
              )}
            </div>

            {/* Share card */}
            <div className="rounded-xl border bg-blue-50 p-6">
              <h3 className="font-semibold text-blue-900 mb-2">Invite friends</h3>
              <p className="text-sm text-blue-700 mb-1">
                Send this link — they can join without an account first.
              </p>
              <div className="mb-3 flex items-center gap-1.5 rounded-lg border border-blue-200 bg-white px-3 py-2">
                <span className="flex-1 truncate text-xs text-gray-500 font-mono">
                  {typeof window !== "undefined" ? `${window.location.origin}/room/${slug}/join` : `/room/${slug}/join`}
                </span>
              </div>
              <button
                onClick={shareLink}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                📋 Copy invite link
              </button>
            </div>

            {/* Quick links */}
            <div className="rounded-xl border bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Quick links</h3>
              <div className="space-y-1">
                <button onClick={() => router.push(`/room/${slug}/availability`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  📅 Availability
                </button>
                <button onClick={() => router.push(`/room/${slug}/preferences`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  🗓️ Duration &amp; budget
                </button>
                <button onClick={() => router.push(`/room/${slug}/destinations`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  🗺️ Destinations
                </button>
                <button onClick={() => router.push(`/room/${slug}/flights`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  ✈️ Flights
                </button>
                <button onClick={() => router.push(`/room/${slug}/booking`)} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 text-left">
                  🎫 Booking
                </button>
              </div>
            </div>

            {/* Danger zone — admin can delete, non-admin can leave */}
            <div className="rounded-xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Danger zone</h3>
              {room.is_admin ? (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Permanently removes this Holiday and all its data.
                  </p>
                  <button
                    onClick={handleDelete}
                    className="w-full rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Delete this Holiday
                  </button>
                </>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Remove yourself from this Holiday.
                  </p>
                  <button
                    onClick={handleLeave}
                    className="w-full rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
                  >
                    Leave this Holiday
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Chat widget — only rendered when token available */}
      {token && <ChatWidget token={token} roomSlug={slug} />}
      <FeedbackButton token={token} page="room" roomSlug={slug} />
    </main>
  );
}
