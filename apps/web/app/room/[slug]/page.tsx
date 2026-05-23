"use client";

import { createClient } from "@/lib/supabase/client";
import { getRoom, listMembers, type Room, type Member } from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

const STEPS = [
  { key: "availability", label: "Availability", icon: "📅" },
  { key: "duration", label: "Duration", icon: "🗓️" },
  { key: "budget", label: "Budget", icon: "💷" },
  { key: "destination", label: "Destination", icon: "🗺️" },
  { key: "flights", label: "Flights", icon: "✈️" },
  { key: "booking", label: "Booking", icon: "🎫" },
];

export default function RoomPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [token, setToken] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      setToken(t);
      try {
        const [r, m] = await Promise.all([
          getRoom(t, slug),
          listMembers(t, slug),
        ]);
        setRoom(r);
        setMembers(m);
      } catch {
        router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });
  }, [slug]);

  function currentStepIndex() {
    return STEPS.findIndex((s) => s.key === room?.current_step) ?? 0;
  }

  function shareLink() {
    const url = `${window.location.origin}/room/${slug}/join`;
    navigator.clipboard.writeText(url);
    alert("Invite link copied to clipboard!");
  }

  if (loading) return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );

  if (!room) return null;

  const stepIdx = currentStepIndex();

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
            {STEPS.map((step, i) => (
              <div key={step.key} className="flex items-center">
                <div
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium whitespace-nowrap ${
                    i === stepIdx
                      ? "bg-blue-600 text-white"
                      : i < stepIdx
                      ? "bg-green-100 text-green-700"
                      : "bg-gray-100 text-gray-400"
                  }`}
                >
                  <span>{step.icon}</span>
                  <span>{step.label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`mx-1 h-0.5 w-6 ${i < stepIdx ? "bg-green-400" : "bg-gray-200"}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-8 lg:grid-cols-3">
          {/* Main content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current step card */}
            <div className="rounded-xl border bg-white p-8 shadow-sm text-center">
              <div className="text-5xl mb-4">{STEPS[stepIdx]?.icon}</div>
              <h2 className="text-xl font-bold text-gray-900 mb-2">
                Step {stepIdx + 1}: {STEPS[stepIdx]?.label}
              </h2>

              {room.current_step === "availability" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Everyone needs to mark their available dates.
                    Results stay hidden until all {room.member_count} members have submitted.
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/availability`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Submit my availability
                  </button>
                </div>
              )}

              {room.current_step === "destination" && (
                <div className="space-y-4">
                  <p className="text-gray-600">Time to pick where you're going.</p>
                  <button
                    onClick={() => router.push(`/room/${slug}/destinations`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Vote on destinations
                  </button>
                </div>
              )}

              {room.current_step === "flights" && (
                <div className="space-y-4">
                  <p className="text-gray-600">
                    Let's find the cheapest flights from everyone's nearest airport.
                  </p>
                  <button
                    onClick={() => router.push(`/room/${slug}/flights`)}
                    className="rounded-xl bg-blue-600 px-8 py-3 font-semibold text-white hover:bg-blue-700"
                  >
                    Find flights
                  </button>
                </div>
              )}

              {!["availability", "destination", "flights"].includes(room.current_step) && (
                <p className="text-gray-500">
                  This step is under construction. Coming soon!
                </p>
              )}
            </div>

            {/* Room info */}
            {room.rough_window && (
              <div className="rounded-xl border bg-white p-6 shadow-sm">
                <h3 className="text-sm font-medium text-gray-500 mb-1">Time window</h3>
                <p className="font-semibold text-gray-900">{room.rough_window}</p>
              </div>
            )}
          </div>

          {/* Sidebar — members */}
          <div className="space-y-4">
            <div className="rounded-xl border bg-white p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-4">
                Members ({members.length})
              </h3>
              <ul className="space-y-3">
                {members.map((m) => (
                  <li key={m.user_id} className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
                      {(m.display_name || "?")[0].toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {m.display_name || "Unknown"}
                        {m.is_admin && (
                          <span className="ml-1 text-xs text-gray-400">(admin)</span>
                        )}
                      </p>
                      {m.home_postcode && (
                        <p className="text-xs text-gray-500">{m.home_postcode}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            {/* Share card */}
            <div className="rounded-xl border bg-blue-50 p-6">
              <h3 className="font-semibold text-blue-900 mb-2">Invite friends</h3>
              <p className="text-sm text-blue-700 mb-3">
                Share the room code: <span className="font-mono font-bold">{slug}</span>
              </p>
              <button
                onClick={shareLink}
                className="w-full rounded-lg bg-blue-600 py-2 text-sm font-semibold text-white hover:bg-blue-700"
              >
                Copy invite link
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
