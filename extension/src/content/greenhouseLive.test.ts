/**
 * Regression fixtures modeled on the REAL job-boards.greenhouse.io
 * application DOM (inspected live on 2026-07-03): intl-tel-input phone
 * country picker and the resume file input whose associated label is just
 * "Attach" (only the id carries the "resume" semantic).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { installChromeMock } from "@/test/chromeMock";
import { emptyProfile } from "@/shared/profile";
import { saveResumeFile } from "@/storage/resumeFile";
import { detectAndFill } from "./fillExecutor";

const NO_SETTLE = { settleMs: 0 };

beforeEach(() => {
  installChromeMock();
});

/** Faithful-enough copy of the Greenhouse form structure. */
function greenhouseLiveForm(): void {
  document.body.innerHTML = `
    <form id="application-form">
      <div id="field_order_1"></div>
      <label for="first_name">First Name*</label>
      <input id="first_name" type="text" aria-label="First Name" autocomplete="given-name" />
      <div class="iti__country-container">
        <button type="button" class="iti__selected-country" aria-expanded="false"
          aria-label="Change country, selected United States (+1)" aria-haspopup="dialog"
          aria-controls="iti-0__dropdown-content" title="United States"></button>
        <div id="iti-0__dropdown-content" class="iti__dropdown-content">
          <input id="iti-0__search-input" type="search" aria-label="Search" role="combobox" />
          <ul id="iti-0__country-listbox" role="listbox">
            <li role="option" id="iti-0__item-in" data-country-code="in">India+91</li>
            <li role="option" id="iti-0__item-gb" data-country-code="gb">United Kingdom+44</li>
            <li role="option" id="iti-0__item-um" data-country-code="um">U.S. Outlying Islands+1</li>
            <li role="option" id="iti-0__item-us" data-country-code="us">United States+1</li>
          </ul>
        </div>
      </div>
      <label for="phone">Phone</label>
      <input id="phone" type="tel" aria-label="Phone" autocomplete="off" />
      <label for="resume">Attach</label>
      <input id="resume" type="file" />
    </form>`;
}

describe("Greenhouse live regression — phone country picker (intl-tel-input)", () => {
  it("selects the profile's dial country by clicking the matching listbox option", async () => {
    greenhouseLiveForm();
    let picked = "";
    const listbox = document.getElementById("iti-0__country-listbox")!;
    listbox.addEventListener("click", (e) => {
      picked = (e.target as HTMLElement).textContent ?? "";
    });

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.phoneCountry = "+91";
    const result = await detectAndFill(p, NO_SETTLE);

    const countryMatch = result.matches.find((m) => m.ruleId === "phoneCountry");
    expect(countryMatch).toBeDefined();
    expect(countryMatch!.value).toBe("India");
    expect(picked).toBe("India+91");
  });

  it("default +1 resolves to United States (exact-prefix beats Outlying Islands)", async () => {
    greenhouseLiveForm();
    let picked = "";
    document.getElementById("iti-0__country-listbox")!.addEventListener("click", (e) => {
      picked = (e.target as HTMLElement).textContent ?? "";
    });

    const p = emptyProfile(); // phoneCountry defaults to "+1"
    p.personal.firstName = "Amudhan";
    await detectAndFill(p, NO_SETTLE);

    expect(picked).toBe("United States+1");
  });

  it("does not misroute the picker to the phone or location-country rules", async () => {
    greenhouseLiveForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.personal.phone = "555-0100";
    p.personal.location.country = "Germany";
    const result = await detectAndFill(p, NO_SETTLE);

    const buttonMatch = result.matches.find((m) => m.label.startsWith("Change country"));
    expect(buttonMatch?.ruleId).toBe("phoneCountry");
    // The tel input still gets the phone number.
    expect((document.getElementById("phone") as HTMLInputElement).value).toBe("555-0100");
  });
});

describe("Greenhouse live regression — resume attach", () => {
  it("attaches the stored resume even when the profile lacks resumeFileName", async () => {
    // The user's exact failure: bytes stored via Options, but the backend
    // parse failed so meta.resumeFileName was never set.
    await saveResumeFile(new File(["pdf bytes"], "resume.pdf", { type: "application/pdf" }));
    greenhouseLiveForm();

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    expect(p.meta.resumeFileName).toBeUndefined();

    const result = await detectAndFill(p, NO_SETTLE);

    const resumeMatch = result.matches.find((m) => m.ruleId === "resumeUpload")!;
    const input = document.getElementById("resume") as HTMLInputElement;
    if (typeof DataTransfer !== "undefined") {
      expect(input.files?.length).toBe(1);
      expect(resumeMatch.value).toBe("resume.pdf");
      expect(resumeMatch.reason).toMatch(/attached resume\.pdf/i);
    } else {
      expect(resumeMatch.reason).toMatch(/could not attach/i);
    }
  });

  it('matches the input via its id even though the label is just "Attach"', async () => {
    greenhouseLiveForm();
    const result = await detectAndFill(emptyProfile(), NO_SETTLE);
    const resumeMatch = result.matches.find((m) => m.ruleId === "resumeUpload");
    expect(resumeMatch).toBeDefined();
    expect(resumeMatch!.reason).toMatch(/upload your resume in options/i);
  });
});

