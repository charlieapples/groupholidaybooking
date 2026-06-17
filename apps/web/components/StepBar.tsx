"use client";

/**
 * Compact, always-clickable step navigator. Drop it under the nav on any room
 * sub-page so the user can jump to any stage (including the next one) in a single
 * click, instead of bouncing back to the dashboard.
 */

import { useEffect } from "react";
import { useRouter } from "next/navigation";

const STEPS = [
  { key: "availability", label: "Availability", icon: "📅", route: "availability" },
  { key: "duration", label: "Duration", icon: "🗓️", route: "preferences" },
  { key: "budget", label: "Budget", icon: "💷", route: "preferences" },
  { key: "destination", label: "Destination", icon: "🗺️", route: "destinations" },
  { key: "flights", label: "Flights", icon: "✈️", route: "flights" },
  { key: "booking", label: "Booking", icon: "🎫", route: "booking" },
];

export default function StepBar({
  slug,
  currentStep,
  activeRoute,
}: {
  slug: string;
  currentStep?: string;          // the group's current step (for the "you are here" dot)
  activeRoute?: string;          // the route of THIS page, so it highlights correctly
}) {
  const router = useRouter();
  const currentIdx = STEPS.findIndex((s) => s.key === currentStep);

  // Left/Right arrow keys move between stages (Availability ⇄ Booking). Ignored
  // while typing in a field, or with modifier keys, so normal input still works.
  useEffect(() => {
    // Unique page routes in order (duration+budget are the same page).
    const routes = [...new Set(STEPS.map((s) => s.route))];
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
  }, [slug, activeRoute, router]);

  return (
    <div className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center gap-1 overflow-x-auto px-4 py-2">
        {STEPS.map((step, i) => {
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
              {i < STEPS.length - 1 && <span className="px-0.5 text-gray-300">›</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}
