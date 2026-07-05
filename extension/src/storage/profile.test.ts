import { describe, it, expect } from "vitest";
import { exportProfileJson, importProfileJson } from "./profile";
import { emptyProfile } from "@/shared/profile";

describe("exportProfileJson / importProfileJson (T11)", () => {
  it("round-trips a full profile", () => {
    const profile = emptyProfile();
    profile.personal.firstName = "Ada";
    profile.personal.email = "ada@example.com";
    profile.experience.push({
      company: "Analytical Engines",
      title: "Engineer",
      startDate: "1840-01",
      endDate: "",
      current: true,
      bullets: ["Wrote the first algorithm"],
    });

    const json = exportProfileJson(profile);
    const restored = importProfileJson(json);

    expect(restored).toEqual(profile);
  });

  it("backfills fields missing from an older export via migration defaults", () => {
    const older = { personal: { firstName: "Grace" } };
    const restored = importProfileJson(JSON.stringify(older));

    expect(restored.personal.firstName).toBe("Grace");
    // Fields absent from the older export fall back to blank defaults.
    expect(restored.personal.lastName).toBe("");
    expect(restored.experience).toEqual([]);
  });

  it("throws a descriptive error for invalid JSON", () => {
    expect(() => importProfileJson("not json")).toThrow(/valid JSON/i);
  });

  it("throws a descriptive error for non-object JSON", () => {
    expect(() => importProfileJson("[1, 2, 3]")).toThrow(/profile object/i);
    expect(() => importProfileJson('"just a string"')).toThrow(/profile object/i);
  });
});
