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
  getCalendarStatus,
  getLinkedAccounts,
  startCalendarLink,
  getLinkedBusy,
  type Room,
  type SubmissionStatus,
  type FreeWindow,
} from "@/lib/api";
import { parseIcal, parseRoughWindow, getMonthsInRange } from "@/lib/ical";
import FeedbackButton from "@/components/FeedbackButton";
import AccountBadge from "@/components/AccountBadge";
import StepBar from "@/components/StepBar";
import Script from "next/script";
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
  onCellDown,
  onCellEnter,
  windowStart,
  windowEnd,
  disabled,
}: {
  year: number;
  month: number;
  busyDates: Set<string>;
  onCellDown: (iso: string) => void;   // press / tap a day (starts a drag-paint)
  onCellEnter: (iso: string) => void;  // drag over a day
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
              onMouseDown={(e) => {
                if (isPast || outOfWindow || disabled) return;
                e.preventDefault(); // stop text selection while dragging
                onCellDown(iso);
              }}
              onMouseEnter={() => {
                if (isPast || outOfWindow || disabled) return;
                onCellEnter(iso);
              }}
              disabled={isPast || outOfWindow || disabled}
              title={
                isBusy ? "Busy — click to unmark (or drag)" : isPast ? "Past date" : "Click or drag to mark busy"
              }
              className={[
                "aspect-square rounded-lg text-sm font-medium transition-colors",
                // Past / out-of-window ALWAYS greyed — even if a calendar event
                // fell on that day — since you can't book it anyway.
                isPast || outOfWindow
                  ? "text-gray-300 cursor-not-allowed"
                  : isBusy
                  ? "bg-red-500 text-white hover:bg-red-600"
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
  // Google calendars to pick from. Each carries the account + that account's
  // access token, so MULTIPLE Google accounts can be connected and stacked
  // (no replacing). `account` is the email the calendar belongs to.
  const [googleCals, setGoogleCals] = useState<
    { id: string; summary: string; selected: boolean; account: string; token: string }[]
  >([]);
  // Connected Microsoft accounts (each an MSAL token) — stacked, not replaced.
  const [msAccounts, setMsAccounts] = useState<{ account: string; token: string }[]>([]);
  const [outlookStatus, setOutlookStatus] = useState<"idle" | "syncing" | "done" | "needs_grant" | "error">("idle");
  const [outlookError, setOutlookError] = useState("");
  const [icsError, setIcsError] = useState("");
  // Permanently-linked calendars: count + one-click pull state.
  const [linkedCount, setLinkedCount] = useState(0);
  // Whether permanent linking is switched on server-side, + the user's choice to
  // remember a calendar permanently (vs one-off) at the moment they connect.
  const [permanentConfigured, setPermanentConfigured] = useState(false);
  const [rememberPermanent, setRememberPermanent] = useState(false);
  const [linkedStatus, setLinkedStatus] = useState<"idle" | "syncing" | "done" | "error">("idle");
  const [linkedError, setLinkedError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Legacy: we used to bounce through a Supabase OAuth redirect to grant calendar
  // scope. That flow was unreliable (it could flash a sign-in error and silently
  // re-auth). We now use in-page token popups (Google GIS / Microsoft MSAL) for
  // everything, so just open the panel on the right tab if we came back from one.
  useEffect(() => {
    if (!autoSyncProvider) return;
    setOpen(true);
    setActiveTab(autoSyncProvider === "outlook" ? "outlook" : "google");
    onAutoSyncDone();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSyncProvider]);

  // How many calendars has this user permanently linked? (Shows the one-click pull.)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data: s } = await supabase.auth.getSession();
        const tok = s.session?.access_token;
        if (!tok) return;
        const st = await getCalendarStatus(tok);
        if (cancelled) return;
        setPermanentConfigured(st.configured);
        if (!st.configured) return;
        const accts = await getLinkedAccounts(tok);
        if (!cancelled) setLinkedCount(accts.length);
      } catch {
        /* feature off — leave count at 0 so the button stays hidden */
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  function fmtDay(d: Date) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  // One click: pull busy days from every permanently-linked account, no re-grant.
  async function pullFromLinked() {
    setLinkedStatus("syncing");
    setLinkedError("");
    try {
      const { data: s } = await supabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) throw new Error("Not signed in");
      const res = await getLinkedBusy(tok, fmtDay(windowStart), fmtDay(windowEnd));
      onImport(res.busy);
      const failed = res.accounts.filter((a) => !a.ok);
      if (failed.length) {
        setLinkedError(
          `Couldn't reach ${failed.length} linked account${failed.length > 1 ? "s" : ""} — you may need to re-link ${failed.length > 1 ? "them" : "it"} in your profile.`,
        );
      }
      setLinkedStatus("done");
    } catch {
      setLinkedStatus("error");
      setLinkedError("Couldn't pull from your linked calendars. Try again.");
    }
  }

  // Permanently link a calendar (server-side OAuth, stores an encrypted refresh
  // token) so the user never has to re-grant on future trips. Redirects away and
  // back. Used when "remember permanently" is ticked at connect time.
  async function startPermanentLink(provider: "google" | "microsoft") {
    const setErr = provider === "google" ? setGcalError : setOutlookError;
    try {
      const { data: s } = await supabase.auth.getSession();
      const tok = s.session?.access_token;
      if (!tok) { setErr("Please sign in again."); return; }
      const { url } = await startCalendarLink(tok, provider, window.location.href);
      window.location.href = url;
    } catch {
      setErr("Couldn't start permanent linking — try the one-off import instead.");
    }
  }

  // Add a Google account via Google Identity Services — an in-page token popup
  // that does NOT touch your Supabase login (so it works for any account, even
  // one that already has its own GHB login). Connect as MANY accounts as you
  // like; their calendars STACK (we never replace the previous account).
  function addGoogleAccount() {
    if (rememberPermanent && permanentConfigured) { startPermanentLink("google"); return; }
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
    if (!clientId) {
      setGcalError("Google calendar import isn't switched on yet (needs NEXT_PUBLIC_GOOGLE_CLIENT_ID).");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const g = (window as unknown as { google?: any }).google;
    if (!g?.accounts?.oauth2) {
      setGcalError("Google sign-in is still loading — give it a second and try again.");
      return;
    }
    setGcalError("");
    const client = g.accounts.oauth2.initTokenClient({
      client_id: clientId,
      // email scope too, so we can label which account each calendar belongs to.
      scope: "https://www.googleapis.com/auth/calendar.readonly email",
      prompt: "select_account consent",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      callback: async (resp: any) => {
        if (!resp?.access_token) {
          setGcalError("Couldn't get Google permission for that account. Please try again.");
          return;
        }
        // Find out which account this token belongs to (for the label + dedupe).
        let email = "Google account";
        try {
          const ui = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
            headers: { Authorization: `Bearer ${resp.access_token}` },
          });
          if (ui.ok) email = (await ui.json()).email || email;
        } catch { /* keep the generic label */ }
        loadGoogleCalendars(resp.access_token, email);
      },
    });
    client.requestAccessToken();
  }

  // One-off import from ANY Microsoft account via MSAL — a popup that does NOT
  // change your Supabase login, so it works even when that Microsoft account
  // already has its own GHB account (the "azure app ID" flow).
  // Ensure the MSAL browser library is loaded before we use it. The <Script> tag
  // loads it lazily, so a quick click can race it — this loads on demand and
  // waits, instead of erroring with "script still loading".
  function ensureMsal(): Promise<any> {  // eslint-disable-line @typescript-eslint/no-explicit-any
    return new Promise((resolve, reject) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const w = window as unknown as { msal?: any };
      if (w.msal?.PublicClientApplication) return resolve(w.msal);
      const SRC = "https://alcdn.msauth.net/browser/2.38.4/js/msal-browser.min.js";
      let el = document.querySelector(`script[src="${SRC}"]`) as HTMLScriptElement | null;
      const start = Date.now();
      const poll = () => {
        if (w.msal?.PublicClientApplication) return resolve(w.msal);
        if (Date.now() - start > 10000) return reject(new Error("MSAL failed to load"));
        setTimeout(poll, 150);
      };
      if (!el) {
        el = document.createElement("script");
        el.src = SRC;
        el.async = true;
        el.onerror = () => reject(new Error("MSAL failed to load"));
        document.head.appendChild(el);
      }
      poll();
    });
  }

  // Add a Microsoft account via MSAL — an in-page popup that does NOT touch your
  // Supabase login. Connect as many accounts as you like; they STACK.
  async function addOutlookAccount() {
    if (rememberPermanent && permanentConfigured) { startPermanentLink("microsoft"); return; }
    const clientId = process.env.NEXT_PUBLIC_MS_CLIENT_ID;
    if (!clientId) {
      setOutlookError("Microsoft calendar import isn't switched on yet (needs NEXT_PUBLIC_MS_CLIENT_ID).");
      return;
    }
    setOutlookError("");
    setOutlookStatus("syncing");
    try {
      const m = await ensureMsal();
      const pca = new m.PublicClientApplication({
        auth: {
          clientId,
          // "common" lets both personal and work/school accounts sign in.
          authority: "https://login.microsoftonline.com/common",
          redirectUri: window.location.origin,
        },
        cache: { cacheLocation: "sessionStorage" },
      });
      if (typeof pca.initialize === "function") await pca.initialize();
      const scopes = ["Calendars.Read"];
      const resp = await pca.loginPopup({ scopes, prompt: "select_account" });
      let accessToken: string | undefined = resp?.accessToken;
      if (!accessToken && resp?.account) {
        const t = await pca.acquireTokenSilent({ scopes, account: resp.account });
        accessToken = t?.accessToken;
      }
      if (!accessToken) {
        setOutlookStatus("idle");
        setOutlookError("Couldn't get Microsoft permission for that account.");
        return;
      }
      const account = resp?.account?.username || "Microsoft account";
      // Stack accounts (replace token if the same account is re-added).
      setMsAccounts((prev) => [...prev.filter((a) => a.account !== account), { account, token: accessToken! }]);
      setOutlookStatus("idle");
    } catch (e) {
      setOutlookStatus("idle");
      setOutlookError(
        e instanceof Error && e.message.includes("MSAL")
          ? "Microsoft sign-in library couldn't load — check your connection and try again."
          : "Microsoft sign-in was cancelled or failed. Please try again.",
      );
    }
  }

  // Fetch one account's calendar list and MERGE it into the picker (stacking
  // multiple accounts; re-adding the same account refreshes its entries).
  async function loadGoogleCalendars(token: string, account: string) {
    setGcalStatus("syncing");
    setGcalError("");
    try {
      const listResp = await fetch(
        "https://www.googleapis.com/calendar/v3/users/me/calendarList?minAccessRole=reader",
        { headers: { Authorization: `Bearer ${token}` } },
      );
      if (listResp.status === 403 || listResp.status === 401) {
        setGcalStatus("idle");
        setGcalError("Google didn't grant calendar access for that account. Try again and tick every box.");
        return;
      }
      const listData = await listResp.json();
      // Auto-generated "informational" calendars (holidays, birthdays, week
      // numbers, weather) — the usual cause of false-busy days, so default them OFF.
      const isNoiseCalendar = (id: string) =>
        /#(holiday|contacts|weeknum|weather)@group\.v\.calendar\.google\.com$/.test(id);
      const cals = (listData.items ?? [])
        .filter((c: { id?: string }) => c.id)
        .map((c: { id: string; summary?: string; summaryOverride?: string; selected?: boolean }) => ({
          id: c.id,
          summary: c.summaryOverride || c.summary || c.id,
          account,
          token,
          // Default-tick visible, non-noise calendars.
          selected: c.selected !== false && !isNoiseCalendar(c.id),
        }));
      // MERGE: drop any previous entries for this account, then add the fresh set.
      setGoogleCals((prev) => [...prev.filter((c) => c.account !== account), ...cals]);
      setGcalStatus("idle"); // show the picker
    } catch {
      setGcalStatus("error");
      setGcalError("Failed to reach Google Calendar. Check your connection and try again.");
    }
  }

  // Sync events from the ticked calendars — each fetched with ITS OWN account token.
  async function syncGoogleSelected() {
    const selected = googleCals.filter((c) => c.selected);
    if (selected.length === 0) {
      setGcalError("Pick at least one calendar to include.");
      return;
    }
    setGcalStatus("syncing");
    setGcalError("");
    try {
      const allBusy = new Set<string>();
      const results = await Promise.allSettled(
        selected.map(async (cal) => {
          const url = new URL(
            `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(cal.id)}/events`,
          );
          url.searchParams.set("timeMin", windowStart.toISOString());
          url.searchParams.set("timeMax", windowEnd.toISOString());
          url.searchParams.set("singleEvents", "true");
          url.searchParams.set("maxResults", "2500");
          const r = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${cal.token}` },
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
    if (msAccounts.length === 0) {
      setOutlookError("Connect a Microsoft account first.");
      return;
    }
    setOutlookStatus("syncing");
    setOutlookError("");
    try {
      const allBusy = new Set<string>();
      // Pull each connected Microsoft account's calendar and merge.
      const results = await Promise.allSettled(
        msAccounts.map(async ({ token }) => {
          // Microsoft Graph calendarView expands recurring events across the window.
          const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
          url.searchParams.set("startDateTime", windowStart.toISOString());
          url.searchParams.set("endDateTime", windowEnd.toISOString());
          url.searchParams.set("$select", "start,end,showAs,isCancelled,isAllDay");
          url.searchParams.set("$top", "1000");
          const r = await fetch(url.toString(), {
            headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' },
          });
          if (!r.ok) throw new Error(`Graph ${r.status}`);
          const data = await r.json();
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
        }),
      );
      if (results.every((r) => r.status === "rejected")) {
        throw new Error("All Outlook fetches failed");
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
      {/* Google Identity Services — for one-off import from any Google account. */}
      <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />
      {/* MSAL — for one-off import from any Microsoft account. */}
      <Script src="https://alcdn.msauth.net/browser/2.38.4/js/msal-browser.min.js" strategy="afterInteractive" />
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
          {/* Merge reassurance */}
          <div className="mt-4 rounded-lg bg-green-50 border border-green-200 px-3 py-2 text-xs text-green-800">
            🔁 Syncing <strong>adds to</strong> the busy days you&apos;ve already marked — it never erases them.
            Import from as many calendars/accounts as you like and they all stack up.
          </div>

          {/* One-click pull from permanently-linked calendars (no re-granting). */}
          {linkedCount > 0 && (
            <div className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
              <p className="text-sm text-blue-900">
                <strong>⚡ You&apos;ve linked {linkedCount} calendar{linkedCount > 1 ? "s" : ""}.</strong>{" "}
                Fill in your busy days instantly — no permission screen.
              </p>
              <button
                onClick={pullFromLinked}
                disabled={linkedStatus === "syncing"}
                className={[
                  "rounded-lg px-5 py-2.5 text-sm font-semibold transition-colors",
                  linkedStatus === "done"
                    ? "bg-green-100 text-green-700"
                    : "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60",
                ].join(" ")}
              >
                {linkedStatus === "syncing"
                  ? "Pulling…"
                  : linkedStatus === "done"
                  ? "✓ Pulled — pull again"
                  : `↻ Fill from my linked calendar${linkedCount > 1 ? "s" : ""}`}
              </button>
              {linkedError && <p className="text-xs text-amber-700">{linkedError}</p>}
              <p className="text-[11px] text-blue-700">
                Manage linked accounts in your <a href="/profile" className="underline">profile</a>.
              </p>
            </div>
          )}

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
                Connect one or more Google accounts, tick the calendars to include, then sync —
                anything scheduled in the holiday window is marked busy. Holiday/birthday
                calendars are off by default.
              </p>

              {/* One button. Click it again to add more accounts — they stack. */}
              <button
                onClick={addGoogleAccount}
                disabled={gcalStatus === "syncing"}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {gcalStatus === "syncing"
                  ? "Loading…"
                  : googleCals.length === 0
                  ? "🗓 Connect a Google calendar"
                  : "➕ Add another Google account"}
              </button>
              <p className="text-[11px] text-gray-400">
                Works for any Google account (even ones with their own Group Holiday login). Add as
                many as you like — they all stack.
                {!rememberPermanent && " One-off — nothing is permanently linked."}
              </p>
              {permanentConfigured && (
                <label className="flex items-start gap-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={rememberPermanent}
                    onChange={(e) => setRememberPermanent(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span>🔒 <strong>Remember permanently</strong> — link it to your account so you never have to grant access again on future trips (you can unlink anytime in your profile).</span>
                </label>
              )}

              {googleCals.length > 0 && (
                <div className="space-y-3">
                  {/* Calendar pick-list, grouped by account so you can choose across several. */}
                  <div className="max-h-56 space-y-2 overflow-y-auto rounded-lg border border-gray-200 p-2">
                    {Array.from(new Set(googleCals.map((c) => c.account))).map((acct) => (
                      <div key={acct}>
                        <p className="px-2 pt-1 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{acct}</p>
                        {googleCals.filter((c) => c.account === acct).map((c) => (
                          <label key={`${acct}:${c.id}`} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={c.selected}
                              onChange={() =>
                                setGoogleCals((prev) =>
                                  prev.map((x) => (x.id === c.id && x.account === acct ? { ...x, selected: !x.selected } : x))
                                )
                              }
                              className="h-4 w-4 accent-blue-600"
                            />
                            <span className="truncate text-gray-800">{c.summary}</span>
                          </label>
                        ))}
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={syncGoogleSelected}
                    disabled={gcalStatus === "syncing"}
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
                      ? "✓ Synced! — sync again"
                      : `Sync ${googleCals.filter((c) => c.selected).length} selected calendar${googleCals.filter((c) => c.selected).length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
              {gcalError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{gcalError}</div>
              )}

              {/* Reliable fallback: .ics upload (no permissions / no app-verification needed) */}
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-600 mb-2">
                  <strong>Prefer no permissions?</strong> Export your calendar and upload it —
                  works instantly, and you can upload several. In Google Calendar: Settings →
                  Import &amp; Export → Export.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 w-full"
                >
                  📂 Upload .ics file
                </button>
              </div>
            </div>
          )}

          {/* Outlook tab */}
          {activeTab === "outlook" && (
            <div className="mt-4 space-y-3">
              <p className="text-sm text-gray-600">
                Connect one or more Microsoft accounts, then sync — anything scheduled in the
                holiday window is marked busy. Add as many accounts as you like; they stack.
              </p>

              {/* One button. Click it again to add more accounts. */}
              <button
                onClick={addOutlookAccount}
                disabled={outlookStatus === "syncing"}
                className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-60"
              >
                {outlookStatus === "syncing"
                  ? "Loading…"
                  : msAccounts.length === 0
                  ? "📘 Connect a Microsoft calendar"
                  : "➕ Add another Microsoft account"}
              </button>
              <p className="text-[11px] text-gray-400">
                Works for any Microsoft account (even ones with their own Group Holiday login).
                {!rememberPermanent && " One-off — nothing is permanently linked."}
              </p>
              {permanentConfigured && (
                <label className="flex items-start gap-2 text-[11px] text-gray-600">
                  <input
                    type="checkbox"
                    checked={rememberPermanent}
                    onChange={(e) => setRememberPermanent(e.target.checked)}
                    className="mt-0.5 h-3.5 w-3.5 accent-blue-600"
                  />
                  <span>🔒 <strong>Remember permanently</strong> — link it to your account so you never have to grant access again on future trips (you can unlink anytime in your profile).</span>
                </label>
              )}

              {msAccounts.length > 0 && (
                <div className="space-y-2">
                  <ul className="rounded-lg border border-gray-200 divide-y text-sm">
                    {msAccounts.map((a) => (
                      <li key={a.account} className="flex items-center justify-between px-3 py-2">
                        <span className="truncate text-gray-800">📘 {a.account}</span>
                        <button
                          onClick={() => setMsAccounts((prev) => prev.filter((x) => x.account !== a.account))}
                          className="text-xs text-red-600 hover:underline"
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                  <button
                    onClick={syncOutlook}
                    disabled={outlookStatus === "syncing"}
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
                      ? "✓ Synced! — sync again"
                      : `Sync ${msAccounts.length} Microsoft account${msAccounts.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              )}
              {outlookError && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{outlookError}</div>
              )}

              {/* Reliable fallback: .ics upload */}
              <div className="mt-2 rounded-lg bg-gray-50 border border-gray-200 p-3">
                <p className="text-xs text-gray-600 mb-2">
                  <strong>Prefer no permissions?</strong> Export your calendar and upload it.
                  Outlook desktop: File → Open &amp; Export → Import/Export → Export to a file →
                  iCalendar.
                </p>
                <button
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg border border-dashed border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:border-blue-400 hover:text-blue-600 w-full"
                >
                  📂 Upload .ics file
                </button>
              </div>
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
  const [reminding, setReminding] = useState(false);
  // Multi-window selection: which free windows to include in the flight search,
  // and whether to search them all (cheapest wins) or lock one for logistics.
  const [selectedWindows, setSelectedWindows] = useState<Set<number>>(new Set([0]));
  const [windowMode, setWindowMode] = useState<"multi" | "single">("multi");
  const [lockingWindows, setLockingWindows] = useState(false);

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

  // Reliable fallback poll: Supabase realtime is silent unless the table is in
  // the realtime publication, so don't depend on it. Poll the submission status
  // every few seconds and stop once everyone's in — no manual refresh needed.
  useEffect(() => {
    if (!room?.id) return;
    let stopped = false;
    const iv = setInterval(async () => {
      const t = tokenRef.current;
      if (!t || stopped) return;
      try {
        const s = await getSubmissionStatus(t, slug);
        setStatus(s);
        if (s.all_submitted) {
          const w = await getFreeWindows(t, slug).catch(() => null);
          setWindows(w);
          stopped = true;
          clearInterval(iv);
        }
      } catch { /* transient — try again next tick */ }
    }, 5000);
    return () => { stopped = true; clearInterval(iv); };
  }, [room?.id, slug]);

  // Derive the month range from the room's rough_window
  const { windowStart, windowEnd, months } = useMemo(() => {
    const { start, end } = parseRoughWindow(room?.rough_window ?? null);
    return {
      windowStart: start,
      windowEnd: end,
      months: getMonthsInRange(start, end),
    };
  }, [room]);

  // Drag-to-paint: press a day to flip it, then drag across days to set them all
  // to the same state (busy or free). paintMode holds the value being painted.
  const paintMode = useRef<boolean | null>(null);

  const setDay = useCallback(
    (iso: string, busy: boolean) => {
      if (submitted) return;
      setBusyDates((prev) => {
        const next = new Set(prev);
        if (busy) next.add(iso);
        else next.delete(iso);
        return next;
      });
    },
    [submitted]
  );

  const handleCellDown = useCallback(
    (iso: string) => {
      if (submitted) return;
      const makeBusy = !busyDates.has(iso); // flip the first cell, then paint that value
      paintMode.current = makeBusy;
      setDay(iso, makeBusy);
    },
    [submitted, busyDates, setDay]
  );

  const handleCellEnter = useCallback(
    (iso: string) => {
      if (paintMode.current === null) return;
      setDay(iso, paintMode.current);
    },
    [setDay]
  );

  // End any drag-paint when the mouse/finger is released anywhere.
  useEffect(() => {
    const end = () => { paintMode.current = null; };
    window.addEventListener("mouseup", end);
    window.addEventListener("touchend", end);
    return () => {
      window.removeEventListener("mouseup", end);
      window.removeEventListener("touchend", end);
    };
  }, []);

  function handleImport(dates: string[]) {
    // Ignore past dates — you can't book a holiday in the past, so a calendar
    // event back then shouldn't mark the day busy (it stays greyed out).
    const today = new Date().toISOString().slice(0, 10);
    setBusyDates((prev) => {
      const next = new Set(prev);
      dates.forEach((d) => { if (d >= today) next.add(d); });
      return next;
    });
  }

  function toggleWindow(idx: number) {
    setSelectedWindows((prev) => {
      if (windowMode === "single") return new Set([idx]);   // radio behaviour
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx);
      else next.add(idx);
      return next;
    });
  }

  // Lock in the selected window(s) and move on. In multi mode the optimiser
  // prices every selected window and keeps the cheapest per destination; in
  // single mode only the one window is searched (logistics certainty).
  async function handleLockWindows() {
    if (!token || !room?.is_admin || !windows) return;
    const chosen = [...selectedWindows]
      .filter((i) => i >= 0 && i < windows.length)
      .map((i) => windows[i])
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
    if (chosen.length === 0) {
      toast.error("Pick at least one window.");
      return;
    }
    setLockingWindows(true);
    try {
      await updateRoom(token, slug, {
        // Earliest selected window is the "primary" (calendar/display + logistics).
        agreed_start: chosen[0].start_date,
        agreed_end: chosen[0].end_date,
        search_windows: chosen.map((w) => ({ start_date: w.start_date, end_date: w.end_date })),
        multi_window_search: windowMode === "multi",
      });
      await advanceStep(token, slug);
      router.push(`/room/${slug}/preferences`);
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Failed to lock in the window(s)"));
      setLockingWindows(false);
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
          <div className="flex items-center gap-3">
            <AccountBadge className="hidden sm:flex" />
            <button
              onClick={() => router.push("/dashboard")}
              className="text-sm font-medium text-blue-600 hover:text-blue-800"
            >
              Dashboard →
            </button>
          </div>
        </div>
      </nav>
      <StepBar slug={slug} currentStep={room?.current_step} activeRoute="availability" />

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
                Click a date to flip it, or <strong>click and drag</strong> to mark several at once.
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
                    onCellDown={handleCellDown}
                    onCellEnter={handleCellEnter}
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

            {room?.is_admin ? (
              <>
                <p className="mb-3 text-sm text-blue-700">
                  Pick the window(s) to search for flights. The more windows you include, the
                  better the chance of finding cheap fares — we price every one and keep the
                  cheapest per destination.
                </p>

                {/* Mode toggle */}
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <div className="flex rounded-lg border border-gray-200 bg-gray-50 p-1">
                    {([
                      ["multi", "🔎 Search multiple windows"],
                      ["single", "📌 Lock one window"],
                    ] as const).map(([val, label]) => (
                      <button
                        key={val}
                        onClick={() => {
                          setWindowMode(val);
                          // Single mode keeps just one selection (the best window by default).
                          if (val === "single") {
                            setSelectedWindows((prev) => new Set([[...prev][0] ?? 0]));
                          }
                        }}
                        className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                          windowMode === val ? "bg-white text-blue-700 shadow-sm" : "text-gray-500 hover:text-gray-800"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <span className="text-xs text-gray-400">
                    {windowMode === "multi"
                      ? "Best for finding the cheapest trip."
                      : "Best when you need date certainty early (e.g. booking time off)."}
                  </span>
                </div>
              </>
            ) : (
              <p className="mb-4 text-sm text-gray-500">The admin will choose which window(s) to search.</p>
            )}

            <div className="space-y-3">
              {windows.map((w, i) => {
                const selected = selectedWindows.has(i);
                return (
                  <label
                    key={i}
                    className={`flex items-center justify-between rounded-xl px-5 py-3 gap-4 ${
                      room?.is_admin ? "cursor-pointer" : ""
                    } ${
                      selected
                        ? "bg-green-50 border-2 border-green-400"
                        : "bg-gray-50 border border-gray-100"
                    }`}
                  >
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      {room?.is_admin && (
                        <input
                          type={windowMode === "single" ? "radio" : "checkbox"}
                          name="search-window"
                          checked={selected}
                          onChange={() => toggleWindow(i)}
                          className="h-4 w-4 shrink-0 accent-green-600"
                        />
                      )}
                      <div className="min-w-0">
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
                    </div>
                    {i === 0 && (
                      <span className="rounded-full bg-green-600 px-3 py-1 text-xs font-bold text-white whitespace-nowrap">
                        Longest window
                      </span>
                    )}
                  </label>
                );
              })}
            </div>

            {room?.is_admin && (
              <div className="mt-5 flex items-center justify-between gap-3 flex-wrap border-t pt-4">
                <p className="text-xs text-gray-500">
                  {selectedWindows.size === 0
                    ? "Select at least one window."
                    : windowMode === "multi"
                    ? `${selectedWindows.size} window${selectedWindows.size !== 1 ? "s" : ""} will be searched for the cheapest flights.`
                    : "Only this window will be searched."}
                </p>
                <button
                  onClick={handleLockWindows}
                  disabled={lockingWindows || selectedWindows.size === 0}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 whitespace-nowrap"
                >
                  {lockingWindows
                    ? "Locking…"
                    : windowMode === "multi" && selectedWindows.size > 1
                    ? `Use these ${selectedWindows.size} windows →`
                    : "Use this window →"}
                </button>
              </div>
            )}
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
