/**
 * Synthetic form corpus (M6): framework-styled fixtures that never name a
 * known ATS, proving the universal engine handles arbitrary career portals.
 * Each fixture asserts fills through the full detect → evaluate → write path.
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
  p.links.linkedin = "https://linkedin.com/in/amudhan";
  return p;
}

function inputValue(id: string): string {
  return (document.getElementById(id) as HTMLInputElement).value;
}

describe("synthetic corpus — universal engine on unknown portals", () => {
  it("Material-UI-style form (label[for] + wrapper divs)", async () => {
    document.body.innerHTML = `
      <div id="root"><form>
        <div class="MuiFormControl-root">
          <label class="MuiInputLabel-root" for="mui-1">First Name</label>
          <div class="MuiInputBase-root"><input id="mui-1" class="MuiInputBase-input" /></div>
        </div>
        <div class="MuiFormControl-root">
          <label class="MuiInputLabel-root" for="mui-2">Email Address</label>
          <div class="MuiInputBase-root"><input id="mui-2" type="email" class="MuiInputBase-input" /></div>
        </div>
      </form></div>`;
    const result = await detectAndFill(profile(), NO_SETTLE);
    expect(result.platform).toBe("generic");
    expect(inputValue("mui-1")).toBe("Amudhan");
    expect(inputValue("mui-2")).toBe("a@example.com");
  });

  it("Angular-style form (formcontrolname attrs, no label association)", async () => {
    document.body.innerHTML = `
      <app-root><form novalidate>
        <mat-form-field><input id="ng-1" formcontrolname="firstName" name="firstName" /></mat-form-field>
        <mat-form-field><input id="ng-2" formcontrolname="phoneNumber" name="phone_number" type="tel" /></mat-form-field>
      </form></app-root>`;
    await detectAndFill(profile(), NO_SETTLE);
    // No labels at all — matched via name-attribute tokens.
    expect(inputValue("ng-1")).toBe("Amudhan");
    expect(inputValue("ng-2")).toBe("555-0100");
  });

  it("placeholder-only minimalist form", async () => {
    document.body.innerHTML = `
      <form>
        <input id="ph-1" placeholder="First name" />
        <input id="ph-2" placeholder="LinkedIn profile URL" type="url" />
      </form>`;
    await detectAndFill(profile(), NO_SETTLE);
    expect(inputValue("ph-1")).toBe("Amudhan");
    expect(inputValue("ph-2")).toBe("https://linkedin.com/in/amudhan");
  });

  it("autocomplete-attribute-only form (no visible text at all)", async () => {
    document.body.innerHTML = `
      <form>
        <input id="ac-1" autocomplete="given-name" />
        <input id="ac-2" autocomplete="email" type="email" />
        <input id="ac-3" autocomplete="address-level2" />
      </form>`;
    await detectAndFill(profile(), NO_SETTLE);
    expect(inputValue("ac-1")).toBe("Amudhan");
    expect(inputValue("ac-2")).toBe("a@example.com");
    expect(inputValue("ac-3")).toBe("Austin");
  });

  it("web-component portal (fields inside a shadow root)", async () => {
    document.body.innerHTML = `<career-portal id="portal"></career-portal>`;
    const shadow = document.getElementById("portal")!.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <form>
        <label for="wc-1">First Name</label><input id="wc-1" />
        <label for="wc-2">Email</label><input id="wc-2" type="email" />
      </form>`;
    const result = await detectAndFill(profile(), NO_SETTLE);
    expect(result.platform).toBe("generic");
    expect((shadow.getElementById("wc-1") as HTMLInputElement).value).toBe("Amudhan");
    expect((shadow.getElementById("wc-2") as HTMLInputElement).value).toBe("a@example.com");
  });

  it("question-per-row table layout (nearby text only) badges but never writes", async () => {
    document.body.innerHTML = `
      <form>
        <div class="row"><div class="q">Email</div><div class="a"><input id="tbl-1" type="email" /></div></div>
      </form>`;
    const result = await detectAndFill(profile(), NO_SETTLE);
    const m = result.matches.find((x) => x.fieldId && x.type === "email")!;
    // Nearby-text matches stay below the fill floor: identified, not written.
    expect(m.ruleId).toBe("email");
    expect(m.confidence).toBeLessThan(0.7);
    expect(inputValue("tbl-1")).toBe("");
  });
});