/**
 * Affirm variant (inspected live 2026-07-04): custom questions are
 * react-select comboboxes (input role=combobox, aria-labelledby), and the iti
 * trigger reads "Select country" before any choice is made.
 *
 * The react-select model below reproduces the REAL widget behavior verified
 * on the live page — each quirk caught an actual bug:
 *  - typing alone does NOT open the menu; a mousedown reaching the control
 *    does (the extension's events bubble up from the input);
 *  - the menu (listbox of role=option, filtered by the typed text) is
 *    portaled to document.body, NOT rendered near the control;
 *  - `aria-controls` exists on the input ONLY while the menu is open;
 *  - picking an option renders it into a .select__single-value div, clears
 *    the search input, and closes the menu.
 */
function mountReactSelect(questionId: string, options: string[]): void {
  const input = document.getElementById(questionId) as HTMLInputElement;
  const control = input.closest(".select__control")!;
  const listboxId = `react-select-${questionId}-listbox`;

  const closeMenu = () => {
    document.getElementById(listboxId)?.remove();
    input.removeAttribute("aria-controls");
    input.setAttribute("aria-expanded", "false");
  };

  control.addEventListener("mousedown", () => {
    if (input.getAttribute("aria-expanded") === "true") return closeMenu();
    const menu = document.createElement("div");
    menu.id = listboxId;
    menu.setAttribute("role", "listbox");
    const filter = input.value.trim().toLowerCase();
    for (const text of options) {
      if (filter && !text.toLowerCase().includes(filter)) continue;
      const opt = document.createElement("div");
      opt.setAttribute("role", "option");
      opt.textContent = text;
      opt.addEventListener("mousedown", () => {
        control.querySelector(".select__single-value")!.textContent = text;
        input.value = "";
        closeMenu();
      });
      menu.appendChild(opt);
    }
    document.body.appendChild(menu); // portal — NOT near the control
    input.setAttribute("aria-controls", listboxId);
    input.setAttribute("aria-expanded", "true");
  });
}

function affirmLiveForm(): void {
  document.body.innerHTML = `
    <form id="application-form">
      <div id="field_order_1"></div>
      <label for="first_name">First Name*</label>
      <input id="first_name" type="text" autocomplete="given-name" />
      <div class="iti__country-container">
        <button type="button" class="iti__selected-country" aria-expanded="false"
          aria-label="Select country" aria-haspopup="dialog"
          aria-controls="iti-1__dropdown-content" title="Select country"></button>
        <div id="iti-1__dropdown-content">
          <ul id="iti-1__country-listbox" role="listbox">
            <li role="option">India+91</li>
            <li role="option">United States+1</li>
          </ul>
        </div>
      </div>
      <div id="question_1-label" class="label">Are you legally authorized to work in the United States?*</div>
      <div class="select__control">
        <input id="question_1" role="combobox" aria-haspopup="true" aria-expanded="false"
          aria-labelledby="question_1-label" type="text" />
        <div class="select__single-value"></div>
      </div>
      <div id="question_2-label" class="label">Do you now or in the future require sponsorship for employment visa status (e.g., H-1B, TN, E-3, F-1 visa status)?*</div>
      <div class="select__control">
        <input id="question_2" role="combobox" aria-haspopup="true" aria-expanded="false"
          aria-labelledby="question_2-label" type="text" />
        <div class="select__single-value"></div>
      </div>
      <div id="question_3-label" class="label">How did you first learn about Affirm as an employer?*</div>
      <div class="select__control">
        <input id="question_3" role="combobox" aria-haspopup="true" aria-expanded="false"
          aria-labelledby="question_3-label" type="text" />
        <div class="select__single-value"></div>
      </div>
      <div id="question_4-label" class="label">Have you previously been employed at Affirm for any length of time?*</div>
      <div class="select__control">
        <input id="question_4" role="combobox" aria-haspopup="true" aria-expanded="false"
          aria-labelledby="question_4-label" type="text" />
        <div class="select__single-value"></div>
      </div>
    </form>`;
  mountReactSelect("question_1", ["Yes", "No"]);
  mountReactSelect("question_2", ["Yes", "No"]);
  mountReactSelect("question_3", ["Job Board (LinkedIn, Indeed)", "Employee Referral", "Other"]);
  mountReactSelect("question_4", ["Yes", "No"]);
}

