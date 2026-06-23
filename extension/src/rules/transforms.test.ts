import { describe, it, expect } from "vitest";
import { boolToYesNo, toFullName, toCityState } from "./transforms";

describe("boolToYesNo", () => {
  it("returns Yes for truthy values", () => {
    expect(boolToYesNo(true)).toBe("Yes");
    expect(boolToYesNo(1)).toBe("Yes");
    expect(boolToYesNo("x")).toBe("Yes");
  });
  it("returns No for falsy values", () => {
    expect(boolToYesNo(false)).toBe("No");
    expect(boolToYesNo(0)).toBe("No");
    expect(boolToYesNo(null)).toBe("No");
    expect(boolToYesNo(undefined)).toBe("No");
  });
});

describe("toFullName", () => {
  it("concatenates firstName and lastName", () => {
    expect(toFullName({ firstName: "Amudhan", lastName: "Smith" })).toBe("Amudhan Smith");
  });
  it("handles missing lastName gracefully", () => {
    expect(toFullName({ firstName: "Amudhan", lastName: "" })).toBe("Amudhan");
  });
  it("handles missing firstName gracefully", () => {
    expect(toFullName({ firstName: "", lastName: "Smith" })).toBe("Smith");
  });
  it("returns empty string when both are missing", () => {
    expect(toFullName({ firstName: "", lastName: "" })).toBe("");
  });
  it("returns empty string for non-object input", () => {
    expect(toFullName(null)).toBe("");
    expect(toFullName(undefined)).toBe("");
    expect(toFullName("Amudhan")).toBe("");
  });
  it("trims extra whitespace", () => {
    expect(toFullName({ firstName: " Amudhan ", lastName: "Smith" })).toBe("Amudhan Smith");
  });
});

describe("toCityState", () => {
  it("concatenates city and state with a comma", () => {
    expect(toCityState({ city: "Austin", state: "TX" })).toBe("Austin, TX");
  });
  it("returns just city when state is empty", () => {
    expect(toCityState({ city: "Austin", state: "" })).toBe("Austin");
  });
  it("returns just state when city is empty", () => {
    expect(toCityState({ city: "", state: "TX" })).toBe("TX");
  });
  it("returns empty string when both are empty", () => {
    expect(toCityState({ city: "", state: "" })).toBe("");
  });
  it("returns empty string for non-object input", () => {
    expect(toCityState(null)).toBe("");
    expect(toCityState(undefined)).toBe("");
    expect(toCityState("Austin")).toBe("");
  });
});
