"use client";

import { createClient } from "@/lib/supabase/client";
import { getRoom, joinRoom, getMyProfile, getPublicRoomSummary, type Room } from "@/lib/api";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { normalisePostcode } from "@/lib/postcode";

export default function JoinRoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [roomName, setRoomName] = useState<string | null>(null);
  const [postcode, setPostcode] = useState("");
  const [joining, setJoining] = useState(false);
  const [loading, setLoading] = useState(true);
  const [alreadyMember, setAlreadyMember] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) {
        // Not signed in — redirect to login with next param
        router.replace(`/?next=/room/${slug}/join`);
        return;
      }
      const t = data.session.access_token;
      setToken(t);

      // Pre-fill postcode from saved profile
      try {
        const profile = await getMyProfile(t);
        if (profile.default_home_postcode) setPostcode(profile.default_home_postcode);
      } catch { /* non-fatal */ }

      // Try to fetch the room (will work even if not a member since join is public)
      try {
        const r = await getRoom(t, slug);
        setRoom(r);
        setAlreadyMember(true); // getRoom succeeded → already a member
      } catch {
        // 403 means not a member yet — fetch public summary to show room name
        getPublicRoomSummary(slug).then((s) => setRoomName(s.name)).catch(() => {});
      }
      setLoading(false);
    });
  }, [slug, router, supabase]);

  async function handleJoin() {
    if (!token) return;
    let normalised: string | undefined;
    if (postcode.trim()) {
      const ok = normalisePostcode(postcode);
      if (!ok) {
        setError("That doesn't look like a UK postcode (e.g. M1 1AE). Leave it blank if you'd rather set it later.");
        return;
      }
      normalised = ok;
    }
    setJoining(true);
    setError(null);
    try {
      await joinRoom(token, slug, normalised);
      router.push(`/room/${slug}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not join room. Check the room code and try again.");
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  if (alreadyMember && room) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl text-center">
          <div className="text-4xl mb-4">✅</div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">You&apos;re already in this Holiday!</h1>
          <p className="text-gray-600 mb-6">
            You&apos;re already a member of <strong>{room.name}</strong>.
          </p>
          <button
            onClick={() => router.push(`/room/${slug}`)}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700"
          >
            Go to Holiday →
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">✈️</div>
          <h1 className="text-2xl font-bold text-gray-900">
            {roomName ? `Join "${roomName}"` : "Join a Holiday"}
          </h1>
          <p className="text-gray-500 mt-1">
            {roomName
              ? "You've been invited to join this group holiday."
              : <>Holiday code: <span className="font-mono font-bold text-blue-600">{slug}</span></>}
          </p>
        </div>

        <div className="rounded-2xl bg-white p-8 shadow-xl space-y-5">
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-700">
              Your home postcode <span className="text-gray-400">(optional but helpful)</span>
            </label>
            <input
              type="text"
              placeholder="e.g. M1 1AE"
              value={postcode}
              onChange={(e) => setPostcode(e.target.value)}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:border-blue-500 focus:outline-none"
            />
            <p className="mt-1 text-xs text-gray-500">
              Used to find the nearest airport when searching for flights.
            </p>
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <button
            onClick={handleJoin}
            disabled={joining}
            className="w-full rounded-xl bg-blue-600 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {joining ? "Joining…" : "Join Holiday"}
          </button>

          <button
            onClick={() => router.push("/dashboard")}
            className="w-full text-sm text-gray-500 hover:text-gray-800"
          >
            Back to dashboard
          </button>
        </div>
      </div>
    </main>
  );
}