function selectedValue(questionId: string): string {
  return (
    document
      .getElementById(questionId)!
      .closest(".select__control")!
      .querySelector(".select__single-value")!.textContent ?? ""
  );
}

describe("Affirm live regression — react-select Yes/No questions", () => {
  it("fills every mandatory dropdown question via the real open→pick flow", async () => {
    affirmLiveForm();

    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.workAuth.usAuthorized = true;
    p.workAuth.sponsorshipNeeded = false;
    p.preferences.hearAboutUs = "Job Board";
    p.preferences.previouslyEmployedHere = false;
    const result = await detectAndFill(p, NO_SETTLE);

    const auth = result.matches.find((m) => m.ruleId === "usAuthorized")!;
    const sponsor = result.matches.find((m) => m.ruleId === "sponsorship")!;
    // Comboboxes are select-typed now, so radio-expecting rules clear the floor.
    expect(auth.confidence).toBeGreaterThanOrEqual(0.7);
    expect(sponsor.confidence).toBeGreaterThanOrEqual(0.7);
    // Actually selected in the widget (portal menu + post-open aria-controls).
    expect(selectedValue("question_1")).toBe("Yes");
    expect(selectedValue("question_2")).toBe("No");
    expect(selectedValue("question_3")).toBe("Job Board (LinkedIn, Indeed)");
    expect(selectedValue("question_4")).toBe("No");
    // Write status is truthful: all four report filled.
    for (const rule of ["usAuthorized", "sponsorship", "howHeard", "prevEmployedHere"]) {
      expect(result.matches.find((m) => m.ruleId === rule)?.filled).toBe(true);
    }
    // No dangling open menus.
    expect(document.querySelectorAll("[role='listbox']:not(#iti-1__country-listbox)").length).toBe(0);
  });

  it("write failures are reported honestly (no option matches the profile value)", async () => {
    affirmLiveForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.preferences.hearAboutUs = "Carrier Pigeon"; // matches no menu option
    const result = await detectAndFill(p, NO_SETTLE);

    const heard = result.matches.find((m) => m.ruleId === "howHeard")!;
    expect(heard.filled).toBeFalsy();
    expect(heard.reason).toMatch(/didn't accept the write/i);
    expect(selectedValue("question_3")).toBe("");
  });

  it('matches the pre-selection iti label "Select country"', async () => {
    affirmLiveForm();
    let picked = "";
    document.getElementById("iti-1__country-listbox")!.addEventListener("click", (e) => {
      picked = (e.target as HTMLElement).textContent ?? "";
    });

    const p = emptyProfile(); // phoneCountry "+1"
    p.personal.firstName = "Amudhan";
    const result = await detectAndFill(p, NO_SETTLE);

    expect(result.matches.some((m) => m.ruleId === "phoneCountry")).toBe(true);
    expect(picked).toBe("United States+1");
  });

  it("EEO self-ID questions are never auto-written even as comboboxes, even with a saved answer", async () => {
    document.body.innerHTML = `
      <form id="application-form"><div id="field_order_1"></div>
        <label for="fn">First Name</label><input id="fn" />
        <div id="q-label" class="label">How do you identify? (gender identity)</div>
        <input id="q" role="combobox" aria-labelledby="q-label" type="text" />
      </form>`;
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    p.demographics.gender = "Non-binary";
    const result = await detectAndFill(p, NO_SETTLE);
    const eeo = result.matches.find((m) => m.label.includes("gender identity"))!;
    // Detected (so the panel can surface it for the user's own review) but
    // "confirm"-flagged — never blocklisted-and-hidden, never auto-written.
    expect(eeo.flags).not.toContain("blocklist");
    expect(eeo.flags).toContain("confirm");
    expect((document.getElementById("q") as HTMLInputElement).value).toBe("");
  });

  it("gives a successful resume attach a green (high) badge", async () => {
    await saveResumeFile(new File(["pdf"], "resume.pdf", { type: "application/pdf" }));
    greenhouseLiveForm();
    const p = emptyProfile();
    p.personal.firstName = "Amudhan";
    const result = await detectAndFill(p, NO_SETTLE);
    const resumeMatch = result.matches.find((m) => m.ruleId === "resumeUpload")!;
    if (typeof DataTransfer !== "undefined") {
      expect(resumeMatch.tier).toBe("high");
      expect(resumeMatch.confidence).toBeGreaterThanOrEqual(0.9);
    }
  });
});
