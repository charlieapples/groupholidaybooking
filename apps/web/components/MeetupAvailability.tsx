"use client";

/**
 * By-the-minute availability for local meet-ups. Each member marks the time
 * ranges they're free on the meet-up day; the API returns the window where
 * everyone (or the most people) overlap.
 */

import { useCallback, useEffect, useState } from "react";
import {
  getMeetupAvailability,
  setMeetupSlots,
  type MeetupAvailability as MeetupData,
  type MeetupSlot,
  type Room,
} from "@/lib/api";
import { useToast, errorMessage } from "@/components/Toast";

function minToHHMM(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
function hhmmToMin(v: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return null;
  const mins = Number(m[1]) * 60 + Number(m[2]);
  return mins >= 0 && mins <= 1440 ? mins : null;
}
function fmtRange(s: MeetupSlot): string {
  return `${minToHHMM(s.start_min)}–${minToHHMM(s.end_min)}`;
}

type Row = { start: string; end: string };

export default function MeetupAvailability({
  token,
  slug,
  room,
}: {
  token: string;
  slug: string;
  room: Room;
}) {
  const { toast } = useToast();
  const [data, setData] = useState<MeetupData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Which day are we meeting? Default to the room's agreed/first date, else today.
  const defaultDate =
    room.agreed_start || room.search_start || new Date().toISOString().slice(0, 10);
  const [meetDate, setMeetDate] = useState(defaultDate);
  const [rows, setRows] = useState<Row[]>([{ start: "18:00", end: "22:00" }]);

  const refresh = useCallback(async () => {
    try {
      const d = await getMeetupAvailability(token, slug);
      setData(d);
      if (d.meet_date) setMeetDate(d.meet_date);
    } catch {
      /* transient — leave as-is */
    }
  }, [token, slug]);

  useEffect(() => {
    (async () => {
      await refresh();
      setLoading(false);
    })();
    const iv = setInterval(refresh, 8000);
    return () => clearInterval(iv);
  }, [refresh]);

  function updateRow(i: number, key: keyof Row, val: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: val } : r)));
  }
  function addRow() {
    setRows((rs) => [...rs, { start: "09:00", end: "17:00" }]);
  }
  function removeRow(i: number) {
    setRows((rs) => rs.filter((_, j) => j !== i));
  }

  async function save() {
    const slots: MeetupSlot[] = [];
    for (const r of rows) {
      const a = hhmmToMin(r.start);
      const b = hhmmToMin(r.end);
      if (a == null || b == null) {
        toast.error(`"${r.start}–${r.end}" isn't a valid time range.`);
        return;
      }
      if (b <= a) {
        toast.error(`End (${r.end}) must be after start (${r.start}).`);
        return;
      }
      slots.push({ start_min: a, end_min: b });
    }
    setSaving(true);
    try {
      await setMeetupSlots(token, slug, meetDate, slots);
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
      await refresh();
    } catch (e: unknown) {
      toast.error(errorMessage(e, "Couldn't save your times"));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <div className="h-6 w-6 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
      </div>
    );
  }

  const total = data?.members_total ?? 0;
  const responded = data?.members_responded ?? 0;
  const everyoneFree = data && data.overlap.length > 0;
  const bestPartial =
    data && data.overlap.length === 0 && data.best_effort.length > 0;

  return (
    <div className="space-y-6">
      {/* My free times */}
      <div className="rounded-xl border bg-white p-5 sm:p-6 shadow-sm space-y-4">
        <div>
          <h2 className="text-lg font-bold text-gray-900">When are you free to meet?</h2>
          <p className="text-sm text-gray-500">
            Add the time ranges you could make on the day — you can be as precise as the minute.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <label className="text-sm font-medium text-gray-700">Meet-up day</label>
          <input
            type="date"
            value={meetDate}
            onChange={(e) => setMeetDate(e.target.value)}
            className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div className="space-y-2">
          {rows.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="time"
                value={r.start}
                onChange={(e) => updateRow(i, "start", e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
              <span className="text-gray-400">to</span>
              <input
                type="time"
                value={r.end}
                onChange={(e) => updateRow(i, "end", e.target.value)}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:border-blue-500 focus:outline-none"
              />
              {rows.length > 1 && (
                <button
                  onClick={() => removeRow(i)}
                  className="rounded-full p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-500"
                  title="Remove this range"
                  aria-label="Remove this range"
                >
                  ✕
                </button>
              )}
            </div>
          ))}
          <button
            onClick={addRow}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            + Add another time range
          </button>
        </div>

        <button
          onClick={save}
          disabled={saving}
          className="rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {saving ? "Saving…" : saved ? "✓ Saved!" : "Save my free times"}
        </button>
      </div>

      {/* Group result */}
      <div className="rounded-xl border bg-white p-5 sm:p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <h2 className="text-lg font-bold text-gray-900">When can the group meet?</h2>
          <span className="text-sm text-gray-500">{responded} of {total} responded</span>
        </div>

        {responded === 0 ? (
          <p className="text-sm text-gray-500">No one has added their times yet — be the first above.</p>
        ) : everyoneFree ? (
          <div className="rounded-lg border border-green-200 bg-green-50 px-4 py-3">
            <p className="text-sm font-semibold text-green-800">
              ✅ Everyone&apos;s free {data!.overlap.length === 1 ? "at" : "at these times"}:
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {data!.overlap.map((s, i) => (
                <span key={i} className="rounded-full bg-green-600 px-3 py-1 text-sm font-semibold text-white">
                  {fmtRange(s)}
                </span>
              ))}
            </div>
          </div>
        ) : bestPartial ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="text-sm font-semibold text-amber-800">
              No time suits everyone yet. Best fit — {data!.best_effort_free} of {responded} free:
            </p>
            <div className="mt-1 flex flex-wrap gap-2">
              {data!.best_effort.map((s, i) => (
                <span key={i} className="rounded-full bg-amber-500 px-3 py-1 text-sm font-semibold text-white">
                  {fmtRange(s)}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Per-member breakdown */}
        {data && data.per_member.length > 0 && (
          <div className="space-y-1.5 pt-1">
            {data.per_member.map((m) => (
              <div key={m.user_id} className="flex items-start gap-2 text-sm">
                <span className="font-medium text-gray-700 min-w-24 truncate">
                  {m.display_name || "Member"}
                </span>
                <span className="text-gray-500">
                  {m.slots.map(fmtRange).join(", ") || "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
