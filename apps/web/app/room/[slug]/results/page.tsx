/**
 * Server component wrapper for the public results page.
 *
 * Exports generateMetadata so that shared links get proper OG tags
 * (trip name, destination, dates) when previewed in WhatsApp / Twitter / iMessage.
 * The actual page content lives in ResultsPageClient (a "use client" component).
 *
 * The public summary endpoint requires no auth, so this fetch is safe.
 */

import type { Metadata } from "next";
import ResultsPageClient from "./ResultsPageClient";

// NEXT_PUBLIC_API_URL is available in server components (it's injected at build time).
// In dev this is http://localhost:8000; in prod the Railway URL.
const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

interface PublicSummary {
  name: string;
  destination_name?: string | null;
  destination_iata?: string | null;
  agreed_start?: string | null;
  agreed_end?: string | null;
  member_count: number;
  avg_cost_pp?: number | null;
}

async function fetchSummary(slug: string): Promise<PublicSummary | null> {
  try {
    const res = await fetch(`${API_BASE}/rooms/${slug}/summary`, {
      // ISR: revalidate every 5 minutes so OG tags stay reasonably fresh
      // without hammering the API on every page view.
      next: { revalidate: 300 },
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const summary = await fetchSummary(slug);
  if (!summary) return {};

  const dest = summary.destination_name ?? summary.destination_iata ?? null;
  const tripTitle = summary.name;
  const descParts: string[] = [];
  if (dest) descParts.push(`Heading to ${dest}`);
  if (summary.agreed_start) descParts.push(summary.agreed_start);
  descParts.push(`${summary.member_count} traveller${summary.member_count !== 1 ? "s" : ""}`);
  if (summary.avg_cost_pp != null)
    descParts.push(`~£${Math.round(summary.avg_cost_pp)} pp incl. flights`);

  const description = descParts.join(" · ");

  return {
    title: tripTitle,
    description,
    openGraph: {
      title: `${tripTitle} ✈️`,
      description,
      type: "article",
    },
    twitter: {
      card: "summary",
      title: `${tripTitle} ✈️`,
      description,
    },
  };
}

export default function ResultsPage() {
  return <ResultsPageClient />;
}
