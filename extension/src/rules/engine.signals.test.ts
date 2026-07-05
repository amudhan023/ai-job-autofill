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

describe("multi-signal matching — autocomplete", () => {
  it("identifies a field from its autocomplete token alone", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ autocomplete: "given-name" }), p);
    expect(m.ruleId).toBe("firstName");
    expect(m.value).toBe("Amudhan");
    expect(m.tier).toBe("high");
    expect(m.reason).toMatch(/autocomplete/i);
  });

  it("autocomplete beats a conflicting weak placeholder", () => {
    const p = emptyProfile();
    p.personal.email = "a@example.com";
    p.personal.phone = "555-0100";
    // Placeholder says phone, autocomplete says email — spec attribute wins.
    const m = evaluateField(
      field({ placeholder: "Phone", autocomplete: "email", type: "email" }),
      p,
    );
    expect(m.ruleId).toBe("email");
    expect(m.value).toBe("a@example.com");
  });

  it("ignores on/off and section-* autocomplete tokens", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ autocomplete: "section-blue on" }), p);
    expect(m.ruleId).toBeNull();
  });
});

describe("multi-signal matching — name/id attributes", () => {
  it("matches snake_case name attributes (Greenhouse-style)", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ nameAttr: "job_application[first_name]" }), p);
    expect(m.ruleId).toBe("firstName");
    expect(m.confidence).toBeCloseTo(0.7, 5);
    expect(m.value).toBe("Amudhan");
  });

  it("matches camelCase id attributes", () => {
    const p = emptyProfile();
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ idAttr: "candidateLastName" }), p);
    expect(m.ruleId).toBe("lastName");
  });

  it("a strong label beats a conflicting attr", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Last Name", nameAttr: "first_name_container" }), p);
    expect(m.ruleId).toBe("lastName");
    expect(m.value).toBe("Kumar");
  });
});

describe("multi-signal matching — nearby text stays below the fill floor", () => {
  it("classifies from nearby text but confidence stays under 0.7", () => {
    const p = emptyProfile();
    p.personal.email = "a@example.com";
    const m = evaluateField(field({ nearbyText: "Email address", type: "email" }), p);
    expect(m.ruleId).toBe("email");
    expect(m.confidence).toBeLessThan(0.7);
    expect(m.tier).toBe("low");
  });
});

describe("blocklist covers all direct signals", () => {
  it("blocks sensitive fields identified only by name attribute", () => {
    const m = evaluateField(field({ nameAttr: "applicant_ssn" }), emptyProfile());
    expect(m.flags).toContain("blocklist");
  });

  it("blocks date-of-birth fields", () => {
    const m = evaluateField(field({ label: "Date of Birth" }), emptyProfile());
    expect(m.flags).toContain("blocklist");
  });

  it("does not false-positive on attr text merely containing 'race'", () => {
    const p = emptyProfile();
    p.personal.email = "a@example.com";
    const m = evaluateField(field({ label: "Email", nameAttr: "embrace_email", type: "email" }), p);
    expect(m.flags).not.toContain("blocklist");
    expect(m.ruleId).toBe("email");
  });
});

describe("best-match beats rule order", () => {
  it("exact label on a later rule wins over pattern hit on an earlier rule", () => {
    const p = emptyProfile();
    p.personal.location.state = "TX";
    p.links.portfolio = "https://me.dev";
    // "State" exact-matches the state rule; placeholder mentions "website"
    // which pattern-matches the earlier portfolio rule at lower strength.
    const m = evaluateField(field({ label: "State", placeholder: "Link to your website" }), p);
    expect(m.ruleId).toBe("state");
    expect(m.value).toBe("TX");
  });
});

describe("new taxonomy rules", () => {
  it("fills citizenship as Yes only for USC visa type", () => {
    const p = emptyProfile();
    p.workAuth.visaType = "USC";
    const yes = evaluateField(field({ label: "Are you a U.S. citizen?", type: "radio" }), p);
    expect(yes.ruleId).toBe("citizenship");
    expect(yes.value).toBe("Yes");

    p.workAuth.visaType = "H1B";
    const no = evaluateField(field({ label: "Are you a U.S. citizen?", type: "radio" }), p);
    expect(no.value).toBe("No");
  });

  it("never guesses citizenship when visa type is unset", () => {
    const p = emptyProfile(); // visaType ""
    const m = evaluateField(field({ label: "Are you a U.S. citizen?", type: "radio" }), p);
    expect(m.value).toBeNull();
  });

  it("joins skills into a comma-separated list", () => {
    const p = emptyProfile();
    p.skills.technical = ["TypeScript", "Python"];
    const m = evaluateField(field({ label: "Technical Skills", type: "textarea" }), p);
    expect(m.ruleId).toBe("skillsList");
    expect(m.value).toBe("TypeScript, Python");
  });
});
