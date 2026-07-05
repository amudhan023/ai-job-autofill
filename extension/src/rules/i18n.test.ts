/**
 * i18n field taxonomy (T10): Spanish/German/French label aliases resolve to
 * the same canonical rule ids as their English equivalents. Rule-matching
 * only — no LLM involved (matches CLAUDE.md's "no LLM on structured fields").
 */
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

describe("rule engine — Spanish label aliases", () => {
  it("resolves core fields from Spanish labels", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    p.personal.email = "a@example.com";
    p.personal.phone = "555-0100";
    p.personal.location.city = "Austin";
    p.personal.location.country = "United States";
    p.personal.location.postalCode = "78701";

    expect(evaluateField(field({ label: "Nombre" }), p).ruleId).toBe("firstName");
    expect(evaluateField(field({ label: "Apellidos" }), p).ruleId).toBe("lastName");
    expect(evaluateField(field({ label: "Correo electrónico", type: "email" }), p).ruleId).toBe(
      "email",
    );
    expect(evaluateField(field({ label: "Teléfono", type: "tel" }), p).ruleId).toBe("phone");
    expect(evaluateField(field({ label: "Ciudad" }), p).ruleId).toBe("city");
    expect(evaluateField(field({ label: "País" }), p).ruleId).toBe("country");
    expect(evaluateField(field({ label: "Código postal" }), p).ruleId).toBe("postalCode");
    expect(evaluateField(field({ label: "Currículum", type: "file" }), p).ruleId).toBe(
      "resumeUpload",
    );
  });

  it("fills a Spanish first-name field with the profile value", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const m = evaluateField(field({ label: "Nombre" }), p);
    expect(m.value).toBe("Amudhan");
  });
});

describe("rule engine — German label aliases", () => {
  it("resolves core fields from German labels", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    p.personal.location.city = "Berlin";
    p.personal.location.postalCode = "10115";

    expect(evaluateField(field({ label: "Vorname" }), p).ruleId).toBe("firstName");
    expect(evaluateField(field({ label: "Nachname" }), p).ruleId).toBe("lastName");
    expect(evaluateField(field({ label: "Telefon", type: "tel" }), p).ruleId).toBe("phone");
    expect(evaluateField(field({ label: "Straße" }), p).ruleId).toBe("street");
    expect(evaluateField(field({ label: "Stadt" }), p).ruleId).toBe("city");
    expect(evaluateField(field({ label: "Land" }), p).ruleId).toBe("country");
    expect(evaluateField(field({ label: "Postleitzahl" }), p).ruleId).toBe("postalCode");
    expect(evaluateField(field({ label: "Lebenslauf", type: "file" }), p).ruleId).toBe(
      "resumeUpload",
    );
  });

  it("fills a German last-name field with the profile value", () => {
    const p = emptyProfile();
    p.personal.lastName = "Kumar";
    const m = evaluateField(field({ label: "Nachname" }), p);
    expect(m.value).toBe("Kumar");
  });
});

describe("rule engine — French label aliases", () => {
  it("resolves core fields from French labels", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    p.personal.email = "a@example.com";
    p.personal.location.city = "Paris";

    expect(evaluateField(field({ label: "Prénom" }), p).ruleId).toBe("firstName");
    expect(evaluateField(field({ label: "Nom" }), p).ruleId).toBe("lastName");
    expect(evaluateField(field({ label: "Courriel", type: "email" }), p).ruleId).toBe("email");
    expect(evaluateField(field({ label: "Téléphone", type: "tel" }), p).ruleId).toBe("phone");
    expect(evaluateField(field({ label: "Ville" }), p).ruleId).toBe("city");
    expect(evaluateField(field({ label: "Pays" }), p).ruleId).toBe("country");
    expect(evaluateField(field({ label: "Code postal" }), p).ruleId).toBe("postalCode");
    expect(
      evaluateField(field({ label: "Lettre de motivation", type: "textarea" }), p).ruleId,
    ).toBe("coverLetter");
  });

  it("does not let bare 'Nom' collide with 'Prénom' (accented word-boundary check)", () => {
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.lastName = "Kumar";
    const first = evaluateField(field({ label: "Prénom" }), p);
    const last = evaluateField(field({ label: "Nom" }), p);
    expect(first.ruleId).toBe("firstName");
    expect(first.value).toBe("Amudhan");
    expect(last.ruleId).toBe("lastName");
    expect(last.value).toBe("Kumar");
  });

  it("fills a French current-company field with the profile value", () => {
    const p = emptyProfile();
    p.experience = [
      {
        company: "Acme",
        title: "Engineer",
        startDate: "2020-01",
        endDate: "",
        current: true,
        bullets: [],
      },
    ];
    const m = evaluateField(field({ label: "Entreprise actuelle" }), p);
    expect(m.ruleId).toBe("currentCompany");
    expect(m.value).toBe("Acme");
  });
});
