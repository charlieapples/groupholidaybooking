"use client";

import { createClient } from "@/lib/supabase/client";
import {
  createRoom,
  joinRoom,
  listRooms,
  deleteRoom,
  getMyProfile,
  type Room,
} from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import { DashboardSkeleton } from "@/components/Skeleton";
import { normalisePostcode } from "@/lib/postcode";
import { destName, flagFor } from "@/lib/destinations";
import FeedbackButton from "@/components/FeedbackButton";
import dynamic from "next/dynamic";

const ChatWidget = dynamic(() => import("@/components/ChatWidget"), { ssr: false });

export default function Dashboard() {
  // Stable client — don't recreate on every render
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const { toast } = useToast();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<{ email?: string; name?: string } | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);

  // Create room modal state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPostcode, setNewPostcode] = useState("");

  // Time window pickers
  const [windowMode, setWindowMode] = useState<"month" | "date">("month");
  const [fromVal, setFromVal] = useState("");
  const [toVal, setToVal] = useState("");

  function buildWindow(): string | undefined {
    if (!fromVal && !toVal) return undefined;
    const fmt = (v: string) => {
      if (!v) return "";
      if (windowMode === "month") {
        const [y, m] = v.split("-");
        return new Date(Number(y), Number(m) - 1).toLocaleDateString("en-GB", { month: "long", year: "numeric" });
      }
      return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
    };
    if (fromVal && toVal) return `${fmt(fromVal)} – ${fmt(toVal)}`;
    return fmt(fromVal) || fmt(toVal);
  }

  function resetWindow() {
    setFromVal(""); setToVal(""); setWindowMode("month");
  }
  const [creating, setCreating] = useState(false);

  // Join room state
  const [joinSlug, setJoinSlug] = useState("");
  const [joinPostcode, setJoinPostcode] = useState("");
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      setToken(t);
      // Show the Google name immediately so the header isn't blank…
      setUser({
        email: data.session.user.email,
        name: data.session.user.user_metadata?.full_name,
      });
      // Pre-fill postcode from saved profile so users don't re-type it for every Holiday
      const [rooms, profile] = await Promise.all([
        listRooms(t).catch(() => []),
        getMyProfile(t).catch(() => null),
      ]);
      setRooms(rooms);
      if (profile) {
        // …then prefer the user's saved display name (set on the Profile page)
        // over the raw Google name so the header reflects their choice.
        setUser({
          email: profile.email ?? data.session.user.email,
          name: profile.display_name || data.session.user.user_metadata?.full_name,
        });
        if (profile.default_home_postcode) {
          setNewPostcode(profile.default_home_postcode);
          setJoinPostcode(profile.default_home_postcode);
        }
      }
      setLoading(false);
    });
    // Keep token fresh when Supabase silently refreshes the JWT
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [supabase, router]);

  // Update browser tab title
  useEffect(() => {
    document.title = "Your Holidays | Group Holiday Booking";
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, []);

  // Focus the name input after the modal animates in
  useEffect(() => {
    if (showCreate) {
      const id = setTimeout(() => nameInputRef.current?.focus(), 50);
      return () => clearTimeout(id);
    }
  }, [showCreate]);

  async function handleCreateRoom() {
    if (!token || !newName.trim()) return;
    // Validate postcode if one was entered (it's optional)
    let normalisedPostcode: string | undefined;
    if (newPostcode.trim()) {
      const normalised = normalisePostcode(newPostcode);
      if (!normalised) {
        toast.error("That doesn't look like a UK postcode (e.g. M1 1AE)");
        return;
      }
      normalisedPostcode = normalised;
    }
    setCreating(true);
    try {
      const room = await createRoom(token, {
        name: newName,
        rough_window: buildWindow(),
        home_postcode: normalisedPostcode,
      });
      setRooms((prev) => [room, ...prev]);
      setShowCreate(false);
      setNewName(""); setNewPostcode("");
      resetWindow();
      router.push(`/room/${room.slug}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to create room"));
    } finally {
      setCreating(false);
    }
  }

  async function handleDeleteRoom(slug: string, name: string) {
    if (!token) return;
    if (!window.confirm(`Delete "${name}"? This permanently removes the Holiday and all its data — this cannot be undone.`)) return;
    try {
      await deleteRoom(token, slug);
      setRooms((prev) => prev.filter((r) => r.slug !== slug));
      toast.success(`Deleted "${name}"`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to delete Holiday"));
    }
  }

  async function copyRoomLink(slug: string) {
    const url = `${window.location.origin}/room/${slug}/join`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Group Holiday Booking invite", url });
        return;
      }
      await navigator.clipboard.writeText(url);
      toast.success("Invite link copied");
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      toast.error("Could not copy link");
    }
  }

  async function handleJoinRoom() {
    if (!token || !joinSlug.trim()) return;
    // Validate postcode if entered
    let normalisedPostcode: string | undefined;
    if (joinPostcode.trim()) {
      const normalised = normalisePostcode(joinPostcode);
      if (!normalised) {
        toast.error("That doesn't look like a UK postcode (e.g. M1 1AE)");
        return;
      }
      normalisedPostcode = normalised;
    }
    setJoining(true);
    try {
      // Accept either a bare slug ("ab3x9k2m") or a full invite URL
      // ("https://groupholidaybooking.vercel.app/room/ab3x9k2m/join").
      // Extract the slug segment in either case.
      const raw = joinSlug.trim();
      const urlMatch = raw.match(/\/room\/([a-z0-9]+)/i);
      const slug = (urlMatch ? urlMatch[1] : raw).toLowerCase();
      await joinRoom(token, slug, normalisedPostcode);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Room not found or you're not allowed to join"));
    } finally {
      setJoining(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) return <DashboardSkeleton />;

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Nav */}
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <span className="text-xl font-bold text-blue-600">✈️ Group Holiday Booking</span>
          <div className="flex items-center gap-4">
            <button onClick={() => router.push("/profile")} className="text-sm text-gray-600 hover:text-gray-900 underline-offset-2 hover:underline">
              {user?.name || user?.email}
            </button>
            <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-900">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Your Holidays</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New Holiday
          </button>
        </div>

        {/* Upcoming trips countdown — rooms in booking/done step with agreed dates */}
        {(() => {
          const upcoming = rooms.filter(
            (r) => (r.current_step === "booking" || r.current_step === "done") && r.agreed_start
          );
          if (!upcoming.length) return null;
          return (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-500">Upcoming Trips</h2>
              <div className="grid gap-3 sm:grid-cols-2">
                {upcoming.map((room) => {
                  const daysUntil = room.agreed_start
                    ? Math.ceil((new Date(room.agreed_start).getTime() - Date.now()) / 86_400_000)
                    : null;
                  const destEmoji = room.destination_iata ? flagFor(room.destination_iata) : "🏖️";
                  const destLabel = room.destination_iata ? destName(room.destination_iata) : "Destination TBC";
                  const countdownLabel =
                    daysUntil === null ? "" :
                    daysUntil < 0 ? "Trip in progress!" :
                    daysUntil === 0 ? "Today! 🎉" :
                    daysUntil === 1 ? "Tomorrow! 🎉" :
                    `in ${daysUntil} days`;
                  return (
                    <button
                      key={room.slug}
                      onClick={() => router.push(`/room/${room.slug}`)}
                      className="rounded-xl border-2 border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50 p-5 text-left hover:border-blue-400 hover:shadow-md transition-all"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-gray-900">{room.name}</p>
                          <p className="text-sm text-blue-700 font-medium mt-0.5">
                            {destEmoji} {destLabel} {countdownLabel && `· ${countdownLabel}`}
                          </p>
                          {room.agreed_start && (
                            <p className="text-xs text-gray-500 mt-1">
                              {new Date(room.agreed_start).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}
                              {room.agreed_end ? ` – ${new Date(room.agreed_end).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : ""}
                            </p>
                          )}
                        </div>
                        <span className="text-3xl">
                          {daysUntil !== null && daysUntil <= 7 ? "🎉" : daysUntil !== null && daysUntil <= 30 ? "⏳" : "✈️"}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Room list */}
        {rooms.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="mx-auto max-w-md space-y-4">
              <div className="text-5xl">🏖️</div>
              <h2 className="text-xl font-semibold text-gray-900">No Holidays yet</h2>
              <p className="text-gray-500">
                A Holiday is a shared planning space — invite your friends, mark when
                you&apos;re free, and the app finds the dates that work for everyone.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  onClick={() => setShowCreate(true)}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Plan your first Holiday
                </button>
                <button
                  onClick={() => document.getElementById("join-room-card")?.scrollIntoView({ behavior: "smooth" })}
                  className="rounded-xl border border-gray-300 px-6 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Or join one with a code
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <div
                key={room.slug}
                className="group relative rounded-xl border bg-white shadow-sm hover:shadow-md transition-shadow"
              >
                {/* Main click target — navigates to room */}
                <button
                  onClick={() => router.push(`/room/${room.slug}`)}
                  className="w-full p-6 text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-300"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="font-semibold text-gray-900 truncate">{room.name}</h2>
                      {room.rough_window && (
                        <p className="text-sm text-gray-500 truncate">{room.rough_window}</p>
                      )}
                    </div>
                    <span className="shrink-0 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                      {({
                        availability: "📅 Availability",
                        duration: "🗓️ Duration",
                        budget: "💷 Budget",
                        destination: "🗺️ Destinations",
                        flights: "✈️ Flights",
                        booking: "🎫 Booking",
                        done: "✅ Done",
                      } as Record<string, string>)[room.current_step] ?? room.current_step}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">
                    {room.member_count} member{room.member_count !== 1 ? "s" : ""}
                    {room.is_admin ? " · admin" : ""}
                  </p>
                </button>
                {/* Quick actions — always visible (hover-only hid them on touch
                    devices and clashed with the status pill at the top-right). */}
                <div className="absolute bottom-2 right-2 flex gap-0.5">
                  <button
                    onClick={() => copyRoomLink(room.slug)}
                    title="Copy invite link"
                    className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Copy invite link"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                    </svg>
                  </button>
                  {room.is_admin && (
                    <button
                      onClick={() => handleDeleteRoom(room.slug, room.name)}
                      title="Delete this Holiday"
                      className="rounded-lg p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
                      aria-label="Delete Holiday"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="3 6 5 6 21 6" />
                        <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Join room */}
        <div id="join-room-card" className="rounded-xl border bg-white p-6 shadow-sm scroll-mt-6">
          <h2 className="mb-4 font-semibold text-gray-900">Join a Holiday</h2>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Holiday code or full invite link"
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoinRoom(); }}
              className="flex-1 min-w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Your postcode"
              value={joinPostcode}
              onChange={(e) => setJoinPostcode(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleJoinRoom(); }}
              className="w-36 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <button
              onClick={handleJoinRoom}
              disabled={joining || !joinSlug.trim()}
              className="rounded-lg bg-gray-900 px-5 py-2 text-sm font-semibold text-white hover:bg-gray-700 disabled:opacity-50"
            >
              {joining ? "Joining…" : "Join"}
            </button>
          </div>
        </div>
      </div>

      {/* Create room modal */}
      {showCreate && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="mb-6 text-xl font-bold text-gray-900">Plan a Holiday</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Holiday name *
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Lads Summer 2026"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoom(); if (e.key === "Escape") setShowCreate(false); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label className="text-sm font-medium text-gray-700">
                    Rough time window
                  </label>
                  <button
                    type="button"
                    onClick={() => { setFromVal(""); setToVal(""); setWindowMode(windowMode === "month" ? "date" : "month"); }}
                    className="text-xs text-blue-600 hover:underline"
                  >
                    {windowMode === "month" ? "Need exact dates? →" : "← Back to months"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="mb-1 text-xs text-gray-500">From</p>
                    <input
                      type={windowMode}
                      value={fromVal}
                      onChange={(e) => setFromVal(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <p className="mb-1 text-xs text-gray-500">To</p>
                    <input
                      type={windowMode}
                      value={toVal}
                      onChange={(e) => setToVal(e.target.value)}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
                    />
                  </div>
                </div>
                {buildWindow() && (
                  <p className="mt-1.5 text-xs text-blue-600">📅 {buildWindow()}</p>
                )}
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Your home postcode
                </label>
                <input
                  type="text"
                  placeholder="e.g. M1 1AE"
                  value={newPostcode}
                  onChange={(e) => setNewPostcode(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleCreateRoom(); if (e.key === "Escape") setShowCreate(false); }}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowCreate(false)}
                  className="flex-1 rounded-lg border border-gray-300 px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleCreateRoom}
                  disabled={creating || !newName.trim()}
                  className="flex-1 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {creating ? "Creating…" : "Plan Holiday"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <FeedbackButton token={token} page="dashboard" />
      {token && <ChatWidget token={token} />}
    </main>
  );
}
