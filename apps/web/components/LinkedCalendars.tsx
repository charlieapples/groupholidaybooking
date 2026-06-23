"use client";

import { useCallback, useEffect, useState } from "react";
import {
  getCalendarStatus,
  getLinkedAccounts,
  startCalendarLink,
  unlinkCalendarAccount,
  type CalendarStatus,
  type LinkedAccount,
} from "@/lib/api";
import { useToast, errorMessage } from "@/components/Toast";
import ProviderIcon from "@/components/ProviderIcon";

/**
 * Manage permanently-linked calendar accounts.
 *
 * Link a Google/Microsoft account ONCE; afterwards every Holiday can pull your
 * busy days with one click (no re-granting). Renders nothing until the backend
 * reports the feature is configured, so it stays invisible until the OAuth
 * secrets + encryption key are set on the API.
 */
export default function LinkedCalendars({ token }: { token: string | null }) {
  const { toast } = useToast();
  const [status, setStatus] = useState<CalendarStatus | null>(null);
  const [accounts, setAccounts] = useState<LinkedAccount[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    if (!token) return;
    try {
      const s = await getCalendarStatus(token);
      setStatus(s);
      if (s.configured) setAccounts(await getLinkedAccounts(token));
    } catch {
      /* feature off or unreachable — stay hidden */
    }
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  // Surface the result of a just-completed OAuth round-trip (?calendar_linked / ?calendar_error).
  useEffect(() => {
    if (typeof window === "undefined") return;
    const p = new URLSearchParams(window.location.search);
    const linked = p.get("calendar_linked");
    const err = p.get("calendar_error");
    if (linked) toast.success(`Linked your ${linked === "google" ? "Google" : "Microsoft"} calendar!`);
    if (err) {
      const msg = err === "no_refresh_token"
        ? "Couldn't link permanently — try again and choose 'Allow' on every screen."
        : "Calendar linking was cancelled or failed.";
      toast.error(msg);
    }
    if (linked || err) {
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

  async function unlink(id: string) {
    if (!token) return;
    try {
      await unlinkCalendarAccount(token, id);
      setAccounts((a) => a.filter((x) => x.id !== id));
      toast.success("Calendar unlinked.");
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't unlink"));
    }
  }

  // Hidden entirely until the feature is switched on server-side.
  if (!status?.configured) return null;

  return (
    <div className="rounded-xl border bg-white p-6 shadow-sm space-y-4">
      <div>
        <h2 className="text-base font-bold text-gray-900">Linked calendars</h2>
        <p className="mt-1 text-sm text-gray-500">
          Link an account once and every Holiday can fill in your busy days with one click —
          no granting access each time. We only ever read free/busy times, and you can unlink anytime.
        </p>
      </div>

      {accounts.length > 0 && (
        <ul className="divide-y rounded-lg border">
          {accounts.map((a) => (
            <li key={a.id} className="flex items-center justify-between px-3 py-2.5">
              <span className="flex items-center gap-2 text-sm text-gray-800">
                <ProviderIcon provider={a.provider} className="h-4 w-4 flex-shrink-0" />
                <span>{a.account_email || (a.provider === "google" ? "Google account" : "Microsoft account")}</span>
              </span>
              <button
                onClick={() => unlink(a.id)}
                className="text-xs text-red-600 hover:underline"
              >
                Unlink
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {status.google && (
          <button
            onClick={() => link("google")}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
          >
            ➕ Link a Google calendar
          </button>
        )}
        {status.microsoft && (
          <button
            onClick={() => link("microsoft")}
            disabled={busy}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 hover:border-blue-400 hover:bg-blue-50 disabled:opacity-50"
          >
            ➕ Link a Microsoft calendar
          </button>
        )}
      </div>
    </div>
  );
}
