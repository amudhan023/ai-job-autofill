/**
 * i18n corpus fixtures (T10): Spanish, German, and French label variants of
 * the synthetic-form fixtures in corpus.test.ts, proving the deterministic
 * rule engine (no LLM) fills the same profile fields from localized labels.
 */
import { describe, it, expect } from "vitest";
import { emptyProfile, type UserProfile } from "@/shared/profile";
import { detectAndFill } from "./fillExecutor";

const NO_SETTLE = { settleMs: 0 };

function profile(): UserProfile {
  const p = emptyProfile();
  p.personal.firstName = "Amudhan";
  p.personal.lastName = "Kumar";
  p.personal.email = "a@example.com";
  p.personal.phone = "555-0100";
  p.personal.location.city = "Austin";
  p.personal.location.country = "United States";
  p.links.linkedin = "https://linkedin.com/in/amudhan";
  return p;
}

function inputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}

describe("synthetic corpus — Spanish labels", () => {
  it("fills a Spanish-labeled form (Nombre / Apellidos / Correo electrónico / Ciudad)", async () => {
    document.body.innerHTML = `
      <form>
        <label for="es-1">Nombre</label><input id="es-1" />
        <label for="es-2">Apellidos</label><input id="es-2" />
        <label for="es-3">Correo electrónico</label><input id="es-3" type="email" />
        <label for="es-4">Ciudad</label><input id="es-4" />
      </form>`;
    await detectAndFill(profile(), NO_SETTLE);
    expect(inputValue("es-1")).toBe("Amudhan");
    expect(inputValue("es-2")).toBe("Kumar");
    expect(inputValue("es-3")).toBe("a@example.com");
    expect(inputValue("es-4")).toBe("Austin");
  });
});

describe("synthetic corpus — German labels", () => {
  it("fills a German-labeled form (Vorname / Nachname / Telefon / Land)", async () => {
    document.body.innerHTML = `
      <form>
        <label for="de-1">Vorname</label><input id="de-1" />
        <label for="de-2">Nachname</label><input id="de-2" />
        <label for="de-3">Telefon</label><input id="de-3" type="tel" />
        <label for="de-4">Land</label><input id="de-4" />
      </form>`;
    await detectAndFill(profile(), NO_SETTLE);
    expect(inputValue("de-1")).toBe("Amudhan");
    expect(inputValue("de-2")).toBe("Kumar");
    expect(inputValue("de-3")).toBe("555-0100");
    expect(inputValue("de-4")).toBe("United States");
  });
});

describe("synthetic corpus — French labels", () => {
  it("fills a French-labeled form (Prénom / Nom / LinkedIn) without 'Nom' colliding with 'Prénom'", async () => {
    document.body.innerHTML = `
      <form>
        <label for="fr-1">Prénom</label><input id="fr-1" />
        <label for="fr-2">Nom</label><input id="fr-2" />
        <label for="fr-3">Profil LinkedIn</label><input id="fr-3" type="url" />
      </form>`;
    await detectAndFill(profile(), NO_SETTLE);
    expect(inputValue("fr-1")).toBe("Amudhan");
    expect(inputValue("fr-2")).toBe("Kumar");
    expect(inputValue("fr-3")).toBe("https://linkedin.com/in/amudhan");
  });
});
