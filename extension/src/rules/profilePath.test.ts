import { describe, it, expect } from "vitest";
import { emptyProfile } from "@/shared/profile";
import { resolveProfilePath, hasValue } from "./profilePath";

describe("resolveProfilePath", () => {
  it("resolves nested object paths", () => {
    const p = emptyProfile();
    p.personal.location.city = "Austin";
    expect(resolveProfilePath(p, "personal.location.city")).toBe("Austin");
  });

  it("resolves array index paths", () => {
    const p = emptyProfile();
    p.experience.push({
      company: "Acme",
      title: "SWE",
      startDate: "",
      endDate: "",
      current: true,
      bullets: [],
    });
    expect(resolveProfilePath(p, "experience[0].company")).toBe("Acme");
    expect(resolveProfilePath(p, "experience[0].title")).toBe("SWE");
  });

  it("returns undefined for missing array index", () => {
    const p = emptyProfile();
    expect(resolveProfilePath(p, "experience[0].company")).toBeUndefined();
  });

  it("returns undefined for missing leaf", () => {
    const p = emptyProfile();
    expect(resolveProfilePath(p, "personal.nope")).toBeUndefined();
  });

  it("returns undefined when traversing through a primitive", () => {
    const p = emptyProfile();
    p.personal.firstName = "Sam";
    expect(resolveProfilePath(p, "personal.firstName.deep")).toBeUndefined();
  });
});

describe("hasValue", () => {
  it("treats non-empty strings as present and whitespace as absent", () => {
    expect(hasValue("x")).toBe(true);
    expect(hasValue("   ")).toBe(false);
    expect(hasValue("")).toBe(false);
  });

  it("treats booleans as always present", () => {
    expect(hasValue(true)).toBe(true);
    expect(hasValue(false)).toBe(true);
  });

  it("treats numbers as present unless NaN", () => {
    expect(hasValue(0)).toBe(true);
    expect(hasValue(5)).toBe(true);
    expect(hasValue(Number.NaN)).toBe(false);
  });

  it("treats null/undefined/empty array as absent", () => {
    expect(hasValue(null)).toBe(false);
    expect(hasValue(undefined)).toBe(false);
    expect(hasValue([])).toBe(false);
    expect(hasValue(["a"])).toBe(true);
  });

  it("treats non-null objects as present (needed for fullName/cityState transforms)", () => {
    expect(hasValue({ firstName: "A", lastName: "B" })).toBe(true);
    expect(hasValue({ city: "Austin", state: "TX" })).toBe(true);
    // An empty object still counts as present; the transform decides whether to produce output.
    expect(hasValue({})).toBe(true);
  });
});
