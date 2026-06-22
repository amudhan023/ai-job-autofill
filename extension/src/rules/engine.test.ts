import { describe, it, expect } from "vitest";
import { emptyProfile } from "@/shared/profile";
import { evaluateField, type DiscoveredField } from "./engine";

function field(partial: Partial<DiscoveredField>): DiscoveredField {
  return {
    fieldId: "f1",
    label: "",
    placeholder: "",
    ariaLabel: "",
    type: "text",
    ...partial,
  };
}

describe("rule engine", () => {
  it("fills first name with high confidence on exact label", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ label: "First Name", type: "text" }), p);
    expect(m.profilePath).toBe("personal.firstName");
    expect(m.value).toBe("Amudhan");
    expect(m.tier).toBe("high");
  });

  it("never fills a field with no profile value (confidence 0)", () => {
    const p = emptyProfile(); // empty email
    const m = evaluateField(field({ label: "Email", type: "email" }), p);
    expect(m.ruleId).toBe("email");
    expect(m.value).toBeNull();
    expect(m.confidence).toBe(0);
  });

  it("blocks sensitive fields regardless of profile", () => {
    const p = emptyProfile();
    const m = evaluateField(field({ label: "Social Security Number" }), p);
    expect(m.flags).toContain("blocklist");
    expect(m.value).toBeNull();
  });

  it("never auto-fills diversity questions", () => {
    const p = emptyProfile();
    const m = evaluateField(field({ label: "Gender Identity" }), p);
    expect(m.flags).toContain("blocklist");
  });

  it("transforms booleans to Yes/No for work authorization", () => {
    const p = emptyProfile();
    p.workAuth.usAuthorized = true;
    const m = evaluateField(
      field({ label: "Are you legally authorized to work in the US?", type: "radio" }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("flags cover letter as AI-generate, not deterministic fill", () => {
    const p = emptyProfile();
    const m = evaluateField(field({ label: "Cover Letter", type: "textarea" }), p);
    expect(m.flags).toContain("ai_generate");
    expect(m.value).toBeNull();
  });
});
