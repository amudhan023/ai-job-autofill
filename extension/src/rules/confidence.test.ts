import { describe, it, expect } from "vitest";
import { computeConfidence, toTier, labelMatchScore } from "./confidence";

describe("computeConfidence", () => {
  it("is 0 when the profile has no value (never fill blanks)", () => {
    expect(
      computeConfidence({ labelMatchScore: 0.97, atsKnownField: true, typeMatch: true, profileValueExists: false }),
    ).toBe(0);
  });

  it("floors ATS-known fields at 0.97", () => {
    expect(
      computeConfidence({ labelMatchScore: 0.4, atsKnownField: true, typeMatch: true, profileValueExists: true }),
    ).toBeCloseTo(0.97, 5);
  });

  it("penalizes type mismatch by 0.7", () => {
    const c = computeConfidence({ labelMatchScore: 0.85, atsKnownField: false, typeMatch: false, profileValueExists: true });
    expect(c).toBeCloseTo(0.595, 5);
  });

  it("caps at 1.0", () => {
    const c = computeConfidence({ labelMatchScore: 1.5, atsKnownField: false, typeMatch: true, profileValueExists: true });
    expect(c).toBe(1.0);
  });
});

describe("toTier", () => {
  it("maps confidence to badge tiers", () => {
    expect(toTier(0.95)).toBe("high");
    expect(toTier(0.9)).toBe("high");
    expect(toTier(0.8)).toBe("medium");
    expect(toTier(0.7)).toBe("medium");
    expect(toTier(0.69)).toBe("low");
    expect(toTier(0)).toBe("low");
  });
});

describe("labelMatchScore", () => {
  it("scores exact, label, and placeholder matches per spec", () => {
    expect(labelMatchScore("label", true)).toBe(0.97);
    expect(labelMatchScore("label", false)).toBe(0.85);
    expect(labelMatchScore("placeholder", false)).toBe(0.75);
    expect(labelMatchScore("aria", false)).toBe(0.75);
  });
});
