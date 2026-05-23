"use client";

/**
 * Availability submission page.
 *
 * Shows a month calendar. Users click dates to mark them as busy (red).
 * When done, they click Submit — the dates are sent to FastAPI and the blind
 * reveal begins. Once everyone submits, free windows appear automatically.
 */

import { createClient } from "@/lib/supabase/client";
import {
  submitAvailability,
  getSubmissionStatus,
  getFreeWindows,
  type SubmissionStatus,
  type FreeWindow,
} from "@/lib/api";
import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfWeek(year: number, month: number) {
  return new Date(year, month, 1).getDay(); // 0=Sun
}

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export default function AvailabilityPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const supabase = createClient();

  const [token, setToken] = useState<string | null>(null);
  const [busyDates, setBusyDates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [windows, setWindows] = useState<FreeWindow[] | null>(null);

  // Calendar state
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      setToken(t);
      // Load submission status
      const s = await getSubmissionStatus(t, slug).catch(() => null);
      if (s) {
        setStatus(s);
        if (s.all_submitted) {
          const w = await getFreeWindows(t, slug).catch(() => null);
          setWindows(w);
        }
      }
    });
  }, [slug]);

  function toggleDate(dateStr: string) {
    if (submitted) return;
    setBusyDates((prev) => {
      const next = new Set(prev);
      if (next.has(dateStr)) next.delete(dateStr);
      else next.add(dateStr);
      return next;
    });
  }

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    try {
      const blocks = Array.from(busyDates).map((d) => ({
        block_date: d,
        is_busy: true,
        source: "manual",
      }));
      await submitAvailability(token, slug, blocks, true);
      setSubmitted(true);
      const s = await getSubmissionStatus(token, slug);
      setStatus(s);
      if (s.all_submitted) {
        const w = await getFreeWindows(token, slug);
        setWindows(w);
      }
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Failed to submit");
    } finally {
      setSubmitting(false);
    }
  }

  function prevMonth() {
    if (month === 0) { setYear(y => y - 1); setMonth(11); }
    else setMonth(m => m - 1);
  }
  function nextMonth() {
    if (month === 11) { setYear(y => y + 1); setMonth(0); }
    else setMonth(m => m + 1);
  }

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfWeek(year, month);
  const monthName = new Date(year, month).toLocaleString("en-GB", { month: "long", year: "numeric" });

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button onClick={() => router.push(`/room/${slug}`)} className="text-sm text-gray-500 hover:text-gray-900">
            ← Back to room
          </button>
          <span className="font-semibold text-gray-900">Mark your availability</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl px-6 py-10 space-y-8">

        {/* Status */}
        {status && (
          <div className={`rounded-xl p-4 text-sm font-medium ${
            status.all_submitted ? "bg-green-50 text-green-800" : "bg-amber-50 text-amber-800"
          }`}>
            {status.all_submitted
              ? "Everyone has submitted! Free windows are shown below."
              : `${status.submitted}/${status.total} members have submitted. Waiting for: ${status.members_pending.join(", ")}`}
          </div>
        )}

        {/* Calendar */}
        {!submitted ? (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <p className="text-sm text-gray-500 mb-4">
              Click the dates you are <span className="font-semibold text-red-600">NOT available</span> (busy, working, etc.)
            </p>

            {/* Month navigation */}
            <div className="flex items-center justify-between mb-4">
              <button onClick={prevMonth} className="rounded-lg p-2 hover:bg-gray-100">←</button>
              <span className="font-semibold text-gray-900">{monthName}</span>
              <button onClick={nextMonth} className="rounded-lg p-2 hover:bg-gray-100">→</button>
            </div>

            {/* Day headers */}
            <div className="grid grid-cols-7 gap-1 mb-1">
              {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => (
                <div key={d} className="text-center text-xs font-medium text-gray-400 py-1">{d}</div>
              ))}
            </div>

            {/* Days */}
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: firstDay }).map((_, i) => (
                <div key={`blank-${i}`} />
              ))}
              {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const dateStr = toISO(year, month, day);
                const isBusy = busyDates.has(dateStr);
                const isPast = new Date(dateStr) < today;
                return (
                  <button
                    key={dateStr}
                    onClick={() => !isPast && toggleDate(dateStr)}
                    disabled={isPast}
                    className={`aspect-square rounded-lg text-sm font-medium transition-colors
                      ${isBusy ? "bg-red-500 text-white" : "hover:bg-gray-100 text-gray-700"}
                      ${isPast ? "opacity-30 cursor-not-allowed" : "cursor-pointer"}
                    `}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            <div className="mt-6 flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {busyDates.size === 0
                  ? "No busy dates marked — you're free for everything!"
                  : `${busyDates.size} busy day${busyDates.size !== 1 ? "s" : ""} marked`}
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit"}
              </button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl border bg-green-50 p-8 text-center shadow-sm">
            <div className="text-4xl mb-3">✅</div>
            <h2 className="text-lg font-bold text-green-900">Availability submitted!</h2>
            <p className="text-green-700 mt-2">
              {status?.all_submitted
                ? "Everyone is in — check the free windows below."
                : `Waiting for ${status?.members_pending?.join(", ")} to submit.`}
            </p>
          </div>
        )}

        {/* Free windows */}
        {windows && windows.length > 0 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="font-semibold text-gray-900 mb-4">Free windows for everyone</h2>
            <div className="space-y-3">
              {windows.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-lg px-4 py-3 ${
                    i === 0 ? "bg-green-50 border border-green-200" : "bg-gray-50"
                  }`}
                >
                  <div>
                    <span className="font-semibold text-gray-900">
                      {new Date(w.start_date).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                      {" – "}
                      {new Date(w.end_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">{w.days} days</span>
                  </div>
                  {i === 0 && (
                    <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white">
                      Best
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
