import { describe, it, expect } from "vitest";
import { countryFor, flagFor, DEST_NAMES } from "./destinations";

describe("countryFor", () => {
  it("maps Italian airports to Italy", () => {
    expect(countryFor("FCO").toLowerCase()).toContain("italy");
    expect(countryFor("MXP").toLowerCase()).toContain("italy");
  });

  it("maps Montevideo to Uruguay", () => {
    expect(countryFor("MVD").toLowerCase()).toContain("uruguay");
  });

  it("includes common aliases", () => {
    expect(countryFor("LHR").toLowerCase()).toContain("uk");
    expect(countryFor("JFK").toLowerCase()).toContain("usa");
    expect(countryFor("DXB").toLowerCase()).toContain("dubai");
    expect(countryFor("AMS").toLowerCase()).toContain("holland");
  });

  it("returns empty string for unknown code", () => {
    expect(countryFor("ZZZ")).toBe("");
  });
});

describe("country search wiring", () => {
  // Mirrors the filter used on the destinations page
  function search(q: string): string[] {
    const lower = q.toLowerCase().trim();
    return Object.entries(DEST_NAMES)
      .filter(
        ([iata, name]) =>
          name.toLowerCase().includes(lower) ||
          iata.toLowerCase().includes(lower) ||
          countryFor(iata).toLowerCase().includes(lower),
      )
      .map(([iata]) => iata);
  }

  it("'Italy' surfaces multiple Italian airports", () => {
    const results = search("Italy");
    expect(results).toContain("FCO"); // Rome
    expect(results).toContain("MXP"); // Milan
    expect(results.length).toBeGreaterThan(2);
  });

  it("'Uruguay' surfaces Montevideo", () => {
    expect(search("Uruguay")).toContain("MVD");
  });

  it("city name still works", () => {
    expect(search("Barcelona")).toContain("BCN");
  });

  it("IATA code still works", () => {
    expect(search("bcn")).toContain("BCN");
  });
});

describe("flagFor", () => {
  it("falls back to globe for unknown", () => {
    expect(flagFor("ZZZ")).toBe("🌍");
  });
});
