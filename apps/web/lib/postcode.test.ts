import { describe, it, expect } from "vitest";
import { normalisePostcode, isValidPostcode } from "./postcode";

describe("normalisePostcode", () => {
  it("normalises a postcode with no space", () => {
    expect(normalisePostcode("M11AE")).toBe("M1 1AE");
  });

  it("normalises lowercase + extra spaces", () => {
    expect(normalisePostcode("  sw1a   1aa ")).toBe("SW1A 1AA");
  });

  it("accepts already-correct format", () => {
    expect(normalisePostcode("EH1 2NG")).toBe("EH1 2NG");
  });

  it("handles the longest district format", () => {
    expect(normalisePostcode("DL2 3HB")).toBe("DL2 3HB");
  });

  it("rejects obvious junk", () => {
    expect(normalisePostcode("hello")).toBeNull();
    expect(normalisePostcode("")).toBeNull();
    expect(normalisePostcode("12345")).toBeNull();
  });

  it("rejects a US zip code", () => {
    expect(normalisePostcode("90210")).toBeNull();
  });
});

describe("isValidPostcode", () => {
  it("returns true for valid, false for invalid", () => {
    expect(isValidPostcode("M1 1AE")).toBe(true);
    expect(isValidPostcode("not a postcode")).toBe(false);
  });
});
