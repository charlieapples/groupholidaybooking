"use client";

/**
 * Availability page — multi-month calendar with calendar import.
 *
 * • Shows every month in the room's time window
 * • Click any day to toggle it busy (red) / free
 * • Import from Google Calendar (OAuth provider token),
 *   or upload a .ics file from Outlook / Apple Calendar / Google export
 * • Blind-reveal: results hidden until everyone submits
 */

import { createClient } from "@/lib/supabase/client";
import {
  submitAvailability,
  getSubmissionStatus,
  getMyAvailability,
  getFreeWindows,
  getRoom,
  updateRoom,
  advanceStep,
  remindPendingMembers,
  type Room,
  type SubmissionStatus,
  type FreeWindow,
} from "@/lib/api";
import { parseIcal, parseRoughWindow, getMonthsInRange } from "@/lib/ical";
import FeedbackButton from "@/components/FeedbackButton";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useToast, errorMessage } from "@/components/Toast";

// ── helpers ──────────────────────────────────────────────────────────────────

function toISO(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

// Monday-first: Mon=0 … Sun=6
function getFirstDayMon(year: number, month: number) {
  const jsDay = new Date(year, month, 1).getDay(); // 0=Sun
  return (jsDay + 6) % 7;
}

const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// ── month calendar component ──────────────────────────────────────────────────

function MonthGrid({
  year,
  month,
  busyDates,
  onToggle,
  windowStart,
  windowEnd,
  disabled,
}: {
  year: number;
  month: number;
  busyDates: Set<string>;
  onToggle: (iso: string) => void;
  windowStart: Date;
  windowEnd: Date;
  disabled: boolean;
}) {
  const today = useMemo(() => {
    const d = new Date();
    return toISO(d.getFullYear(), d.getMonth(), d.getDate());
  }, []);

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayMon(year, month);
  const monthLabel = new Date(year, month).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
  });

  return (
    <div className="rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="mb-4 text-center font-semibold text-gray-900">{monthLabel}</h3>

      {/* Day headers */}
      <div className="mb-1 grid grid-cols-7 gap-1">
        {DAY_LABELS.map((d) => (
          <div key={d} className="py-1 text-center text-xs font-medium text-gray-400">
            {d}
          </div>
        ))}
      </div>

      {/* Day cells */}
      <div className="grid grid-cols-7 gap-1">
        {/* Leading blanks */}
        {Array.from({ length: firstDay }).map((_, i) => (
          <div key={`blank-${i}`} />
        ))}

        {Array.from({ length: daysInMonth }).map((_, i) => {
          const day = i + 1;
          const iso = toISO(year, month, day);
          const isBusy = busyDates.has(iso);
          const isPast = iso < today;
          const outOfWindow =
            new Date(year, month, day) < windowStart ||
            new Date(year, month, day) > windowEnd;

          return (
            <button
              key={iso}
              onClick={() => !isPast && !outOfWindow && !disabled && onToggle(iso)}
              disabled={isPast || outOfWindow || disabled}
              title={
                isBusy ? "Busy — click to unmark" : isPast ? "Past date" : "Click to mark busy"
              }
              className={[
                "aspect-square rounded-lg text-sm font-medium transition-colors",
                isBusy
                  ? "bg-red-500 text-white hover:bg-red-600"
                  : isPast || outOfWindow
                  ? "text-gray-300 cursor-not-allowed"
                  // Free, in-window, clickable: bold green so it's obvious at a glance
                  : "bg-green-300 text-green-900 hover:bg-red-200 hover:text-red-800",
              ].join(" ")}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── import panel ──────────────────────────────────────────────────────────────

function ImportPanel({
  onImport,
  windowStart,
  windowEnd,
  providerToken,
  authProvider,
  slug,
  autoSyncProvider,
  onAutoSyncDone,
  busyDates,
}: {
  onImport: (dates: string[]) => void;
  windowStart: Date;
  windowEnd: Date;
  providerToken: string | null;
  authProvider: string | null;
  slug: string;
  autoSyncProvider: "google" | "outlook" | null;
  onAutoSyncDone: () => void;
  busyDates: Set<string>;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<"google" | "outlook" | "apple">("google");
  const [gcalStatus, setGcalStatus] = useState<"idle" | "syncing" | "done" | "needs_grant" | "error">("idle");
  const [gcalError, setGcalError] = useState("");
  const [outlookStatus, setOutlookStatus] = useState<"idle" | "syncing" | "done" | "needs_grant" | "error">("idle");
  const [outlookError, setOutlookError] = useState("");
  const [icsError, setIcsError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  // provider_token is a Microsoft Graph token only when the user signed in with Microsoft
  const hasOutlookToken = authProvider === "azure" && !!providerToken;

  // Auto-trigger the matching sync when returning from a calendar connect.
  useEffect(() => {
    if (!autoSyncProvider || !providerToken) return;
    setOpen(true);
    if (autoSyncProvider === "google" && gcalStatus === "idle") {
      setActiveTab("google");
      syncGoogle();
      onAutoSyncDone();
    } else if (autoSyncProvider === "outlook" && outlookStatus === "idle") {
      setActiveTab("outlook");
      syncOutlook();
      onAutoSyncDone();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncProvider, providerToken]);

  // Connect a calendar account (the one you logged in with OR an extra one).
  // linkIdentity attaches another Google/Microsoft account to your existing
  // account without logging you out, so several calendars can be summed. Falls
  // back to a normal re-auth if linking isn't available (e.g. first connection).
  async function connectCalendar(provider: "google" | "azure") {
    localStorage.setItem(`busy_${slug}`, JSON.stringify([...busyDates]));
    const flag = provider === "google" ? "google" : "outlook";
    const returnPath = `/room/${slug}/availability?connect=${flag}`;
    const scopes =
      provider === "google"
        ? "openid profile email https://www.googleapis.com/auth/calendar.readonly"
        : "openid profile email offline_access Calendars.Read";
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnPath)}`;
    const queryParams: Record<string, string> =
      provider === "google"
        ? { prompt: "select_account consent", access_type: "offline" }
        : { prompt: "select_account" };

    const { error } = await supabase.auth.linkIdentity({
      provider,
      options: { scopes, redirectTo, queryParams },
    });
    // If linking isn't enabled or the identity is the same one you're logged in
    // with, fall back to a standard re-auth (still returns with a calendar token).
    if (error) {
      await supabase.auth.signInWithOAuth({
        provider,
        options: { scopes, redirectTo, queryParams },
      });
    }
  }


  async function syncGoogle() {
    if (!providerToken) {
      setGcalStatus("needs_grant");
      return;
    }
    setGcalStatus("syncing");
    setGcalError("");
    try {
      // Step 1: list ALL the user's calendars (primary + work + shared + etc.)
      // so a single sync pulls events from every calendar, not just primary.
      const listResp = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
        { headers: { Authorization: `Bearer ${providerToken}` } },
      );
      if (listResp.status === 403 || listResp.status === 401) {
        setGcalStatus("needs_grant");
        return;
      }
      const listData = await listResp.json();
      const calendarIds: string[] = (listData.items ?? [])
        // Skip calendars the user has hidden in the Google UI — they probably
        // don't want them counted as "busy" (e.g. holidays in your country).
        .filter((c: { selected?: boolean; id?: string }) => c.selected !== false && c.id)
        .map((c: { id: string }) => c.id);

      if (calendarIds.length === 0) calendarIds.push("primary");

      // Step 2: fetch events from each calendar in parallel and merge.
      const allBusy = new Set<string>();
      const results = await Promise.allSettled(
        calendarIds.map(async (id) => {
          const url = new URL(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(id)}/events`,
          );
          url.searchParams.set("timeMin", windowStart.toISOString());
          url.searchParams.set("timeMax", windowEnd.toISOString());
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("maxResults", "2500");
          const r = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${providerToken}` },
          });
          if (!r.ok) return;
          const d = await r.json();
          for (const ev of d.items ?? []) {
            if (ev.status === "cancelled") continue;
            // transparency: "transparent" = "available", skip it
            if (ev.transparency === "transparent") continue;
            // All-day events use `date` (exclusive end). Timed events use
            // `dateTime` and end on an INCLUSIVE day — a 9am–5pm meeting on
            // Jul 15 has end Jul 15, so without the +1 below it would collapse
            // to zero busy days and be silently dropped (most calendar events
            // are timed same-day events).
            const isTimed = !ev.start?.date;
            const start: string = (ev.start?.date ?? ev.start?.dateTime)?.slice(0, 10);
            const end: string   = (ev.end?.date   ?? ev.end?.dateTime)?.slice(0, 10);
            if (!start || !end) continue;
            const cur = new Date(start);
            const stop = new Date(end);
            if (isTimed) stop.setDate(stop.getDate() + 1);
            while (cur < stop) {
              allBusy.add(cur.toISOString().slice(0, 10));
              cur.setDate(cur.getDate() + 1);
            }
          }
        }),
      );

      // If every fetch failed, surface that as an error
      if (results.every((r) => r.status === "rejected")) {
        throw new Error("All calendar fetches failed");
      }

      onImport(Array.from(allBusy));
      setGcalStatus("done");
    } catch {
      setGcalStatus("error");
      setGcalError("Failed to reach Google Calendar. Check your connection and try again.");
    }
  }

  async function syncOutlook() {
    if (!hasOutlookToken) {
      setOutlookStatus("needs_grant");
      return;
    }
    setOutlookStatus("syncing");
    setOutlookError("");
    try {
      // Microsoft Graph calendarView expands recurring events across the window.
      const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
      url.searchParams.set("startDateTime", windowStart.toISOString());
      url.searchParams.set("endDateTime", windowEnd.toISOString());
      url.searchParams.set("$select", "start,end,showAs,isCancelled,isAllDay");
      url.searchParams.set("$top", "1000");

      const r = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${providerToken}`,
          Prefer: 'outlook.timezone="UTC"',
        },
      });
      if (!r.ok) throw new Error(`Graph ${r.status}`);
      const data = await r.json();

      const allBusy = new Set<string>();
      for (const ev of data.value ?? []) {
        if (ev.isCancelled) continue;
        // showAs: free | tentative | busy | oof | workingElsewhere — skip "free"
        if (ev.showAs === "free") continue;
        const startStr: string = ev.start?.dateTime?.slice(0, 10);
        const endStr: string = ev.end?.dateTime?.slice(0, 10);
        if (!startStr || !endStr) continue;
        // All-day events have an exclusive end; timed events end on an inclusive day.
        const isTimed = !ev.isAllDay;
        const cur = new Date(startStr);
        const stop = new Date(endStr);
        if (isTimed) stop.setDate(stop.getDate() + 1);
        while (cur < stop) {
          allBusy.add(cur.toISOString().slice(0, 10));
          cur.setDate(cur.getDate() + 1);
        }
      }

      onImport(Array.from(allBusy));
      setOutlookStatus("done");
    } catch {
      setOutlookStatus("error");
      setOutlookError("Failed to reach Outlook Calendar. Check your connection and try again.");
    }
  }

  async function handleFile(file: File) {
    setIcsError("");
    try {
      const text = await file.text();
      const dates = parseIcal(text, windowStart, windowEnd);
      if (dates.length === 0) {
        setIcsError(
          "No events found in this file within your time window. " +
          "Make sure you exported the right calendar."
        );
        return;
      }
      onImport(dates);
    } catch {
      setIcsError("Couldn't read this file. Make sure it's a valid .ics calendar file.");
    }
  }

  return (
    <div className="rounded-xl border bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between px-6 py-4 text-left"
      >
        <div className="flex items-center gap-3">
          <span className="text-xl">📲</span>
          <div>
            <p className="font-semibold text-gray-900">Import from your calendar</p>
            <p className="text-sm text-gray-500">Google, Outlook, Apple — auto-fill busy days</p>
          </div>
        </div>
        <span className="text-gray-400">{open ? "▲" : "▼"}</span>
      </button>

      {open && (
        <div className="border-t px-6 pb-6">
          {/* Tab row */}
          <div className="mt-4 flex gap-2 border-b">
            {(["google", "outlook", "apple"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={[
                  "px-4 py-2 text-sm font-medium capitalize transition-colors",
                  activeTab === tab
                    ? "border-b-2 border-blue-600 text-blue-600"
                    : "text-gray-500 hover:text-gray-900",
                ].join(" ")}
              >
                {tab === "google" ? "🗓 Google" : tab === "outlook" ? "📘 Outlook" : "🍎 Apple"}
              </button>
            ))}
          </div>

          {/* Google tab */}
          {activeTab === "google" && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">
                Syncs all your Google Calendars (primary, work, shared) — marks anything you have
                scheduled in the holiday window as busy.
              </p>

              {gcalStatus === "needs_grant" ? (
                <div className="rounded-lg bg-amber-50 border border-amber-200 p-4 space-y-3">
                  <p className="text-sm text-amber-800">
                    <strong>One-time permission needed.</strong> Click below to let this app read
                    your Google Calendar. You'll see a Google permissions screen — just click{" "}
                    <em>Allow</em>. You stay logged in, no sign-out required.
                  </p>
                  <button
                    onClick={() => connectCalendar("google")}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    🗓 Grant calendar access →
                  </button>
                </div>
              ) : (
                <button
                  onClick={syncGoogle}
                  disabled={gcalStatus === "syncing" || gcalStatus === "done"}
                  className={[
                    "rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
                    gcalStatus === "done"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60",
                  ].join(" ")}
                >
                  {gcalStatus === "syncing"
                    ? "Syncing…"
                    : gcalStatus === "done"
                    ? "✓ Synced!"
                    : "Sync Google Calendar"}
                </button>
              )}
              {/* Connect an additional Google account — its busy days are summed in. */}
              <button
                onClick={() => connectCalendar("google")}
                className="text-xs text-blue-600 hover:underline"
              >
                ➕ Connect another Google account
              </button>
              {gcalError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{gcalError}</div>
              )}
            </div>
          )}

          {/* Outlook tab */}
          {activeTab === "outlook" && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">
                One-click sync of your Outlook/Microsoft 365 calendar — marks anything scheduled
                in the holiday window as busy.
              </p>

              {outlookStatus === "needs_grant" || !hasOutlookToken ? (
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-4 space-y-3">
                  <p className="text-sm text-blue-800">
                    <strong>Connect your Microsoft account</strong> to sync live. You&apos;ll see a
                    Microsoft permissions screen — just click <em>Accept</em>. You stay logged in.
                  </p>
                  <button
                    onClick={() => connectCalendar("azure")}
                    className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
                  >
                    📘 Connect Outlook Calendar →
                  </button>
                </div>
              ) : (
                <button
                  onClick={syncOutlook}
                  disabled={outlookStatus === "syncing" || outlookStatus === "done"}
                  className={[
                    "rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
                    outlookStatus === "done"
                      ? "bg-green-100 text-green-700"
                      : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60",
                  ].join(" ")}
                >
                  {outlookStatus === "syncing"
                    ? "Syncing…"
                    : outlookStatus === "done"
                    ? "✓ Synced!"
                    : "Sync Outlook Calendar"}
                </button>
              )}
              {/* Connect an additional Microsoft account — its busy days are summed in. */}
              <button
                onClick={() => connectCalendar("azure")}
                className="block text-xs text-blue-600 hover:underline"
              >
                ➕ Connect another Microsoft account
              </button>
              {outlookError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{outlookError}</div>
              )}

              {/* Manual fallback */}
              <details className="text-sm text-gray-500">
                <summary className="cursor-pointer hover:text-gray-700">Or upload a .ics file instead</summary>
                <p className="mt-2 text-xs text-gray-400">
                  Outlook desktop: File → Open &amp; Export → Import/Export → Export to a file → iCalendar.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="mt-2 rounded-lg border border-dashed border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 w-full"
                >
                  📂 Upload .ics file
                </button>
              </details>
            </div>
          )}

          {/* Apple tab */}
          {activeTab === "apple" && (
            <div className="mt-4 space-y-3">
              <ol className="ml-4 list-decimal space-y-2 text-sm text-gray-600">
                <li>Open the <strong>Calendar</strong> app on your Mac</li>
                <li>In the left sidebar, right-click (or Ctrl-click) the calendar you want</li>
                <li>Click <strong>Export…</strong></li>
                <li>Save the <strong>.ics</strong> file and upload it below</li>
              </ol>
              <p className="text-xs text-gray-400">
                On iPhone/iPad: use iCloud.com → Calendar → export, or share via AirDrop to your Mac first.
              </p>
              <button
                onClick={() => fileRef.current?.click()}
                className="rounded-lg border border-dashed border-gray-300 px-5 py-3 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 w-full"
              >
                📂 Upload .ics file
              </button>
            </div>
          )}

          {/* Shared hidden file input for .ics upload */}
          <input
            ref={fileRef}
            type="file"
            accept=".ics,text/calendar"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
              e.target.value = "";
            }}
          />
          {icsError && (
            <div className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{icsError}</div>
          )}
        </div>
      )}
    </div>
  );
}

