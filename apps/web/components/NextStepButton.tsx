"use client";

import { useRouter } from "next/navigation";

// The room flow in order. Duration + Budget share the 'preferences' page.
const FLOW: { route: string; label: string }[] = [
  { route: "availability", label: "Availability" },
  { route: "preferences", label: "Duration & Budget" },
  { route: "destinations", label: "Destination" },
  { route: "flights", label: "Flights" },
  { route: "booking", label: "Booking" },
];

/**
 * A big, obvious "Next →" button for the bottom of each room step page. The
 * stepbar + arrow keys already navigate, but a clear button is friendlier.
 * Hidden on the last step (booking).
 */
export default function NextStepButton({ slug, currentRoute }: { slug: string; currentRoute: string }) {
  const router = useRouter();
  const idx = FLOW.findIndex((s) => s.route === currentRoute);
  if (idx < 0 || idx >= FLOW.length - 1) return null;
  const next = FLOW[idx + 1];
  return (
    <div className="mx-auto max-w-5xl px-6 pb-10">
      <button
        onClick={() => router.push(`/room/${slug}/${next.route}`)}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-blue-200 bg-white py-3 text-sm font-semibold text-blue-700 shadow-sm hover:border-blue-400 hover:bg-blue-50"
      >
        Next: {next.label} →
      </button>
    </div>
  );
}
