"use client";

/**
 * Owner-only feedback inbox + triage. Lists all user feedback with an
 * auto-assigned category (bug / feature_request / praise / other — currently a
 * rule-based stub, AI later) and lets the owner set a status. Non-owners get a
 * polite "not authorised".
 */

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { listAllFeedback, updateFeedbackTriage, type FeedbackItem } from "@/lib/api";

const CATEGORY_STYLE: Record<string, string> = {
  bug: "bg-red-100 text-red-700",
  feature_request: "bg-blue-100 text-blue-700",
  praise: "bg-green-100 text-green-700",
  other: "bg-gray-100 text-gray-600",
};
const STATUSES = ["new", "in_progress", "resolved", "wontfix"];

export default function AdminFeedbackPage() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [token, setToken] = useState<string | null>(null);
  const [items, setItems] = useState<FeedbackItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      if (!data.session) { router.replace("/"); return; }
      const t = data.session.access_token;
      setToken(t);
      try {
        setItems(await listAllFeedback(t));
      } catch (e) {
        setError(e instanceof Error ? e.message : "Couldn't load feedback");
      }
    });
  }, [supabase, router]);

  async function setStatus(id: string, status: string) {
    if (!token) return;
    setItems((prev) => prev?.map((i) => (i.id === id ? { ...i, triage_status: status } : i)) ?? prev);
    try { await updateFeedbackTriage(token, id, { triage_status: status }); } catch {}
  }

  if (error) {
    return (
      <main className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-900">Not authorised</p>
          <p className="mt-1 text-sm text-gray-500">{error}</p>
          <button onClick={() => router.push("/dashboard")} className="mt-4 text-sm text-blue-600 hover:underline">← Dashboard</button>
        </div>
      </main>
    );
  }
  if (!items) {
    return <div className="flex min-h-screen items-center justify-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" /></div>;
  }

  const counts = items.reduce<Record<string, number>>((a, i) => {
    const c = i.triage_category || "other";
    a[c] = (a[c] || 0) + 1;
    return a;
  }, {});
  const shown = filter === "all" ? items : items.filter((i) => (i.triage_category || "other") === filter);

  return (
    <main className="min-h-screen bg-gray-50">
      <nav className="border-b bg-white px-6 py-4">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <span className="font-semibold text-gray-900">📨 Feedback inbox</span>
          <button onClick={() => router.push("/dashboard")} className="text-sm text-blue-600 hover:text-blue-800">Dashboard →</button>
        </div>
      </nav>

      <div className="mx-auto max-w-4xl px-6 py-8 space-y-4">
        <div className="flex flex-wrap gap-2">
          {["all", "bug", "feature_request", "praise", "other"].map((c) => (
            <button
              key={c}
              onClick={() => setFilter(c)}
              className={`rounded-full px-3 py-1 text-xs font-medium ${filter === c ? "bg-gray-900 text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"}`}
            >
              {c === "all" ? `All (${items.length})` : `${c.replace("_", " ")} (${counts[c] || 0})`}
            </button>
          ))}
        </div>
        <p className="text-xs text-gray-400">Categories are auto-assigned by a rule-based stub for now (AI sorting can be wired in later).</p>

        {shown.length === 0 ? (
          <p className="py-10 text-center text-gray-400">No feedback in this category yet.</p>
        ) : (
          <div className="space-y-3">
            {shown.map((i) => (
              <div key={i.id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${CATEGORY_STYLE[i.triage_category || "other"]}`}>
                      {(i.triage_category || "other").replace("_", " ")}
                    </span>
                    {i.rating != null && <span className="text-xs text-amber-500">{"★".repeat(i.rating)}{"☆".repeat(5 - i.rating)}</span>}
                    {i.page && <span className="text-xs text-gray-400">on {i.page}</span>}
                  </div>
                  <select
                    value={i.triage_status}
                    onChange={(e) => setStatus(i.id, e.target.value)}
                    className="rounded border border-gray-300 px-2 py-1 text-xs text-gray-700"
                  >
                    {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                {i.comment && <p className="mt-2 text-sm text-gray-800 whitespace-pre-wrap">{i.comment}</p>}
                <p className="mt-2 text-[11px] text-gray-400">
                  {i.user_email || "unknown"} · {i.created_at ? new Date(i.created_at).toLocaleString("en-GB") : ""}
                  {i.room_slug ? ` · room ${i.room_slug}` : ""}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
