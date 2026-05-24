"use client";

/**
 * Public shareable results page — no login required.
 *
 * Shows: destination, dates, group size, avg cost pp.
 * Does NOT show: individual names, postcodes, exact per-person costs.
 *
 * URL: /room/[slug]/results
 * Anyone with this link can see the trip summary.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { getPublicRoomSummary, type PublicRoomSummary } from "@/lib/api";
import { flagFor } from "@/lib/destinations";

function formatDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
}

function nightsBetween(start: string, end: string) {
  return Math.round((new Date(end).getTime() - new Date(start).getTime()) / 86_400_000);
}

export default function PublicResultsPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const [summary, setSummary] = useState<PublicRoomSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    getPublicRoomSummary(slug)
      .then(setSummary)
      .catch((e) => setError(e.message || "Could not load trip details"))
      .finally(() => setLoading(false));
  }, [slug]);

  function copyLink() {
    navigator.clipboard.writeText(window.location.href).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </main>
    );
  }

  if (error || !summary) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 px-4 text-center">
        <div className="text-5xl">😕</div>
        <h1 className="text-xl font-semibold text-gray-900">Trip not found</h1>
        <p className="text-gray-500 text-sm">{error || "This link may have expired or the trip doesn't exist."}</p>
        <button onClick={() => router.push("/")} className="mt-2 rounded-xl bg-blue-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-blue-700">
          Plan your own group trip →
        </button>
      </main>
    );
  }

  const nights = summary.agreed_start && summary.agreed_end
    ? nightsBetween(summary.agreed_start, summary.agreed_end)
    : null;

  const daysUntil = summary.agreed_start
    ? Math.ceil((new Date(summary.agreed_start).getTime() - Date.now()) / 86_400_000)
    : null;

  const destDisplay = summary.destination_name ?? summary.destination_iata ?? "TBC";
  const flag = summary.destination_iata ? flagFor(summary.destination_iata) : "✈️";

  return (
    <main className="min-h-screen bg-gradient-to-b from-blue-50 to-white px-4 py-12">
      <div className="mx-auto max-w-lg space-y-8">

        {/* Header */}
        <div className="text-center space-y-2">
          <a href="/" className="text-sm text-gray-400 hover:text-blue-600 transition-colors">
            ✈️ Group Holiday
          </a>
          <h1 className="text-3xl font-bold text-gray-900">{summary.name}</h1>
          <p className="text-gray-500 text-sm">Group trip summary · {summary.member_count} travellers</p>
        </div>

        {/* Main destination card */}
        <div className="rounded-2xl border-2 border-blue-200 bg-white shadow-lg p-8 text-center space-y-4">
          <div className="text-6xl">{flag}</div>
          <div>
            <h2 className="text-2xl font-bold text-gray-900">{destDisplay}</h2>
            {summary.destination_iata && (
              <p className="text-sm text-gray-400 font-mono mt-0.5">{summary.destination_iata}</p>
            )}
          </div>

          {summary.agreed_start && (
            <div className="rounded-xl bg-blue-50 p-4 space-y-1">
              <p className="font-semibold text-blue-900">{formatDate(summary.agreed_start)}</p>
              {summary.agreed_end && (
                <p className="text-blue-700 text-sm">→ {formatDate(summary.agreed_end)}</p>
              )}
              {nights !== null && (
                <p className="text-blue-500 text-sm">{nights} night{nights !== 1 ? "s" : ""}</p>
              )}
            </div>
          )}

          {daysUntil !== null && (
            <div className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold ${
              daysUntil <= 0 ? "bg-green-100 text-green-700" :
              daysUntil <= 7 ? "bg-orange-100 text-orange-700" :
              "bg-gray-100 text-gray-600"
            }`}>
              {daysUntil <= 0 ? "🎉 In progress!" :
               daysUntil === 1 ? "⏳ Tomorrow!" :
               `⏳ ${daysUntil} days to go`}
            </div>
          )}

          {summary.avg_cost_pp !== null && (
            <div className="border-t pt-4">
              <p className="text-xs text-gray-400 mb-1">Estimated cost</p>
              <p className="text-3xl font-bold text-gray-900">~£{Math.round(summary.avg_cost_pp).toLocaleString()}</p>
              <p className="text-sm text-gray-500">per person including flights</p>
            </div>
          )}
        </div>

        {/* Share + actions */}
        <div className="space-y-3">
          <button
            onClick={copyLink}
            className="w-full rounded-xl border-2 border-blue-200 bg-white px-4 py-3 text-sm font-semibold text-blue-700 hover:border-blue-400 hover:bg-blue-50 transition-colors"
          >
            {copied ? "✓ Link copied!" : "📋 Copy share link"}
          </button>
          <a
            href="/"
            className="block w-full rounded-xl bg-blue-600 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-blue-700 transition-colors"
          >
            Plan your own group trip →
          </a>
        </div>

        <p className="text-center text-xs text-gray-300">
          Powered by Group Holiday · Prices are estimates and may vary
        </p>
      </div>
    </main>
  );
}
