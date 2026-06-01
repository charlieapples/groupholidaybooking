import { describe, it, expect } from "vitest";
import { parseIcal, parseRoughWindow, getMonthsInRange } from "./ical";

const WINDOW_START = new Date(2026, 6, 1); // 1 Jul 2026
const WINDOW_END = new Date(2026, 7, 1); // 1 Aug 2026 (exclusive)

describe("parseIcal", () => {
  it("extracts a single all-day busy event", () => {
    const ics = [
      "BEGIN:VCALENDAR",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260716",
      "SUMMARY:Busy day",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\n");
    expect(parseIcal(ics, WINDOW_START, WINDOW_END)).toEqual(["2026-07-15"]);
  });

  it("expands a multi-day event into individual dates (DTEND exclusive)", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260718",
      "END:VEVENT",
    ].join("\n");
    const busy = parseIcal(ics, WINDOW_START, WINDOW_END).sort();
    expect(busy).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("skips cancelled events", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260716",
      "STATUS:CANCELLED",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcal(ics, WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it("clamps events to the requested window", () => {
    // Event spans Jun 28 → Jul 3; only Jul 1 + Jul 2 are inside the window
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260628",
      "DTEND;VALUE=DATE:20260703",
      "END:VEVENT",
    ].join("\n");
    const busy = parseIcal(ics, WINDOW_START, WINDOW_END).sort();
    expect(busy).toEqual(["2026-07-01", "2026-07-02"]);
  });

  it("handles datetime DTSTART (with time component)", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART:20260715T090000Z",
      "DTEND:20260715T170000Z",
      "END:VEVENT",
    ].join("\n");
    expect(parseIcal(ics, WINDOW_START, WINDOW_END)).toEqual(["2026-07-15"]);
  });

  it("expands a multi-day timed event inclusive of the end day", () => {
    // Conference Jul 15 09:00 → Jul 17 17:00 — all three days are busy
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART:20260715T090000Z",
      "DTEND:20260717T170000Z",
      "END:VEVENT",
    ].join("\n");
    const busy = parseIcal(ics, WINDOW_START, WINDOW_END).sort();
    expect(busy).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });

  it("returns empty for an ics with no events", () => {
    expect(parseIcal("BEGIN:VCALENDAR\nEND:VCALENDAR", WINDOW_START, WINDOW_END)).toEqual([]);
  });

  it("deduplicates overlapping events", () => {
    const ics = [
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260715",
      "DTEND;VALUE=DATE:20260717",
      "END:VEVENT",
      "BEGIN:VEVENT",
      "DTSTART;VALUE=DATE:20260716",
      "DTEND;VALUE=DATE:20260718",
      "END:VEVENT",
    ].join("\n");
    const busy = parseIcal(ics, WINDOW_START, WINDOW_END).sort();
    expect(busy).toEqual(["2026-07-15", "2026-07-16", "2026-07-17"]);
  });
});

describe("parseRoughWindow", () => {
  it("parses 'Month YYYY – Month YYYY'", () => {
    const { start, end } = parseRoughWindow("June 2026 – October 2026");
    expect(start.getFullYear()).toBe(2026);
    expect(start.getMonth()).toBe(5); // June
    expect(end.getMonth()).toBe(9); // October
  });

  it("parses a single month", () => {
    const { start, end } = parseRoughWindow("August 2026");
    expect(start.getMonth()).toBe(7);
    expect(end.getMonth()).toBe(7);
  });

  it("parses exact date range", () => {
    const { start, end } = parseRoughWindow("15 Jan 2027 – 28 Mar 2027");
    expect(start.getDate()).toBe(15);
    expect(start.getMonth()).toBe(0);
    expect(end.getDate()).toBe(28);
    expect(end.getMonth()).toBe(2);
  });

  it("parses 'Sept' (en-GB short September) in an exact date range", () => {
    // Regression: "17 Sept 2026" previously failed to parse and fell back to
    // a default 6-month window.
    const { start, end } = parseRoughWindow("1 Aug 2026 – 17 Sept 2026");
    expect(start.getMonth()).toBe(7);   // August
    expect(start.getDate()).toBe(1);
    expect(end.getMonth()).toBe(8);     // September
    expect(end.getDate()).toBe(17);
  });

  it("falls back to a 6-month window for unparseable input", () => {
    const { start, end } = parseRoughWindow("sometime next year maybe");
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });

  it("falls back for null", () => {
    const { start, end } = parseRoughWindow(null);
    expect(end.getTime()).toBeGreaterThan(start.getTime());
  });
});

describe("getMonthsInRange", () => {
  it("lists every month inclusive", () => {
    const months = getMonthsInRange(new Date(2026, 5, 10), new Date(2026, 8, 20));
    expect(months).toEqual([
      { year: 2026, month: 5 },
      { year: 2026, month: 6 },
      { year: 2026, month: 7 },
      { year: 2026, month: 8 },
    ]);
  });

  it("handles a single month", () => {
    expect(getMonthsInRange(new Date(2026, 5, 1), new Date(2026, 5, 28))).toEqual([
      { year: 2026, month: 5 },
    ]);
  });

  it("spans a year boundary", () => {
    const months = getMonthsInRange(new Date(2026, 10, 1), new Date(2027, 1, 1));
    expect(months).toHaveLength(4); // Nov, Dec, Jan, Feb
  });
});
