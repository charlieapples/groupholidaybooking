"use client";

import { createClient } from "@/lib/supabase/client";
import { createRoom, joinRoom, listRooms, type Room } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";
import { DashboardSkeleton } from "@/components/Skeleton";
import { normalisePostcode } from "@/lib/postcode";

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
      return new Date(v).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
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
      setUser({
        email: data.session.user.email,
        name: data.session.user.user_metadata?.full_name,
      });
      const rooms = await listRooms(t).catch(() => []);
      setRooms(rooms);
      setLoading(false);
    });
  }, [supabase, router]);

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

  async function copyRoomLink(slug: string) {
    const url = `${window.location.origin}/room/${slug}/join`;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Group Holiday invite", url });
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
          <span className="text-xl font-bold text-blue-600">✈️ Group Holiday</span>
          <div className="flex items-center gap-4">
            <span className="text-sm text-gray-600">{user?.name || user?.email}</span>
            <button onClick={signOut} className="text-sm text-gray-500 hover:text-gray-900">
              Sign out
            </button>
          </div>
        </div>
      </nav>

      <div className="mx-auto max-w-5xl px-6 py-10 space-y-10">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Your holiday rooms</h1>
          <button
            onClick={() => setShowCreate(true)}
            className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
          >
            + New room
          </button>
        </div>

        {/* Room list */}
        {rooms.length === 0 ? (
          <div className="rounded-2xl border-2 border-dashed border-gray-300 bg-white px-6 py-14 text-center">
            <div className="mx-auto max-w-md space-y-4">
              <div className="text-5xl">🏖️</div>
              <h2 className="text-xl font-semibold text-gray-900">No holiday rooms yet</h2>
              <p className="text-gray-500">
                A room is a shared planning space — invite your friends, mark when
                you&apos;re free, and the app finds the dates that work for everyone.
              </p>
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <button
                  onClick={() => setShowCreate(true)}
                  className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                >
                  Create your first room
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
                      {room.current_step}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-gray-500">
                    {room.member_count} member{room.member_count !== 1 ? "s" : ""}
                    {room.is_admin ? " · admin" : ""}
                  </p>
                </button>
                {/* Quick share — only visible on hover/focus */}
                <button
                  onClick={() => copyRoomLink(room.slug)}
                  title="Copy invite link"
                  className="absolute top-2 right-2 rounded-lg p-1.5 text-gray-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-gray-100 hover:text-gray-700 transition-opacity"
                  aria-label="Copy invite link"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Join room */}
        <div id="join-room-card" className="rounded-xl border bg-white p-6 shadow-sm scroll-mt-6">
          <h2 className="mb-4 font-semibold text-gray-900">Join a room</h2>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Room code or full invite link"
              value={joinSlug}
              onChange={(e) => setJoinSlug(e.target.value)}
              className="flex-1 min-w-40 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <input
              type="text"
              placeholder="Your postcode"
              value={joinPostcode}
              onChange={(e) => setJoinPostcode(e.target.value)}
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
            <h2 className="mb-6 text-xl font-bold text-gray-900">Create a holiday room</h2>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">
                  Room name *
                </label>
                <input
                  ref={nameInputRef}
                  type="text"
                  placeholder="e.g. Lads Summer 2026"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
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
                  {creating ? "Creating…" : "Create room"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
