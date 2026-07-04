"use client";

/**
 * Compact, always-clickable step navigator. Drop it under the nav on any room
 * sub-page so the user can jump to any stage (including the next one) in a single
 * click, instead of bouncing back to the dashboard.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Duration + Budget live on the SAME page, so they're one tab here (no point in
// two timeline steps that open the same screen).
const STEPS = [
  { key: "availability", label: "Availability", icon: "📅", route: "availability" },
  { key: "duration", label: "Duration & Budget", icon: "🗓️", route: "preferences" },
  { key: "destination", label: "Destination", icon: "🗺️", route: "destinations" },
  { key: "flights", label: "Flights", icon: "✈️", route: "flights" },
  { key: "booking", label: "Booking", icon: "🎫", route: "booking" },
];

export default function StepBar({
  slug,
  currentStep,
  activeRoute,
  tripType,
}: {
  slug: string;
  currentStep?: string;          // the group's current step (for the "you are here" dot)
  activeRoute?: string;          // the route of THIS page, so it highlights correctly
  tripType?: string;             // 'meetup' drops the flights & booking steps
}) {
  const router = useRouter();
  // Local meet-ups have no flights or booking — only show when & where.
  const steps = tripType === "meetup"
    ? STEPS.filter((s) => s.key !== "flights" && s.key !== "booking")
    : STEPS;
  // The group's step can be "budget" (a back-end step) which now lives under the
  // merged "Duration & Budget" tab — map it so the "you are here" dot still shows.
  const normalizedStep = currentStep === "budget" ? "duration" : currentStep;
  const currentIdx = steps.findIndex((s) => s.key === normalizedStep);

  // Left/Right arrow keys move between stages (Availability ⇄ Booking). Ignored
  // while typing in a field, or with modifier keys, so normal input still works.
  useEffect(() => {
    // Unique page routes in order (duration+budget are the same page).
    const routes = [...new Set(steps.map((s) => s.route))];
    const idx = routes.indexOf(activeRoute ?? "");
    if (idx < 0) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement;
      const tag = el?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement)?.isContentEditable) return;
      const next = e.key === "ArrowRight" ? idx + 1 : idx - 1;
      if (next < 0 || next >= routes.length) return;
      e.preventDefault();
      router.push(`/room/${slug}/${routes[next]}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [slug, activeRoute, router, tripType]);

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
        {steps.map((step, i) => {
          const isActivePage = activeRoute === step.route;
          const isGroupHere = i === currentIdx;
          const isPast = currentIdx >= 0 && i < currentIdx;
          return (
            <div key={step.key} className="flex items-center">
              <button
                onClick={() => router.push(`/room/${slug}/${step.route}`)}
                title={`Go to ${step.label}`}
                className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors ${
                  isActivePage
                    ? "bg-blue-600 text-white"
                    : isPast
                    ? "bg-green-50 text-green-700 hover:bg-green-100"
                    : "text-gray-500 hover:bg-gray-100 hover:text-gray-800"
                }`}
              >
                <span>{step.icon}</span>
                <span>{step.label}</span>
                {isGroupHere && !isActivePage && (
                  <span className="ml-0.5 h-1.5 w-1.5 rounded-full bg-blue-500" title="Group is here" />
                )}
              </button>
              {/* The first three steps are independent (do in any order → "·").
                  Flights and booking depend on them (→). */}
              {i < steps.length - 1 && (
                <span
                  className="px-0.5 text-gray-300"
                  title={steps[i + 1].key === "flights" || steps[i + 1].key === "booking"
                    ? "depends on the earlier steps"
                    : "either order"}
                >
                  {steps[i + 1].key === "flights" || steps[i + 1].key === "booking" ? "→" : "·"}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
