import { describe, it, expect } from "vitest";
import { emptyProfile, migrateProfile, type UserProfile } from "@/shared/profile";
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

describe("M3 rules — names", () => {
  it("fills Middle Name / Middle Initial", () => {
    const p = emptyProfile();
    p.personal.middleName = "Raj";
    expect(evaluateField(field({ label: "Middle Name" }), p).value).toBe("Raj");
    expect(evaluateField(field({ label: "Middle Initial" }), p).value).toBe("Raj");
  });

  it("fills Preferred Name from preferredName when set", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    p.personal.preferredName = "Amu";
    const m = evaluateField(field({ label: "Preferred Name" }), p);
    expect(m.ruleId).toBe("preferredName");
    expect(m.value).toBe("Amu");
  });

  it("falls back to full name for Preferred Name when preferredName is empty", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Preferred Name" }), p);
    expect(m.value).toBe("Amudhan Kumar");
  });
});

describe("M3 rules — address", () => {
  it("fills street address and line 2", () => {
    const p = emptyProfile();
    p.personal.location.street = "123 Main St";
    p.personal.location.street2 = "Apt 4B";
    expect(evaluateField(field({ label: "Street Address" }), p).value).toBe("123 Main St");
    expect(evaluateField(field({ label: "Address Line 1" }), p).value).toBe("123 Main St");
    expect(evaluateField(field({ label: "Address" }), p).value).toBe("123 Main St");
    expect(evaluateField(field({ label: "Address Line 2" }), p).value).toBe("Apt 4B");
    expect(evaluateField(field({ label: "Apt / Suite" }), p).value).toBe("Apt 4B");
  });

  it("does NOT treat Email Address as a street address", () => {
    const p = emptyProfile();
    p.personal.email = "a@example.com";
    p.personal.location.street = "123 Main St";
    const m = evaluateField(field({ label: "Email Address", type: "email" }), p);
    expect(m.ruleId).toBe("email");
    expect(m.value).toBe("a@example.com");
  });

  it("identifies address fields by autocomplete tokens", () => {
    const p = emptyProfile();
    p.personal.location.street = "123 Main St";
    const m = evaluateField(field({ autocomplete: "street-address" }), p);
    expect(m.ruleId).toBe("street");
    expect(m.tier).toBe("high");
  });
});

describe("M3 rules — work auth & preferences", () => {
  it("fills security clearance", () => {
    const p = emptyProfile();
    p.workAuth.clearance = "Secret";
    const m = evaluateField(field({ label: "Security Clearance", type: "select" }), p);
    expect(m.ruleId).toBe("clearance");
    expect(m.value).toBe("Secret");
  });

  it("fills willing-to-travel as Yes/No", () => {
    const p = emptyProfile();
    p.preferences.willingToTravel = true;
    const m = evaluateField(
      field({ label: "Are you willing to travel up to 25%?", type: "radio" }),
      p,
    );
    expect(m.ruleId).toBe("travel");
    expect(m.value).toBe("Yes");
  });
});

describe("M3 rules — references", () => {
  it("reference email/phone beat the generic contact rules", () => {
    const p = emptyProfile();
    p.personal.email = "me@example.com";
    p.personal.phone = "555-0100";
    p.references = [
      { name: "Jane Boss", relationship: "Manager", company: "Acme", email: "jane@acme.com", phone: "555-0199" },
    ];
    expect(evaluateField(field({ label: "Reference Email", type: "email" }), p).value).toBe("jane@acme.com");
    expect(evaluateField(field({ label: "Reference Phone", type: "tel" }), p).value).toBe("555-0199");
    expect(evaluateField(field({ label: "Reference Name" }), p).value).toBe("Jane Boss");
    expect(evaluateField(field({ label: "Relationship to you" }), p).value).toBe("Manager");
  });

  it("reference fields stay empty when no references exist", () => {
    const p = emptyProfile();
    p.personal.email = "me@example.com";
    const m = evaluateField(field({ label: "Reference Email", type: "email" }), p);
    expect(m.ruleId).toBe("referenceEmail");
    expect(m.value).toBeNull(); // never falls back to the candidate's own email
  });
});

describe("profile migration", () => {
  it("fills fields missing from an old-schema stored profile", () => {
    // Shape of a profile stored by the pre-M3 extension.
    const old = {
      personal: {
        firstName: "Amudhan",
        lastName: "Kumar",
        email: "a@example.com",
        phone: "555",
        location: { city: "Austin", state: "TX", country: "US", postalCode: "78701" },
      },
      links: { linkedin: "in/a", github: "", portfolio: "", website: "" },
      workAuth: { usAuthorized: true, sponsorshipNeeded: false, visaType: "H1B" },
      experience: [{ company: "Acme", title: "SWE", startDate: "2020-01", endDate: "", current: true, bullets: [] }],
      education: [],
      skills: { technical: ["TS"], languages: [], certifications: [] },
      preferences: {
        salaryExpected: "",
        noticePeriod: "2 weeks",
        remotePreference: "remote",
        willingToRelocate: true,
        hearAboutUs: "Job Board",
        consentToContact: true,
        previouslyEmployedHere: false,
      },
      meta: { totalYearsExp: 5 },
    };

    const migrated: UserProfile = migrateProfile(old);

    // Old values preserved.
    expect(migrated.personal.firstName).toBe("Amudhan");
    expect(migrated.personal.location.city).toBe("Austin");
    expect(migrated.workAuth.visaType).toBe("H1B");
    expect(migrated.experience).toHaveLength(1);
    expect(migrated.preferences.willingToRelocate).toBe(true);
    // New fields defaulted.
    expect(migrated.personal.middleName).toBe("");
    expect(migrated.personal.preferredName).toBe("");
    expect(migrated.personal.location.street).toBe("");
    expect(migrated.workAuth.clearance).toBe("");
    expect(migrated.preferences.willingToTravel).toBe(false);
    expect(migrated.references).toEqual([]);
  });

  it("is a no-op on a current-schema profile", () => {
    const p = emptyProfile();
    p.personal.firstName = "A";
    p.references = [{ name: "R", relationship: "", company: "", email: "", phone: "" }];
    expect(migrateProfile(p)).toEqual(p);
  });
});
