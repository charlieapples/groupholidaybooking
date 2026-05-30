/**
 * Minimal iCal (.ics) parser.
 *
 * Extracts VEVENT busy-date ranges. Works with exports from:
 *   Google Calendar, Outlook, Apple Calendar, and any standard .ics file.
 *
 * Returns an array of ISO date strings ("YYYY-MM-DD") that are busy,
 * filtered to only those within [windowStart, windowEnd).
 */

function icalDateToDate(s: string): Date {
  // Handles: 20260715 or 20260715T090000Z or 20260715T090000
  const clean = s.split("T")[0].replace(/\D/g, "");
  return new Date(
    parseInt(clean.slice(0, 4)),
    parseInt(clean.slice(4, 6)) - 1,
    parseInt(clean.slice(6, 8))
  );
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function parseIcal(
  text: string,
  windowStart: Date,
  windowEnd: Date
): string[] {
  const busy = new Set<string>();

  // Split on VEVENT boundaries (case-insensitive, CRLF or LF)
  const normalised = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const blocks = normalised.split(/BEGIN:VEVENT/i).slice(1);

  for (const block of blocks) {
    // Skip cancelled events
    if (/STATUS:CANCELLED/i.test(block)) continue;

    // DTSTART and DTEND – handles VALUE=DATE (all-day) and datetime variants.
    // The trailing capture group detects a time component ("T090000Z").
    const startMatch = block.match(/DTSTART(?:;[^:\n]*)?:(\d{8})(T\d{4,6}Z?)?/i);
    const endMatch   = block.match(/DTEND(?:;[^:\n]*)?:(\d{8})(T\d{4,6}Z?)?/i);

    if (!startMatch) continue;

    // All-day events use DATE values (no time component) and an EXCLUSIVE DTEND
    // (a one-day event on Jul 15 has DTEND Jul 16). Timed events have a time
    // component and an INCLUSIVE end day (a 9am–5pm meeting on Jul 15 has DTEND
    // Jul 15) — without this distinction same-day timed events collapse to zero
    // busy days and get silently dropped on calendar import.
    const isTimed = Boolean(startMatch[2]);

    const evStart = icalDateToDate(startMatch[1]);
    let evEnd: Date;
    if (endMatch) {
      evEnd = icalDateToDate(endMatch[1]);
      // Timed event: push the boundary one day forward so the [from, to) loop
      // includes the final day the event actually touches.
      if (isTimed) evEnd = new Date(evEnd.getTime() + 86_400_000);
    } else {
      evEnd = new Date(evStart.getTime() + 86_400_000);
    }

    // Clamp to window
    const from = new Date(Math.max(evStart.getTime(), windowStart.getTime()));
    const to   = new Date(Math.min(evEnd.getTime(),   windowEnd.getTime()));

    const cur = new Date(from);
    while (cur < to) {
      busy.add(toISO(cur));
      cur.setDate(cur.getDate() + 1);
    }
  }

  return [...busy];
}

/**
 * Parse rough_window string into a {start, end} Date range.
 * Handles formats produced by our month/date pickers:
 *   "January 2027 – March 2027"
 *   "January–March 2027"
 *   "15 Jan 2027 – 28 Mar 2027"
 *   "January 2027"   (single month)
 * Falls back to next 6 months if unparseable.
 */
const MONTH_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2, april: 3, may: 4, june: 5,
  july: 6, august: 7, september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, oct: 9, nov: 10, dec: 11,
};

function monthFromName(name: string): number | undefined {
  return MONTH_MAP[name.toLowerCase()];
}

export function parseRoughWindow(rough: string | null): { start: Date; end: Date } {
  const now = new Date();
  const defaultStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const defaultEnd   = new Date(now.getFullYear(), now.getMonth() + 6, 0);

  if (!rough) return { start: defaultStart, end: defaultEnd };

  // "Month YYYY – Month YYYY"
  const m1 = rough.match(/^(\w+)\s+(\d{4})\s*[–—-]\s*(\w+)\s+(\d{4})$/);
  if (m1) {
    const sm = monthFromName(m1[1]); const sy = parseInt(m1[2]);
    const em = monthFromName(m1[3]); const ey = parseInt(m1[4]);
    if (sm !== undefined && em !== undefined)
      return { start: new Date(sy, sm, 1), end: new Date(ey, em + 1, 0) };
  }

  // "Month–Month YYYY"
  const m2 = rough.match(/^(\w+)\s*[–—-]\s*(\w+)\s+(\d{4})$/);
  if (m2) {
    const sm = monthFromName(m2[1]); const em = monthFromName(m2[2]); const y = parseInt(m2[3]);
    if (sm !== undefined && em !== undefined)
      return { start: new Date(y, sm, 1), end: new Date(y, em + 1, 0) };
  }

  // "D Mon YYYY – D Mon YYYY" (exact date range from our date picker)
  const m3 = rough.match(/^(\d{1,2})\s+(\w+)\s+(\d{4})\s*[–—-]\s*(\d{1,2})\s+(\w+)\s+(\d{4})$/);
  if (m3) {
    const sm = monthFromName(m3[2]); const em = monthFromName(m3[5]);
    if (sm !== undefined && em !== undefined)
      return {
        start: new Date(parseInt(m3[3]), sm, parseInt(m3[1])),
        end:   new Date(parseInt(m3[6]), em, parseInt(m3[4])),
      };
  }

  // "Month YYYY" single
  const m4 = rough.match(/^(\w+)\s+(\d{4})$/);
  if (m4) {
    const sm = monthFromName(m4[1]); const y = parseInt(m4[2]);
    if (sm !== undefined)
      return { start: new Date(y, sm, 1), end: new Date(y, sm + 1, 0) };
  }

  return { start: defaultStart, end: defaultEnd };
}

/** Return array of {year, month} for every month between start and end (inclusive). */
export function getMonthsInRange(start: Date, end: Date): { year: number; month: number }[] {
  const months: { year: number; month: number }[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const last = new Date(end.getFullYear(), end.getMonth(), 1);
  while (cur <= last) {
    months.push({ year: cur.getFullYear(), month: cur.getMonth() });
    cur.setMonth(cur.getMonth() + 1);
  }
  return months;
}