// ── main page ─────────────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const { slug } = useParams<{ slug: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []);
  const { toast } = useToast();

  const [token, setToken] = useState<string | null>(null);
  const [providerToken, setProviderToken] = useState<string | null>(null);
  const [authProvider, setAuthProvider] = useState<string | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [busyDates, setBusyDates] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [status, setStatus] = useState<SubmissionStatus | null>(null);
  const [windows, setWindows] = useState<FreeWindow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      const pt = data.session.provider_token ?? null;
      setToken(t);
      setProviderToken(pt);
      // Which OAuth provider the user signed in with — decides whether the
      // provider_token is a Google or a Microsoft Graph token.
      setAuthProvider((data.session.user.app_metadata?.provider as string) ?? null);

      // Restore any busy dates saved before the OAuth redirect
      const saved = localStorage.getItem(`busy_${slug}`);
      if (saved) {
        try {
          const dates: string[] = JSON.parse(saved);
          setBusyDates(new Set(dates));
        } catch { /* ignore */ }
        localStorage.removeItem(`busy_${slug}`);
      }

      try {
        const [r, s] = await Promise.all([
          getRoom(t, slug),
          getSubmissionStatus(t, slug).catch(() => null),
        ]);
        setRoom(r);
        if (s) {
          setStatus(s);
          if (s.user_submitted) {
            setSubmitted(true);
            // Pre-populate the calendar with the user's previously submitted dates
            // so "Edit my availability" shows what they actually marked, not a blank slate.
            getMyAvailability(t, slug).then((dates) => {
              setBusyDates((prev) => {
                // Don't overwrite if localStorage restore from OAuth redirect already ran
                if (prev.size > 0) return prev;
                return new Set(dates);
              });
            }).catch(() => { /* non-fatal — calendar just starts empty */ });
          }
          if (s.all_submitted) {
            const w = await getFreeWindows(t, slug).catch(() => null);
            setWindows(w);
          }
        }
      } catch {
        router.replace("/dashboard");
      } finally {
        setLoading(false);
      }
    });
    // Availability page is often left open for ages — keep the captured
    // JWT in sync with Supabase's silent background refresh.
    const { data: sub } = supabase.auth.onAuthStateChange((_evt, session) => {
      if (session?.access_token) setToken(session.access_token);
    });
    return () => sub.subscription.unsubscribe();
  }, [slug, supabase, router]);

  // Update browser tab title when the room name is known
  useEffect(() => {
    if (room?.name) document.title = `Availability – ${room.name} | Group Holiday Booking`;
    return () => { document.title = "Group Holiday Booking — plan your trip together"; };
  }, [room?.name]);

  // After returning from a calendar OAuth/link, auto-trigger the matching sync.
  // ?connect=google|outlook is set by connectCalendar(); sync_google=1 kept for
  // backward compatibility with the older Google grant flow.
  const autoSyncDone = useRef(false);
  useEffect(() => {
    if (autoSyncDone.current) return;
    if (!providerToken || loading) return;
    const connect = searchParams.get("connect");
    const legacyGoogle = searchParams.get("sync_google") === "1";
    const provider: "google" | "outlook" | null =
      connect === "google" || legacyGoogle ? "google" : connect === "outlook" ? "outlook" : null;
    if (!provider) return;
    autoSyncDone.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("connect");
    url.searchParams.delete("sync_google");
    window.history.replaceState({}, "", url.toString());
    setAutoSyncProvider(provider);
  }, [searchParams, providerToken, loading]);

  const [autoSyncProvider, setAutoSyncProvider] = useState<"google" | "outlook" | null>(null);
  const [lockingWindow, setLockingWindow] = useState<number | null>(null);
  const [reminding, setReminding] = useState(false);

  // Keep a ref so realtime callbacks always have the latest token without
  // needing to close over the token state directly (which would be stale).
  const tokenRef = useRef<string | null>(null);
  useEffect(() => { tokenRef.current = token; }, [token]);

  // ── Realtime: live submission counter ─────────────────────────────────────────
  // When another member submits, the counter ticks up instantly and the free
  // windows auto-appear for everyone the moment the last member submits —
  // no manual refresh needed.
  useEffect(() => {
    if (!room?.id) return;

    const channel = supabase
      .channel(`avail-subs-${room.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "availability_submissions",
          filter: `room_id=eq.${room.id}`,
        },
        async () => {
          const t = tokenRef.current;
          if (!t) return;
          try {
            const s = await getSubmissionStatus(t, slug);
            setStatus(s);
            if (s.all_submitted) {
              const w = await getFreeWindows(t, slug).catch(() => null);
              setWindows(w);
            }
          } catch { /* non-fatal — tab-visibility poll catches failures */ }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [room?.id, supabase, slug]);

  // Derive the month range from the room's rough_window
  const { windowStart, windowEnd, months } = useMemo(() => {
    const { start, end } = parseRoughWindow(room?.rough_window ?? null);
    return {
      windowStart: start,
      windowEnd: end,
      months: getMonthsInRange(start, end),
    };
  }, [room]);

  const toggleDate = useCallback(
    (iso: string) => {
      if (submitted) return;
      setBusyDates((prev) => {
        const next = new Set(prev);
        if (next.has(iso)) next.delete(iso);
        else next.add(iso);
        return next;
      });
    },
    [submitted]
  );

  function handleImport(dates: string[]) {
    setBusyDates((prev) => {
      const next = new Set(prev);
      dates.forEach((d) => next.add(d));
      return next;
    });
  }

  async function handleLockWindow(window: FreeWindow, idx: number) {
    if (!token || !room?.is_admin) return;
    setLockingWindow(idx);
    try {
      await updateRoom(token, slug, {
        agreed_start: window.start_date,
        agreed_end: window.end_date,
      });
      await advanceStep(token, slug);
      router.push(`/room/${slug}/preferences`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to lock in window"));
      setLockingWindow(null);
    }
  }

  async function handleRemind() {
    if (!token) return;
    setReminding(true);
    try {
      const result = await remindPendingMembers(token, slug);
      const n = result.reminders_sent;
      toast.success(n > 0 ? `Reminder sent to ${n} member${n !== 1 ? "s" : ""} 📬` : "No pending members to remind.");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to send reminders"));
    } finally {
      setReminding(false);
    }
  }

  async function handleSubmit() {
    if (!token) return;
    setSubmitting(true);
    try {
      const blocks = Array.from(busyDates).map((d) => ({
        block_date: d,
        is_busy: true,
        source: "manual" as const,
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
      toast.error(errorMessage(e, "Failed to submit"));
    } finally {
      setSubmitting(false);
    }
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
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <button
            onClick={() => router.push(`/room/${slug}`)}
            className="text-sm text-gray-500 hover:text-gray-900"
          >
            ← Back to room
          </button>
          <span className="font-semibold text-gray-900">Mark your availability</span>
          <div />
        </div>
      </nav>

      <div className="mx-auto max-w-3xl space-y-6 px-6 py-10">

        {/* Step already done banner — show if room has moved past availability */}
        {room?.agreed_start && (
          <div className="rounded-xl border-2 border-green-200 bg-green-50 p-4 flex items-start gap-3">
            <span className="text-2xl leading-none">✅</span>
            <div>
              <p className="font-semibold text-green-900">Availability step complete!</p>
              <p className="text-sm text-green-800 mt-0.5">
                The group agreed on <strong>{room.agreed_start} → {room.agreed_end}</strong>.{" "}
                <button onClick={() => router.push(`/room/${slug}`)} className="underline hover:text-green-700">
                  Continue planning →
                </button>
              </p>
            </div>
          </div>
        )}

        {/* Status banner */}
        {status && !room?.agreed_start && (
          <div
            className={`rounded-xl p-4 text-sm font-medium ${
              status.all_submitted
                ? "bg-green-50 text-green-800"
                : "bg-amber-50 text-amber-800"
            }`}
          >
            {status.all_submitted
              ? "🎉 Everyone has submitted! Free windows are shown below."
              : `${status.submitted} / ${status.total} members submitted. Still waiting for: ${status.members_pending.join(", ")}`}
          </div>
        )}

        {!submitted ? (
          <>
            {/* Import panel */}
            <ImportPanel
              onImport={handleImport}
              windowStart={windowStart}
              windowEnd={windowEnd}
              providerToken={providerToken}
              authProvider={authProvider}
              slug={slug}
              autoSyncProvider={autoSyncProvider}
              onAutoSyncDone={() => setAutoSyncProvider(null)}
              busyDates={busyDates}
            />

            {/* Legend + instructions */}
            <div className="flex flex-wrap items-center gap-4 rounded-xl border bg-white px-5 py-3">
              <p className="text-sm text-gray-600 flex-1">
                <strong>Green = free</strong>, <strong>red = busy</strong>.
                Click any date to flip it.
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded bg-green-300 inline-block" />
                  <span className="text-gray-600">Free</span>
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="h-5 w-5 rounded bg-red-500 inline-block" />
                  <span className="text-gray-600">Busy</span>
                </span>
                {busyDates.size > 0 && (
                  <button
                    onClick={() => setBusyDates(new Set())}
                    className="text-xs text-gray-400 hover:text-red-600 underline underline-offset-2"
                  >
                    Clear all
                  </button>
                )}
              </div>
            </div>

            {/* Month grids — all months in the window */}
            {months.length === 0 ? (
              <div className="rounded-xl border bg-white p-8 text-center text-gray-500">
                No time window set for this room yet.{" "}
                <button
                  onClick={() => router.push(`/room/${slug}`)}
                  className="text-blue-600 hover:underline"
                >
                  Go back and set one.
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {months.map(({ year, month }) => (
                  <MonthGrid
                    key={`${year}-${month}`}
                    year={year}
                    month={month}
                    busyDates={busyDates}
                    onToggle={toggleDate}
                    windowStart={windowStart}
                    windowEnd={windowEnd}
                    disabled={submitted}
                  />
                ))}
              </div>
            )}

            {/* Sticky submit bar */}
            <div className="sticky bottom-6 flex items-center justify-between rounded-2xl border bg-white px-6 py-4 shadow-lg">
              <p className="text-sm text-gray-600">
                {busyDates.size === 0
                  ? "No busy days marked — you're free the whole window!"
                  : `${busyDates.size} busy day${busyDates.size !== 1 ? "s" : ""} marked`}
              </p>
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="rounded-xl bg-blue-600 px-7 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {submitting ? "Submitting…" : "Submit availability →"}
              </button>
            </div>
          </>
        ) : (
          /* Post-submit state */
          <div className="rounded-xl border bg-green-50 p-8 text-center shadow-sm">
            <div className="mb-3 text-4xl">✅</div>
            <h2 className="text-lg font-bold text-green-900">Availability submitted!</h2>
            <p className="mt-2 text-green-700">
              {status?.all_submitted
                ? "Everyone is in — check the free windows below."
                : `Waiting for ${status?.members_pending?.join(", ")} to submit.`}
            </p>
            {room?.is_admin && !status?.all_submitted && (
              <button
                onClick={handleRemind}
                disabled={reminding}
                className="mt-4 rounded-lg bg-amber-500 px-5 py-2 text-sm font-semibold text-white hover:bg-amber-600 disabled:opacity-60"
              >
                {reminding ? "Sending…" : "📬 Send reminder to pending members"}
              </button>
            )}
            <button
              onClick={() => setSubmitted(false)}
              className="mt-4 text-xs text-green-600 hover:text-green-800 underline underline-offset-2"
            >
              Made a mistake? Edit my availability →
            </button>
          </div>
        )}

        {/* Free windows — shown once everyone submits */}
        {windows && windows.length > 0 && (
          <div className="rounded-xl border bg-white p-6 shadow-sm">
            <h2 className="mb-1 font-semibold text-gray-900">🗓 Free windows for everyone</h2>
            {room?.is_admin && (
              <p className="mb-4 text-sm text-blue-700">
                As admin, click <strong>Use these dates</strong> to lock in a window and move to the next step.
              </p>
            )}
            <div className="space-y-3">
              {windows.map((w, i) => (
                <div
                  key={i}
                  className={`flex items-center justify-between rounded-xl px-5 py-3 gap-4 ${
                    i === 0
                      ? "bg-green-50 border border-green-200"
                      : "bg-gray-50 border border-gray-100"
                  }`}
                >
                  <div className="flex-1">
                    <p className="font-semibold text-gray-900">
                      {new Date(w.start_date).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", timeZone: "UTC",
                      })}
                      {" – "}
                      {new Date(w.end_date).toLocaleDateString("en-GB", {
                        day: "numeric", month: "short", year: "numeric", timeZone: "UTC",
                      })}
                    </p>
                    <p className="text-sm text-gray-500">{w.days} days free</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {i === 0 && (
                      <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white whitespace-nowrap">
                        Best window
                      </span>
                    )}
                    {room?.is_admin && (
                      <button
                        onClick={() => handleLockWindow(w, i)}
                        disabled={lockingWindow !== null}
                        className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                      >
                        {lockingWindow === i ? "Locking…" : "Use these dates →"}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {windows && windows.length === 0 && status?.all_submitted && (
          <div className="rounded-xl border bg-red-50 p-6 text-center">
            <p className="font-semibold text-red-800">No common free windows found 😬</p>
            <p className="mt-1 text-sm text-red-600">
              Everyone is too busy in this period. Consider expanding your time window.
            </p>
          </div>
        )}
      </div>
      {token && <FeedbackButton token={token} page="availability" roomSlug={slug} />}
    </main>
  );
}
