"use client";

import { createClient } from "@/lib/supabase/client";
import { createRoom, joinRoom, listRooms, type Room } from "@/lib/api";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

export default function Dashboard() {
  // Stable client — don't recreate on every render
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
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
    setCreating(true);
    try {
      const room = await createRoom(token, {
        name: newName,
        rough_window: buildWindow(),
        home_postcode: newPostcode || undefined,
      });
      setRooms((prev) => [room, ...prev]);
      setShowCreate(false);
      setNewName(""); setNewPostcode("");
      resetWindow();
      router.push(`/room/${room.slug}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to create room");
    } finally {
      setCreating(false);
    }
  }

  async function handleJoinRoom() {
    if (!token || !joinSlug.trim()) return;
    setJoining(true);
    try {
      const slug = joinSlug.trim().toLowerCase();
      await joinRoom(token, slug, joinPostcode || undefined);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Room not found or you're not allowed to join");
    } finally {
      setJoining(false);
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/");
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

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
          <div className="rounded-xl border-2 border-dashed border-gray-300 py-16 text-center">
            <div className="text-4xl mb-3">🏖️</div>
            <p className="text-gray-500">No rooms yet. Create one or join via a link.</p>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {rooms.map((room) => (
              <button
                key={room.slug}
                onClick={() => router.push(`/room/${room.slug}`)}
                className="rounded-xl border bg-white p-6 text-left shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="font-semibold text-gray-900">{room.name}</h2>
                    {room.rough_window && (
                      <p className="text-sm text-gray-500">{room.rough_window}</p>
                    )}
                  </div>
                  <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">
                    {room.current_step}
                  </span>
                </div>
                <p className="mt-3 text-sm text-gray-500">
                  {room.member_count} member{room.member_count !== 1 ? "s" : ""}
                  {room.is_admin ? " · admin" : ""}
                </p>
              </button>
            ))}
          </div>
        )}

        {/* Join room */}
        <div className="rounded-xl border bg-white p-6 shadow-sm">
          <h2 className="mb-4 font-semibold text-gray-900">Join a room</h2>
          <div className="flex gap-3 flex-wrap">
            <input
              type="text"
              placeholder="Room code (e.g. ab3x9k2m)"
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
