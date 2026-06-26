"use client";

import { createClient } from "@/lib/supabase/client";
import {
  getRoom,
  listMembers,
  getSubmissionStatus,
  updateMyPostcode,
  updateRoom,
  goBackStep,
  resetRoom,
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
import AccountBadge from "@/components/AccountBadge";

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
  const [editingName, setEditingName] = useState(false);
  const [newName, setNewName] = useState("");
  const [savingName, setSavingName] = useState(false);
  // Editable target window
  const [editingWindow, setEditingWindow] = useState(false);
  const [winMode, setWinMode] = useState<"month" | "date">("month");
  const [winFrom, setWinFrom] = useState("");
  const [winTo, setWinTo] = useState("");
  const [savingWindow, setSavingWindow] = useState(false);

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

  // Poll submission status every 20s while on the availability step and not yet complete.
  // Lets the admin see the count go up in real-time as members submit.
  const allSubmitted = Boolean(submissionStatus?.all_submitted ||
    (submissionStatus && submissionStatus.submitted === submissionStatus.total));
  useEffect(() => {
    if (!token || !room || room.current_step !== "availability" || allSubmitted) return;
    const interval = setInterval(async () => {
      try {
        const status = await getSubmissionStatus(token, slug);
        setSubmissionStatus(status);
      } catch {
        // Ignore transient failures — next tick will retry
      }
    }, 20_000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, room?.current_step, slug, allSubmitted]);

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `${room.name} | Group Holiday Booking`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

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


  async function handleLeave() {
    if (!token || !room) return;
    const lastOne = (room.member_count ?? 1) <= 1;
    const msg = lastOne
      ? `Leave "${room.name}"? You're the only member, so the Holiday will be deleted.`
      : `Leave "${room.name}"? You won't be able to rejoin unless re-invited.${room.is_admin ? " Admin will pass to another member." : ""}`;
    if (!window.confirm(msg)) return;
    try {
      await leaveRoom(token, slug);
      toast.success(lastOne ? `Deleted "${room.name}"` : `Left "${room.name}"`);
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

  async function handleRename() {
    if (!token || !room?.is_admin || !newName.trim()) return;
    setSavingName(true);
    try {
      const updated = await updateRoom(token, slug, { name: newName.trim() });
      setRoom(updated);
      setEditingName(false);
      toast.success("Holiday renamed!");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to rename Holiday"));
    } finally {
      setSavingName(false);
    }
  }

  const [resetting, setResetting] = useState(false);
  async function handleReset(targetStep: string, label: string) {
    if (!token || !room?.is_admin) return;
    const msg =
      targetStep === "availability"
        ? `Start "${room.name}" over? This keeps everyone and the rough dates, but clears all progress (availability, votes, picks, flights) back to the start.`
        : `Reset "${room.name}" back to ${label}? This clears everything done from that step onward. Members and saved preferences are kept.`;
    if (!window.confirm(msg)) return;
    setResetting(true);
    try {
      const updated = await resetRoom(token, slug, targetStep);
      setRoom(updated);
      toast.success(`Reset to ${label}.`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't reset the Holiday"));
    } finally {
      setResetting(false);
    }
  }

  const [goingBack, setGoingBack] = useState(false);
  async function handleGoBack() {
    if (!token || !room?.is_admin) return;
    setGoingBack(true);
    try {
      const updated = await goBackStep(token, slug);
      setRoom(updated);
      toast.success("Moved back a step.");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't move the step back"));
    } finally {
      setGoingBack(false);
    }
  }

  // Build the rough_window display string in the same format the create modal
  // uses (so the parser reads it back correctly).
  function buildWindowString(): string | null {
    if (!winFrom || !winTo) return null;
    const fmt = (v: string) =>
      winMode === "month"
        ? new Date(Number(v.split("-")[0]), Number(v.split("-")[1]) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" })
        : new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    return `${fmt(winFrom)} – ${fmt(winTo)}`;
  }

  // Parse a month ("YYYY-MM") or date ("YYYY-MM-DD") input into a Date.
  function winValueToDate(v: string): Date | null {
    if (!v) return null;
    const p = v.split("-").map(Number);
    return winMode === "month"
      ? new Date(p[0], (p[1] || 1) - 1, 1)
      : new Date(p[0], (p[1] || 1) - 1, p[2] || 1);
  }
  // Earliest selectable value (this month / today) + a validation message that
  // covers past dates and backwards ranges (e.g. a 2026 → 2007 typo).
  const _now = new Date();
  const winMin =
    winMode === "month"
      ? `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}`
      : `${_now.getFullYear()}-${String(_now.getMonth() + 1).padStart(2, "0")}-${String(_now.getDate()).padStart(2, "0")}`;
  const windowError = (() => {
    const floor =
      winMode === "month"
        ? new Date(_now.getFullYear(), _now.getMonth(), 1)
        : new Date(_now.getFullYear(), _now.getMonth(), _now.getDate());
    const s = winValueToDate(winFrom);
    const e = winValueToDate(winTo);
    if (s && s < floor) return "Start is in the past — pick a future date.";
    if (e && e < floor) return "End is in the past — pick a future date.";
    if (s && e && e < s) return "The end is before the start — check the years.";
    return null;
  })();
  const windowInvalid = windowError !== null;
  const windowInvalidBorder = windowInvalid ? "border-red-400 bg-red-50" : "border-gray-300";

  async function handleSaveWindow() {
    if (!token || !room?.is_admin) return;
    if (!winFrom || !winTo) { toast.error("Pick both a start and end."); return; }
    if (windowError) {
      toast.error(windowError);
      return;
    }
    const str = buildWindowString();
    if (!str) { toast.error("Pick both a start and end."); return; }
    setSavingWindow(true);
    try {
      const updated = await updateRoom(token, slug, { rough_window: str });
      setRoom(updated);
      setEditingWindow(false);
      toast.success("Target window updated!");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to update window"));
    } finally {
      setSavingWindow(false);
    }
  }

  /** Download an .ics file so users can add the agreed trip dates to their calendar. */
  function downloadIcs() {
    if (!room?.agreed_start) return;
    const start = room.agreed_start.replace(/-/g, ""); // YYYYMMDD
    // DTEND is exclusive in iCal — use the day after agreed_end (or day after start for single-day)
    const endDate = room.agreed_end
      ? new Date(room.agreed_end)
      : new Date(room.agreed_start);
    endDate.setUTCDate(endDate.getUTCDate() + 1);
    const end = endDate.toISOString().slice(0, 10).replace(/-/g, "");
    const destLabel = room.destination_iata ? ` (${destName(room.destination_iata)})` : "";
    const summary = `${room.name}${destLabel}`;
    const ics = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Group Holiday Booking//EN",
      "BEGIN:VEVENT",
      `UID:${slug}@groupholidaybooking.com`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${end}`,
      `SUMMARY:${summary}`,
      "DESCRIPTION:Booked via Group Holiday Booking",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${room.name.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function shareLink() {
    const url = `${window.location.origin}/room/${slug}/join`;
    const subject = `Join "${room?.name ?? slug}" on Group Holiday Booking`;
    // Put the link INSIDE the body text too — desktop email apps (Outlook) often
    // ignore the separate `url` field and only keep `text`, leaving no link.
    const shareText = `Join my holiday planning room "${room?.name ?? slug}" on Group Holiday Booking — we'll find dates that work for everyone and vote on where to go.\n\nJoin here: ${url}`;

    // Use Web Share API on supported devices (mobile gets a native share sheet)
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: subject, text: shareText, url });
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
          {editingName ? (
            <div className="flex items-center gap-2">
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleRename();
                  if (e.key === "Escape") setEditingName(false);
                }}
                className="rounded-lg border border-gray-300 px-2 py-1 text-sm font-semibold text-gray-900 focus:border-blue-500 focus:outline-none w-48"
              />
              <button onClick={handleRename} disabled={savingName} className="text-xs font-medium text-blue-600 hover:text-blue-800 disabled:opacity-50">
                {savingName ? "…" : "Save"}
              </button>
              <button onClick={() => setEditingName(false)} className="text-xs text-gray-400 hover:text-gray-600">✕</button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-900">{room.name}</span>
              {room.is_admin && (
                <button
                  onClick={() => { setNewName(room.name); setEditingName(true); }}
                  title="Rename this Holiday"
                  className="rounded p-0.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
              )}
            </div>
          )}
          <div className="flex items-center gap-3">
            <AccountBadge className="hidden sm:flex" />
            <button
              onClick={shareLink}
              className="rounded-lg bg-blue-50 px-3 py-1.5 text-sm font-medium text-blue-700 hover:bg-blue-100"
            >
              Invite friends
            </button>
          </div>
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
          {/* Admin: undo an over-advance. The step is a shared group pointer the
              admin moves forward — this lets them move it back without losing data. */}
          {room.is_admin && stepIdx > 0 && (
            <div className="mt-3 flex items-center gap-2 border-t pt-3 flex-wrap">
              <button
                onClick={handleGoBack}
                disabled={goingBack}
                className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50 disabled:opacity-50"
              >
                {goingBack ? "Moving…" : `← Move group back to ${STEPS[stepIdx - 1]?.label}`}
              </button>
              <span className="text-xs text-gray-400">moves the pointer · no data deleted</span>
            </div>
          )}
          {/* Admin: reset to any step (clears work from there onward). */}
          {room.is_admin && (
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-medium text-gray-500">Reset Holiday to:</span>
              {STEPS.map((step) => (
                <button
                  key={step.key}
                  onClick={() => handleReset(step.key, step.label)}
                  disabled={resetting}
                  title={
                    step.key === "availability"
                      ? "Start over — keep the group & rough dates, clear all progress"
                      : `Clear everything from ${step.label} onward and go back there`
                  }
                  className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50"
                >
                  {step.icon} {step.label}
                </button>
              ))}
              <span className="text-xs text-gray-400">clears work from that step on · keeps members &amp; prefs</span>
            </div>
          )}
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current step card */}
            <div className="rounded-xl border bg-white p-8 shadow-sm">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <span className="text-4xl">{activeStep?.icon ?? "🎉"}</span>
                  <h2 className="mt-2 text-xl font-bold text-gray-900">
                    {activeStep ? `Step ${stepIdx + 1}: ${activeStep.label}` : "Trip complete"}
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
                    {room.min_nights && ` (Current: ${room.min_nights === room.max_nights ? `${room.min_nights} nights` : `${room.min_nights}–${room.max_nights} nights`})`}
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
                    Find the cheapest combination of flights to the shortlisted destinations, checking every airport each member can reach.
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

              {/* Done — but only a real "booked" if a destination was actually chosen.
                  If the group jumped to 'done' without picking flights, say so and
                  point them back, rather than wrongly celebrating. */}
              {room.current_step === "done" && !room.destination_iata && (
                <div className="text-center py-6 space-y-3">
                  <div className="text-5xl">🤔</div>
                  <h3 className="text-xl font-bold text-amber-700">Marked complete — but no destination was chosen</h3>
                  <p className="text-gray-600 max-w-md mx-auto text-sm">
                    This Holiday is on the final step, but a destination was never locked in (the flight
                    search may not have found anything yet). Go back to choose flights and a destination.
                  </p>
                  <div className="flex flex-wrap justify-center gap-3 pt-1">
                    <button
                      onClick={() => router.push(`/room/${slug}/flights`)}
                      className="rounded-xl bg-blue-600 px-6 py-2.5 font-semibold text-white hover:bg-blue-700"
                    >
                      Go to flights →
                    </button>
                    {room.is_admin && (
                      <button
                        onClick={handleGoBack}
                        disabled={goingBack}
                        className="rounded-xl border border-gray-300 bg-white px-6 py-2.5 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                      >
                        {goingBack ? "Moving…" : "← Move group back a step"}
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Done! */}
              {room.current_step === "done" && room.destination_iata && (
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
                      onClick={() => {
                        const url = `${window.location.origin}/room/${slug}/results`;
                        if (typeof navigator.share === "function") {
                          navigator.share({ title: room.name, text: `Check out our group trip: ${room.name}`, url }).catch(() => {
                            navigator.clipboard.writeText(url).then(() => toast.success("Results link copied!"));
                          });
                        } else {
                          navigator.clipboard.writeText(url).then(() => toast.success("Results link copied!"));
                        }
                      }}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      📤 Share trip summary
                    </button>
                    {room.agreed_start && (
                      <button
                        onClick={downloadIcs}
                        className="rounded-lg border border-green-300 bg-green-50 px-4 py-2 text-sm font-medium text-green-700 hover:bg-green-100"
                      >
                        📅 Add to calendar
                      </button>
                    )}
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
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <h3 className="text-xs font-medium text-gray-500">Target window</h3>
                    {room.is_admin && !editingWindow && (
                      <button
                        onClick={() => { setEditingWindow(true); setWinMode("month"); setWinFrom(""); setWinTo(""); }}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                  {editingWindow ? (
                    <div className="space-y-2">
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => setWinMode("month")}
                          className={`rounded px-2 py-1 ${winMode === "month" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
                        >Months</button>
                        <button
                          onClick={() => setWinMode("date")}
                          className={`rounded px-2 py-1 ${winMode === "date" ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600"}`}
                        >Exact dates</button>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <input
                          type={winMode === "month" ? "month" : "date"}
                          min={winMin}
                          value={winFrom}
                          onChange={(e) => setWinFrom(e.target.value)}
                          className={`w-full rounded border px-2 py-1 text-xs text-gray-900 ${windowInvalidBorder}`}
                        />
                        <span className="text-gray-400 text-xs">to</span>
                        <input
                          type={winMode === "month" ? "month" : "date"}
                          min={winFrom || winMin}
                          value={winTo}
                          onChange={(e) => setWinTo(e.target.value)}
                          className={`w-full rounded border px-2 py-1 text-xs text-gray-900 ${windowInvalidBorder}`}
                        />
                      </div>
                      {windowError && (
                        <p className="text-xs font-medium text-red-600">⚠️ {windowError}</p>
                      )}
                      <div className="flex gap-2">
                        <button
                          onClick={handleSaveWindow}
                          disabled={savingWindow || windowInvalid || !winFrom || !winTo}
                          className="rounded bg-blue-600 px-3 py-1 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                        >{savingWindow ? "Saving…" : "Save"}</button>
                        <button
                          onClick={() => setEditingWindow(false)}
                          className="rounded px-3 py-1 text-xs text-gray-500 hover:text-gray-700"
                        >Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <p className="font-semibold text-gray-900 text-sm">{room.rough_window}</p>
                  )}
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
                  <button
                    onClick={downloadIcs}
                    className="mt-2 text-xs text-blue-600 hover:text-blue-800 hover:underline"
                  >
                    📅 Add to my calendar
                  </button>
                </div>
              )}
              {(room.min_nights || room.budget_gbp) && (
                <div className="rounded-xl border bg-white p-4 shadow-sm">
                  <h3 className="text-xs font-medium text-gray-500 mb-1">Trip details</h3>
                  {room.min_nights && (
                    <p className="text-sm font-semibold text-gray-900">
                      {room.min_nights === room.max_nights
                        ? `${room.min_nights} nights`
                        : `${room.min_nights}–${room.max_nights} nights`}
                    </p>
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
                    onKeyDown={(e) => { if (e.key === "Enter") handleSavePostcode(); }}
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
              {(room.current_step === "booking" || room.current_step === "done") && (
                <button
                  onClick={() => {
                    const url = `${window.location.origin}/room/${slug}/results`;
                    if (typeof navigator.share === "function") {
                      navigator.share({ title: room.name, text: `Our group trip: ${room.name}`, url }).catch(() => {
                        navigator.clipboard.writeText(url).then(() => toast.success("Results link copied!"));
                      });
                    } else {
                      navigator.clipboard.writeText(url).then(() => toast.success("Results link copied!"));
                    }
                  }}
                  className="mt-2 w-full rounded-lg border border-blue-300 bg-white py-2 text-sm font-medium text-blue-700 hover:bg-blue-100"
                >
                  📤 Share trip summary
                </button>
              )}
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

            {/* Danger zone — anyone can leave; a Holiday is only deleted once
                everyone has left (or by its sole member). */}
            <div className="rounded-xl border border-red-100 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-semibold text-gray-900 mb-1">Danger zone</h3>
              <p className="text-xs text-gray-500 mb-3">
                {(room.member_count ?? 1) <= 1
                  ? "You're the only member — leaving deletes this Holiday."
                  : room.is_admin
                  ? "Leave this Holiday. Admin passes to another member; it's deleted once everyone has left."
                  : "Leave this Holiday. It's deleted once everyone has left."}
              </p>
              <button
                onClick={handleLeave}
                className="w-full rounded-lg border border-red-200 bg-red-50 py-2 text-xs font-medium text-red-700 hover:bg-red-100"
              >
                {(room.member_count ?? 1) <= 1 ? "Leave & delete this Holiday" : "Leave this Holiday"}
              </button>
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
