"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCalendarStatus,
  getLinkedAccounts,
  startCalendarLink,
  type CalendarStatus,
} from "@/lib/api";
import { useToast, errorMessage } from "@/components/Toast";

const DISMISS_KEY = "calendarOnboardingDismissed";

/**
 * One-time onboarding nudge: after a user signs in (with Google/Microsoft), offer
 * to permanently link their calendar so every Holiday auto-fills their busy days.
 * Shows only when the feature is configured, the user has NO linked accounts yet,
 * and they haven't dismissed it. Linking is the same server-side flow as the
 * profile page (encrypted refresh token, always-live, unlink anytime).
 */
export default function CalendarOnboardingPrompt({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);

  const check = useCallback(async () => {
    if (!token) return;
    if (typeof window !== "undefined" && localStorage.getItem(DISMISS_KEY)) return;
    try {
      const s = await getCalendarStatus(token);
      if (!s.configured) return;
      const accts = await getLinkedAccounts(token);
      setStatus(s);
      setShow(accts.length === 0);   // only nudge if they've linked nothing yet
    } catch {
      /* feature off or unreachable — stay hidden */
    }
  }, [token]);

  useEffect(() => { check(); }, [check]);

  // Celebrate (and hide) when we come back from a successful link.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    if (p.get("calendar_linked")) {
      toast.success("Calendar linked! We'll auto-fill your busy days each trip.");
      localStorage.setItem(DISMISS_KEY, "1");
      setShow(false);
      p.delete("calendar_linked");
      p.delete("calendar_error");
      const qs = p.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function link(provider: "google" | "microsoft") {
    if (!token) return;
    setBusy(true);
    try {
      const { url } = await startCalendarLink(token, provider, window.location.href);
      window.location.href = url;   // hand off to the provider consent screen
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't start calendar linking"));
      setBusy(false);
    }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setShow(false);
  }

  if (!show || !status) return null;

  return (
    <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4 sm:flex sm:items-center sm:justify-between sm:gap-4">
      <div className="text-sm text-blue-900">
        <p className="font-semibold">📅 Connect your calendar?</p>
        <p className="mt-0.5 text-blue-800">
          Link it once and every Holiday will auto-fill your busy days — no filling the calendar in by
          hand, ever. We only read free/busy times, it stays live, and you can unlink anytime.
        </p>
      </div>
      <div className="mt-3 flex flex-shrink-0 flex-wrap items-center gap-2 sm:mt-0">
        {status.google && (
          <button
            onClick={() => link("google")}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            🗓 Connect Google
          </button>
        )}
        {status.microsoft && (
          <button
            onClick={() => link("microsoft")}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            📘 Connect Microsoft
          </button>
        )}
        <button onClick={dismiss} className="rounded-lg px-3 py-1.5 text-xs text-blue-700 hover:underline">
          Not now
        </button>
      </div>
    </div>
  );
}
