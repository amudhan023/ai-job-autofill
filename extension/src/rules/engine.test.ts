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

describe("rule engine — basic fills", () => {
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

  it("still hard-blocks disability/veteran status", () => {
    const p = emptyProfile();
    const m = evaluateField(field({ label: "Veteran Status" }), p);
    expect(m.flags).toContain("blocklist");
    expect(m.value).toBeNull();
  });

  it("detects voluntary EEO fields but never auto-fills them (confirm-gated)", () => {
    const p = emptyProfile();
    p.demographics.gender = "Non-binary";
    const m = evaluateField(field({ label: "Gender Identity" }), p);
    expect(m.flags).not.toContain("blocklist");
    expect(m.profilePath).toBe("demographics.gender");
    expect(m.value).toBe("Non-binary");
    expect(m.flags).toContain("confirm");
  });

  it("joins multi-select race/ethnicity answers for display", () => {
    const p = emptyProfile();
    p.demographics.raceEthnicity = ["Asian", "White / Caucasian"];
    const m = evaluateField(field({ label: "Racial, ethnic and origin identities" }), p);
    expect(m.profilePath).toBe("demographics.raceEthnicity");
    expect(m.value).toBe("Asian, White / Caucasian");
    expect(m.flags).toContain("confirm");
  });

  it("detects age range and pronoun questions as confirm-gated (not blocked)", () => {
    const p = emptyProfile();
    p.demographics.ageRange = "30-39";
    p.demographics.pronouns = "they/them";
    const age = evaluateField(field({ label: "What is your age range?" }), p);
    const pronouns = evaluateField(field({ label: "What are your pronouns?" }), p);
    expect(age.value).toBe("30-39");
    expect(age.flags).toContain("confirm");
    expect(pronouns.value).toBe("they/them");
    expect(pronouns.flags).toContain("confirm");
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

describe("rule engine — full name fields", () => {
  it("fills Full Name with firstName + lastName", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Full Name", type: "text" }), p);
    expect(m.ruleId).toBe("fullName");
    expect(m.value).toBe("Amudhan Kumar");
  });

  it("fills Preferred Full Name with full name", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Preferred Full Name", type: "text" }), p);
    expect(m.ruleId).toBe("fullName");
    expect(m.value).toBe("Amudhan Kumar");
  });

  it("fills Legal Full Name with full name", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Legal Full Name", type: "text" }), p);
    expect(m.ruleId).toBe("fullName");
    expect(m.value).toBe("Amudhan Kumar");
  });

  it("handles missing lastName in full name", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ label: "Full Name", type: "text" }), p);
    expect(m.value).toBe("Amudhan");
  });

  it("returns null for Full Name when both firstName and lastName are empty", () => {
    const p = emptyProfile();
    const m = evaluateField(field({ label: "Full Name", type: "text" }), p);
    // personal object exists but transform returns empty → no fill
    expect(m.value).toBeNull();
  });
});

describe("rule engine — city/state combined field", () => {
  it("fills City, State combined field with city + state", () => {
    const p = emptyProfile();
    p.personal.location.city = "Austin";
    p.personal.location.state = "TX";
    const m = evaluateField(field({ label: "City, State", type: "text" }), p);
    expect(m.ruleId).toBe("cityState");
    expect(m.value).toBe("Austin, TX");
  });

  it("fills individual City field from profile.location.city", () => {
    const p = emptyProfile();
    p.personal.location.city = "Austin";
    const m = evaluateField(field({ label: "City", type: "text" }), p);
    expect(m.ruleId).toBe("city");
    expect(m.value).toBe("Austin");
  });

  it("does NOT use cityState rule for a standalone City field", () => {
    const p = emptyProfile();
    p.personal.location.city = "Austin";
    p.personal.location.state = "TX";
    const m = evaluateField(field({ label: "City", type: "text" }), p);
    expect(m.ruleId).toBe("city");
    expect(m.value).toBe("Austin"); // not "Austin, TX"
  });
});

describe("rule engine — company-specific questions", () => {
  it("fills How did you hear about us from preferences.hearAboutUs", () => {
    const p = emptyProfile();
    p.preferences.hearAboutUs = "Job Board";
    const m = evaluateField(field({ label: "How did you hear about Confluent?", type: "select" }), p);
    expect(m.ruleId).toBe("howHeard");
    expect(m.value).toBe("Job Board");
  });

  it("fills previously employed question with No by default", () => {
    const p = emptyProfile(); // previouslyEmployedHere = false
    const m = evaluateField(
      field({ label: "Have you previously been employed at Confluent?", type: "radio" }),
      p,
    );
    expect(m.ruleId).toBe("prevEmployedHere");
    expect(m.value).toBe("No");
  });

  it("fills previously employed question with Yes when profile flag is set", () => {
    const p = emptyProfile();
    p.preferences.previouslyEmployedHere = true;
    const m = evaluateField(
      field({ label: "Have you previously been employed here?", type: "radio" }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("fills consent contact checkbox with Yes by default", () => {
    const p = emptyProfile(); // consentToContact = true
    const m = evaluateField(
      field({ label: "Do you agree to allow Confluent to contact you about job opportunities for up to 5 years?", type: "checkbox" }),
      p,
    );
    expect(m.ruleId).toBe("consentContact");
    expect(m.value).toBe("Yes");
  });

  it("does not fill consent checkbox when profile consent is false", () => {
    const p = emptyProfile();
    p.preferences.consentToContact = false;
    const m = evaluateField(
      field({ label: "Do you agree to allow Confluent to contact you about job opportunities?", type: "checkbox" }),
      p,
    );
    expect(m.value).toBe("No");
  });
});

describe("rule engine — work authorization", () => {
  it("fills sponsorship question with No when not needed", () => {
    const p = emptyProfile();
    p.workAuth.sponsorshipNeeded = false;
    const m = evaluateField(
      field({ label: "Do you now, or will you in the future, require sponsorship for employment visa status?", type: "radio" }),
      p,
    );
    expect(m.ruleId).toBe("sponsorship");
    expect(m.value).toBe("No");
  });

  it("fills sponsorship question with Yes when needed", () => {
    const p = emptyProfile();
    p.workAuth.sponsorshipNeeded = true;
    const m = evaluateField(
      field({ label: "Will you require sponsorship for a work visa?", type: "radio" }),
      p,
    );
    expect(m.value).toBe("Yes");
  });

  it("fills US authorization as Yes from workAuth.usAuthorized", () => {
    const p = emptyProfile();
    p.workAuth.usAuthorized = true;
    const m = evaluateField(
      field({ label: "Are you legally authorized to work in the United States?", type: "radio" }),
      p,
    );
    expect(m.ruleId).toBe("usAuthorized");
    expect(m.value).toBe("Yes");
  });
});
